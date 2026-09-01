import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { isCollectionPiiPlaintextRetiredField } from "../config/security";
import { buildCollectionCallingWindow } from "../lib/collection-calling-window";
import {
  decryptCollectionPiiValueResult,
} from "../lib/collection-pii-encryption";
import {
  parseCollectionAmountToCents,
} from "../../shared/collection-amount-types";
import type {
  CollectionLegacyBackfillReason,
  CollectionLegacyBackfillStats,
} from "../storage-postgres-collection-types";
import { buildTextArraySql } from "./sql-array-utils";
import {
  acquireCollectionRecordMutationLock,
  acquireCollectionSettlementCycleLocks,
  recalculateCollectionSettlementCycles,
} from "./collection-settlement-repository-utils";
import { hashCollectionSourceIdentifier } from "./collection-source-repository-utils";

const LEGACY_BACKFILL_PAGE_SIZE = 200;
const LEGACY_BACKFILL_TRANSACTION_SIZE = 50;

type LegacyBackfillDbRow = Record<string, unknown>;

export type LegacyCollectionBackfillCandidate = {
  recordId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  paymentDate: string;
  resolvedAccountNumber: string | null;
  sourceRowExists: boolean;
  dataRowExists: boolean;
  sourceEnabled: boolean;
  sourceCompatible: boolean;
  sourceImportActive: boolean;
  sourceValidFrom: string | null;
  sourceValidTo: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  sourceAccountHash: string | null;
  sourceAccountMatchCount: number;
  sourceCardNumberLast4: string | null;
  sourceObligationKey: string | null;
  sourceTotalDue: string | null;
  sourceBillingPrincipalOsp: string | null;
  sourceAgingBucket: string | null;
  sourceCallingDate: string | null;
  existingCardNumberLast4: string | null;
  existingAgingBucket: string | null;
  existingCallingDate: string | null;
  existingCallingWindowEndExclusive: string | null;
  existingTotalDue: string | null;
  existingBillingPrincipalOsp: string | null;
  existingSettlementCycleKey: string | null;
};

export type LegacyCollectionBackfillPlan = {
  recordId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  sourceImportName: string | null;
  sourceFilename: string | null;
  cardNumberLast4: string | null;
  agingBucket: "D3" | "D4" | "D5" | "D6";
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: string;
  billingPrincipalOsp: string;
  sourceObligationKey: string;
  settlementCycleKey: string;
  previousSettlementCycleKey: string | null;
};

export type LegacyCollectionBackfillAssessment =
  | { accepted: true; plan: LegacyCollectionBackfillPlan }
  | { accepted: false; reason: CollectionLegacyBackfillReason };

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDate(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.slice(0, 10) : null;
}

function normalizeMoney(value: unknown, options: { allowZero: boolean }): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const cents = parseCollectionAmountToCents(value, options);
  return cents === null ? null : (cents / 100).toFixed(2);
}

function moneySnapshotsConflict(
  existing: string | null,
  authoritative: string,
  options: { allowZero: boolean },
): boolean {
  if (existing === null) return false;
  const existingCents = parseCollectionAmountToCents(existing, options);
  const authoritativeCents = parseCollectionAmountToCents(authoritative, options);
  return existingCents === null
    || authoritativeCents === null
    || existingCents !== authoritativeCents;
}

function resolveLegacyAccountNumber(row: LegacyBackfillDbRow): string | null {
  const encrypted = normalizeText(row.account_number_encrypted);
  if (encrypted) {
    const decrypted = decryptCollectionPiiValueResult(encrypted, {
      operation: "collectionLegacyBackfill",
      logFailure: false,
    });
    return decrypted.success ? normalizeText(decrypted.data) : null;
  }
  if (isCollectionPiiPlaintextRetiredField("accountNumber")) return null;
  return normalizeText(row.account_number);
}

