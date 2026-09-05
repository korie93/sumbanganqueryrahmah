import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { safeJsonParse } from "../lib/safe-json";
import {
  formatCollectionAmountFromCents,
  parseCollectionAmountToCents,
} from "../../shared/collection-amount-types";
import type {
  CollectionManualSettlementReason,
  CollectionRecord,
} from "../storage-postgres-collection-types";
import { getCollectionRecordById } from "./collection-record-read-utils";
import {
  acquireCollectionRecordMutationLock,
  acquireCollectionSettlementCycleLocks,
} from "./collection-settlement-repository-utils";
import type { CollectionRepositoryExecutor } from "./collection-nickname-utils";

export type UpsertCollectionManualSettlementInput = {
  recordId: string;
  poolAmount: string;
  settlementDate: string;
  reason: CollectionManualSettlementReason;
  note: string | null;
  reference: string | null;
  expectedVersion: number | null;
  actor: string;
  actorRole: string;
  requestId?: string | null;
};

export type RevokeCollectionManualSettlementInput = {
  recordId: string;
  expectedVersion: number;
  revokeReason: string;
  actor: string;
  actorRole: string;
  requestId?: string | null;
};

export type CollectionManualSettlementAuditView = {
  id: string;
  action: "VERIFIED" | "UPDATED" | "REVOKED";
  actor: string;
  actorRole: string;
  timestamp: string;
  requestId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};

type ManualSettlementRow = Record<string, unknown>;

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDateOnly(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const normalized = normalizeText(value);
  return normalized ? normalized.slice(0, 10) : null;
}

