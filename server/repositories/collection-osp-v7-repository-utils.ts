import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  decryptCollectionPiiValueSafe,
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  hasCollectionPiiEncryptionConfigured,
} from "../lib/collection-pii-encryption";
import {
  aggregateCollectionOspReconciliation,
  formatCollectionOspMoneyCents,
  formatCollectionOspPercentage,
  parseCollectionOspMoneyCents,
  reconcileCollectionOspAccount,
  type CollectionOspReconciliationAccountResult,
  type CollectionOspSystemPaymentEvent,
} from "../lib/collection-osp-reconciliation";
import {
  extractCanonicalSavedCollectionMasterRow,
  extractSavedCollectionIdentity,
} from "../lib/saved-collection-link-utils";
import type {
  CollectionAgingBucket,
  CollectionOspClientResultView,
  CollectionOspManualReasonCode,
  CollectionOspManualReconciliationView,
  CollectionOspPagination,
  CollectionOspSavedTargetView,
  CollectionOspTargetInput,
} from "../storage-postgres-collection-types";
import type { CollectionRepositoryExecutor } from "./collection-nickname-types";
import { buildTextArraySql } from "./sql-array-utils";
import { buildCollectionSourceScopeHash } from "./collection-source-repository-utils";

const AGINGS: CollectionAgingBucket[] = ["D3", "D4", "D5", "D6"];
const TARGET_SOURCE_PAGE_SIZE = 500;
const MAX_TARGET_SOURCE_ROWS = 100_000;
const MAX_EXPORT_DETAIL_ROWS = 10_000;
// An export can contain both one reconciliation and one drilldown row per source row.
const MAX_EXPORT_SOURCE_ROWS = Math.floor(MAX_EXPORT_DETAIL_ROWS / 2);
const MAX_DRILLDOWN_SOURCE_ROWS = 10_000;

export class CollectionOspV7RepositoryError extends Error {
  constructor(
    readonly reason:
      | "NOT_FOUND"
      | "DELETED"
      | "VERSION_CONFLICT"
      | "DUPLICATE"
      | "INVALID_SOURCE"
      | "BASELINE_MISMATCH"
      | "PII_UNAVAILABLE"
      | "DATASET_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "CollectionOspV7RepositoryError";
  }
}

type QueryExecutor = CollectionRepositoryExecutor;
type UnknownRow = Record<string, unknown>;

function rowsOf(result: { rows?: unknown[] }): UnknownRow[] {
  return (result.rows ?? []) as UnknownRow[];
}

function dateOnly(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function isoDateTime(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? 0));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeName(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, " ").toLocaleLowerCase("en-MY");
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function maskAccountNumber(value: unknown): string {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (!normalized) return "Unavailable";
  const suffix = normalized.slice(-4);
  return `•••• ${suffix}`;
}

function maskCustomerName(value: unknown): string {
  const words = normalizeText(value).split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Unavailable";
  return words.map((word) => `${word.slice(0, 1)}${"•".repeat(Math.min(5, Math.max(1, word.length - 1)))}`).join(" ");
}

function parseTargetPercentage(value: string): string {
  const raw = String(value).trim();
  if (!/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(raw)) {
    throw new Error("Target percentage is invalid.");
  }
  return Number(raw).toFixed(4);
}

function calculateTargetOsp(baseline: string, percentage: string): string {
  const baselineCents = parseCollectionOspMoneyCents(baseline);
  const percentageUnits = BigInt(parseTargetPercentage(percentage).replace(".", ""));
  const targetCents = ((baselineCents * percentageUnits) + 500_000n) / 1_000_000n;
  return formatCollectionOspMoneyCents(targetCents);
}

export function resolveCollectionOspAuthoritativeBaseline(input: {
  aging: CollectionAgingBucket;
  derivedBaselineCents: bigint;
  submittedBaseline?: string | null;
}): string {
  const authoritativeBaseline = formatCollectionOspMoneyCents(input.derivedBaselineCents);
  if (
    input.submittedBaseline !== undefined
    && input.submittedBaseline !== null
    && parseCollectionOspMoneyCents(input.submittedBaseline) !== input.derivedBaselineCents
  ) {
    throw new CollectionOspV7RepositoryError(
      "BASELINE_MISMATCH",
      `${input.aging} TT OSP baseline is stale or does not match the authoritative Saved source snapshot. Reload the report and try again.`,
    );
  }
  return authoritativeBaseline;
}