function mapLegacyBackfillCandidate(row: LegacyBackfillDbRow): LegacyCollectionBackfillCandidate {
  return {
    recordId: normalizeText(row.record_id) ?? "",
    sourceImportId: normalizeText(row.source_import_id) ?? "",
    sourceDataRowId: normalizeText(row.source_data_row_id) ?? "",
    paymentDate: normalizeDate(row.payment_date) ?? "",
    resolvedAccountNumber: resolveLegacyAccountNumber(row),
    sourceRowExists: row.source_row_exists === true,
    dataRowExists: row.data_row_exists === true,
    sourceEnabled: row.source_enabled === true,
    sourceCompatible: row.source_compatible === true,
    sourceImportActive: row.source_import_active === true,
    sourceValidFrom: normalizeDate(row.source_valid_from),
    sourceValidTo: normalizeDate(row.source_valid_to),
    sourceImportName: normalizeText(row.source_import_name),
    sourceFilename: normalizeText(row.source_filename),
    sourceAccountHash: normalizeText(row.source_account_hash),
    sourceAccountMatchCount: Math.max(0, Number(row.source_account_match_count || 0)),
    sourceCardNumberLast4: normalizeText(row.source_card_number_last4),
    sourceObligationKey: normalizeText(row.source_obligation_key),
    sourceTotalDue: normalizeMoney(row.source_total_due, { allowZero: false }),
    sourceBillingPrincipalOsp: normalizeMoney(row.source_billing_principal_osp, { allowZero: true }),
    sourceAgingBucket: normalizeText(row.source_aging_bucket),
    sourceCallingDate: normalizeDate(row.source_calling_date),
    existingCardNumberLast4: normalizeText(row.existing_card_number_last4),
    existingAgingBucket: normalizeText(row.existing_aging_bucket),
    existingCallingDate: normalizeDate(row.existing_calling_date),
    existingCallingWindowEndExclusive: normalizeDate(row.existing_calling_window_end_exclusive),
    existingTotalDue: normalizeMoney(row.existing_total_due, { allowZero: false }),
    existingBillingPrincipalOsp: normalizeMoney(row.existing_billing_principal_osp, { allowZero: true }),
    existingSettlementCycleKey: normalizeText(row.existing_settlement_cycle_key),
  };
}

/**
 * Produces a trusted legacy snapshot only from an exact, unique Account match.
 * A pre-existing source row relationship narrows the scope but is never treated
 * as proof of identity by itself. Card-last-four is deliberately insufficient.
 */