function normalizeTimestamp(value: unknown): string | null {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function snapshotManualSettlement(
  row: ManualSettlementRow | null,
  facts?: { systemCollectedCents: number; totalDueCents: number | null; hasAutomaticAbort: boolean },
): Record<string, unknown> | null {
  const status = normalizeText(row?.settlement_override_status);
  if (!row || (status !== "ACTIVE" && status !== "REVOKED")) return null;
  const poolAmountCents = parseCollectionAmountToCents(row.pool_amount, { allowZero: false });
  const isManualEffective = status === "ACTIVE"
    && poolAmountCents !== null
    && facts?.totalDueCents !== null
    && facts?.totalDueCents !== undefined
    && facts.systemCollectedCents + poolAmountCents >= facts.totalDueCents;
  const automaticStatus = facts?.hasAutomaticAbort ? "ABORT_CP" : "CP";
  return {
    sourceIdentity: {
      sourceImportId: normalizeText(row.source_import_id),
      sourceDataRowId: normalizeText(row.source_data_row_id),
      sourceObligationKey: normalizeText(row.source_obligation_key),
      settlementCycleKey: normalizeText(row.settlement_cycle_key),
    },
    status,
    poolAmount: normalizeText(row.pool_amount),
    settlementDate: normalizeDateOnly(row.manual_settlement_date),
    reason: normalizeText(row.manual_settlement_reason),
    note: normalizeText(row.manual_settlement_note),
    reference: normalizeText(row.manual_settlement_reference),
    version: Number(row.manual_settlement_version ?? 0),
    verifiedBy: normalizeText(row.manual_settlement_verified_by),
    verifiedAt: normalizeTimestamp(row.manual_settlement_verified_at),
    updatedBy: normalizeText(row.manual_settlement_updated_by),
    updatedAt: normalizeTimestamp(row.manual_settlement_updated_at),
    revokedBy: normalizeText(row.manual_settlement_revoked_by),
    revokedAt: normalizeTimestamp(row.manual_settlement_revoked_at),
    revokedReason: normalizeText(row.manual_settlement_revoked_reason),
    automaticStatus,
    effectiveStatus: facts?.hasAutomaticAbort || isManualEffective ? "ABORT_CP" : "CP",
    effectiveStatusSource: facts?.hasAutomaticAbort
      ? "AUTOMATIC"
      : isManualEffective
        ? "MANUAL_VERIFIED"
        : "NONE",
    systemCollectedAtSettlement: facts
      ? formatCollectionAmountFromCents(facts.systemCollectedCents)
      : null,
    reconciledSettlement: facts && poolAmountCents !== null
      ? formatCollectionAmountFromCents(facts.systemCollectedCents + poolAmountCents)
      : null,
    poolCreditOwner: null,
  };
}

async function loadManualSettlementAnchorForUpdate(
  executor: CollectionRepositoryExecutor,
  recordId: string,
): Promise<ManualSettlementRow | null> {
  const result = await executor.execute(sql`
    SELECT
      id,
      source_import_id,
      source_data_row_id,
      source_obligation_key,
      source_match_basis,
      settlement_cycle_key,
      total_due,
      calling_date,
      calling_window_end_exclusive,
      duplicate_receipt_flag,
      settlement_override_status,
      pool_amount,
      manual_settlement_date,
      manual_settlement_reason,
      manual_settlement_note,
      manual_settlement_reference,
      manual_settlement_version,
      manual_settlement_verified_by,
      manual_settlement_verified_at,
      manual_settlement_updated_by,
      manual_settlement_updated_at,
      manual_settlement_revoked_by,
      manual_settlement_revoked_at,
      manual_settlement_revoked_reason
    FROM public.collection_records
    WHERE id = ${recordId}::uuid
    LIMIT 1
    FOR UPDATE
  `);
  return (result.rows?.[0] as ManualSettlementRow | undefined) ?? null;
}

function requireTrustedAnchor(row: ManualSettlementRow, settlementDate: string): {
  settlementCycleKey: string;
  totalDueCents: number;
} {
  const settlementCycleKey = normalizeText(row.settlement_cycle_key);
  const callingDate = normalizeDateOnly(row.calling_date);
  const callingWindowEndExclusive = normalizeDateOnly(row.calling_window_end_exclusive);
  const totalDueCents = parseCollectionAmountToCents(row.total_due, { allowZero: false });
  if (
    !settlementCycleKey
    || !normalizeText(row.source_import_id)
    || !normalizeText(row.source_data_row_id)
    || !normalizeText(row.source_obligation_key)
    || !normalizeText(row.source_match_basis)
    || !callingDate
    || !callingWindowEndExclusive
    || totalDueCents === null
    || Boolean(row.duplicate_receipt_flag)
  ) {
    throw new Error("COLLECTION_MANUAL_SETTLEMENT_SOURCE_INVALID");
  }
  if (settlementDate < callingDate || settlementDate >= callingWindowEndExclusive) {
    throw new Error("COLLECTION_MANUAL_SETTLEMENT_DATE_INVALID");
  }
  return { settlementCycleKey, totalDueCents };
}

async function loadCycleSettlementFacts(
  executor: CollectionRepositoryExecutor,
  settlementCycleKey: string,
  settlementDate: string,
): Promise<{
  systemCollectedCents: number;
  totalDueCents: number | null;
  hasAutomaticAbort: boolean;
  activeOverrideRecordId: string | null;
}> {
  await executor.execute(sql`
    SELECT id
    FROM public.collection_records
    WHERE settlement_cycle_key = ${settlementCycleKey}
    ORDER BY payment_date ASC, created_at ASC, id ASC
    FOR UPDATE
  `);
  const result = await executor.execute(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE source_import_id IS NOT NULL
          AND source_data_row_id IS NOT NULL
          AND source_obligation_key IS NOT NULL
          AND source_match_basis IS NOT NULL
          AND total_due IS NOT NULL
          AND total_due > 0
          AND calling_date IS NOT NULL
          AND calling_window_end_exclusive IS NOT NULL
          AND payment_date >= calling_date
          AND payment_date < calling_window_end_exclusive
          AND payment_date <= ${settlementDate}::date
          AND duplicate_receipt_flag = false
      ), 0)::numeric(14,2) AS system_collected,
      MIN(total_due) FILTER (
        WHERE source_import_id IS NOT NULL
          AND source_data_row_id IS NOT NULL
          AND source_obligation_key IS NOT NULL
          AND source_match_basis IS NOT NULL
          AND total_due > 0
          AND duplicate_receipt_flag = false
      )::numeric(14,2) AS minimum_total_due,
      MAX(total_due) FILTER (
        WHERE source_import_id IS NOT NULL
          AND source_data_row_id IS NOT NULL
          AND source_obligation_key IS NOT NULL
          AND source_match_basis IS NOT NULL
          AND total_due > 0
          AND duplicate_receipt_flag = false
      )::numeric(14,2) AS maximum_total_due,
      COALESCE(BOOL_OR(classification = 'abort_cp'), false) AS has_automatic_abort,
      MIN(id::text) FILTER (WHERE settlement_override_status = 'ACTIVE') AS active_override_record_id
    FROM public.collection_records
    WHERE settlement_cycle_key = ${settlementCycleKey}
  `);
  const facts = (result.rows?.[0] ?? {}) as Record<string, unknown>;
  const minimumDueCents = facts.minimum_total_due === null || facts.minimum_total_due === undefined
    ? null
    : parseCollectionAmountToCents(facts.minimum_total_due, { allowZero: false });
  const maximumDueCents = facts.maximum_total_due === null || facts.maximum_total_due === undefined
    ? null
    : parseCollectionAmountToCents(facts.maximum_total_due, { allowZero: false });
  if (minimumDueCents === null || maximumDueCents === null || minimumDueCents !== maximumDueCents) {
    throw new Error("COLLECTION_MANUAL_SETTLEMENT_SOURCE_INVALID");
  }
  const systemCollectedCents = parseCollectionAmountToCents(facts.system_collected, {
    allowZero: true,
  });
  if (systemCollectedCents === null) {
    throw new Error("COLLECTION_MANUAL_SETTLEMENT_AMOUNT_INVALID");
  }
  return {
    systemCollectedCents,
    totalDueCents: minimumDueCents,
    hasAutomaticAbort: Boolean(facts.has_automatic_abort),
    activeOverrideRecordId: normalizeText(facts.active_override_record_id),
  };
}

async function insertManualSettlementAudit(
  executor: CollectionRepositoryExecutor,
  input: {
    recordId: string;
    actor: string;
    actorRole: string;
    requestId?: string | null;
    action: "VERIFIED" | "UPDATED" | "REVOKED";
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
  },
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO public.audit_logs (
      id,
      action,
      performed_by,
      request_id,
      target_resource,
      details,
      timestamp
    ) VALUES (
      ${randomUUID()},
      ${`COLLECTION_MANUAL_SETTLEMENT_${input.action}`},
      ${input.actor},
      ${input.requestId ?? null},
      ${input.recordId},
      ${JSON.stringify({
        event: "collection_manual_verified_settlement",
        recordId: input.recordId,
        action: input.action,
        actorRole: input.actorRole,
        oldValue: input.oldValue,
        newValue: input.newValue,
      })},
      date_trunc('milliseconds', now())
    )
  `);
}