function pagination(page: number, pageSize: number, total: number): CollectionOspPagination {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function targetTrackingRange(target: CollectionOspSavedTargetView) {
  return {
    start: target.activeRevision.trackingStartDate ?? target.activeRevision.from,
    end: target.activeRevision.trackingEndDate ?? target.activeRevision.to,
  };
}

function assertTargetDate(
  target: CollectionOspSavedTargetView,
  value: string,
  label: string,
): void {
  const range = targetTrackingRange(target);
  if (value < range.start || value > range.end) {
    throw new CollectionOspV7RepositoryError(
      "INVALID_SOURCE",
      `${label} must be within the Saved Target tracking period (${range.start} to ${range.end}).`,
    );
  }
}

async function loadTargetViews(
  executor: QueryExecutor,
  filters: { targetId?: string; revisionId?: string; includeDeleted?: boolean } = {},
): Promise<CollectionOspSavedTargetView[]> {
  const targetResult = await executor.execute(sql`
    WITH latest_revision AS (
      SELECT DISTINCT ON (revision.target_id)
        revision.*
      FROM public.collection_osp_target_revisions revision
      ${filters.revisionId ? sql`WHERE revision.id = ${filters.revisionId}::uuid` : sql``}
      ORDER BY revision.target_id, revision.revision_number DESC
    )
    SELECT
      target.id,
      target.target_name,
      target.description,
      target.status,
      target.version,
      target.created_at,
      target.updated_at,
      revision.id AS revision_id,
      revision.revision_number,
      revision.period_from,
      revision.period_to,
      revision.tracking_start_date,
      revision.tracking_end_date,
      revision.nickname_scope,
      revision.aging_scope,
      revision.created_at AS revision_created_at
    FROM public.collection_osp_saved_targets target
    JOIN latest_revision revision ON revision.target_id = target.id
    WHERE ${filters.targetId ? sql`target.id = ${filters.targetId}::uuid` : sql`TRUE`}
      AND (${filters.includeDeleted === true} OR target.status = 'ACTIVE')
    ORDER BY target.updated_at DESC, target.id ASC
  `);
  const targetRows = rowsOf(targetResult);
  if (targetRows.length === 0) return [];
  const revisionIds = targetRows.map((row) => String(row.revision_id));
  const revisionIdsSql = buildTextArraySql(revisionIds);
  const sourceResult = await executor.execute(sql`
    SELECT target_revision_id, source_import_id, source_name_snapshot, source_filename_snapshot
    FROM public.collection_osp_target_sources
    WHERE target_revision_id::text = ANY(${revisionIdsSql})
    ORDER BY target_revision_id, source_import_id
  `);
  const sourcesByRevision = new Map<string, Array<{ sourceImportId: string; name: string; filename: string | null }>>();
  for (const row of rowsOf(sourceResult)) {
    const revisionId = String(row.target_revision_id);
    const values = sourcesByRevision.get(revisionId) ?? [];
    values.push({
      sourceImportId: String(row.source_import_id),
      name: String(row.source_name_snapshot),
      filename: row.source_filename_snapshot == null ? null : String(row.source_filename_snapshot),
    });
    sourcesByRevision.set(revisionId, values);
  }
  return targetRows.map((row): CollectionOspSavedTargetView => {
    const revisionId = String(row.revision_id);
    const sourceSnapshots = sourcesByRevision.get(revisionId) ?? [];
    return {
      id: String(row.id),
      name: String(row.target_name),
      description: row.description == null ? null : String(row.description),
      status: row.status === "DELETED" ? "DELETED" : "ACTIVE",
      version: Math.max(1, toNumber(row.version)),
      activeRevision: {
        id: revisionId,
        revisionNumber: Math.max(1, toNumber(row.revision_number)),
        from: dateOnly(row.period_from),
        to: dateOnly(row.period_to),
        trackingStartDate: row.tracking_start_date == null ? null : dateOnly(row.tracking_start_date),
        trackingEndDate: row.tracking_end_date == null ? null : dateOnly(row.tracking_end_date),
        sourceImportIds: sourceSnapshots.map((source) => source.sourceImportId),
        sourceSnapshots,
        nicknameScope: textArray(row.nickname_scope),
        agingScope: textArray(row.aging_scope).filter((aging): aging is CollectionAgingBucket => AGINGS.includes(aging as CollectionAgingBucket)),
        createdAt: isoDateTime(row.revision_created_at),
      },
      createdAt: isoDateTime(row.created_at),
      updatedAt: isoDateTime(row.updated_at),
    };
  });
}

export async function listCollectionOspSavedTargetsRepository(options?: {
  includeDeleted?: boolean;
}): Promise<CollectionOspSavedTargetView[]> {
  return loadTargetViews(db, options?.includeDeleted === undefined
    ? {}
    : { includeDeleted: options.includeDeleted });
}

export async function getCollectionOspSavedTargetRepository(
  targetId: string,
  revisionId?: string,
): Promise<CollectionOspSavedTargetView | undefined> {
  return (await loadTargetViews(db, {
    targetId,
    ...(revisionId === undefined ? {} : { revisionId }),
    includeDeleted: true,
  }))[0];
}

export async function createCollectionOspSavedTargetRepository(input: {
  name: string;
  description?: string | null;
  sourceImportIds: string[];
  from: string;
  to: string;
  trackingStartDate: string;
  trackingEndDate?: string | null;
  timezone: string;
  nicknameScope: string[];
  agingScope: CollectionAgingBucket[];
  targets: CollectionOspTargetInput[];
  actor: string;
}): Promise<CollectionOspSavedTargetView> {
  if (!hasCollectionPiiEncryptionConfigured()) {
    throw new CollectionOspV7RepositoryError(
      "PII_UNAVAILABLE",
      "Collection PII encryption must be configured before a Saved Target can be created.",
    );
  }
  const targetId = randomUUID();
  const revisionId = randomUUID();
  const sourceIds = Array.from(new Set(input.sourceImportIds)).sort();
  const sourceScopeHash = buildCollectionSourceScopeHash(sourceIds);
  try {
    await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`collection-osp-target-name:${normalizeName(input.name)}`}, 0))`);
    const sourcesResult = await tx.execute(sql`
      SELECT
        config.source_import_id,
        imp.name,
        imp.filename,
        imp.content_hash_sha256,
        imp.created_at,
        config.indexed_row_count
      FROM public.collection_source_configs config
      JOIN public.imports imp ON imp.id = config.source_import_id
      WHERE config.source_import_id = ANY(${buildTextArraySql(sourceIds)})
        AND config.compatibility_status = 'compatible'
        AND imp.is_deleted = false
      ORDER BY config.source_import_id
      FOR SHARE OF config, imp
    `);
    const sourceRows = rowsOf(sourcesResult);
    if (sourceRows.length !== sourceIds.length) {
      throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "One or more Saved sources are unavailable or incompatible.");
    }
    const expectedRows = sourceRows.reduce((sum, row) => sum + toNumber(row.indexed_row_count), 0);
    if (expectedRows > MAX_TARGET_SOURCE_ROWS) {
      throw new CollectionOspV7RepositoryError("INVALID_SOURCE", `Saved Target source scope exceeds ${MAX_TARGET_SOURCE_ROWS.toLocaleString()} rows.`);
    }
    const conflictingSnapshotResult = await tx.execute(sql`
      SELECT
        (source_row.calling_date::text || ':' || source_row.canonical_obligation_key) AS cycle_key
      FROM public.collection_source_rows source_row
      WHERE source_row.source_import_id = ANY(${buildTextArraySql(sourceIds)})
      GROUP BY source_row.calling_date, source_row.canonical_obligation_key
      HAVING COUNT(DISTINCT source_row.total_due) > 1
        OR COUNT(DISTINCT source_row.billing_principal_osp) > 1
        OR COUNT(DISTINCT source_row.aging_bucket) > 1
      LIMIT 1
    `);
    if (rowsOf(conflictingSnapshotResult).length > 0) {
      throw new CollectionOspV7RepositoryError(
        "INVALID_SOURCE",
        "Selected Saved sources contain conflicting trusted values for the same account and calling cycle.",
      );
    }

    await tx.execute(sql`
      INSERT INTO public.collection_osp_saved_targets (
        id, target_name, normalized_name, description, status, version,
        created_by, created_at, updated_by, updated_at
      ) VALUES (
        ${targetId}::uuid, ${input.name}, ${normalizeName(input.name)}, ${input.description ?? null},
        'ACTIVE', 1, ${input.actor}, now(), ${input.actor}, now()
      )
    `);
    await tx.execute(sql`
      INSERT INTO public.collection_osp_target_revisions (
        id, target_id, revision_number, source_scope_hash, period_from, period_to,
        tracking_start_date, tracking_end_date, timezone, nickname_scope, aging_scope,
        calculation_version, created_by, created_at
      ) VALUES (
        ${revisionId}::uuid, ${targetId}::uuid, 1, ${sourceScopeHash},
        ${input.from}::date, ${input.to}::date, ${input.trackingStartDate}::date,
        ${input.trackingEndDate ?? null}::date, ${input.timezone},
        ${buildTextArraySql(input.nicknameScope)}, ${buildTextArraySql(input.agingScope)},
        'osp-manual-reconciliation-v7', ${input.actor}, now()
      )
    `);
    for (const source of sourceRows) {
      await tx.execute(sql`
        INSERT INTO public.collection_osp_target_sources (
          target_revision_id, source_import_id, source_name_snapshot,
          source_filename_snapshot, source_version_snapshot,
          source_content_hash_snapshot, created_at
        ) VALUES (
          ${revisionId}::uuid, ${String(source.source_import_id)}, ${String(source.name)},
          ${String(source.filename)}, ${isoDateTime(source.created_at)},
          ${source.content_hash_sha256 == null ? null : String(source.content_hash_sha256)}, now()
        )
      `);
    }

    let cursor = "";
    let snapshotted = 0;
    const baselineByAging = new Map<CollectionAgingBucket, bigint>(AGINGS.map((aging) => [aging, 0n]));
    while (true) {
      const pageResult = await tx.execute(sql`
        WITH deduplicated AS (
          SELECT DISTINCT ON (source_row.canonical_obligation_key)
            source_row.source_import_id,
            source_row.source_data_row_id,
            source_row.account_number_hash,
            source_row.card_number_last4,
            source_row.canonical_obligation_key,
            source_row.canonical_obligation_key AS snapshot_cursor,
            (source_row.calling_date::text || ':' || source_row.canonical_obligation_key) AS cycle_key,
            source_row.total_due::text AS total_due,
            source_row.billing_principal_osp::text AS billing_principal_osp,
            source_row.aging_bucket,
            source_row.calling_date,
            (source_row.calling_date + INTERVAL '1 month')::date AS calling_window_end_exclusive,
            data_row.json_data
          FROM public.collection_source_rows source_row
          JOIN public.collection_source_configs source_config
            ON source_config.source_import_id = source_row.source_import_id
          JOIN public.data_rows data_row
            ON data_row.import_id = source_row.source_import_id
            AND data_row.id = source_row.source_data_row_id
          WHERE source_row.source_import_id = ANY(${buildTextArraySql(sourceIds)})
          ORDER BY
            source_row.canonical_obligation_key,
            source_row.calling_date DESC,
            source_config.valid_from DESC,
            source_config.updated_at DESC,
            source_row.source_import_id,
            source_row.source_data_row_id
        )
        SELECT * FROM deduplicated
        WHERE snapshot_cursor > ${cursor}
        ORDER BY snapshot_cursor
        LIMIT ${TARGET_SOURCE_PAGE_SIZE}
      `);
      const page = rowsOf(pageResult);
      if (page.length === 0) break;
      const inserts = [];
      for (const row of page) {
        const master = extractCanonicalSavedCollectionMasterRow(row.json_data);
        const identity = extractSavedCollectionIdentity(row.json_data);
        const account = master.accountNumber ?? identity.accountNumbers[0] ?? null;
        const accountEncrypted = encryptCollectionPiiFieldValue(account);
        const customerName = identity.customerName || null;
        const customerEncrypted = encryptCollectionPiiFieldValue(customerName);
        if ((account && !accountEncrypted) || (customerName && !customerEncrypted)) {
          throw new CollectionOspV7RepositoryError("PII_UNAVAILABLE", "Saved Target PII snapshot encryption failed.");
        }
        const aging = String(row.aging_bucket) as CollectionAgingBucket;
        const osp = String(row.billing_principal_osp);
        baselineByAging.set(aging, (baselineByAging.get(aging) ?? 0n) + parseCollectionOspMoneyCents(osp));
        inserts.push(sql`(
          ${revisionId}::uuid,
          ${String(row.source_import_id)},
          ${String(row.source_data_row_id)},
          ${String(row.canonical_obligation_key)},
          ${String(row.cycle_key)},
          ${accountEncrypted},
          ${account ? hashCollectionPiiSearchValue("accountNumber", account) : null},
          ${row.card_number_last4 == null ? null : String(row.card_number_last4)},
          ${customerEncrypted},
          ${buildTextArraySql(hashCollectionCustomerNameSearchTerms(customerName) ?? [])},
          ${aging},
          ${dateOnly(row.calling_date)}::date,
          ${dateOnly(row.calling_window_end_exclusive)}::date,
          ${String(row.total_due)}::numeric(16,2),
          ${osp}::numeric(16,2),
          now()
        )`);
      }
      if (inserts.length > 0) {
        await tx.execute(sql`
          INSERT INTO public.collection_osp_target_source_rows (
            target_revision_id, source_import_id, source_data_row_id,
            canonical_obligation_key, cycle_key, account_number_encrypted,
            account_number_search_hash, card_number_last4, customer_name_encrypted,
            customer_name_search_hashes, aging_bucket, calling_date,
            calling_window_end_exclusive, total_due, billing_principal_osp, created_at
          ) VALUES ${sql.join(inserts, sql`, `)}
        `);
      }
      snapshotted += page.length;
      if (snapshotted > MAX_TARGET_SOURCE_ROWS) {
        throw new CollectionOspV7RepositoryError("INVALID_SOURCE", `Saved Target source scope exceeds ${MAX_TARGET_SOURCE_ROWS.toLocaleString()} rows.`);
      }
      cursor = String(page[page.length - 1]?.snapshot_cursor ?? "");
      if (page.length < TARGET_SOURCE_PAGE_SIZE) break;
    }
    if (snapshotted === 0) {
      throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Saved Target sources contain no compatible account rows.");
    }
    const configuredByAging = new Map(input.targets.map((target) => [target.agingBucket, target]));
    for (const aging of AGINGS) {
      const configured = configuredByAging.get(aging);
      if (input.agingScope.includes(aging) && !configured) {
        throw new CollectionOspV7RepositoryError(
          "INVALID_SOURCE",
          `Saved Target is missing the ${aging} configuration required by its aging scope.`,
        );
      }
      const baseline = resolveCollectionOspAuthoritativeBaseline({
        aging,
        derivedBaselineCents: baselineByAging.get(aging) ?? 0n,
        ...(configured?.totalOspBaseline === undefined
          ? {}
          : { submittedBaseline: configured.totalOspBaseline }),
      });
      const percentage = configured ? parseTargetPercentage(configured.targetPercentage) : "0.0000";
      const targetOsp = calculateTargetOsp(baseline, percentage);
      await tx.execute(sql`
        INSERT INTO public.collection_osp_target_aging_rows (
          target_revision_id, aging_bucket, total_osp_baseline,
          target_percentage, target_osp, created_at
        ) VALUES (
          ${revisionId}::uuid, ${aging}, ${baseline}::numeric(16,2),
          ${percentage}::numeric(7,4), ${targetOsp}::numeric(16,2), now()
        )
      `);
    }
    });
  } catch (error) {
    if (getErrorField(error, "code") === "23505") {
      throw new CollectionOspV7RepositoryError("DUPLICATE", "An active Saved Target with this name already exists.");
    }
    throw error;
  }
  const created = (await loadTargetViews(db, { targetId, revisionId, includeDeleted: true }))[0];
  if (!created) throw new Error("Created Saved Target could not be reloaded.");
  return created;
}

export async function updateCollectionOspSavedTargetRepository(input: {
  targetId: string;
  name?: string;
  description?: string | null;
  expectedVersion?: number;
  actor: string;
}): Promise<CollectionOspSavedTargetView> {
  try {
    return await db.transaction(async (tx) => {
      const existingResult = await tx.execute(sql`
      SELECT version, status FROM public.collection_osp_saved_targets
      WHERE id = ${input.targetId}::uuid
      FOR UPDATE
    `);
      const existing = rowsOf(existingResult)[0];
      if (!existing) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
      if (existing.status !== "ACTIVE") throw new CollectionOspV7RepositoryError("DELETED", "Saved Target has been deleted.");
      if (input.expectedVersion !== undefined && toNumber(existing.version) !== input.expectedVersion) {
        throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Saved Target changed in another session.");
      }
      const updateResult = await tx.execute(sql`
      UPDATE public.collection_osp_saved_targets
      SET
        target_name = COALESCE(${input.name ?? null}, target_name),
        normalized_name = COALESCE(${input.name ? normalizeName(input.name) : null}, normalized_name),
        description = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null} ELSE description END,
        version = version + 1,
        updated_by = ${input.actor},
        updated_at = now()
      WHERE id = ${input.targetId}::uuid
      RETURNING id
    `);
      if (!rowsOf(updateResult)[0]) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
      const target = (await loadTargetViews(tx, { targetId: input.targetId, includeDeleted: true }))[0];
      if (!target) throw new Error("Updated Saved Target could not be reloaded.");
      return target;
    });
  } catch (error) {
    if (getErrorField(error, "code") === "23505") {
      throw new CollectionOspV7RepositoryError("DUPLICATE", "An active Saved Target with this name already exists.");
    }
    throw error;
  }
}

export async function deleteCollectionOspSavedTargetRepository(input: {
  targetId: string;
  expectedVersion?: number;
  actor: string;
}): Promise<CollectionOspSavedTargetView> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      UPDATE public.collection_osp_saved_targets
      SET status = 'DELETED', version = version + 1,
        deleted_by = ${input.actor}, deleted_at = now(),
        updated_by = ${input.actor}, updated_at = now()
      WHERE id = ${input.targetId}::uuid
        AND status = 'ACTIVE'
        ${input.expectedVersion === undefined ? sql`` : sql`AND version = ${input.expectedVersion}`}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) {
      const exists = rowsOf(await tx.execute(sql`SELECT version FROM public.collection_osp_saved_targets WHERE id = ${input.targetId}::uuid`))[0];
      if (!exists) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
      throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Saved Target changed in another session.");
    }
    const target = (await loadTargetViews(tx, { targetId: input.targetId, includeDeleted: true }))[0];
    if (!target) throw new Error("Deleted Saved Target could not be reloaded.");
    return target;
  });
}

type TargetAgingConfiguration = {
  aging: CollectionAgingBucket;
  totalOsp: string;
  targetPercentage: string;
  targetOsp: string;
};

type TargetSourceSnapshotRow = {
  sourceImportId: string;
  sourceDataRowId: string;
  sourceName: string;
  sourceFilename: string;
  canonicalObligationKey: string;
  cycleKey: string;
  accountNumberEncrypted: string | null;
  cardNumberLast4: string | null;
  customerNameEncrypted: string | null;
  aging: CollectionAgingBucket;
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: string;
  billingPrincipalOsp: string;
};

type ManualCalculationRow = {
  id: string;
  status: "ACTIVE" | "VOIDED";
  version: number;
  cycleKey: string;
  amount: string;
  asOfDate: string;
  actualPaymentDate: string | null;
  reason: CollectionOspManualReasonCode;
  note: string | null;
  reference: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

type TargetSystemPaymentEvent = CollectionOspSystemPaymentEvent & {
  classification: "cp" | "abort_cp";
  collectionStaffNickname: string;
  createdAt: string;
};

type TargetCalculationDataset = {
  target: CollectionOspSavedTargetView;
  agingRows: TargetAgingConfiguration[];
  snapshots: TargetSourceSnapshotRow[];
  paymentsByCycle: Map<string, TargetSystemPaymentEvent[]>;
  abortDateByCycle: Map<string, string>;
  manualByCycle: Map<string, ManualCalculationRow>;
  results: CollectionOspReconciliationAccountResult[];
};

function scopeAccountResultToTarget(
  result: CollectionOspReconciliationAccountResult,
  target: CollectionOspSavedTargetView,
): CollectionOspReconciliationAccountResult {
  const range = targetTrackingRange(target);
  const systemInScope = Boolean(
    result.systemClosed
    && result.systemAbortDate
    && result.systemAbortDate >= range.start
    && result.systemAbortDate <= range.end,
  );
  const effectiveDate = result.effectiveClosureDate && result.effectiveClosureDate < range.start
    && systemInScope
    ? result.systemAbortDate
    : result.effectiveClosureDate;
  const reconciledInScope = Boolean(
    result.reconciledClosed
    && effectiveDate
    && effectiveDate >= range.start
    && effectiveDate <= range.end,
  );
  const hasActiveManualAmount = parseCollectionOspMoneyCents(result.manualPriorAmount) > 0n;
  return {
    ...result,
    systemClosed: systemInScope,
    systemAbortDate: systemInScope ? result.systemAbortDate : null,
    reconciledClosed: reconciledInScope,
    effectiveClosureDate: reconciledInScope ? effectiveDate : null,
    contributionSource: systemInScope
      ? "SYSTEM_ABORT_CP"
      : reconciledInScope && hasActiveManualAmount
        ? "MANUAL_RECONCILIATION"
        : "OPEN",
    manualSuperseded: systemInScope && hasActiveManualAmount,
  };
}

async function loadTargetAgingRows(
  executor: QueryExecutor,
  revisionId: string,
): Promise<TargetAgingConfiguration[]> {
  const result = await executor.execute(sql`
    SELECT aging_bucket, total_osp_baseline::text, target_percentage::text, target_osp::text
    FROM public.collection_osp_target_aging_rows
    WHERE target_revision_id = ${revisionId}::uuid
    ORDER BY aging_bucket
  `);
  return rowsOf(result).map((row) => ({
    aging: String(row.aging_bucket) as CollectionAgingBucket,
    totalOsp: String(row.total_osp_baseline ?? "0.00"),
    targetPercentage: String(row.target_percentage ?? "0.0000"),
    targetOsp: String(row.target_osp ?? "0.00"),
  }));
}

async function loadTargetSourceSnapshots(
  executor: QueryExecutor,
  revisionId: string,
  agingScope: CollectionAgingBucket[],
): Promise<TargetSourceSnapshotRow[]> {
  const result = await executor.execute(sql`
    SELECT
      target_row.source_import_id,
      target_row.source_data_row_id,
      source.source_name_snapshot,
      source.source_filename_snapshot,
      target_row.canonical_obligation_key,
      target_row.cycle_key,
      target_row.account_number_encrypted,
      target_row.card_number_last4,
      target_row.customer_name_encrypted,
      target_row.aging_bucket,
      target_row.calling_date,
      target_row.calling_window_end_exclusive,
      target_row.total_due::text,
      target_row.billing_principal_osp::text
    FROM public.collection_osp_target_source_rows target_row
    JOIN public.collection_osp_target_sources source
      ON source.target_revision_id = target_row.target_revision_id
      AND source.source_import_id = target_row.source_import_id
    WHERE target_row.target_revision_id = ${revisionId}::uuid
      AND target_row.aging_bucket = ANY(${buildTextArraySql(agingScope)})
    ORDER BY target_row.cycle_key
  `);
  return rowsOf(result).map((row) => ({
    sourceImportId: String(row.source_import_id),
    sourceDataRowId: String(row.source_data_row_id),
    sourceName: String(row.source_name_snapshot),
    sourceFilename: String(row.source_filename_snapshot),
    canonicalObligationKey: String(row.canonical_obligation_key),
    cycleKey: String(row.cycle_key),
    accountNumberEncrypted: row.account_number_encrypted == null ? null : String(row.account_number_encrypted),
    cardNumberLast4: row.card_number_last4 == null ? null : String(row.card_number_last4),
    customerNameEncrypted: row.customer_name_encrypted == null ? null : String(row.customer_name_encrypted),
    aging: String(row.aging_bucket) as CollectionAgingBucket,
    callingDate: dateOnly(row.calling_date),
    callingWindowEndExclusive: dateOnly(row.calling_window_end_exclusive),
    totalDue: String(row.total_due),
    billingPrincipalOsp: String(row.billing_principal_osp),
  }));
}

async function loadTargetSystemPayments(
  executor: QueryExecutor,
  target: CollectionOspSavedTargetView,
  revisionId: string,
  asOfDate: string,
): Promise<{
  paymentsByCycle: Map<string, TargetSystemPaymentEvent[]>;
  abortDateByCycle: Map<string, string>;
}> {
  const nicknameScope = target.activeRevision.nicknameScope.map((value) => value.toLowerCase());
  const result = await executor.execute(sql`
    SELECT
      record.settlement_cycle_key,
      record.id,
      record.payment_date,
      record.amount::text,
      record.classification,
      record.collection_staff_nickname,
      record.created_at
    FROM public.collection_records record
    JOIN public.collection_osp_target_source_rows target_row
      ON target_row.target_revision_id = ${revisionId}::uuid
      AND target_row.cycle_key = record.settlement_cycle_key
    JOIN public.collection_osp_target_sources target_source
      ON target_source.target_revision_id = target_row.target_revision_id
      AND target_source.source_import_id = record.source_import_id
    WHERE record.payment_date <= ${asOfDate}::date
      AND record.payment_date >= ${target.activeRevision.from}::date
      AND record.payment_date <= ${target.activeRevision.to}::date
      AND record.payment_date >= target_row.calling_date
      AND record.payment_date < target_row.calling_window_end_exclusive
      AND record.duplicate_receipt_flag = false
      AND record.source_import_id IS NOT NULL
      AND record.source_data_row_id IS NOT NULL
      AND record.source_obligation_key = target_row.canonical_obligation_key
      AND record.total_due = target_row.total_due
      AND record.billing_principal_osp = target_row.billing_principal_osp
      ${nicknameScope.length > 0
        ? sql`AND lower(record.collection_staff_nickname) = ANY(${buildTextArraySql(nicknameScope)})`
        : sql``}
    ORDER BY record.settlement_cycle_key, record.payment_date, record.created_at, record.id
  `);
  const paymentsByCycle = new Map<string, TargetSystemPaymentEvent[]>();
  const abortDateByCycle = new Map<string, string>();
  for (const row of rowsOf(result)) {
    const cycleKey = String(row.settlement_cycle_key);
    const payment: TargetSystemPaymentEvent = {
      id: String(row.id),
      date: dateOnly(row.payment_date),
      amount: String(row.amount),
      classification: row.classification === "abort_cp" ? "abort_cp" : "cp",
      collectionStaffNickname: String(row.collection_staff_nickname),
      createdAt: isoDateTime(row.created_at),
    };
    const values = paymentsByCycle.get(cycleKey) ?? [];
    values.push(payment);
    paymentsByCycle.set(cycleKey, values);
    if (row.classification === "abort_cp" && !abortDateByCycle.has(cycleKey)) {
      abortDateByCycle.set(cycleKey, payment.date);
    }
  }
  return { paymentsByCycle, abortDateByCycle };
}

async function loadTargetManualRows(
  executor: QueryExecutor,
  targetId: string,
  revisionId: string,
  options?: { includeVoided?: boolean },
): Promise<ManualCalculationRow[]> {
  const result = await executor.execute(sql`
    SELECT id, status, version, cycle_key, manual_prior_amount::text,
      manual_as_of_date, actual_payment_date, reason_code, note,
      evidence_reference, created_by, created_at, updated_by, updated_at
    FROM public.collection_osp_manual_reconciliations
    WHERE target_id = ${targetId}::uuid
      AND target_revision_id = ${revisionId}::uuid
      ${options?.includeVoided ? sql`` : sql`AND status = 'ACTIVE'`}
    ORDER BY updated_at DESC, id
  `);
  return rowsOf(result).map((row) => ({
    id: String(row.id),
    status: row.status === "VOIDED" ? "VOIDED" : "ACTIVE",
    version: Math.max(1, toNumber(row.version)),
    cycleKey: String(row.cycle_key),
    amount: String(row.manual_prior_amount),
    asOfDate: dateOnly(row.manual_as_of_date),
    actualPaymentDate: row.actual_payment_date == null ? null : dateOnly(row.actual_payment_date),
    reason: String(row.reason_code) as CollectionOspManualReasonCode,
    note: row.note == null ? null : String(row.note),
    reference: row.evidence_reference == null ? null : String(row.evidence_reference),
    createdBy: String(row.created_by),
    createdAt: isoDateTime(row.created_at),
    updatedBy: String(row.updated_by),
    updatedAt: isoDateTime(row.updated_at),
  }));
}

async function loadTargetCalculationDataset(
  targetId: string,
  revisionId: string,
  asOfDate: string,
  options?: { maxSourceRows?: number; operationLabel?: string },
): Promise<TargetCalculationDataset> {
  const target = await getCollectionOspSavedTargetRepository(targetId, revisionId);
  if (!target || target.status !== "ACTIVE" || target.activeRevision.id !== revisionId) {
    throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target revision was not found.");
  }
  assertTargetDate(target, asOfDate, "As-of date");
  if (options?.maxSourceRows) {
    const limit = options.maxSourceRows + 1;
    const limitResult = await db.execute(sql`
      SELECT 1
      FROM public.collection_osp_target_source_rows
      WHERE target_revision_id = ${revisionId}::uuid
      LIMIT ${limit}
    `);
    if (rowsOf(limitResult).length > options.maxSourceRows) {
      throw new CollectionOspV7RepositoryError(
        "DATASET_TOO_LARGE",
        `${options.operationLabel ?? "This operation"} exceeds the ${options.maxSourceRows.toLocaleString("en-MY")} source-row limit. Narrow the Saved Target scope and try again.`,
      );
    }
  }
  const [agingRows, snapshots, system, manualRows] = await Promise.all([
    loadTargetAgingRows(db, revisionId),
    loadTargetSourceSnapshots(db, revisionId, target.activeRevision.agingScope),
    loadTargetSystemPayments(db, target, revisionId, asOfDate),
    loadTargetManualRows(db, targetId, revisionId),
  ]);
  const manualByCycle = new Map(manualRows.map((row) => [row.cycleKey, row]));
  const results = snapshots.map((snapshot) => {
    const manual = manualByCycle.get(snapshot.cycleKey);
    return scopeAccountResultToTarget(reconcileCollectionOspAccount({
      targetRevisionId: revisionId,
      cycleKey: snapshot.cycleKey,
      aging: snapshot.aging,
      totalDue: snapshot.totalDue,
      billingPrincipalOsp: snapshot.billingPrincipalOsp,
      systemPayments: system.paymentsByCycle.get(snapshot.cycleKey) ?? [],
      systemAbortDate: system.abortDateByCycle.get(snapshot.cycleKey) ?? null,
      manual: manual ? {
        amount: manual.amount,
        asOfDate: manual.asOfDate,
        actualPaymentDate: manual.actualPaymentDate,
        active: manual.status === "ACTIVE",
      } : null,
      asOfDate,
    }), target);
  });
  return {
    target,
    agingRows,
    snapshots,
    paymentsByCycle: system.paymentsByCycle,
    abortDateByCycle: system.abortDateByCycle,
    manualByCycle,
    results,
  };
}

function resultRows(
  dataset: TargetCalculationDataset,
  mode: "system" | "reconciled",
) {
  const baseline = Object.fromEntries(dataset.agingRows
    .filter((row) => dataset.target.activeRevision.agingScope.includes(row.aging))
    .map((row) => [row.aging, row.totalOsp]));
  const aggregate = aggregateCollectionOspReconciliation(dataset.results, baseline, mode);
  const configByAging = new Map(dataset.agingRows.map((row) => [row.aging, row]));
  const scopedAgings = AGINGS.filter((aging) => dataset.target.activeRevision.agingScope.includes(aging));
  const rows = scopedAgings.map((aging) => {
    const config = configByAging.get(aging) ?? {
      aging,
      totalOsp: "0.00",
      targetPercentage: "0.0000",
      targetOsp: "0.00",
    };
    const value = aggregate.find((row) => row.aging === aging)!;
    return {
      aging,
      totalOsp: config.totalOsp,
      targetPercentage: config.targetPercentage,
      targetOsp: config.targetOsp,
      resultPercentage: value.resultPercentage,
      ospClosed: value.ospClosed,
      closedAccountCount: value.closedAccountCount,
    };
  });
  const allAggregate = aggregate.find((row) => row.aging === "ALL")!;
  const allTotalOsp = dataset.agingRows
    .filter((row) => scopedAgings.includes(row.aging))
    .reduce((sum, row) => sum + parseCollectionOspMoneyCents(row.totalOsp), 0n);
  const allTargetOsp = dataset.agingRows
    .filter((row) => scopedAgings.includes(row.aging))
    .reduce((sum, row) => sum + parseCollectionOspMoneyCents(row.targetOsp), 0n);
  const all = {
    aging: "ALL" as const,
    totalOsp: formatCollectionOspMoneyCents(allTotalOsp),
    targetPercentage: formatCollectionOspPercentage(allTargetOsp, allTotalOsp),
    targetOsp: formatCollectionOspMoneyCents(allTargetOsp),
    resultPercentage: allAggregate.resultPercentage,
    ospClosed: allAggregate.ospClosed,
    closedAccountCount: allAggregate.closedAccountCount,
  };
  return { rows, all };
}

function signedMoneyDifference(left: string, right: string): string {
  return formatCollectionOspMoneyCents(
    parseCollectionOspMoneyCents(left) - parseCollectionOspMoneyCents(right),
  );
}

function percentageUnits(value: string): bigint {
  const normalized = String(value || "0").trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return 0n;
  const [whole, fraction = ""] = normalized.split(".");
  return (BigInt(whole!) * 10_000n) + BigInt(`${fraction}0000`.slice(0, 4));
}

function signedPercentageDifference(left: string, right: string): string {
  const delta = percentageUnits(left) - percentageUnits(right);
  const negative = delta < 0n;
  const absolute = negative ? -delta : delta;
  return `${negative ? "-" : ""}${absolute / 10_000n}.${String(absolute % 10_000n).padStart(4, "0")}`;
}

async function loadClientResultView(
  revisionId: string,
  asOfDate: string,
  dataset: TargetCalculationDataset,
): Promise<{
  rows: CollectionOspClientResultView[];
  all: Omit<CollectionOspClientResultView, "aging"> & { aging: "ALL" };
}> {
  const result = await db.execute(sql`
    SELECT DISTINCT ON (aging_bucket)
      aging_bucket, result_percentage::text, osp_closed::text,
      note, client_reference, as_of_date, version
    FROM public.collection_osp_client_results
    WHERE target_revision_id = ${revisionId}::uuid
      AND as_of_date = ${asOfDate}::date
    ORDER BY aging_bucket, as_of_date DESC, updated_at DESC, id DESC
  `);
  const byAging = new Map(rowsOf(result).map((row) => [String(row.aging_bucket), row]));
  const scopedAgings = AGINGS.filter((aging) => dataset.target.activeRevision.agingScope.includes(aging));
  const rows = scopedAgings.map((aging): CollectionOspClientResultView => {
    const row = byAging.get(aging);
    return {
      aging,
      resultPercentage: row ? String(row.result_percentage) : "0.0000",
      ospClosed: row ? String(row.osp_closed) : "0.00",
      note: row?.note == null ? null : String(row.note),
      reference: row?.client_reference == null ? null : String(row.client_reference),
      effectiveDate: row?.as_of_date == null ? null : dateOnly(row.as_of_date),
      version: row?.version == null ? null : Math.max(1, toNumber(row.version)),
    };
  });
  const explicitAll = byAging.get("ALL");
  return {
    rows,
    all: deriveCollectionOspClientAllView({
      rows,
      scopedAgings,
      asOfDate,
      baselineByAging: new Map(dataset.agingRows.map((row) => [row.aging, row.totalOsp])),
      explicitAll: explicitAll ? {
        resultPercentage: String(explicitAll.result_percentage),
        ospClosed: String(explicitAll.osp_closed),
        note: explicitAll.note == null ? null : String(explicitAll.note),
        reference: explicitAll.client_reference == null ? null : String(explicitAll.client_reference),
        effectiveDate: explicitAll.as_of_date == null ? null : dateOnly(explicitAll.as_of_date),
        version: explicitAll.version == null ? null : Math.max(1, toNumber(explicitAll.version)),
      } : null,
    }),
  };
}

export function deriveCollectionOspClientAllView(input: {
  rows: readonly CollectionOspClientResultView[];
  scopedAgings: readonly CollectionAgingBucket[];
  asOfDate: string;
  baselineByAging: ReadonlyMap<CollectionAgingBucket, string>;
  explicitAll: Omit<CollectionOspClientResultView, "aging"> | null;
}): Omit<CollectionOspClientResultView, "aging"> & { aging: "ALL" } {
  if (input.explicitAll) return { aging: "ALL", ...input.explicitAll };
  const exactRows = input.rows.filter((row) => row.effectiveDate === input.asOfDate);
  const completeExactSnapshot = input.scopedAgings.length > 0
    && input.scopedAgings.every((aging) => exactRows.some((row) => row.aging === aging));
  const totalClientOsp = exactRows.reduce(
    (sum, row) => sum + parseCollectionOspMoneyCents(row.ospClosed),
    0n,
  );
  const totalBaseline = input.scopedAgings.reduce(
    (sum, aging) => sum + parseCollectionOspMoneyCents(input.baselineByAging.get(aging) ?? "0.00"),
    0n,
  );
  return {
    aging: "ALL",
    resultPercentage: completeExactSnapshot
      ? formatCollectionOspPercentage(totalClientOsp, totalBaseline)
      : "0.0000",
    ospClosed: completeExactSnapshot ? formatCollectionOspMoneyCents(totalClientOsp) : "0.00",
    note: null,
    reference: null,
    effectiveDate: completeExactSnapshot ? input.asOfDate : null,
    version: null,
  };
}

export async function getCollectionOspTargetOverviewRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
}) {
  const dataset = await loadTargetCalculationDataset(input.targetId, input.revisionId, input.asOfDate);
  return buildCollectionOspTargetOverviewFromDataset(dataset, input.revisionId, input.asOfDate);
}

async function buildCollectionOspTargetOverviewFromDataset(
  dataset: TargetCalculationDataset,
  revisionId: string,
  asOfDate: string,
) {
  const systemResult = resultRows(dataset, "system");
  const reconciledBase = resultRows(dataset, "reconciled");
  const baseline = Object.fromEntries(dataset.agingRows
    .filter((row) => dataset.target.activeRevision.agingScope.includes(row.aging))
    .map((row) => [row.aging, row.totalOsp]));
  const manualAggregate = aggregateCollectionOspReconciliation(dataset.results, baseline, "manual");
  const scopedAgings = AGINGS.filter((aging) => dataset.target.activeRevision.agingScope.includes(aging));
  const manualRows = scopedAgings.map((aging) => {
    const row = manualAggregate.find((entry) => entry.aging === aging)!;
    return { aging, ospClosed: row.ospClosed, closedAccountCount: row.closedAccountCount };
  });
  const manualAll = manualAggregate.find((entry) => entry.aging === "ALL")!;
  const manualReconciliation = {
    rows: manualRows,
    all: { aging: "ALL" as const, ospClosed: manualAll.ospClosed, closedAccountCount: manualAll.closedAccountCount },
  };
  const manualByAging = new Map(manualRows.map((row) => [row.aging, row]));
  const reconciledResult = {
    rows: reconciledBase.rows.map((row) => ({
      ...row,
      systemOspClosed: systemResult.rows.find((system) => system.aging === row.aging)!.ospClosed,
      manualReconciledOsp: manualByAging.get(row.aging)?.ospClosed ?? "0.00",
      reconciledOspClosed: row.ospClosed,
      reconciledResultPercentage: row.resultPercentage,
    })),
    all: {
      ...reconciledBase.all,
      systemOspClosed: systemResult.all.ospClosed,
      manualReconciledOsp: manualReconciliation.all.ospClosed,
      reconciledOspClosed: reconciledBase.all.ospClosed,
      reconciledResultPercentage: reconciledBase.all.resultPercentage,
    },
  };
  const clientResult = await loadClientResultView(revisionId, asOfDate, dataset);
  const systemAll = [...systemResult.rows, systemResult.all];
  const reconciledAll = [...reconciledResult.rows, reconciledResult.all];
  const clientAll = [...clientResult.rows, clientResult.all];
  const comparison = {
    rows: systemAll.map((system, index) => {
      const reconciled = reconciledAll[index]!;
      const client = clientAll[index];
      const hasClient = Boolean(client?.effectiveDate);
      return {
        aging: system.aging,
        systemResultPercentage: system.resultPercentage,
        reconciledResultPercentage: reconciled.reconciledResultPercentage,
        clientResultPercentage: hasClient ? client!.resultPercentage : null,
        systemOspClosed: system.ospClosed,
        manualReconciledOsp: reconciled.manualReconciledOsp,
        reconciledOspClosed: reconciled.reconciledOspClosed,
        clientOspClosed: hasClient ? client!.ospClosed : null,
        systemVsClientResultPercentagePointDifference: hasClient
          ? signedPercentageDifference(system.resultPercentage, client!.resultPercentage)
          : null,
        reconciledVsClientResultPercentagePointDifference: hasClient
          ? signedPercentageDifference(reconciled.reconciledResultPercentage, client!.resultPercentage)
          : null,
        systemVsClientOspDifference: hasClient ? signedMoneyDifference(system.ospClosed, client!.ospClosed) : null,
        reconciledVsClientOspDifference: hasClient
          ? signedMoneyDifference(reconciled.reconciledOspClosed, client!.ospClosed)
          : null,
      };
    }),
  };
  return {
    target: dataset.target,
    revision: dataset.target.activeRevision,
    asOf: asOfDate,
    systemResult,
    clientResult,
    manualReconciliation,
    reconciledResult,
    comparison,
  };
}

function assertActiveTargetRevision(
  target: CollectionOspSavedTargetView | undefined,
  targetId: string,
  revisionId: string,
): asserts target is CollectionOspSavedTargetView {
  if (
    !target
    || target.id !== targetId
    || target.status !== "ACTIVE"
    || target.activeRevision.id !== revisionId
  ) {
    throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target revision was not found.");
  }
}

function candidateSearchCondition(search: string) {
  if (!search) return sql`TRUE`;
  const accountHash = hashCollectionPiiSearchValue("accountNumber", search);
  const customerHashes = hashCollectionCustomerNameSearchTerms(search) ?? [];
  const last4 = /^\d{4}$/.test(search.replace(/\s+/g, "")) ? search.replace(/\s+/g, "") : null;
  return sql`(
    (${accountHash} IS NOT NULL AND target_row.account_number_search_hash = ${accountHash})
    OR (${last4} IS NOT NULL AND target_row.card_number_last4 = ${last4})
    OR (${customerHashes.length > 0} AND target_row.customer_name_search_hashes && ${buildTextArraySql(customerHashes)})
  )`;
}

export async function listCollectionOspReconciliationCandidatesRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  search: string;
  aging?: CollectionAgingBucket;
  page: number;
  pageSize: number;
}) {
  const target = await getCollectionOspSavedTargetRepository(input.targetId, input.revisionId);
  assertActiveTargetRevision(target, input.targetId, input.revisionId);
  assertTargetDate(target, input.asOfDate, "As-of date");
  if (input.aging && !target.activeRevision.agingScope.includes(input.aging)) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Aging is outside this Saved Target revision.");
  }
  const offset = (input.page - 1) * input.pageSize;
  const nicknameScope = target.activeRevision.nicknameScope.map((value) => value.toLowerCase());
  const result = await db.execute(sql`
    WITH record_stats AS (
      SELECT
        record.settlement_cycle_key AS cycle_key,
        COALESCE(SUM(record.amount), 0)::numeric(16,2)::text AS system_cumulative,
        BOOL_OR(
          record.classification = 'abort_cp'
          AND record.payment_date >= ${targetTrackingRange(target).start}::date
          AND record.payment_date <= ${targetTrackingRange(target).end}::date
        ) AS has_abort
      FROM public.collection_records record
      JOIN public.collection_osp_target_source_rows scoped_row
        ON scoped_row.target_revision_id = ${input.revisionId}::uuid
        AND scoped_row.cycle_key = record.settlement_cycle_key
      JOIN public.collection_osp_target_sources target_source
        ON target_source.target_revision_id = scoped_row.target_revision_id
        AND target_source.source_import_id = record.source_import_id
      WHERE record.payment_date <= ${input.asOfDate}::date
        AND record.payment_date >= ${target.activeRevision.from}::date
        AND record.payment_date <= ${target.activeRevision.to}::date
        AND record.payment_date >= scoped_row.calling_date
        AND record.payment_date < scoped_row.calling_window_end_exclusive
        AND record.duplicate_receipt_flag = false
        AND record.source_obligation_key = scoped_row.canonical_obligation_key
        AND record.total_due = scoped_row.total_due
        AND record.billing_principal_osp = scoped_row.billing_principal_osp
        ${nicknameScope.length > 0
          ? sql`AND lower(record.collection_staff_nickname) = ANY(${buildTextArraySql(nicknameScope)})`
          : sql``}
      GROUP BY record.settlement_cycle_key
    ), candidate_rows AS (
      SELECT
        target_row.*,
        source.source_name_snapshot,
        source.source_filename_snapshot,
        active_manual.id AS active_reconciliation_id,
        COALESCE(stats.system_cumulative, '0.00') AS system_cumulative,
        COALESCE(stats.has_abort, false) AS has_abort,
        COUNT(*) OVER()::int AS total_count
      FROM public.collection_osp_target_source_rows target_row
      JOIN public.collection_osp_target_sources source
        ON source.target_revision_id = target_row.target_revision_id
        AND source.source_import_id = target_row.source_import_id
      LEFT JOIN public.collection_osp_manual_reconciliations active_manual
        ON active_manual.target_revision_id = target_row.target_revision_id
        AND active_manual.cycle_key = target_row.cycle_key
        AND active_manual.status = 'ACTIVE'
      LEFT JOIN record_stats stats ON stats.cycle_key = target_row.cycle_key
      WHERE target_row.target_revision_id = ${input.revisionId}::uuid
        AND target_row.aging_bucket = ANY(${buildTextArraySql(target.activeRevision.agingScope)})
        ${input.aging ? sql`AND target_row.aging_bucket = ${input.aging}` : sql``}
        AND ${candidateSearchCondition(input.search)}
      ORDER BY target_row.calling_date DESC, target_row.cycle_key
      LIMIT ${input.pageSize} OFFSET ${offset}
    )
    SELECT * FROM candidate_rows
  `);
  const rawRows = rowsOf(result);
  const total = rawRows.length > 0 ? toNumber(rawRows[0]!.total_count) : 0;
  const candidates = rawRows.map((row) => {
    const account = decryptCollectionPiiValueSafe(row.account_number_encrypted);
    const customer = decryptCollectionPiiValueSafe(row.customer_name_encrypted);
    const systemCumulative = String(row.system_cumulative ?? "0.00");
    return {
      sourceImportId: String(row.source_import_id),
      sourceRecordId: String(row.source_data_row_id),
      sourceName: String(row.source_name_snapshot),
      sourceFilename: String(row.source_filename_snapshot),
      maskedAccountNumber: maskAccountNumber(account),
      cardNumberLast4: row.card_number_last4 == null ? null : String(row.card_number_last4),
      maskedCustomerName: maskCustomerName(customer),
      aging: String(row.aging_bucket) as CollectionAgingBucket,
      callingDate: dateOnly(row.calling_date),
      totalDue: String(row.total_due),
      billingPrincipalOsp: String(row.billing_principal_osp),
      systemEligibleCumulative: systemCumulative,
      rawSystemClassification: row.has_abort === true
        ? "ABORT_CP" as const
        : parseCollectionOspMoneyCents(systemCumulative) > 0n
          ? "CP" as const
          : null,
      activeReconciliationId: row.active_reconciliation_id == null ? null : String(row.active_reconciliation_id),
    };
  });
  return { candidates, pagination: pagination(input.page, input.pageSize, total) };
}

type ReconciliationDbRow = UnknownRow & {
  id?: unknown;
};

async function loadReconciliationViewsFromRows(
  rawRows: ReconciliationDbRow[],
  asOfDate: string,
  target: CollectionOspSavedTargetView,
  calculationDataset?: TargetCalculationDataset,
): Promise<CollectionOspManualReconciliationView[]> {
  if (rawRows.length === 0) return [];
  let paymentsByCycle: Map<string, CollectionOspSystemPaymentEvent[]>;
  let abortByCycle: Map<string, string>;
  if (calculationDataset) {
    paymentsByCycle = calculationDataset.paymentsByCycle;
    abortByCycle = calculationDataset.abortDateByCycle;
  } else {
    paymentsByCycle = new Map<string, CollectionOspSystemPaymentEvent[]>();
    abortByCycle = new Map<string, string>();
    const cycleKeys = Array.from(new Set(rawRows.map((row) => String(row.cycle_key))));
    const nicknameScope = target.activeRevision.nicknameScope.map((value) => value.toLowerCase());
    const paymentsResult = await db.execute(sql`
    SELECT record.settlement_cycle_key, record.id, record.payment_date,
      record.amount::text, record.classification
    FROM public.collection_records record
    JOIN public.collection_osp_target_source_rows target_row
      ON target_row.target_revision_id = ${target.activeRevision.id}::uuid
      AND target_row.cycle_key = record.settlement_cycle_key
    JOIN public.collection_osp_target_sources target_source
      ON target_source.target_revision_id = target_row.target_revision_id
      AND target_source.source_import_id = record.source_import_id
    WHERE record.settlement_cycle_key = ANY(${buildTextArraySql(cycleKeys)})
      AND record.payment_date <= ${asOfDate}::date
      AND record.payment_date >= ${target.activeRevision.from}::date
      AND record.payment_date <= ${target.activeRevision.to}::date
      AND record.duplicate_receipt_flag = false
      AND record.source_import_id IS NOT NULL
      AND record.source_data_row_id IS NOT NULL
      AND record.source_obligation_key = target_row.canonical_obligation_key
      AND record.total_due = target_row.total_due
      AND record.billing_principal_osp = target_row.billing_principal_osp
      AND record.payment_date >= target_row.calling_date
      AND record.payment_date < target_row.calling_window_end_exclusive
      ${nicknameScope.length > 0
        ? sql`AND lower(record.collection_staff_nickname) = ANY(${buildTextArraySql(nicknameScope)})`
        : sql``}
    ORDER BY record.settlement_cycle_key, record.payment_date, record.created_at, record.id
  `);
    for (const row of rowsOf(paymentsResult)) {
      const key = String(row.settlement_cycle_key);
      const values = paymentsByCycle.get(key) ?? [];
      values.push({ id: String(row.id), date: dateOnly(row.payment_date), amount: String(row.amount) });
      paymentsByCycle.set(key, values);
      if (row.classification === "abort_cp" && !abortByCycle.has(key)) {
        abortByCycle.set(key, dateOnly(row.payment_date));
      }
    }
  }
  return rawRows.map((row): CollectionOspManualReconciliationView => {
    const cycleKey = String(row.cycle_key);
    const status = row.status === "VOIDED" ? "VOIDED" as const : "ACTIVE" as const;
    const calculation = scopeAccountResultToTarget(reconcileCollectionOspAccount({
      targetRevisionId: String(row.target_revision_id),
      cycleKey,
      aging: String(row.aging_bucket) as CollectionAgingBucket,
      totalDue: String(row.total_due),
      billingPrincipalOsp: String(row.billing_principal_osp),
      systemPayments: paymentsByCycle.get(cycleKey) ?? [],
      systemAbortDate: abortByCycle.get(cycleKey) ?? null,
      manual: {
        amount: String(row.manual_prior_amount),
        asOfDate: dateOnly(row.manual_as_of_date),
        actualPaymentDate: row.actual_payment_date == null ? null : dateOnly(row.actual_payment_date),
        active: status === "ACTIVE",
      },
      asOfDate,
    }), target);
    const account = decryptCollectionPiiValueSafe(row.account_number_encrypted);
    const customer = decryptCollectionPiiValueSafe(row.customer_name_encrypted);
    const rawClassification = calculation.systemClosed
      ? "ABORT_CP" as const
      : parseCollectionOspMoneyCents(calculation.systemCumulative) > 0n
        ? "CP" as const
        : null;
    return {
      id: String(row.id),
      version: Math.max(1, toNumber(row.version)),
      status,
      sourceImportId: String(row.source_import_id),
      sourceRecordId: String(row.source_data_row_id),
      sourceName: String(row.source_name_snapshot),
      sourceFilename: String(row.source_filename_snapshot),
      maskedAccountNumber: maskAccountNumber(account),
      cardNumberLast4: row.card_number_last4 == null ? null : String(row.card_number_last4),
      maskedCustomerName: maskCustomerName(customer),
      aging: String(row.aging_bucket) as CollectionAgingBucket,
      callingDate: dateOnly(row.calling_date),
      totalDue: String(row.total_due),
      billingPrincipalOsp: String(row.billing_principal_osp),
      systemEligibleCumulative: calculation.systemCumulative,
      rawSystemClassification: rawClassification,
      manualPriorAmount: String(row.manual_prior_amount),
      asOfDate: dateOnly(row.manual_as_of_date),
      actualPaymentDate: row.actual_payment_date == null ? null : dateOnly(row.actual_payment_date),
      reconciledCumulative: calculation.reconciledCumulative,
      reconciledRemaining: calculation.remainingAmount,
      reconciledStatus: calculation.manualSuperseded
        ? "SUPERSEDED_BY_SYSTEM_ABORT"
        : calculation.reconciledClosed
          ? "RECONCILED_CLOSED"
          : "RECONCILED_OPEN",
      reconciledClosedEffectiveDate: calculation.effectiveClosureDate,
      reason: String(row.reason_code) as CollectionOspManualReasonCode,
      note: row.note == null ? null : String(row.note),
      reference: row.evidence_reference == null ? null : String(row.evidence_reference),
      createdBy: String(row.created_by),
      createdAt: isoDateTime(row.created_at),
      updatedBy: String(row.updated_by),
      updatedAt: isoDateTime(row.updated_at),
    };
  });
}

const RECONCILIATION_SELECT = sql`
  reconciliation.*,
  source.source_name_snapshot,
  source.source_filename_snapshot