export function assessLegacyCollectionBackfillCandidate(
  candidate: LegacyCollectionBackfillCandidate,
): LegacyCollectionBackfillAssessment {
  if (!candidate.recordId || !candidate.sourceImportId || !candidate.sourceDataRowId) {
    return { accepted: false, reason: "incomplete_source_link" };
  }
  if (!candidate.sourceRowExists || !candidate.dataRowExists) {
    return { accepted: false, reason: "missing_source_row" };
  }
  if (
    !candidate.sourceEnabled
    || !candidate.sourceCompatible
    || !candidate.sourceImportActive
  ) {
    return { accepted: false, reason: "source_not_authorized" };
  }
  if (
    !candidate.paymentDate
    || !candidate.sourceValidFrom
    || !candidate.sourceValidTo
    || candidate.paymentDate < candidate.sourceValidFrom
    || candidate.paymentDate > candidate.sourceValidTo
  ) {
    return { accepted: false, reason: "outside_source_validity" };
  }
  const accountHash = hashCollectionSourceIdentifier(candidate.resolvedAccountNumber);
  if (!accountHash || !candidate.sourceAccountHash) {
    return { accepted: false, reason: "account_match_unavailable" };
  }
  if (accountHash !== candidate.sourceAccountHash) {
    return { accepted: false, reason: "account_mismatch" };
  }
  if (candidate.sourceAccountMatchCount !== 1) {
    return { accepted: false, reason: "ambiguous_account_match" };
  }
  if (
    !candidate.sourceObligationKey
    || !candidate.sourceTotalDue
    || candidate.sourceBillingPrincipalOsp === null
    || !candidate.sourceCallingDate
    || !(candidate.sourceAgingBucket === "D3"
      || candidate.sourceAgingBucket === "D4"
      || candidate.sourceAgingBucket === "D5"
      || candidate.sourceAgingBucket === "D6")
  ) {
    return { accepted: false, reason: "incomplete_trusted_source" };
  }
  const callingWindow = buildCollectionCallingWindow(candidate.sourceCallingDate);
  if (!callingWindow?.endExclusive) {
    return { accepted: false, reason: "incomplete_trusted_source" };
  }
  if (
    (candidate.existingCardNumberLast4 !== null
      && candidate.existingCardNumberLast4 !== candidate.sourceCardNumberLast4)
    || (candidate.existingAgingBucket !== null
      && candidate.existingAgingBucket !== candidate.sourceAgingBucket)
    || (candidate.existingCallingDate !== null
      && candidate.existingCallingDate !== candidate.sourceCallingDate)
    || (candidate.existingCallingWindowEndExclusive !== null
      && candidate.existingCallingWindowEndExclusive !== callingWindow.endExclusive)
    || moneySnapshotsConflict(candidate.existingTotalDue, candidate.sourceTotalDue, {
      allowZero: false,
    })
    || moneySnapshotsConflict(
      candidate.existingBillingPrincipalOsp,
      candidate.sourceBillingPrincipalOsp,
      { allowZero: true },
    )
  ) {
    return { accepted: false, reason: "snapshot_conflict" };
  }

  const settlementCycleKey = `${candidate.sourceCallingDate}:${candidate.sourceObligationKey}`;
  return {
    accepted: true,
    plan: {
      recordId: candidate.recordId,
      sourceImportId: candidate.sourceImportId,
      sourceDataRowId: candidate.sourceDataRowId,
      sourceImportName: candidate.sourceImportName,
      sourceFilename: candidate.sourceFilename,
      cardNumberLast4: candidate.sourceCardNumberLast4,
      agingBucket: candidate.sourceAgingBucket,
      callingDate: candidate.sourceCallingDate,
      callingWindowEndExclusive: callingWindow.endExclusive,
      totalDue: candidate.sourceTotalDue,
      billingPrincipalOsp: candidate.sourceBillingPrincipalOsp,
      sourceObligationKey: candidate.sourceObligationKey,
      settlementCycleKey,
      previousSettlementCycleKey: candidate.existingSettlementCycleKey,
    },
  };
}

const LEGACY_BACKFILL_SELECT = sql`
  record.id::text AS record_id,
  record.source_import_id,
  record.source_data_row_id,
  record.payment_date,
  record.account_number,
  record.account_number_encrypted,
  record.card_number_last4 AS existing_card_number_last4,
  record.aging_bucket AS existing_aging_bucket,
  record.calling_date AS existing_calling_date,
  record.calling_window_end_exclusive AS existing_calling_window_end_exclusive,
  record.total_due AS existing_total_due,
  record.billing_principal_osp AS existing_billing_principal_osp,
  record.settlement_cycle_key AS existing_settlement_cycle_key,
  (source_row.source_data_row_id IS NOT NULL) AS source_row_exists,
  (data_row.id IS NOT NULL) AS data_row_exists,
  (config.enabled = true) AS source_enabled,
  (config.compatibility_status = 'compatible') AS source_compatible,
  (imp.id IS NOT NULL AND imp.is_deleted = false) AS source_import_active,
  config.valid_from AS source_valid_from,
  config.valid_to AS source_valid_to,
  imp.name AS source_import_name,
  imp.filename AS source_filename,
  source_row.account_number_hash AS source_account_hash,
  CASE
    WHEN source_row.account_number_hash IS NULL THEN 0
    ELSE (
      SELECT COUNT(*)::int
      FROM public.collection_source_rows duplicate_source
      WHERE duplicate_source.source_import_id = source_row.source_import_id
        AND duplicate_source.account_number_hash = source_row.account_number_hash
    )
  END AS source_account_match_count,
  source_row.card_number_last4 AS source_card_number_last4,
  source_row.canonical_obligation_key AS source_obligation_key,
  source_row.total_due AS source_total_due,
  source_row.billing_principal_osp AS source_billing_principal_osp,
  source_row.aging_bucket AS source_aging_bucket,
  source_row.calling_date AS source_calling_date
`;