export async function upsertCollectionManualSettlement(
  input: UpsertCollectionManualSettlementInput,
): Promise<CollectionRecord | undefined> {
  const changed = await db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, input.recordId);
    const existing = await loadManualSettlementAnchorForUpdate(tx, input.recordId);
    if (!existing) return false;
    const { settlementCycleKey, totalDueCents } = requireTrustedAnchor(
      existing,
      input.settlementDate,
    );
    await acquireCollectionSettlementCycleLocks(tx, [settlementCycleKey]);
    const facts = await loadCycleSettlementFacts(tx, settlementCycleKey, input.settlementDate);
    const existingVersion = Number(existing.manual_settlement_version ?? 0);
    const hasExistingOverride = existingVersion >= 1;
    if (
      (hasExistingOverride && input.expectedVersion !== existingVersion)
      || (!hasExistingOverride && input.expectedVersion !== null)
    ) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT");
    }
    if (
      facts.activeOverrideRecordId
      && facts.activeOverrideRecordId !== input.recordId
    ) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_DUPLICATE");
    }
    if (facts.hasAutomaticAbort) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_ALREADY_AUTOMATIC");
    }
    if (facts.totalDueCents !== totalDueCents) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_SOURCE_INVALID");
    }
    const poolAmountCents = parseCollectionAmountToCents(input.poolAmount, { allowZero: false });
    if (poolAmountCents === null || facts.systemCollectedCents + poolAmountCents < totalDueCents) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_INSUFFICIENT");
    }

    const oldValue = snapshotManualSettlement(existing, facts);
    const nextVersion = Math.max(1, existingVersion + 1);
    const updated = await tx.execute(sql`
      UPDATE public.collection_records
      SET
        settlement_override_status = 'ACTIVE',
        pool_amount = ${input.poolAmount}::numeric(14,2),
        manual_settlement_date = ${input.settlementDate}::date,
        manual_settlement_reason = ${input.reason},
        manual_settlement_note = ${input.note},
        manual_settlement_reference = ${input.reference},
        manual_settlement_version = ${nextVersion},
        manual_settlement_verified_by = CASE
          WHEN manual_settlement_verified_at IS NULL THEN ${input.actor}
          ELSE manual_settlement_verified_by
        END,
        manual_settlement_verified_at = COALESCE(
          manual_settlement_verified_at,
          date_trunc('milliseconds', now())
        ),
        manual_settlement_updated_by = ${input.actor},
        manual_settlement_updated_at = date_trunc('milliseconds', now()),
        manual_settlement_revoked_by = NULL,
        manual_settlement_revoked_at = NULL,
        manual_settlement_revoked_reason = NULL,
        updated_at = date_trunc('milliseconds', now())
      WHERE id = ${input.recordId}::uuid
        AND COALESCE(manual_settlement_version, 0) = ${existingVersion}
      RETURNING *
    `);
    const updatedRow = (updated.rows?.[0] as ManualSettlementRow | undefined) ?? null;
    if (!updatedRow) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT");
    }
    await insertManualSettlementAudit(tx, {
      recordId: input.recordId,
      actor: input.actor,
      actorRole: input.actorRole,
      requestId: input.requestId ?? null,
      action: oldValue ? "UPDATED" : "VERIFIED",
      oldValue,
      newValue: snapshotManualSettlement(updatedRow, facts),
    });
    return true;
  });
  return changed ? getCollectionRecordById(input.recordId) : undefined;
}