`;

export async function listCollectionOspManualReconciliationsRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  search: string;
  aging?: CollectionAgingBucket;
  status?: "ACTIVE" | "VOIDED";
  page: number;
  pageSize: number;
  maxTotalRows?: number;
  calculationDataset?: TargetCalculationDataset;
}) {
  const target = input.calculationDataset?.target
    ?? await getCollectionOspSavedTargetRepository(input.targetId, input.revisionId);
  assertActiveTargetRevision(target, input.targetId, input.revisionId);
  assertTargetDate(target, input.asOfDate, "As-of date");
  if (input.aging && !target.activeRevision.agingScope.includes(input.aging)) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Aging is outside this Saved Target revision.");
  }
  const offset = (input.page - 1) * input.pageSize;
  const searchHashes = input.search ? hashCollectionCustomerNameSearchTerms(input.search) ?? [] : [];
  const result = await db.execute(sql`
    SELECT ${RECONCILIATION_SELECT}, COUNT(*) OVER()::int AS total_count
    FROM public.collection_osp_manual_reconciliations reconciliation
    JOIN public.collection_osp_target_sources source
      ON source.target_revision_id = reconciliation.target_revision_id
      AND source.source_import_id = reconciliation.source_import_id
    JOIN public.collection_osp_target_source_rows target_row
      ON target_row.target_revision_id = reconciliation.target_revision_id
      AND target_row.source_import_id = reconciliation.source_import_id
      AND target_row.source_data_row_id = reconciliation.source_data_row_id
    WHERE reconciliation.target_id = ${input.targetId}::uuid
      AND reconciliation.target_revision_id = ${input.revisionId}::uuid
      ${input.status ? sql`AND reconciliation.status = ${input.status}` : sql``}
      ${input.aging ? sql`AND reconciliation.aging_bucket = ${input.aging}` : sql``}
      AND ${input.search
        ? sql`(
          reconciliation.account_number_search_hash = ${hashCollectionPiiSearchValue("accountNumber", input.search)}
          OR reconciliation.card_number_last4 = ${/^\d{4}$/.test(input.search) ? input.search : null}
          OR (${searchHashes.length > 0} AND target_row.customer_name_search_hashes && ${buildTextArraySql(searchHashes)})
        )`
        : sql`TRUE`}
    ORDER BY reconciliation.updated_at DESC, reconciliation.id
    LIMIT ${input.pageSize} OFFSET ${offset}
  `);
  const rawRows = rowsOf(result);
  const total = rawRows.length > 0 ? toNumber(rawRows[0]!.total_count) : 0;
  if (input.maxTotalRows !== undefined && total > input.maxTotalRows) {
    throw new CollectionOspV7RepositoryError(
      "DATASET_TOO_LARGE",
      `Export exceeds the ${input.maxTotalRows.toLocaleString("en-MY")} manual-reconciliation row limit. Narrow the Saved Target scope and try again.`,
    );
  }
  return {
    reconciliations: await loadReconciliationViewsFromRows(
      rawRows,
      input.asOfDate,
      target,
      input.calculationDataset,
    ),
    pagination: pagination(input.page, input.pageSize, total),
  };
}

function safeAuditState(row: UnknownRow | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    sourceImportId: row.source_import_id,
    sourceRecordId: row.source_data_row_id,
    canonicalObligationKey: row.canonical_obligation_key,
    cycleKey: row.cycle_key,
    aging: row.aging_bucket,
    totalDue: row.total_due,
    billingPrincipalOsp: row.billing_principal_osp,
    manualPriorAmount: row.manual_prior_amount,
    asOfDate: row.manual_as_of_date,
    actualPaymentDate: row.actual_payment_date,
    dateSource: row.date_source,
    reason: row.reason_code,
    note: row.note,
    reference: row.evidence_reference,
    status: row.status,
    version: row.version,
    voidReason: row.void_reason,
  };
}

async function insertReconciliationAudit(
  executor: QueryExecutor,
  input: {
    reconciliationId: string;
    targetId: string;
    revisionId: string;
    operation: "CREATE" | "UPDATE" | "VOID" | "RESTORE";
    fromVersion: number | null;
    toVersion: number;
    before: UnknownRow | null;
    after: UnknownRow;
    actor: string;
    actorRole: string;
    requestId?: string | null | undefined;
  },
) {
  await executor.execute(sql`
    INSERT INTO public.collection_osp_manual_reconciliation_audit (
      id, reconciliation_id, target_id, target_revision_id, operation,
      from_version, to_version, before_state, after_state,
      actor_username, actor_role, request_id, created_at
    ) VALUES (
      ${randomUUID()}::uuid, ${input.reconciliationId}::uuid,
      ${input.targetId}::uuid, ${input.revisionId}::uuid, ${input.operation},
      ${input.fromVersion}, ${input.toVersion},
      ${safeAuditState(input.before)}::jsonb, ${safeAuditState(input.after)}::jsonb,
      ${input.actor}, ${input.actorRole}, ${input.requestId ?? null}, now()
    )
  `);
}

function getErrorField(error: unknown, field: string): string {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object") return "";
    const record = current as Record<string, unknown>;
    if (typeof record[field] === "string") return String(record[field]);
    current = record.cause;
  }
  return "";
}

async function getReconciliationDbRow(
  executor: QueryExecutor,
  targetId: string,
  revisionId: string,
  reconciliationId: string,
  forUpdate = false,
): Promise<UnknownRow | undefined> {
  const result = await executor.execute(sql`
    SELECT ${RECONCILIATION_SELECT}
    FROM public.collection_osp_manual_reconciliations reconciliation
    JOIN public.collection_osp_target_sources source
      ON source.target_revision_id = reconciliation.target_revision_id
      AND source.source_import_id = reconciliation.source_import_id
    WHERE reconciliation.id = ${reconciliationId}::uuid
      AND reconciliation.target_id = ${targetId}::uuid
      AND reconciliation.target_revision_id = ${revisionId}::uuid
    ${forUpdate ? sql`FOR UPDATE OF reconciliation` : sql``}
  `);
  return rowsOf(result)[0];
}

async function getReconciliationView(
  targetId: string,
  revisionId: string,
  reconciliationId: string,
  asOfDate: string,
) {
  const target = await getCollectionOspSavedTargetRepository(targetId, revisionId);
  assertActiveTargetRevision(target, targetId, revisionId);
  assertTargetDate(target, asOfDate, "As-of date");
  const row = await getReconciliationDbRow(db, targetId, revisionId, reconciliationId);
  if (!row) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Manual reconciliation was not found.");
  return (await loadReconciliationViewsFromRows([row], asOfDate, target))[0]!;
}

export async function createCollectionOspManualReconciliationRepository(input: {
  targetId: string;
  revisionId: string;
  sourceImportId: string;
  sourceDataRowId: string;
  manualPriorAmount: string;
  asOfDate: string;
  actualPaymentDate?: string | null;
  reason: CollectionOspManualReasonCode;
  note?: string | null;
  reference?: string | null;
  actor: string;
  actorRole: string;
  requestId?: string | null;
}) {
  const reconciliationId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`collection-osp-reconciliation:${input.revisionId}:${input.sourceImportId}:${input.sourceDataRowId}`}, 0))`);
      const target = (await loadTargetViews(tx, { targetId: input.targetId, revisionId: input.revisionId }))[0];
      assertActiveTargetRevision(target, input.targetId, input.revisionId);
      assertTargetDate(target, input.asOfDate, "Manual reconciliation as-of date");
      const sourceResult = await tx.execute(sql`
        SELECT target_row.*
        FROM public.collection_osp_target_source_rows target_row
        WHERE target_row.target_revision_id = ${input.revisionId}::uuid
          AND target_row.source_import_id = ${input.sourceImportId}
          AND target_row.source_data_row_id = ${input.sourceDataRowId}
        FOR SHARE
      `);
      const source = rowsOf(sourceResult)[0];
      if (!source) throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Selected account is outside this Saved Target revision.");
      if (!target.activeRevision.agingScope.includes(String(source.aging_bucket) as CollectionAgingBucket)) {
        throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Selected account aging is outside this Saved Target revision.");
      }
      const callingDate = dateOnly(source.calling_date);
      const windowEnd = dateOnly(source.calling_window_end_exclusive);
      if (
        input.asOfDate < callingDate
        || input.asOfDate >= windowEnd
        || (input.actualPaymentDate && (
          input.actualPaymentDate < callingDate
          || input.actualPaymentDate >= windowEnd
          || input.actualPaymentDate > input.asOfDate
        ))
      ) {
        throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Manual payment dates must belong to the trusted account calling cycle.");
      }
      const insertedResult = await tx.execute(sql`
        INSERT INTO public.collection_osp_manual_reconciliations (
          id, target_id, target_revision_id, source_import_id, source_data_row_id,
          canonical_obligation_key, cycle_key, account_number_encrypted,
          account_number_search_hash, card_number_last4, customer_name_encrypted,
          aging_bucket, calling_date, calling_window_end_exclusive,
          total_due, billing_principal_osp, manual_prior_amount,
          manual_as_of_date, actual_payment_date, date_source, reason_code,
          note, evidence_reference, status, version,
          created_by, created_at, updated_by, updated_at
        ) VALUES (
          ${reconciliationId}::uuid, ${input.targetId}::uuid, ${input.revisionId}::uuid,
          ${input.sourceImportId}, ${input.sourceDataRowId},
          ${String(source.canonical_obligation_key)}, ${String(source.cycle_key)},
          ${source.account_number_encrypted == null ? null : String(source.account_number_encrypted)},
          ${source.account_number_search_hash == null ? null : String(source.account_number_search_hash)},
          ${source.card_number_last4 == null ? null : String(source.card_number_last4)},
          ${source.customer_name_encrypted == null ? null : String(source.customer_name_encrypted)},
          ${String(source.aging_bucket)}, ${dateOnly(source.calling_date)}::date,
          ${dateOnly(source.calling_window_end_exclusive)}::date,
          ${String(source.total_due)}::numeric(16,2),
          ${String(source.billing_principal_osp)}::numeric(16,2),
          ${input.manualPriorAmount}::numeric(16,2), ${input.asOfDate}::date,
          ${input.actualPaymentDate ?? null}::date,
          ${input.actualPaymentDate ? "ACTUAL_PAYMENT_DATE" : "MANUAL_AS_OF"},
          ${input.reason}, ${input.note ?? null}, ${input.reference ?? null},
          'ACTIVE', 1, ${input.actor}, now(), ${input.actor}, now()
        ) RETURNING *
      `);
      const inserted = rowsOf(insertedResult)[0]!;
      await insertReconciliationAudit(tx, {
        reconciliationId,
        targetId: input.targetId,
        revisionId: input.revisionId,
        operation: "CREATE",
        fromVersion: null,
        toVersion: 1,
        before: null,
        after: inserted,
        actor: input.actor,
        actorRole: input.actorRole,
        requestId: input.requestId,
      });
    });
  } catch (error) {
    if (getErrorField(error, "code") === "23505") {
      throw new CollectionOspV7RepositoryError("DUPLICATE", "An active reconciliation already exists for this target account and cycle.");
    }
    throw error;
  }
  return getReconciliationView(input.targetId, input.revisionId, reconciliationId, input.asOfDate);
}