function legacyBackfillJoins() {
  return sql`
    LEFT JOIN public.collection_source_rows source_row
      ON source_row.source_import_id = record.source_import_id
      AND source_row.source_data_row_id = record.source_data_row_id
    LEFT JOIN public.collection_source_configs config
      ON config.source_import_id = record.source_import_id
    LEFT JOIN public.imports imp
      ON imp.id = record.source_import_id
    LEFT JOIN public.data_rows data_row
      ON data_row.id = record.source_data_row_id
      AND data_row.import_id = record.source_import_id
  `;
}

function legacyBackfillRequiredJoins() {
  return sql`
    JOIN public.collection_source_rows source_row
      ON source_row.source_import_id = record.source_import_id
      AND source_row.source_data_row_id = record.source_data_row_id
    JOIN public.collection_source_configs config
      ON config.source_import_id = record.source_import_id
    JOIN public.imports imp
      ON imp.id = record.source_import_id
    JOIN public.data_rows data_row
      ON data_row.id = record.source_data_row_id
      AND data_row.import_id = record.source_import_id
  `;
}

function legacyBackfillNeededCondition() {
  return sql`(
    record.source_obligation_key IS NULL
    OR record.settlement_cycle_key IS NULL
    OR record.source_match_basis NOT IN ('account_number', 'account_and_card')
    OR record.source_match_basis IS NULL
    OR record.source_match_accuracy IS DISTINCT FROM 100
    OR record.aging_bucket IS NULL
    OR record.calling_date IS NULL
    OR record.calling_window_end_exclusive IS NULL
    OR record.total_due IS NULL
    OR record.billing_principal_osp IS NULL
    OR record.card_number_last4 IS DISTINCT FROM source_row.card_number_last4
  )`;
}

async function loadLegacyBackfillPage(
  sourceImportId: string,
  afterRecordId: string | null,
): Promise<LegacyBackfillDbRow[]> {
  const result = await db.execute(sql`
    SELECT ${LEGACY_BACKFILL_SELECT}
    FROM public.collection_records record
    ${legacyBackfillJoins()}
    WHERE record.source_import_id = ${sourceImportId}
      AND record.source_data_row_id IS NOT NULL
      AND (${afterRecordId}::uuid IS NULL OR record.id > ${afterRecordId}::uuid)
      AND ${legacyBackfillNeededCondition()}
    ORDER BY record.id ASC
    LIMIT ${LEGACY_BACKFILL_PAGE_SIZE}
  `);
  return (result.rows ?? []) as LegacyBackfillDbRow[];
}

function addUnresolvedReason(
  stats: CollectionLegacyBackfillStats,
  reason: CollectionLegacyBackfillReason,
  count = 1,
): void {
  stats.unresolvedRecords += count;
  stats.reasonCounts[reason] = (stats.reasonCounts[reason] ?? 0) + count;
}