export async function revokeCollectionManualSettlement(
  input: RevokeCollectionManualSettlementInput,
): Promise<CollectionRecord | undefined> {
  const changed = await db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, input.recordId);
    const existing = await loadManualSettlementAnchorForUpdate(tx, input.recordId);
    if (!existing) return false;
    const settlementCycleKey = normalizeText(existing.settlement_cycle_key);
    if (settlementCycleKey) {
      await acquireCollectionSettlementCycleLocks(tx, [settlementCycleKey]);
    }
    const existingVersion = Number(existing.manual_settlement_version ?? 0);
    if (
      existing.settlement_override_status !== "ACTIVE"
      || !Number.isInteger(existingVersion)
      || existingVersion < 1
    ) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_NOT_ACTIVE");
    }
    if (input.expectedVersion !== existingVersion) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT");
    }
    const settlementDate = normalizeDateOnly(existing.manual_settlement_date);
    let facts: Awaited<ReturnType<typeof loadCycleSettlementFacts>> | undefined;
    if (settlementCycleKey && settlementDate) {
      try {
        facts = await loadCycleSettlementFacts(tx, settlementCycleKey, settlementDate);
      } catch (error) {
        const message = String((error as { message?: unknown })?.message ?? "");
        if (
          message !== "COLLECTION_MANUAL_SETTLEMENT_SOURCE_INVALID"
          && message !== "COLLECTION_MANUAL_SETTLEMENT_AMOUNT_INVALID"
        ) {
          throw error;
        }
        // A structurally damaged or already-invalid settlement must still be
        // revocable. The audit retains the raw before/after fields and marks
        // derived status facts unavailable instead of trapping the override.
      }
    }
    const oldValue = snapshotManualSettlement(existing, facts);
    const updated = await tx.execute(sql`
      UPDATE public.collection_records
      SET
        settlement_override_status = 'REVOKED',
        manual_settlement_version = manual_settlement_version + 1,
        manual_settlement_updated_by = ${input.actor},
        manual_settlement_updated_at = date_trunc('milliseconds', now()),
        manual_settlement_revoked_by = ${input.actor},
        manual_settlement_revoked_at = date_trunc('milliseconds', now()),
        manual_settlement_revoked_reason = ${input.revokeReason},
        updated_at = date_trunc('milliseconds', now())
      WHERE id = ${input.recordId}::uuid
        AND settlement_override_status = 'ACTIVE'
        AND manual_settlement_version = ${existingVersion}
      RETURNING *
    `);
    const updatedRow = (updated.rows?.[0] as ManualSettlementRow | undefined) ?? null;
    if (!updatedRow) {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT");
    }
    await insertManualSettlementAudit(tx, {
      recordId: input.recordId,
      actor: input.actor,
      actorRole: input.actorRole,
      requestId: input.requestId ?? null,
      action: "REVOKED",
      oldValue,
      newValue: snapshotManualSettlement(updatedRow, facts),
    });
    return true;
  });
  return changed ? getCollectionRecordById(input.recordId) : undefined;
}