export async function updateCollectionOspManualReconciliationRepository(input: {
  targetId: string;
  revisionId: string;
  reconciliationId: string;
  expectedVersion: number;
  manualPriorAmount: string;
  asOfDate: string;
  actualPaymentDate?: string | null;
  reason: CollectionOspManualReasonCode;
  note?: string | null;
  reference?: string | null;
  actor: string;
  actorRole: string;
  requestId?: string | null;
}) {
  await db.transaction(async (tx) => {
    const target = (await loadTargetViews(tx, { targetId: input.targetId, revisionId: input.revisionId }))[0];
    assertActiveTargetRevision(target, input.targetId, input.revisionId);
    assertTargetDate(target, input.asOfDate, "Manual reconciliation as-of date");
    const before = await getReconciliationDbRow(tx, input.targetId, input.revisionId, input.reconciliationId, true);
    if (!before) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Manual reconciliation was not found.");
    if (before.status !== "ACTIVE") throw new CollectionOspV7RepositoryError("DELETED", "Voided reconciliation cannot be edited.");
    if (toNumber(before.version) !== input.expectedVersion) {
      throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Manual reconciliation changed in another session.");
    }
    const callingDate = dateOnly(before.calling_date);
    const windowEnd = dateOnly(before.calling_window_end_exclusive);
    if (
      input.asOfDate < callingDate
      || input.asOfDate >= windowEnd
      || (input.actualPaymentDate && (
        input.actualPaymentDate < callingDate
        || input.actualPaymentDate >= windowEnd
        || input.actualPaymentDate > input.asOfDate
      ))
    ) {
      throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Manual payment dates must belong to the trusted account calling cycle.");
    }
    const result = await tx.execute(sql`
      UPDATE public.collection_osp_manual_reconciliations
      SET manual_prior_amount = ${input.manualPriorAmount}::numeric(16,2),
        manual_as_of_date = ${input.asOfDate}::date,
        actual_payment_date = ${input.actualPaymentDate ?? null}::date,
        date_source = ${input.actualPaymentDate ? "ACTUAL_PAYMENT_DATE" : "MANUAL_AS_OF"},
        reason_code = ${input.reason}, note = ${input.note ?? null},
        evidence_reference = ${input.reference ?? null}, version = version + 1,
        updated_by = ${input.actor}, updated_at = now()
      WHERE id = ${input.reconciliationId}::uuid
        AND target_id = ${input.targetId}::uuid
        AND target_revision_id = ${input.revisionId}::uuid
        AND version = ${input.expectedVersion}
        AND status = 'ACTIVE'
      RETURNING *
    `);
    const after = rowsOf(result)[0];
    if (!after) throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Manual reconciliation changed in another session.");
    await insertReconciliationAudit(tx, {
      reconciliationId: input.reconciliationId,
      targetId: input.targetId,
      revisionId: input.revisionId,
      operation: "UPDATE",
      fromVersion: input.expectedVersion,
      toVersion: input.expectedVersion + 1,
      before,
      after,
      actor: input.actor,
      actorRole: input.actorRole,
      requestId: input.requestId,
    });
  });
  return getReconciliationView(input.targetId, input.revisionId, input.reconciliationId, input.asOfDate);
}