async function applyLegacyBackfillTransaction(
  sourceImportId: string,
  recordIds: string[],
): Promise<{
  plans: LegacyCollectionBackfillPlan[];
  unresolvedReasons: CollectionLegacyBackfillReason[];
}> {
  const uniqueRecordIds = Array.from(new Set(recordIds)).sort();
  return db.transaction(async (tx) => {
    // Match the normal mutation lock order: record -> settlement cycle -> source.
    for (const recordId of uniqueRecordIds) {
      await acquireCollectionRecordMutationLock(tx, recordId);
    }

    const idSql = buildTextArraySql(uniqueRecordIds);
    const prelockResult = await tx.execute(sql`
      SELECT ${LEGACY_BACKFILL_SELECT}
      FROM public.collection_records record
      ${legacyBackfillRequiredJoins()}
      WHERE record.id::text = ANY(${idSql})
        AND record.source_import_id = ${sourceImportId}
        AND record.source_data_row_id IS NOT NULL
        AND ${legacyBackfillNeededCondition()}
      ORDER BY record.id ASC
    `);
    const prelockAssessments = (prelockResult.rows ?? []).map((row) => (
      assessLegacyCollectionBackfillCandidate(
        mapLegacyBackfillCandidate(row as LegacyBackfillDbRow),
      )
    ));
    const prelockPlans = prelockAssessments.flatMap((assessment) => (
      assessment.accepted ? [assessment.plan] : []
    ));
    const settlementKeys = prelockPlans.flatMap((plan) => [
      plan.previousSettlementCycleKey,
      plan.settlementCycleKey,
    ]);
    await acquireCollectionSettlementCycleLocks(tx, settlementKeys);
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`collection-source:${sourceImportId}`}, 0)
      )
    `);

    const lockedResult = await tx.execute(sql`
      SELECT ${LEGACY_BACKFILL_SELECT}
      FROM public.collection_records record
      ${legacyBackfillRequiredJoins()}
      WHERE record.id::text = ANY(${idSql})
        AND record.source_import_id = ${sourceImportId}
        AND record.source_data_row_id IS NOT NULL
        AND ${legacyBackfillNeededCondition()}
      ORDER BY record.id ASC
      FOR UPDATE OF record
      FOR SHARE OF source_row, config, imp, data_row
    `);
    const lockedById = new Map(
      (lockedResult.rows ?? []).map((row) => {
        const candidate = mapLegacyBackfillCandidate(row as LegacyBackfillDbRow);
        return [candidate.recordId, candidate] as const;
      }),
    );
    const plans: LegacyCollectionBackfillPlan[] = [];
    const unresolvedReasons: CollectionLegacyBackfillReason[] = [];
    for (const recordId of uniqueRecordIds) {
      const locked = lockedById.get(recordId);
      if (!locked) {
        unresolvedReasons.push("concurrent_change");
        continue;
      }
      const assessment = assessLegacyCollectionBackfillCandidate(locked);
      if (!assessment.accepted) {
        unresolvedReasons.push(assessment.reason);
        continue;
      }
      const lockedKeys = [
        assessment.plan.previousSettlementCycleKey,
        assessment.plan.settlementCycleKey,
      ].filter((value): value is string => Boolean(value));
      if (lockedKeys.some((key) => !settlementKeys.includes(key))) {
        unresolvedReasons.push("concurrent_change");
        continue;
      }
      plans.push(assessment.plan);
    }

    if (plans.length > 0) {
      const values = plans.map((plan) => sql`(
        ${plan.recordId}::uuid,
        ${plan.sourceDataRowId},
        ${plan.sourceImportName},
        ${plan.sourceFilename},
        ${plan.cardNumberLast4},
        ${plan.agingBucket},
        ${plan.callingDate}::date,
        ${plan.callingWindowEndExclusive}::date,
        ${plan.totalDue}::numeric(14,2),
        ${plan.billingPrincipalOsp}::numeric(14,2),
        ${plan.sourceObligationKey},
        ${plan.settlementCycleKey}
      )`);
      await tx.execute(sql`
        UPDATE public.collection_records target
        SET
          source_import_name = COALESCE(
            NULLIF(trim(target.source_import_name), ''),
            trusted.source_import_name
          ),
          source_filename = COALESCE(
            NULLIF(trim(target.source_filename), ''),
            trusted.source_filename
          ),
          card_number_last4 = trusted.card_number_last4,
          aging_bucket = trusted.aging_bucket,
          calling_date = trusted.calling_date,
          calling_window_end_exclusive = trusted.calling_window_end_exclusive,
          total_due = trusted.total_due,
          billing_principal_osp = trusted.billing_principal_osp,
          source_match_basis = 'account_number',
          source_match_accuracy = 100,
          source_obligation_key = trusted.source_obligation_key,
          settlement_cycle_key = trusted.settlement_cycle_key,
          classification = NULL,
          cumulative_collected = NULL,
          remaining_amount = NULL,
          updated_at = date_trunc('milliseconds', now())
        FROM (VALUES ${sql.join(values, sql`, `)}) AS trusted(
          record_id,
          source_data_row_id,
          source_import_name,
          source_filename,
          card_number_last4,
          aging_bucket,
          calling_date,
          calling_window_end_exclusive,
          total_due,
          billing_principal_osp,
          source_obligation_key,
          settlement_cycle_key
        )
        WHERE target.id = trusted.record_id
          AND target.source_import_id = ${sourceImportId}
          AND target.source_data_row_id = trusted.source_data_row_id
      `);
      await recalculateCollectionSettlementCycles(tx, settlementKeys);
    }

    return { plans, unresolvedReasons };
  });
}

/**
 * Deterministically migrates legacy rows already linked to a configured Saved
 * row. Work is paged and committed in small transactions; unresolved rows are
 * retained untouched and reported only as aggregate reason counts.
 */
export async function backfillLegacyCollectionRecordsForSource(
  sourceImportIdRaw: string,
): Promise<CollectionLegacyBackfillStats> {
  const sourceImportId = normalizeText(sourceImportIdRaw);
  if (!sourceImportId) throw new Error("Collection source ID is required for legacy backfill.");

  const stats: CollectionLegacyBackfillStats = {
    scannedRecords: 0,
    backfilledRecords: 0,
    unresolvedRecords: 0,
    recalculatedCycles: 0,
    reasonCounts: {},
  };
  const recalculatedCycleKeys = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const page = await loadLegacyBackfillPage(sourceImportId, cursor);
    if (page.length === 0) break;
    cursor = normalizeText(page[page.length - 1]?.record_id);
    stats.scannedRecords += page.length;

    const acceptedIds: string[] = [];
    for (const row of page) {
      const assessment = assessLegacyCollectionBackfillCandidate(
        mapLegacyBackfillCandidate(row),
      );
      if (assessment.accepted) {
        acceptedIds.push(assessment.plan.recordId);
      } else {
        addUnresolvedReason(stats, assessment.reason);
      }
    }

    for (let offset = 0; offset < acceptedIds.length; offset += LEGACY_BACKFILL_TRANSACTION_SIZE) {
      const recordIds = acceptedIds.slice(offset, offset + LEGACY_BACKFILL_TRANSACTION_SIZE);
      try {
        const result = await applyLegacyBackfillTransaction(sourceImportId, recordIds);
        stats.backfilledRecords += result.plans.length;
        for (const plan of result.plans) {
          recalculatedCycleKeys.add(plan.settlementCycleKey);
          if (plan.previousSettlementCycleKey) {
            recalculatedCycleKeys.add(plan.previousSettlementCycleKey);
          }
        }
        for (const reason of result.unresolvedReasons) addUnresolvedReason(stats, reason);
      } catch (error) {
        if (
          error instanceof Error
          && /Settlement cycle contains inconsistent TOTAL DUE values/i.test(error.message)
        ) {
          addUnresolvedReason(stats, "settlement_conflict", recordIds.length);
          continue;
        }
        throw error;
      }
    }

    if (page.length < LEGACY_BACKFILL_PAGE_SIZE || !cursor) break;
  }

  stats.recalculatedCycles = recalculatedCycleKeys.size;
  return stats;
}