export async function listCollectionManualSettlementAudit(
  recordId: string,
  limit = 50,
): Promise<CollectionManualSettlementAuditView[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const result = await db.execute(sql`
    SELECT id, action, performed_by, request_id, details, timestamp
    FROM public.audit_logs
    WHERE target_resource = ${recordId}
      AND action IN (
        'COLLECTION_MANUAL_SETTLEMENT_VERIFIED',
        'COLLECTION_MANUAL_SETTLEMENT_UPDATED',
        'COLLECTION_MANUAL_SETTLEMENT_REVOKED'
      )
    ORDER BY timestamp DESC, id DESC
    LIMIT ${safeLimit}
  `);
  return (result.rows ?? []).flatMap((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const parseResult = safeJsonParse<unknown>(
      String(row.details ?? "{}"),
      "collection_manual_settlement_audit_details",
      {
        logFailures: false,
        maxArrayLength: 20,
        maxDepth: 8,
        maxObjectKeys: 100,
        maxRawBytes: 64 * 1024,
        maxStringLength: 10_000,
        maxTotalBytes: 64 * 1024,
      },
    );
    if (
      !parseResult.success
      || !parseResult.data
      || typeof parseResult.data !== "object"
      || Array.isArray(parseResult.data)
    ) {
      return [];
    }

    const details = parseResult.data as Record<string, unknown>;
    const rawAction = String(row.action ?? "").replace("COLLECTION_MANUAL_SETTLEMENT_", "");
    if (rawAction !== "VERIFIED" && rawAction !== "UPDATED" && rawAction !== "REVOKED") {
      return [];
    }
    return [{
      id: String(row.id ?? ""),
      action: rawAction,
      actor: String(row.performed_by ?? ""),
      actorRole: normalizeText(details.actorRole) ?? "unknown",
      timestamp: normalizeTimestamp(row.timestamp) ?? "",
      requestId: normalizeText(row.request_id),
      oldValue: details.oldValue
        && typeof details.oldValue === "object"
        && !Array.isArray(details.oldValue)
        ? details.oldValue as Record<string, unknown>
        : null,
      newValue: details.newValue
        && typeof details.newValue === "object"
        && !Array.isArray(details.newValue)
        ? details.newValue as Record<string, unknown>
        : null,
    }];
  });
}