export async function voidCollectionOspManualReconciliationRepository(input: {
  targetId: string;
  revisionId: string;
  reconciliationId: string;
  expectedVersion: number;
  reason: string;
  asOfDate: string;
  actor: string;
  actorRole: string;
  requestId?: string | null;
}) {
  await db.transaction(async (tx) => {
    const target = (await loadTargetViews(tx, { targetId: input.targetId, revisionId: input.revisionId }))[0];
    assertActiveTargetRevision(target, input.targetId, input.revisionId);
    assertTargetDate(target, input.asOfDate, "Manual reconciliation as-of date");
    const before = await getReconciliationDbRow(tx, input.targetId, input.revisionId, input.reconciliationId, true);
    if (!before) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Manual reconciliation was not found.");
    if (before.status !== "ACTIVE") throw new CollectionOspV7RepositoryError("DELETED", "Manual reconciliation is already voided.");
    if (toNumber(before.version) !== input.expectedVersion) {
      throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Manual reconciliation changed in another session.");
    }
    const result = await tx.execute(sql`
      UPDATE public.collection_osp_manual_reconciliations
      SET status = 'VOIDED', version = version + 1,
        voided_by = ${input.actor}, voided_at = now(), void_reason = ${input.reason},
        updated_by = ${input.actor}, updated_at = now()
      WHERE id = ${input.reconciliationId}::uuid
        AND target_id = ${input.targetId}::uuid
        AND target_revision_id = ${input.revisionId}::uuid
        AND version = ${input.expectedVersion}
        AND status = 'ACTIVE'
      RETURNING *
    `);
    const after = rowsOf(result)[0];
    if (!after) throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Manual reconciliation changed in another session.");
    await insertReconciliationAudit(tx, {
      reconciliationId: input.reconciliationId,
      targetId: input.targetId,
      revisionId: input.revisionId,
      operation: "VOID",
      fromVersion: input.expectedVersion,
      toVersion: input.expectedVersion + 1,
      before,
      after,
      actor: input.actor,
      actorRole: input.actorRole,
      requestId: input.requestId,
    });
  });
  return getReconciliationView(input.targetId, input.revisionId, input.reconciliationId, input.asOfDate);
}

export async function listCollectionOspReconciliationHistoryRepository(input: {
  targetId: string;
  revisionId: string;
  reconciliationId: string;
  limit: number;
}) {
  const exists = await getReconciliationDbRow(db, input.targetId, input.revisionId, input.reconciliationId);
  if (!exists) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Manual reconciliation was not found.");
  const result = await db.execute(sql`
    SELECT id, operation, from_version, to_version, before_state, after_state,
      actor_username, created_at
    FROM public.collection_osp_manual_reconciliation_audit
    WHERE reconciliation_id = ${input.reconciliationId}::uuid
      AND target_id = ${input.targetId}::uuid
      AND target_revision_id = ${input.revisionId}::uuid
    ORDER BY created_at DESC, id DESC
    LIMIT ${input.limit}
  `);
  return rowsOf(result).map((row) => ({
    id: String(row.id),
    operation: String(row.operation) as "CREATE" | "UPDATE" | "VOID" | "RESTORE",
    fromVersion: row.from_version == null ? null : toNumber(row.from_version),
    toVersion: toNumber(row.to_version),
    before: row.before_state && typeof row.before_state === "object" ? row.before_state as Record<string, unknown> : null,
    after: row.after_state && typeof row.after_state === "object" ? row.after_state as Record<string, unknown> : null,
    actor: String(row.actor_username),
    createdAt: isoDateTime(row.created_at),
  }));
}

export async function upsertCollectionOspClientResultsRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  rows: Array<{
    aging: CollectionAgingBucket;
    resultPercentage: string;
    ospClosed: string;
    note?: string | null;
    reference?: string | null;
    expectedVersion?: number | null;
  }>;
  actor: string;
}): Promise<CollectionOspClientResultView[]> {
  await db.transaction(async (tx) => {
    const target = (await loadTargetViews(tx, { targetId: input.targetId, revisionId: input.revisionId }))[0];
    assertActiveTargetRevision(target, input.targetId, input.revisionId);
    assertTargetDate(target, input.asOfDate, "Client Result as-of date");
    const submittedAgings = Array.from(new Set(input.rows.map((row) => row.aging))).sort();
    const scopedAgings = [...target.activeRevision.agingScope].sort();
    if (
      submittedAgings.length !== scopedAgings.length
      || submittedAgings.some((aging, index) => aging !== scopedAgings[index])
    ) {
      throw new CollectionOspV7RepositoryError(
        "INVALID_SOURCE",
        "Client Result rows must match the Saved Target aging scope exactly.",
      );
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`collection-osp-client:${input.revisionId}:${input.asOfDate}`}, 0))`);
    for (const row of input.rows) {
      const existingResult = await tx.execute(sql`
        SELECT id, version
        FROM public.collection_osp_client_results
        WHERE target_revision_id = ${input.revisionId}::uuid
          AND as_of_date = ${input.asOfDate}::date
          AND aging_bucket = ${row.aging}
        FOR UPDATE
      `);
      const existing = rowsOf(existingResult)[0];
      if (
        existing
        && (
          row.expectedVersion === undefined
          || row.expectedVersion === null
          || toNumber(existing.version) !== row.expectedVersion
        )
      ) {
        throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Client Result changed in another session.");
      }
      if (existing) {
        await tx.execute(sql`
          UPDATE public.collection_osp_client_results
          SET result_percentage = ${row.resultPercentage}::numeric(9,4),
            osp_closed = ${row.ospClosed}::numeric(16,2),
            client_reference = ${row.reference ?? null}, note = ${row.note ?? null},
            version = version + 1, updated_by = ${input.actor}, updated_at = now()
          WHERE id = ${String(existing.id)}::uuid
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO public.collection_osp_client_results (
            id, target_id, target_revision_id, as_of_date, aging_bucket,
            result_percentage, osp_closed, client_reference, note, version,
            created_by, created_at, updated_by, updated_at
          ) VALUES (
            ${randomUUID()}::uuid, ${input.targetId}::uuid, ${input.revisionId}::uuid,
            ${input.asOfDate}::date, ${row.aging},
            ${row.resultPercentage}::numeric(9,4), ${row.ospClosed}::numeric(16,2),
            ${row.reference ?? null}, ${row.note ?? null}, 1,
            ${input.actor}, now(), ${input.actor}, now()
          )
        `);
      }
    }
  });
  const dataset = await loadTargetCalculationDataset(input.targetId, input.revisionId, input.asOfDate);
  return (await loadClientResultView(input.revisionId, input.asOfDate, dataset)).rows;
}

function enumerateDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

export async function getCollectionOspCalendarRepository(input: {
  targetId: string;
  revisionId: string;
  from: string;
  to: string;
  asOfDate: string;
  aging?: CollectionAgingBucket;
}) {
  const dataset = await loadTargetCalculationDataset(input.targetId, input.revisionId, input.asOfDate, {
    maxSourceRows: MAX_DRILLDOWN_SOURCE_ROWS,
    operationLabel: "Drilldown",
  });
  return buildCollectionOspCalendarFromDataset(dataset, input);
}

async function buildCollectionOspCalendarFromDataset(
  dataset: TargetCalculationDataset,
  input: {
    revisionId: string;
    from: string;
    to: string;
    aging?: CollectionAgingBucket;
  },
) {
  const range = targetTrackingRange(dataset.target);
  if (input.from > input.to || input.from < range.start || input.to > range.end) {
    throw new CollectionOspV7RepositoryError(
      "INVALID_SOURCE",
      `Calendar range must be within the Saved Target tracking period (${range.start} to ${range.end}).`,
    );
  }
  if (input.aging && !dataset.target.activeRevision.agingScope.includes(input.aging)) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Aging is outside this Saved Target revision.");
  }
  const selectedAgings = input.aging
    ? [input.aging]
    : dataset.target.activeRevision.agingScope;
  const totalBaseline = dataset.agingRows
    .filter((row) => selectedAgings.includes(row.aging))
    .reduce((sum, row) => sum + parseCollectionOspMoneyCents(row.totalOsp), 0n);
  const targetOsp = dataset.agingRows
    .filter((row) => selectedAgings.includes(row.aging))
    .reduce((sum, row) => sum + parseCollectionOspMoneyCents(row.targetOsp), 0n);
  const clientResult = await db.execute(sql`
    SELECT as_of_date, aging_bucket, osp_closed::text, result_percentage::text
    FROM public.collection_osp_client_results
    WHERE target_revision_id = ${input.revisionId}::uuid
      AND as_of_date >= ${input.from}::date
      AND as_of_date <= ${input.to}::date
    ORDER BY as_of_date, aging_bucket
  `);
  const clientSnapshots = new Map<string, Map<string, { ospClosed: string; resultPercentage: string }>>();
  for (const row of rowsOf(clientResult)) {
    const date = dateOnly(row.as_of_date);
    const snapshot = clientSnapshots.get(date)
      ?? new Map<string, { ospClosed: string; resultPercentage: string }>();
    snapshot.set(String(row.aging_bucket), {
      ospClosed: String(row.osp_closed),
      resultPercentage: String(row.result_percentage),
    });
    clientSnapshots.set(date, snapshot);
  }
  const calendarAging: CollectionAgingBucket | "ALL" = input.aging ?? "ALL";
  return {
    from: input.from,
    to: input.to,
    aging: calendarAging,
    days: buildCollectionOspCalendarDays({
      from: input.from,
      to: input.to,
      ...(input.aging ? { aging: input.aging } : {}),
      totalBaseline,
      targetOsp,
      targetAgingScope: dataset.target.activeRevision.agingScope,
      results: input.aging
        ? dataset.results.filter((result) => result.aging === input.aging)
        : dataset.results,
      activeManualCycleKeys: new Set(
        Array.from(dataset.manualByCycle.values())
          .filter((row) => row.status === "ACTIVE")
          .map((row) => row.cycleKey),
      ),
      clientSnapshots,
    }),
  };
}

export function buildCollectionOspCalendarDays(input: {
  from: string;
  to: string;
  aging?: CollectionAgingBucket;
  totalBaseline: bigint;
  targetOsp: bigint;
  targetAgingScope: readonly CollectionAgingBucket[];
  results: readonly CollectionOspReconciliationAccountResult[];
  activeManualCycleKeys: ReadonlySet<string>;
  clientSnapshots: ReadonlyMap<string, ReadonlyMap<string, {
    ospClosed: string;
    resultPercentage: string;
  }>>;
}) {
  const systemEvents = new Map<string, bigint>();
  const systemCounts = new Map<string, number>();
  const manualEvents = new Map<string, bigint>();
  const manualCounts = new Map<string, number>();
  const reconciledEvents = new Map<string, bigint>();
  const reconciledCounts = new Map<string, number>();
  const add = (amounts: Map<string, bigint>, counts: Map<string, number>, date: string, amount: bigint) => {
    amounts.set(date, (amounts.get(date) ?? 0n) + amount);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  };
  for (const result of input.results) {
    const osp = parseCollectionOspMoneyCents(result.billingPrincipalOsp);
    if (result.systemClosed && result.systemAbortDate) {
      add(systemEvents, systemCounts, result.systemAbortDate, osp);
    }
    const manualEstablishedEarlierClosure = input.activeManualCycleKeys.has(result.cycleKey)
      && result.effectiveClosureDate !== null
      && result.effectiveClosureDate !== result.systemAbortDate;
    if (
      (result.contributionSource === "MANUAL_RECONCILIATION" || manualEstablishedEarlierClosure)
      && result.effectiveClosureDate
    ) {
      add(manualEvents, manualCounts, result.effectiveClosureDate, osp);
    }
    if (result.reconciledClosed && result.effectiveClosureDate) {
      add(reconciledEvents, reconciledCounts, result.effectiveClosureDate, osp);
    }
  }
  const dates = enumerateDates(input.from, input.to);
  let systemCumulative = Array.from(systemEvents.entries())
    .filter(([date]) => date < input.from)
    .reduce((sum, [, amount]) => sum + amount, 0n);
  let manualCumulative = Array.from(manualEvents.entries())
    .filter(([date]) => date < input.from)
    .reduce((sum, [, amount]) => sum + amount, 0n);
  let reconciledCumulative = Array.from(reconciledEvents.entries())
    .filter(([date]) => date < input.from)
    .reduce((sum, [, amount]) => sum + amount, 0n);
  const calendarAging: CollectionAgingBucket | "ALL" = input.aging ?? "ALL";
  const days = dates.map((date) => {
    const systemToday = systemEvents.get(date) ?? 0n;
    const manualToday = manualEvents.get(date) ?? 0n;
    const reconciledToday = reconciledEvents.get(date) ?? 0n;
    const previousSystemResult = formatCollectionOspPercentage(systemCumulative, input.totalBaseline);
    const previousReconciledResult = formatCollectionOspPercentage(reconciledCumulative, input.totalBaseline);
    systemCumulative += systemToday;
    manualCumulative += manualToday;
    reconciledCumulative += reconciledToday;
    const clientSnapshot = input.clientSnapshots.get(date);
    const explicitAll = clientSnapshot?.get("ALL");
    const scopedClientSnapshot = input.aging ? clientSnapshot?.get(input.aging) : undefined;
    const hasCompleteAllSnapshot = !input.aging
      && Boolean(clientSnapshot)
      && input.targetAgingScope.every((aging) => clientSnapshot!.has(aging));
    const clientTotal = explicitAll
      ? parseCollectionOspMoneyCents(explicitAll.ospClosed)
      : hasCompleteAllSnapshot
        ? input.targetAgingScope.reduce(
          (sum, aging) => sum + parseCollectionOspMoneyCents(clientSnapshot!.get(aging)!.ospClosed),
          0n,
        )
        : 0n;
    const clientResultPercentage = input.aging
      ? scopedClientSnapshot?.resultPercentage ?? null
      : explicitAll?.resultPercentage
        ?? (hasCompleteAllSnapshot
          ? formatCollectionOspPercentage(clientTotal, input.totalBaseline)
          : null);
    return {
      date,
      aging: calendarAging,
      totalOsp: formatCollectionOspMoneyCents(input.totalBaseline),
      targetOsp: formatCollectionOspMoneyCents(input.targetOsp),
      systemOspClosedToday: formatCollectionOspMoneyCents(systemToday),
      manualReconciliationOspClosedToday: formatCollectionOspMoneyCents(manualToday),
      reconciledOspClosedToday: formatCollectionOspMoneyCents(reconciledToday),
      systemCumulativeOspClosed: formatCollectionOspMoneyCents(systemCumulative),
      manualReconciliationCumulativeOsp: formatCollectionOspMoneyCents(manualCumulative),
      reconciledCumulativeOspClosed: formatCollectionOspMoneyCents(reconciledCumulative),
      systemResultPercentage: formatCollectionOspPercentage(systemCumulative, input.totalBaseline),
      reconciledResultPercentage: formatCollectionOspPercentage(reconciledCumulative, input.totalBaseline),
      clientResultPercentage,
      systemPreviousResultPercentage: previousSystemResult,
      reconciledPreviousResultPercentage: previousReconciledResult,
      systemDailyMovementPercentagePoints: formatCollectionOspPercentage(systemToday, input.totalBaseline),
      reconciledDailyMovementPercentagePoints: formatCollectionOspPercentage(reconciledToday, input.totalBaseline),
      systemAchievementVsTargetPercentage: formatCollectionOspPercentage(systemCumulative, input.targetOsp),
      reconciledAchievementVsTargetPercentage: formatCollectionOspPercentage(reconciledCumulative, input.targetOsp),
      systemDailyAccounts: systemCounts.get(date) ?? 0,
      manualDailyAccounts: manualCounts.get(date) ?? 0,
      reconciledDailyAccounts: reconciledCounts.get(date) ?? 0,
    };
  });
  return days;
}

export async function getCollectionOspDrilldownRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  date?: string;
  aging?: CollectionAgingBucket;
  contributionSource?: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION";
  page: number;
  pageSize: number;
}) {
  const dataset = await loadTargetCalculationDataset(input.targetId, input.revisionId, input.asOfDate);
  return buildCollectionOspDrilldownFromDataset(dataset, input);
}

export function resolveCollectionOspDrilldownContribution(
  result: CollectionOspReconciliationAccountResult,
  hasActiveManual: boolean,
  hasExactDateFilter: boolean,
  requestedSource: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | undefined,
): {
  source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION";
  effectiveDate: string;
} | null {
  const manualEstablishedEarlierClosure = hasActiveManual
    && parseCollectionOspMoneyCents(result.manualPriorAmount) > 0n
    && result.effectiveClosureDate !== null
    && result.effectiveClosureDate !== result.systemAbortDate;
  if (requestedSource === "SYSTEM_ABORT_CP") {
    return result.systemClosed && result.systemAbortDate
      ? { source: "SYSTEM_ABORT_CP", effectiveDate: result.systemAbortDate }
      : null;
  }
  if (requestedSource === "MANUAL_RECONCILIATION") {
    return (
      result.contributionSource === "MANUAL_RECONCILIATION"
      // A source-filtered current/cumulative drilldown must reconcile to the
      // current Manual summary, where native System ABORT takes precedence.
      // Retain the superseded manual event only for an exact-day historical
      // movement drilldown.
      || (hasExactDateFilter && manualEstablishedEarlierClosure)
    ) && result.effectiveClosureDate
      ? { source: "MANUAL_RECONCILIATION", effectiveDate: result.effectiveClosureDate }
      : null;
  }
  if (!result.reconciledClosed || !result.effectiveClosureDate) return null;
  // Exact-day movement retains the event that first put the account into the
  // reconciled union. A cumulative/current view uses native System precedence.
  if (hasExactDateFilter && manualEstablishedEarlierClosure) {
    return { source: "MANUAL_RECONCILIATION", effectiveDate: result.effectiveClosureDate };
  }
  if (result.contributionSource === "MANUAL_RECONCILIATION") {
    return { source: "MANUAL_RECONCILIATION", effectiveDate: result.effectiveClosureDate };
  }
  return {
    source: "SYSTEM_ABORT_CP",
    effectiveDate: result.systemAbortDate ?? result.effectiveClosureDate,
  };
}

function buildCollectionOspDrilldownFromDataset(
  dataset: TargetCalculationDataset,
  input: {
    date?: string;
    aging?: CollectionAgingBucket;
    contributionSource?: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION";
    page: number;
    pageSize: number;
  },
) {
  if (input.date) assertTargetDate(dataset.target, input.date, "Drilldown date");
  if (input.aging && !dataset.target.activeRevision.agingScope.includes(input.aging)) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Aging is outside this Saved Target revision.");
  }
  const snapshotByCycle = new Map(dataset.snapshots.map((snapshot) => [snapshot.cycleKey, snapshot]));
  const items = dataset.results.flatMap((result) => {
    const snapshot = snapshotByCycle.get(result.cycleKey);
    if (!snapshot) return [];
    const manual = dataset.manualByCycle.get(result.cycleKey);
    const hasActiveManual = manual?.status === "ACTIVE";
    const contribution = resolveCollectionOspDrilldownContribution(
      result,
      hasActiveManual,
      Boolean(input.date),
      input.contributionSource,
    );
    if (!contribution) return [];
    const { source, effectiveDate } = contribution;
    if (input.aging && result.aging !== input.aging) return [];
    if (input.date && effectiveDate !== input.date) return [];
    const account = decryptCollectionPiiValueSafe(snapshot.accountNumberEncrypted);
    const customer = decryptCollectionPiiValueSafe(snapshot.customerNameEncrypted);
    const systemAbortEvent = dataset.paymentsByCycle.get(result.cycleKey)?.find((payment) => (
      payment.classification === "abort_cp"
      && payment.date === result.systemAbortDate
    ));
    return [{
      contributionSource: source,
      maskedAccountNumber: maskAccountNumber(account),
      cardNumberLast4: snapshot.cardNumberLast4,
      maskedCustomerName: maskCustomerName(customer),
      sourceName: snapshot.sourceName,
      sourceFilename: snapshot.sourceFilename,
      callingDate: snapshot.callingDate,
      aging: result.aging,
      totalDue: result.totalDue,
      systemEligibleCumulative: result.systemCumulative,
      systemClosureCollectionAmount: source === "SYSTEM_ABORT_CP"
        ? systemAbortEvent?.amount ?? null
        : null,
      systemClosureStaffNickname: source === "SYSTEM_ABORT_CP"
        ? systemAbortEvent?.collectionStaffNickname ?? null
        : null,
      manualPriorAmount: manual?.status === "ACTIVE" ? manual.amount : "0.00",
      reconciledCumulative: result.reconciledCumulative,
      billingPrincipalOsp: result.billingPrincipalOsp,
      effectiveClosedDate: effectiveDate,
      reason: manual?.reason ?? null,
      reference: manual?.reference ?? null,
      reconciliationCreatedBy: manual?.createdBy ?? null,
      reconciliationCreatedAt: manual?.createdAt ?? null,
      reconciliationUpdatedBy: manual?.updatedBy ?? null,
      reconciliationUpdatedAt: manual?.updatedAt ?? null,
    }];
  }).sort((left, right) => left.effectiveClosedDate.localeCompare(right.effectiveClosedDate)
    || left.maskedAccountNumber.localeCompare(right.maskedAccountNumber));
  const total = items.length;
  const offset = (input.page - 1) * input.pageSize;
  return {
    items: items.slice(offset, offset + input.pageSize),
    pagination: pagination(input.page, input.pageSize, total),
  };
}

export async function getCollectionOspExportDatasetRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  from: string;
  to: string;
  date?: string;
  aging?: CollectionAgingBucket;
  contributionSource?: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION";
}) {
  const calculationDataset = await loadTargetCalculationDataset(
    input.targetId,
    input.revisionId,
    input.asOfDate,
    {
      maxSourceRows: MAX_EXPORT_SOURCE_ROWS,
      operationLabel: "Export",
    },
  );
  const [overview, reconciliations, calendar, drilldown] = await Promise.all([
    buildCollectionOspTargetOverviewFromDataset(
      calculationDataset,
      input.revisionId,
      input.asOfDate,
    ),
    listCollectionOspManualReconciliationsRepository({
      ...input,
      search: "",
      page: 1,
      pageSize: MAX_EXPORT_SOURCE_ROWS + 1,
      maxTotalRows: MAX_EXPORT_SOURCE_ROWS,
      calculationDataset,
    }),
    buildCollectionOspCalendarFromDataset(calculationDataset, input),
    Promise.resolve(buildCollectionOspDrilldownFromDataset(calculationDataset, {
      ...input,
      page: 1,
      pageSize: MAX_EXPORT_DETAIL_ROWS,
    })),
  ]);
  if (
    reconciliations.pagination.total !== reconciliations.reconciliations.length
    || drilldown.pagination.total !== drilldown.items.length
  ) {
    throw new CollectionOspV7RepositoryError(
      "INVALID_SOURCE",
      `The export contains more than ${MAX_EXPORT_DETAIL_ROWS.toLocaleString("en-MY")} detail rows. Narrow the export date or aging filters and try again.`,
    );
  }
  return {
    generatedAt: new Date().toISOString(),
    filters: {
      asOf: input.asOfDate,
      from: input.from,
      to: input.to,
      date: input.date ?? null,
      aging: input.aging ?? null,
      contributionSource: input.contributionSource ?? null,
    },
    overview,
    reconciliations: reconciliations.reconciliations,
    reconciliationTotal: reconciliations.pagination.total,
    calendar: calendar.days,
    drilldown: drilldown.items,
    drilldownTotal: drilldown.pagination.total,
  };
}
