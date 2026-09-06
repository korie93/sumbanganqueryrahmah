import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db-postgres";
import { CollectionOspV7RepositoryError } from "./collection-osp-repository-error";
import { collectionOspReportingRange, defaultCollectionOspAsOf, isCollectionOspBusinessDate, resolveCollectionOspReportingWindow } from "../lib/collection-osp-reporting-window";
export { CollectionOspV7RepositoryError } from "./collection-osp-repository-error";
import {
  assertCollectionOspEligibleAdmin, assertCollectionOspSourceAssignment,
  assertCollectionOspSuperuserActor, loadCollectionOspConfiguredSourceScope,
  assertCollectionOspBaselinePrecision,
} from "./collection-osp-source-scope-repository-utils";
import {
  decryptCollectionPiiValueSafe,
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  hasCollectionPiiEncryptionConfigured,
} from "../lib/collection-pii-encryption";
import {
  calculateCollectionOspBalance,
  calculateCollectionOspPercentageAmount as calculateTargetOsp,
  normalizeCollectionOspTargetPercentage as parseTargetPercentage,
  formatCollectionOspMoneyCents,
  formatCollectionOspPercentage,
  parseCollectionOspMoneyCents,
  reconcileCollectionOspAccount,
  type CollectionOspReconciliationAccountResult,
  type CollectionOspSystemPaymentEvent,
} from "../lib/collection-osp-reconciliation";
import {
  extractCanonicalSavedCollectionMasterRow,
  extractSavedCollectionDisplayDetails,
} from "../lib/saved-collection-link-utils";
import type {
  CollectionAgingBucket,
  CollectionOspClientResultView,
  CollectionOspClientResultTableView,
  CollectionOspManualReasonCode,
  CollectionOspManualReconciliationView,
  CollectionOspPagination,
  CollectionOspSavedTargetView,
  CollectionOspTargetInput,
  CollectionOspViewer,
} from "../storage-postgres-collection-types";
import type { CollectionRepositoryExecutor } from "./collection-nickname-types";
import { buildTextArraySql } from "./sql-array-utils";
import { buildCollectionSourceScopeHash } from "./collection-source-repository-utils";
import { buildCollectionOspAgingAggregateQuery, buildCollectionOspDailyAggregateQuery, buildCollectionOspEffectiveAccountCtes } from "./collection-osp-effective-query";
import {
  hashCollectionSourceIdentifier,
  normalizeCollectionSourceIdentifier,
} from "./collection-source-repository-utils";

const AGINGS: CollectionAgingBucket[] = ["D3", "D4", "D5", "D6"];
const TARGET_SOURCE_PAGE_SIZE = 500;
const MAX_TARGET_SOURCE_ROWS = 100_000;
const MAX_TARGET_PAYMENT_ROWS = 250_000;
const MAX_TARGET_PAYMENTS_PER_SOURCE_ROW = 20;
const MAX_EXPORT_DETAIL_ROWS = 10_000;

export function resolveCollectionOspDatasetLimits(maxSourceRows = MAX_TARGET_SOURCE_ROWS): {
  maxSourceRows: number;
  maxPaymentRows: number;
} {
  return {
    maxSourceRows,
    maxPaymentRows: Math.min(
      MAX_TARGET_PAYMENT_ROWS,
      maxSourceRows * MAX_TARGET_PAYMENTS_PER_SOURCE_ROW,
    ),
  };
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

export function resolveCollectionOspAuthoritativeBaseline(input: {
  aging: CollectionAgingBucket;
  derivedBaselineCents: bigint;
  submittedBaseline?: string | null;
}): string {
  const authoritativeBaseline = formatCollectionOspMoneyCents(input.derivedBaselineCents);
  assertCollectionOspBaselinePrecision(authoritativeBaseline);
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
  return collectionOspReportingRange(target.activeRevision);
}

function assertTargetDate(
  target: CollectionOspSavedTargetView,
  value: string,
  label: string,
): void {
  const range = targetTrackingRange(target);
  if (!isCollectionOspBusinessDate(value) || value < range.start || value > range.end) {
    throw new CollectionOspV7RepositoryError(
      "INVALID_SOURCE",
      `${label} must be within the Collection Source reporting period (${range.start} to ${range.end}).`,
    );
  }
}

function latestTargetAsOf(target: CollectionOspSavedTargetView): string {
  return defaultCollectionOspAsOf(target.activeRevision);
}

function reportingSourcesSql(revisionId: SQL) {
  return sql`(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'sourceImportId', source.source_import_id, 'validFrom', config.valid_from::text,
      'validTo', config.valid_to::text) ORDER BY source.source_import_id), '[]'::jsonb)
    FROM public.collection_osp_target_sources source
    LEFT JOIN public.collection_source_configs config ON config.source_import_id = source.source_import_id
    WHERE source.target_revision_id = ${revisionId})`;
}

function assertReportingWindowStillCurrent(target: CollectionOspSavedTargetView, current: UnknownRow) {
  if (!target.activeRevision.reportingWindow) return;
  const sources = current.reporting_sources;
  if (!Array.isArray(sources)) throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Source validity could not be revalidated. Reload the report.");
  const window = resolveCollectionOspReportingWindow(target.activeRevision, sources);
  if (window.version !== target.activeRevision.reportingWindow.version) {
    throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Collection Source validity changed while loading. Reload the report.");
  }
}

function targetViewerPredicate(viewer: CollectionOspViewer | undefined) {
  // Missing scope is never an administrative wildcard on an exported read.
  if (!viewer?.userId || !["admin", "manager", "superuser"].includes(viewer.role)) return sql`FALSE`;
  return sql`(
    (${viewer.role} IN ('superuser', 'manager') OR target.assigned_admin_user_id = ${viewer.userId})
    AND EXISTS (
      SELECT 1 FROM public.users viewer_account
      WHERE viewer_account.id = ${viewer.userId} AND viewer_account.role = ${viewer.role}
        AND viewer_account.status = 'active' AND COALESCE(viewer_account.is_banned, false) = false
    )
  )`;
}

async function assertViewerStillAuthorized(target: CollectionOspSavedTargetView, viewer: CollectionOspViewer | undefined, verifyReportingWindow = true) {
  const current = rowsOf(await db.execute(sql`
    SELECT target.version, ${reportingSourcesSql(sql`${target.activeRevision.id}::uuid`)} AS reporting_sources
    FROM public.collection_osp_saved_targets target
    WHERE target.id = ${target.id}::uuid AND target.status = 'ACTIVE'
      AND ${targetViewerPredicate(viewer)}
  `))[0];
  if (!current) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
  if (toNumber(current.version) !== target.version) {
    throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Saved Target changed while loading. Reload the report.");
  }
  if (verifyReportingWindow) assertReportingWindowStillCurrent(target, current);
}

async function loadTargetViews(
  executor: QueryExecutor,
  filters: { targetId?: string; revisionId?: string; includeDeleted?: boolean; viewer?: CollectionOspViewer; enforceViewer?: boolean; limit?: number; offset?: number } = {},
): Promise<CollectionOspSavedTargetView[]> {
  const targetResult = await executor.execute(sql`
    WITH authorized_targets AS MATERIALIZED (
      SELECT target.* FROM public.collection_osp_saved_targets target
      WHERE ${filters.targetId ? sql`target.id = ${filters.targetId}::uuid` : sql`TRUE`}
        AND (${filters.includeDeleted === true} OR target.status = 'ACTIVE')
        AND ${filters.enforceViewer ? targetViewerPredicate(filters.viewer) : sql`TRUE`}
        AND EXISTS (SELECT 1 FROM public.collection_osp_target_revisions available
          WHERE available.target_id = target.id
            ${filters.revisionId ? sql`AND available.id = ${filters.revisionId}::uuid` : sql``})
      ORDER BY target.updated_at DESC, target.id ASC
      LIMIT ${filters.targetId ? 1 : Math.max(1, Math.min(100, Math.trunc(filters.limit ?? 100)))}
      OFFSET ${filters.targetId ? 0 : Math.max(0, Math.trunc(filters.offset ?? 0))}
    )
    SELECT
      target.id,
      target.assigned_admin_user_id,
      assigned_admin.username AS assigned_admin_username,
      assigned_admin.full_name AS assigned_admin_full_name,
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
      revision.calculation_version,
      revision.created_at AS revision_created_at
    FROM authorized_targets target
    JOIN LATERAL (
      SELECT revision.* FROM public.collection_osp_target_revisions revision
      WHERE revision.target_id = target.id
        ${filters.revisionId ? sql`AND revision.id = ${filters.revisionId}::uuid` : sql``}
      ORDER BY revision.revision_number DESC LIMIT 1
    ) revision ON true
    LEFT JOIN public.users assigned_admin ON assigned_admin.id = target.assigned_admin_user_id
    ORDER BY target.updated_at DESC, target.id ASC
  `);
  const targetRows = rowsOf(targetResult);
  if (targetRows.length === 0) return [];
  const revisionIds = targetRows.map((row) => String(row.revision_id));
  const revisionIdsSql = buildTextArraySql(revisionIds);
  const sourceResult = await executor.execute(sql`
    SELECT source.target_revision_id, source.source_import_id, source.source_name_snapshot, source.source_filename_snapshot,
      config.valid_from::text AS current_valid_from, config.valid_to::text AS current_valid_to
    FROM public.collection_osp_target_sources source
    LEFT JOIN public.collection_source_configs config ON config.source_import_id = source.source_import_id
    WHERE source.target_revision_id = ANY(${revisionIdsSql}::uuid[])
    ORDER BY source.target_revision_id, source.source_import_id
  `);
  const sourcesByRevision = new Map<string, Array<{ sourceImportId: string; name: string; filename: string | null }>>();
  const boundsByRevision = new Map<string, Array<{ sourceImportId: string; validFrom: string | null; validTo: string | null }>>();
  for (const row of rowsOf(sourceResult)) {
    const revisionId = String(row.target_revision_id);
    const values = sourcesByRevision.get(revisionId) ?? [];
    values.push({
      sourceImportId: String(row.source_import_id),
      name: String(row.source_name_snapshot),
      filename: row.source_filename_snapshot == null ? null : String(row.source_filename_snapshot),
    });
    sourcesByRevision.set(revisionId, values);
    const bounds = boundsByRevision.get(revisionId) ?? [];
    bounds.push({ sourceImportId: String(row.source_import_id), validFrom: row.current_valid_from == null ? null : dateOnly(row.current_valid_from), validTo: row.current_valid_to == null ? null : dateOnly(row.current_valid_to) });
    boundsByRevision.set(revisionId, bounds);
  }
  return targetRows.map((row): CollectionOspSavedTargetView => {
    const revisionId = String(row.revision_id);
    const sourceSnapshots = sourcesByRevision.get(revisionId) ?? [];
    return {
      id: String(row.id),
      assignedAdminUserId: row.assigned_admin_user_id == null ? null : String(row.assigned_admin_user_id),
      assignedAdmin: row.assigned_admin_user_id == null ? null : {
        id: String(row.assigned_admin_user_id), username: String(row.assigned_admin_username),
        fullName: row.assigned_admin_full_name == null ? null : String(row.assigned_admin_full_name),
      },
      name: String(row.target_name),
      description: row.description == null ? null : String(row.description),
      status: row.status === "DELETED" ? "DELETED" : "ACTIVE",
      version: Math.max(1, toNumber(row.version)),
      activeRevision: {
        id: revisionId,
        revisionNumber: Math.max(1, toNumber(row.revision_number)),
        sourceValidityVerified: row.calculation_version === "osp-effective-private-v3-canonical-source",
        ...(sourceSnapshots.length ? { reportingWindow: resolveCollectionOspReportingWindow(
          { from: dateOnly(row.period_from), to: dateOnly(row.period_to) }, boundsByRevision.get(revisionId) ?? [],
        ) } : {}),
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
  viewer?: CollectionOspViewer;
  limit?: number;
  offset?: number;
}): Promise<CollectionOspSavedTargetView[]> {
  const targets = await loadTargetViews(db, { ...options, enforceViewer: true });
  if (targets.length === 0) return [];
  // The source-label query above can overlap a reassignment; filter the final
  // bounded result against current access in one query, not one query per row.
  const current = new Map(rowsOf(await db.execute(sql`
    SELECT target.id, target.version,
      ${reportingSourcesSql(sql`(SELECT revision.id FROM public.collection_osp_target_revisions revision
        WHERE revision.target_id = target.id ORDER BY revision.revision_number DESC LIMIT 1)`)} AS reporting_sources
    FROM public.collection_osp_saved_targets target
    WHERE target.id = ANY(${buildTextArraySql(targets.map((target) => target.id))}::uuid[])
      AND target.status = 'ACTIVE' AND ${targetViewerPredicate(options?.viewer)}
  `)).map((row) => [String(row.id), row]));
  return targets.filter((target) => {
    const row = current.get(target.id);
    if (!row || toNumber(row.version) !== target.version) return false;
    try { assertReportingWindowStillCurrent(target, row); return true; }
    catch (error) { if (error instanceof CollectionOspV7RepositoryError && error.reason === "VERSION_CONFLICT") return false; throw error; }
  });
}

export async function getCollectionOspSavedTargetRepository(
  targetId: string,
  revisionId?: string,
  viewer?: CollectionOspViewer,
): Promise<CollectionOspSavedTargetView | undefined> {
  const target = (await loadTargetViews(db, {
    targetId,
    ...(revisionId === undefined ? {} : { revisionId }),
    includeDeleted: false,
    ...(viewer ? { viewer } : {}),
    enforceViewer: true,
  }))[0];
  if (target) await assertViewerStillAuthorized(target, viewer);
  return target;
}

export async function createCollectionOspSavedTargetRepository(input: {
  name: string;
  assignedAdminUserId: string;
  viewer?: CollectionOspViewer;
  description?: string | null;
  sourceImportIds: string[];
  from?: string;
  to?: string;
  trackingStartDate?: string;
  trackingEndDate?: string | null;
  timezone: string;
  nicknameScope: string[];
  agingScope: CollectionAgingBucket[];
  targets: CollectionOspTargetInput[];
  actor: string;
}): Promise<CollectionOspSavedTargetView> {
  if (
    input.agingScope.length !== AGINGS.length
    || AGINGS.some((aging) => !input.agingScope.includes(aging))
  ) {
    throw new CollectionOspV7RepositoryError(
      "INVALID_SOURCE",
      "A Saved Target must include the complete D3, D4, D5, and D6 aging scope.",
    );
  }
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
    await assertCollectionOspSuperuserActor(tx, input.viewer, input.actor);
    await assertCollectionOspEligibleAdmin(tx, input.assignedAdminUserId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`collection-osp-target-name:${normalizeName(input.name)}`}, 0))`);
    const { sources: sourceRows, from, to } = await loadCollectionOspConfiguredSourceScope(tx, sourceIds);
    if ((input.from !== undefined && input.from !== from) || (input.to !== undefined && input.to !== to)
      || (input.trackingStartDate !== undefined && input.trackingStartDate !== from)
      || (input.trackingEndDate != null && input.trackingEndDate !== to)) {
      throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Target and calendar dates must match the configured source validity. Reload the source preview.");
    }
    await assertCollectionOspSourceAssignment(tx, { sourceImportIds: sourceIds, from, to, assignedAdminUserId: input.assignedAdminUserId });
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
        id, assigned_admin_user_id, target_name, normalized_name, description, status, version,
        created_by, created_at, updated_by, updated_at
      ) VALUES (
        ${targetId}::uuid, ${input.assignedAdminUserId}, ${input.name}, ${normalizeName(input.name)}, ${input.description ?? null},
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
        ${from}::date, ${to}::date, ${from}::date,
        ${to}::date, ${input.timezone},
        ${buildTextArraySql(input.nicknameScope)}, ${buildTextArraySql(input.agingScope)},
        'osp-effective-private-v3-canonical-source', ${input.actor}, now()
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
            source_row.card_number_hash,
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
        const display = extractSavedCollectionDisplayDetails(row.json_data);
        const account = master.accountNumber;
        const accountHash = hashCollectionSourceIdentifier(master.accountNumber, "account_number");
        const cardHash = hashCollectionSourceIdentifier(master.cardNumber, "card_number");
        const canonicalKey = accountHash ? `account:${accountHash}` : cardHash ? `card:${cardHash}` : null;
        if (canonicalKey !== String(row.canonical_obligation_key)
          || (row.card_number_hash != null && cardHash !== String(row.card_number_hash))) {
          throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Saved source identity has changed. Reconfigure the source before creating a target.");
        }
        const accountEncrypted = encryptCollectionPiiFieldValue(account);
        const customerName = display.customerName;
        const customerEncrypted = encryptCollectionPiiFieldValue(customerName);
        const cardEncrypted = encryptCollectionPiiFieldValue(master.cardNumber);
        const identificationEncrypted = encryptCollectionPiiFieldValue(display.identificationNumber);
        const phoneEncrypted = encryptCollectionPiiFieldValue(display.phone);
        if ((account && !accountEncrypted) || (customerName && !customerEncrypted)
          || (master.cardNumber && !cardEncrypted) || (display.identificationNumber && !identificationEncrypted)
          || (display.phone && !phoneEncrypted)) {
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
          ${cardEncrypted}, ${identificationEncrypted}, ${phoneEncrypted},
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
            account_number_search_hash, card_number_last4,
            card_number_encrypted, identification_number_encrypted, phone_encrypted, customer_name_encrypted,
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
    await tx.execute(sql`INSERT INTO public.audit_logs
      (id, action, performed_by, target_resource, details, timestamp)
      VALUES (${randomUUID()}, 'COLLECTION_OSP_TARGET_CREATED', ${input.actor}, ${targetId},
        ${JSON.stringify({ revisionId, name: input.name, oldAssignedAdminUserId: null,
          assignedAdminUserId: input.assignedAdminUserId, sourceImportIds: sourceIds, from, to,
          targets: input.targets.map((row) => ({ aging: row.agingBucket, targetPercentage: row.targetPercentage })) })}, now())`);
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
  assignedAdminUserId?: string;
  targets?: CollectionOspTargetInput[];
  viewer?: CollectionOspViewer;
  name?: string;
  description?: string | null;
  expectedVersion?: number;
  actor: string;
}): Promise<CollectionOspSavedTargetView> {
  try {
    return await db.transaction(async (tx) => {
      await assertCollectionOspSuperuserActor(tx, input.viewer, input.actor);
      const existingResult = await tx.execute(sql`
      SELECT version, status FROM public.collection_osp_saved_targets
      WHERE id = ${input.targetId}::uuid
      FOR UPDATE
    `);
      const existing = rowsOf(existingResult)[0];
      if (!existing) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
      if (existing.status !== "ACTIVE") throw new CollectionOspV7RepositoryError("DELETED", "Saved Target has been deleted.");
      if (input.expectedVersion === undefined || toNumber(existing.version) !== input.expectedVersion) {
        throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Saved Target changed in another session.");
      }
      const before = (await loadTargetViews(tx, { targetId: input.targetId }))[0];
      if (!before) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
      const previousAgingRows = await loadTargetAgingRows(tx, before.activeRevision.id);
      if (input.assignedAdminUserId !== undefined) {
        await assertCollectionOspEligibleAdmin(tx, input.assignedAdminUserId);
        await assertCollectionOspSourceAssignment(tx, { targetId: input.targetId,
          assignedAdminUserId: input.assignedAdminUserId, sourceImportIds: before.activeRevision.sourceImportIds,
          from: targetTrackingRange(before).start, to: targetTrackingRange(before).end });
      }
      if (input.targets !== undefined) {
        if (input.targets.length !== AGINGS.length || new Set(input.targets.map((row) => row.agingBucket)).size !== AGINGS.length
          || AGINGS.some((aging) => !input.targets!.some((row) => row.agingBucket === aging))) {
          throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Shared target percentages must contain D3, D4, D5 and D6 exactly once.");
        }
        const evidence = await loadTargetBaselineEvidence(tx, before.activeRevision.id);
        assertCollectionOspTargetBaselineIntegrity({ agingScope: before.activeRevision.agingScope,
          agingRows: previousAgingRows, sourceRows: evidence.sourceRows, hasSavedSourceScope: evidence.hasSavedSourceScope });
        for (const submitted of input.targets) {
          const config = previousAgingRows.find((row) => row.aging === submitted.agingBucket)!;
          const baseline = resolveCollectionOspAuthoritativeBaseline({ aging: submitted.agingBucket,
            derivedBaselineCents: parseCollectionOspMoneyCents(config.totalOsp), submittedBaseline: submitted.totalOspBaseline });
          const percentage = parseTargetPercentage(submitted.targetPercentage);
          await tx.execute(sql`UPDATE public.collection_osp_target_aging_rows
            SET target_percentage = ${percentage}::numeric(7,4), target_osp = ${calculateTargetOsp(baseline, percentage)}::numeric(16,2)
            WHERE target_revision_id = ${before.activeRevision.id}::uuid AND aging_bucket = ${submitted.agingBucket}`);
        }
      }
      const updateResult = await tx.execute(sql`
      UPDATE public.collection_osp_saved_targets
      SET
        target_name = COALESCE(${input.name ?? null}, target_name),
        normalized_name = COALESCE(${input.name ? normalizeName(input.name) : null}, normalized_name),
        description = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null} ELSE description END,
        assigned_admin_user_id = COALESCE(${input.assignedAdminUserId ?? null}, assigned_admin_user_id),
        version = version + 1,
        updated_by = ${input.actor},
        updated_at = now()
      WHERE id = ${input.targetId}::uuid
      RETURNING id
    `);
      if (!rowsOf(updateResult)[0]) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
      const target = (await loadTargetViews(tx, { targetId: input.targetId, includeDeleted: true }))[0];
      if (!target) throw new Error("Updated Saved Target could not be reloaded.");
      await tx.execute(sql`INSERT INTO public.audit_logs
        (id, action, performed_by, target_resource, details, timestamp)
        VALUES (${randomUUID()}, 'COLLECTION_OSP_TARGET_UPDATED', ${input.actor}, ${input.targetId},
          ${JSON.stringify({ revisionId: before.activeRevision.id, fromVersion: before.version, toVersion: target.version,
            sourceImportIds: before.activeRevision.sourceImportIds, from: before.activeRevision.from, to: before.activeRevision.to,
            before: { name: before.name, assignedAdminUserId: before.assignedAdminUserId, targets: previousAgingRows },
            after: { name: target.name, assignedAdminUserId: target.assignedAdminUserId, targets: input.targets ?? previousAgingRows } })}, now())`);
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
  viewer?: CollectionOspViewer;
}): Promise<CollectionOspSavedTargetView> {
  return db.transaction(async (tx) => {
    await assertCollectionOspSuperuserActor(tx, input.viewer, input.actor);
    if (input.expectedVersion === undefined) throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Reload the Saved Target before deleting it.");
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
    await tx.execute(sql`INSERT INTO public.audit_logs
      (id, action, performed_by, target_resource, details, timestamp)
      VALUES (${randomUUID()}, 'COLLECTION_OSP_TARGET_DELETED', ${input.actor}, ${input.targetId},
        ${JSON.stringify({ revisionId: target.activeRevision.id, fromVersion: input.expectedVersion, toVersion: target.version })}, now())`);
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
  aging: CollectionAgingBucket;
  callingDate: string;
  callingWindowEndExclusive: string;
  totalDue: string;
  billingPrincipalOsp: string;
};

type PoolCalculationRow = {
  id: string;
  status: "ACTIVE";
  version: number;
  cycleKey: string;
  amount: string;
  settlementDate: string;
  reason: string | null;
  note: string | null;
  reference: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  updatedBy: string;
  updatedAt: string | null;
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
  poolByCycle: Map<string, PoolCalculationRow>;
  results: CollectionOspReconciliationAccountResult[];
};

type TargetReportDataset = {
  target: CollectionOspSavedTargetView;
  agingRows: TargetAgingConfiguration[];
  aggregates: Array<{ aging: CollectionAgingBucket; ospClosed: string; closedAccountCount: number }>;
};

/** Public report reads return four grouped financial rows, never all accounts. */
async function loadTargetReportDataset(targetId: string, revisionId: string, asOfDate: string, viewer?: CollectionOspViewer, fullCalendarState = false): Promise<TargetReportDataset> {
  const target = await getCollectionOspSavedTargetRepository(targetId, revisionId, viewer);
  if (!target || target.status !== "ACTIVE" || target.activeRevision.id !== revisionId) {
    throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target revision was not found.");
  }
  assertTargetDate(target, asOfDate, "As-of date");
  const bounded = rowsOf(await db.execute(sql`SELECT COUNT(*)::integer AS count
    FROM (SELECT 1 FROM public.collection_osp_target_source_rows
      WHERE target_revision_id = ${revisionId}::uuid LIMIT ${MAX_TARGET_SOURCE_ROWS + 1}) source_limit`))[0];
  if (toNumber(bounded?.count) > MAX_TARGET_SOURCE_ROWS) throw new CollectionOspV7RepositoryError("DATASET_TOO_LARGE", "Saved Target exceeds the 100,000-account scope.");
  const rows = rowsOf(await db.execute(buildCollectionOspAgingAggregateQuery({
    targetId, revisionId, asOfDate: fullCalendarState ? targetTrackingRange(target).end : asOfDate,
    viewerPredicate: targetViewerPredicate(viewer), expectedTargetVersion: target.version,
  })));
  if (rows.length !== target.activeRevision.agingScope.length) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target changed or is unavailable.");
  const agingRows = rows.map((row) => ({ aging: String(row.aging_bucket) as CollectionAgingBucket,
    totalOsp: String(row.total_osp_baseline), targetPercentage: String(row.target_percentage), targetOsp: String(row.target_osp) }));
  assertCollectionOspTargetBaselineIntegrity({ agingScope: target.activeRevision.agingScope, agingRows,
    sourceRows: rows.map((row) => ({ aging: String(row.aging_bucket) as CollectionAgingBucket, billingPrincipalOsp: String(row.snapshot_total_osp) })),
    hasSavedSourceScope: rows.every((row) => row.has_saved_source_scope === true) });
  if (rows.reduce((sum, row) => sum + toNumber(row.payment_count), 0) > MAX_TARGET_PAYMENT_ROWS) {
    throw new CollectionOspV7RepositoryError("DATASET_TOO_LARGE", "Saved Target exceeds the 250,000-payment scope.");
  }
  return { target, agingRows, aggregates: rows.map((row) => ({ aging: String(row.aging_bucket) as CollectionAgingBucket,
    ospClosed: formatCollectionOspMoneyCents(parseCollectionOspMoneyCents(row.reconciled_osp_closed)), closedAccountCount: toNumber(row.reconciled_account_count) })) };
}

function baselineIntegrityError(message: string): never {
  throw new CollectionOspV7RepositoryError(
    "BASELINE_MISMATCH",
    `${message} Rebuild this Saved Target from its governed source snapshot.`,
  );
}

function requireTargetAgingConfiguration(
  configByAging: ReadonlyMap<CollectionAgingBucket, TargetAgingConfiguration>,
  aging: CollectionAgingBucket,
): TargetAgingConfiguration {
  const config = configByAging.get(aging);
  if (!config) {
    return baselineIntegrityError(`The Saved Target is missing its ${aging} TT OSP baseline.`);
  }
  return config;
}

/**
 * Proves that the immutable per-aging baseline still equals the Saved Target's
 * own row snapshot. A missing value is never interpreted as a confirmed zero;
 * a genuine zero is accepted only when the snapshotted OSP sum is also zero.
 */
export function assertCollectionOspTargetBaselineIntegrity(input: {
  agingScope: readonly CollectionAgingBucket[];
  agingRows: readonly TargetAgingConfiguration[];
  sourceRows: readonly Pick<TargetSourceSnapshotRow, "aging" | "billingPrincipalOsp">[];
  hasSavedSourceScope: boolean;
}): void {
  if (!input.hasSavedSourceScope) {
    baselineIntegrityError("The Saved Target has no immutable source-scope evidence.");
  }
  const duplicateAgings = input.agingRows.filter((row, index, rows) => (
    rows.findIndex((candidate) => candidate.aging === row.aging) !== index
  ));
  if (duplicateAgings.length > 0) {
    baselineIntegrityError("The Saved Target contains duplicate aging baseline rows.");
  }
  const configByAging = new Map(input.agingRows.map((row) => [row.aging, row]));
  const expectedByAging = new Map<CollectionAgingBucket, bigint>(
    input.agingScope.map((aging) => [aging, 0n]),
  );
  try {
    for (const sourceRow of input.sourceRows) {
      if (!input.agingScope.includes(sourceRow.aging)) continue;
      expectedByAging.set(
        sourceRow.aging,
        (expectedByAging.get(sourceRow.aging) ?? 0n)
          + parseCollectionOspMoneyCents(sourceRow.billingPrincipalOsp),
      );
    }
    for (const aging of input.agingScope) {
      const config = requireTargetAgingConfiguration(configByAging, aging);
      const persistedBaseline = parseCollectionOspMoneyCents(config.totalOsp);
      const expectedBaseline = expectedByAging.get(aging) ?? 0n;
      if (persistedBaseline !== expectedBaseline) {
        baselineIntegrityError(
          `${aging} TT OSP does not match the immutable Billing Principal (OSP) snapshot.`,
        );
      }
      const canonicalPercentage = parseTargetPercentage(config.targetPercentage);
      const expectedTargetOsp = calculateTargetOsp(config.totalOsp, canonicalPercentage);
      if (parseCollectionOspMoneyCents(config.targetOsp) !== parseCollectionOspMoneyCents(expectedTargetOsp)) {
        baselineIntegrityError(`${aging} Target OSP is inconsistent with its saved TT OSP and Target %.`);
      }
    }
  } catch (error) {
    if (error instanceof CollectionOspV7RepositoryError) throw error;
    baselineIntegrityError("The Saved Target contains an invalid or unreadable TT OSP baseline.");
  }
}

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
        ? "MANUAL_VERIFIED_ABORT"
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
  return rowsOf(result).map((row) => {
    const aging = String(row.aging_bucket);
    if (
      !AGINGS.includes(aging as CollectionAgingBucket)
      || row.total_osp_baseline == null
      || row.target_percentage == null
      || row.target_osp == null
    ) {
      return baselineIntegrityError("The Saved Target contains an incomplete aging baseline row.");
    }
    return {
      aging: aging as CollectionAgingBucket,
      totalOsp: String(row.total_osp_baseline),
      targetPercentage: String(row.target_percentage),
      targetOsp: String(row.target_osp),
    };
  });
}

async function loadTargetBaselineEvidence(
  executor: QueryExecutor,
  revisionId: string,
): Promise<{
  sourceRows: Array<Pick<TargetSourceSnapshotRow, "aging" | "billingPrincipalOsp">>;
  hasSavedSourceScope: boolean;
}> {
  const result = await executor.execute(sql`
    WITH source_scope AS (
      SELECT EXISTS (
        SELECT 1
        FROM public.collection_osp_target_sources
        WHERE target_revision_id = ${revisionId}::uuid
      ) AS has_saved_source_scope
    ), scoped_aging AS (
      SELECT unnest(ARRAY['D3', 'D4', 'D5', 'D6']::text[]) AS aging_bucket
    )
    SELECT
      aging.aging_bucket,
      COALESCE(SUM(source_row.billing_principal_osp), 0)::text AS billing_principal_osp,
      source_scope.has_saved_source_scope
    FROM scoped_aging aging
    CROSS JOIN source_scope
    LEFT JOIN public.collection_osp_target_source_rows source_row
      ON source_row.target_revision_id = ${revisionId}::uuid
      AND source_row.aging_bucket = aging.aging_bucket
    GROUP BY aging.aging_bucket, source_scope.has_saved_source_scope
    ORDER BY aging.aging_bucket
  `);
  const rows = rowsOf(result);
  return {
    sourceRows: rows.map((row) => ({
      aging: String(row.aging_bucket) as CollectionAgingBucket,
      billingPrincipalOsp: String(row.billing_principal_osp),
    })),
    hasSavedSourceScope: rows.some((row) => row.has_saved_source_scope === true),
  };
}


function resultRows(
  dataset: TargetReportDataset,
) {
  const aggregate = dataset.aggregates;
  const configByAging = new Map(dataset.agingRows.map((row) => [row.aging, row]));
  const scopedAgings = AGINGS.filter((aging) => dataset.target.activeRevision.agingScope.includes(aging));
  const rows = scopedAgings.map((aging) => {
    const config = requireTargetAgingConfiguration(configByAging, aging);
    const value = aggregate.find((row) => row.aging === aging)!;
    return {
      aging,
      totalOsp: config.totalOsp,
      targetPercentage: config.targetPercentage,
      targetOsp: config.targetOsp,
      resultPercentage: formatCollectionOspPercentage(parseCollectionOspMoneyCents(value.ospClosed), parseCollectionOspMoneyCents(config.totalOsp)),
      ospClosed: value.ospClosed,
      balanceOsp: calculateCollectionOspBalance(config.targetOsp, value.ospClosed),
      closedAccountCount: value.closedAccountCount,
    };
  });
  const allClosed = aggregate.reduce((sum, row) => sum + parseCollectionOspMoneyCents(row.ospClosed), 0n);
  const allClosedCount = aggregate.reduce((sum, row) => sum + row.closedAccountCount, 0);
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
    resultPercentage: formatCollectionOspPercentage(allClosed, allTotalOsp),
    ospClosed: formatCollectionOspMoneyCents(allClosed),
    balanceOsp: formatCollectionOspMoneyCents(allTargetOsp - allClosed),
    closedAccountCount: allClosedCount,
  };
  return { rows, all };
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
  executor: QueryExecutor,
  revisionId: string,
  target: CollectionOspSavedTargetView,
  agingRows: readonly TargetAgingConfiguration[],
  viewer?: CollectionOspViewer,
): Promise<{
  rows: CollectionOspClientResultView[];
  all: Omit<CollectionOspClientResultView, "aging"> & { aging: "ALL" };
}> {
  const scopedAgings = AGINGS.filter((aging) => target.activeRevision.agingScope.includes(aging));
  const result = await executor.execute(sql`
    SELECT client.aging_bucket, client.target_percentage::text, client.result_percentage::text,
      client.note, client.client_reference, client.as_of_date,
      client.version, client.updated_at
    FROM public.collection_osp_private_client_results client
    JOIN public.collection_osp_saved_targets target ON target.id = client.target_id
    WHERE client.target_revision_id = ${revisionId}::uuid
      AND client.owner_user_id = ${viewer?.userId ?? null}
      AND target.status = 'ACTIVE' AND ${targetViewerPredicate(viewer)}
      AND client.aging_bucket = ANY(${buildTextArraySql(scopedAgings)})
    ORDER BY client.aging_bucket, client.updated_at DESC, client.id DESC
  `);
  const byAging = new Map(rowsOf(result).map((row) => [String(row.aging_bucket), row]));
  const configByAging = new Map(agingRows.map((row) => [row.aging, row]));
  const rows = scopedAgings.map((aging): CollectionOspClientResultView => {
    const row = byAging.get(aging);
    const config = requireTargetAgingConfiguration(configByAging, aging);
    const resultPercentage = row ? String(row.result_percentage) : "0.0000";
    const targetPercentage = row ? String(row.target_percentage) : config.targetPercentage;
    const targetOsp = calculateTargetOsp(config.totalOsp, targetPercentage);
    return {
      aging,
      totalOsp: config.totalOsp,
      targetPercentage,
      targetOsp,
      resultPercentage,
      ospClosed: row ? calculateTargetOsp(config.totalOsp, resultPercentage) : "0.00",
      balanceOsp: calculateCollectionOspBalance(targetOsp, row ? calculateTargetOsp(config.totalOsp, resultPercentage) : "0.00"),
      note: row?.note == null ? null : String(row.note),
      reference: row?.client_reference == null ? null : String(row.client_reference),
      receivedDate: row?.as_of_date == null ? null : dateOnly(row.as_of_date),
      updatedAt: row?.updated_at == null ? null : isoDateTime(row.updated_at),
      version: row?.version == null ? null : Math.max(1, toNumber(row.version)),
    };
  });
  return {
    rows,
    all: deriveCollectionOspClientAllView({
      rows,
      scopedAgings,
      configByAging,
    }),
  };
}

export function deriveCollectionOspClientAllView(input: {
  rows: readonly CollectionOspClientResultView[];
  scopedAgings: readonly CollectionAgingBucket[];
  configByAging: ReadonlyMap<CollectionAgingBucket, TargetAgingConfiguration>;
}): Omit<CollectionOspClientResultView, "aging"> & { aging: "ALL" } {
  const savedRows = input.rows.filter((row) => row.receivedDate !== null);
  const completeSnapshot = input.scopedAgings.length > 0
    && input.scopedAgings.every((aging) => savedRows.some((row) => row.aging === aging));
  const totalClientOsp = savedRows.reduce(
    (sum, row) => sum + parseCollectionOspMoneyCents(row.ospClosed),
    0n,
  );
  const totalBaseline = input.scopedAgings.reduce(
    (sum, aging) => sum + parseCollectionOspMoneyCents(
      requireTargetAgingConfiguration(input.configByAging, aging).totalOsp,
    ),
    0n,
  );
  const totalTargetOsp = input.scopedAgings.reduce(
    (sum, aging) => sum + parseCollectionOspMoneyCents(
      input.rows.find((row) => row.aging === aging)?.targetOsp
        ?? requireTargetAgingConfiguration(input.configByAging, aging).targetOsp,
    ),
    0n,
  );
  const receivedDates = savedRows.map((row) => row.receivedDate!).sort();
  const updatedTimes = savedRows.map((row) => row.updatedAt!).filter(Boolean).sort();
  return {
    aging: "ALL",
    totalOsp: formatCollectionOspMoneyCents(totalBaseline),
    targetPercentage: formatCollectionOspPercentage(totalTargetOsp, totalBaseline),
    targetOsp: formatCollectionOspMoneyCents(totalTargetOsp),
    resultPercentage: completeSnapshot
      ? formatCollectionOspPercentage(totalClientOsp, totalBaseline)
      : "0.0000",
    ospClosed: completeSnapshot ? formatCollectionOspMoneyCents(totalClientOsp) : "0.00",
    balanceOsp: formatCollectionOspMoneyCents(totalTargetOsp - (completeSnapshot ? totalClientOsp : 0n)),
    note: null,
    reference: null,
    receivedDate: completeSnapshot ? receivedDates[receivedDates.length - 1] ?? null : null,
    updatedAt: completeSnapshot ? updatedTimes[updatedTimes.length - 1] ?? null : null,
    version: null,
  };
}

export async function getCollectionOspTargetOverviewRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  viewer?: CollectionOspViewer;
}) {
  const dataset = await loadTargetReportDataset(input.targetId, input.revisionId, input.asOfDate, input.viewer);
  const result = await buildCollectionOspTargetOverviewFromDataset(dataset, input.revisionId, input.asOfDate, input.viewer);
  await assertViewerStillAuthorized(dataset.target, input.viewer);
  return result;
}

async function buildCollectionOspTargetOverviewFromDataset(
  dataset: TargetReportDataset,
  revisionId: string,
  asOfDate: string,
  viewer?: CollectionOspViewer,
) {
  // "System Result" is the canonical effective Collection settlement state:
  // native ABORT CP or a currently-valid Manual Verified ABORT/POOL. The
  // legacy Billing Table C rows are deliberately not loaded and contribute 0.
  const systemResult = resultRows(dataset);
  const clientResult = await loadClientResultView(
    db,
    revisionId,
    dataset.target,
    dataset.agingRows,
    viewer,
  );
  const latestAsOf = latestTargetAsOf(dataset.target);
  const latestDataset = latestAsOf === asOfDate
    ? dataset
    : await loadTargetReportDataset(dataset.target.id, revisionId, latestAsOf, viewer);
  const latestSystem = resultRows(latestDataset).all;
  const hasClient = clientResult.all.receivedDate !== null;
  const latestComparison = {
    system: {
      asOf: latestAsOf,
      totalOsp: latestSystem.totalOsp,
      ospClosed: latestSystem.ospClosed,
      resultPercentage: latestSystem.resultPercentage,
    },
    client: hasClient ? {
      lastUpdatedAt: clientResult.all.updatedAt!,
      receivedDate: clientResult.all.receivedDate!,
      totalOsp: clientResult.all.totalOsp,
      ospClosed: clientResult.all.ospClosed,
      resultPercentage: clientResult.all.resultPercentage,
    } : null,
    differencePercentagePoints: hasClient
      ? signedPercentageDifference(latestSystem.resultPercentage, clientResult.all.resultPercentage)
      : null,
  };
  return {
    target: dataset.target,
    revision: dataset.target.activeRevision,
    asOf: asOfDate,
    systemResult,
    clientResult,
    latestComparison,
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
  const target = (await loadTargetViews(db, { targetId: input.targetId, revisionId: input.revisionId }))[0];
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
      LEFT JOIN public.collection_source_configs source_config
        ON source_config.source_import_id = target_source.source_import_id
      WHERE record.payment_date <= ${input.asOfDate}::date
        AND record.payment_date BETWEEN COALESCE(source_config.valid_from, ${target.activeRevision.from}::date)
          AND COALESCE(source_config.valid_to, ${target.activeRevision.to}::date)
        AND record.payment_date >= ${targetTrackingRange(target).start}::date
        AND record.payment_date <= ${targetTrackingRange(target).end}::date
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
    LEFT JOIN public.collection_source_configs source_config
      ON source_config.source_import_id = target_source.source_import_id
    WHERE record.settlement_cycle_key = ANY(${buildTextArraySql(cycleKeys)})
      AND record.payment_date <= ${asOfDate}::date
      AND record.payment_date BETWEEN COALESCE(source_config.valid_from, ${target.activeRevision.from}::date)
        AND COALESCE(source_config.valid_to, ${target.activeRevision.to}::date)
      AND record.payment_date >= ${targetTrackingRange(target).start}::date
      AND record.payment_date <= ${targetTrackingRange(target).end}::date
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
    ?? (await loadTargetViews(db, { targetId: input.targetId, revisionId: input.revisionId }))[0];
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
  const target = (await loadTargetViews(db, { targetId, revisionId }))[0];
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
  receivedDate: string;
  rows: Array<{
    aging: CollectionAgingBucket;
    targetPercentage: string;
    resultPercentage: string;
    note?: string | null;
    reference?: string | null;
    expectedVersion?: number | null;
  }>;
  actor: string;
  viewer?: CollectionOspViewer;
}): Promise<CollectionOspClientResultTableView> {
  const baseline = await db.transaction(async (tx) => {
    // Keep the authenticated account eligible throughout the transaction.
    // Use the same account-before-target lock order as shared mutations.
    const actor = rowsOf(await tx.execute(sql`SELECT id FROM public.users
      WHERE id = ${input.viewer?.userId ?? null} AND username = ${input.actor}
        AND role = ${input.viewer?.role ?? null} AND role IN ('superuser', 'manager', 'admin')
        AND status = 'active' AND COALESCE(is_banned, false) = false FOR SHARE`))[0];
    if (!actor) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
    const locked = rowsOf(await tx.execute(sql`
      SELECT target.id FROM public.collection_osp_saved_targets target
      WHERE target.id = ${input.targetId}::uuid AND target.status = 'ACTIVE'
        AND ${targetViewerPredicate(input.viewer)}
        AND EXISTS (SELECT 1 FROM public.users actor_account
          WHERE actor_account.id = ${input.viewer?.userId ?? null} AND actor_account.username = ${input.actor})
      FOR UPDATE OF target
    `))[0];
    if (!locked) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target was not found.");
    const target = (await loadTargetViews(tx, { targetId: input.targetId, revisionId: input.revisionId }))[0];
    assertActiveTargetRevision(target, input.targetId, input.revisionId);
    const submittedAgings = Array.from(new Set(input.rows.map((row) => row.aging))).sort();
    const scopedAgings = [...target.activeRevision.agingScope].sort();
    if (
      input.rows.length !== scopedAgings.length || submittedAgings.length !== scopedAgings.length
      || submittedAgings.some((aging, index) => aging !== scopedAgings[index])
    ) {
      throw new CollectionOspV7RepositoryError(
        "INVALID_SOURCE",
        "Client Result rows must match the Saved Target aging scope exactly.",
      );
    }
    const agingRows = await loadTargetAgingRows(tx, input.revisionId);
    const baselineEvidence = await loadTargetBaselineEvidence(tx, input.revisionId);
    assertCollectionOspTargetBaselineIntegrity({
      agingScope: target.activeRevision.agingScope,
      agingRows,
      sourceRows: baselineEvidence.sourceRows,
      hasSavedSourceScope: baselineEvidence.hasSavedSourceScope,
    });
    const agingConfigs = new Map(agingRows.map((row) => [row.aging, row]));
    for (const row of input.rows) {
      const targetPercentage = parseTargetPercentage(row.targetPercentage);
      const resultPercentage = parseTargetPercentage(row.resultPercentage);
      const existingResult = await tx.execute(sql`
        SELECT id, version, as_of_date
        FROM public.collection_osp_private_client_results
        WHERE target_revision_id = ${input.revisionId}::uuid
          AND owner_user_id = ${input.viewer!.userId}
          AND aging_bucket = ${row.aging}
        ORDER BY updated_at DESC, as_of_date DESC, id DESC
        LIMIT 1
        FOR UPDATE
      `);
      const existing = rowsOf(existingResult)[0];
      if (
        (!existing && row.expectedVersion != null) || (existing
        && (
          row.expectedVersion === undefined
          || row.expectedVersion === null
          || toNumber(existing.version) !== row.expectedVersion
        ))
      ) {
        throw new CollectionOspV7RepositoryError("VERSION_CONFLICT", "Client Result changed in another session.");
      }
      const agingConfig = requireTargetAgingConfiguration(agingConfigs, row.aging);
      const derivedOspClosed = calculateTargetOsp(agingConfig.totalOsp, resultPercentage);
      if (
        parseCollectionOspMoneyCents(agingConfig.totalOsp) === 0n
        && percentageUnits(row.resultPercentage) > 0n
      ) {
        throw new CollectionOspV7RepositoryError(
          "INVALID_SOURCE",
          `${row.aging} has no Saved TT OSP baseline, so its Client Result must remain 0%.`,
        );
      }
      if (existing) {
        await tx.execute(sql`
          UPDATE public.collection_osp_private_client_results
          SET target_percentage = ${targetPercentage}::numeric(7,4),
            result_percentage = ${resultPercentage}::numeric(9,4),
            as_of_date = ${input.receivedDate}::date,
            osp_closed = ${derivedOspClosed}::numeric(16,2),
            client_reference = ${row.reference ?? null}, note = ${row.note ?? null},
            version = version + 1, updated_by = ${input.actor}, updated_at = now()
          WHERE id = ${String(existing.id)}::uuid
            AND owner_user_id = ${input.viewer!.userId}
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO public.collection_osp_private_client_results (
            id, target_id, target_revision_id, owner_user_id, as_of_date, aging_bucket, target_percentage,
            result_percentage, osp_closed, client_reference, note, version,
            created_by, created_at, updated_by, updated_at
          ) VALUES (
            ${randomUUID()}::uuid, ${input.targetId}::uuid, ${input.revisionId}::uuid,
            ${input.viewer!.userId}, ${input.receivedDate}::date, ${row.aging}, ${targetPercentage}::numeric(7,4),
            ${resultPercentage}::numeric(9,4), ${derivedOspClosed}::numeric(16,2),
            ${row.reference ?? null}, ${row.note ?? null}, 1,
            ${input.actor}, now(), ${input.actor}, now()
          )
        `);
      }
    }
    // Do not copy private percentage/evidence contents into the globally readable audit log.
    await tx.execute(sql`INSERT INTO public.audit_logs
      (id, action, performed_by, target_resource, details, timestamp)
      VALUES (${randomUUID()}, 'COLLECTION_OSP_PRIVATE_CLIENT_SAVED', ${input.actor}, ${input.targetId},
        ${JSON.stringify({ revisionId: input.revisionId, ownerUserId: input.viewer!.userId, agingCount: input.rows.length })}, now())`);
    return { target, agingRows };
  });
  const result = await loadClientResultView(
    db,
    input.revisionId,
    baseline.target,
    baseline.agingRows,
    input.viewer,
  );
  // This response contains only the actor's private values derived from the
  // immutable baseline. Source-date edits cannot invalidate a committed private
  // save; shared target/account authorization must still be rechecked.
  await assertViewerStillAuthorized(baseline.target, input.viewer, false);
  return result;
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
  viewer?: CollectionOspViewer;
}) {
  const dataset = await loadTargetReportDataset(input.targetId, input.revisionId, input.to, input.viewer);
  const result = await buildCollectionOspCalendarFromDataset(dataset, input);
  await assertViewerStillAuthorized(dataset.target, input.viewer);
  return result;
}

async function buildCollectionOspCalendarFromDataset(
  dataset: TargetReportDataset,
  input: {
    revisionId: string;
    from: string;
    to: string;
    aging?: CollectionAgingBucket;
    viewer?: CollectionOspViewer;
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
  const calendarAging: CollectionAgingBucket | "ALL" = input.aging ?? "ALL";
  const movements = rowsOf(await db.execute(buildCollectionOspDailyAggregateQuery({
    targetId: dataset.target.id, revisionId: input.revisionId, asOfDate: input.to,
    viewerPredicate: targetViewerPredicate(input.viewer), expectedTargetVersion: dataset.target.version,
    ...(input.aging ? { aging: input.aging } : {}),
  }))).map((row) => ({ date: dateOnly(row.date), ospClosed: String(row.osp_closed), accountCount: toNumber(row.account_count) }));
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
      results: [], movements,
    }),
  };
}

export function buildCollectionOspCalendarDays(input: {
  from: string;
  to: string;
  aging?: CollectionAgingBucket;
  totalBaseline: bigint;
  targetOsp: bigint;
  results: readonly CollectionOspReconciliationAccountResult[];
  movements?: readonly { date: string; ospClosed: string; accountCount: number }[];
}) {
  const systemEvents = new Map<string, bigint>();
  const systemCounts = new Map<string, number>();
  const add = (amounts: Map<string, bigint>, counts: Map<string, number>, date: string, amount: bigint) => {
    amounts.set(date, (amounts.get(date) ?? 0n) + amount);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  };
  for (const result of input.results) {
    const osp = parseCollectionOspMoneyCents(result.billingPrincipalOsp);
    if (result.reconciledClosed && result.effectiveClosureDate) {
      add(systemEvents, systemCounts, result.effectiveClosureDate, osp);
    }
  }
  for (const movement of input.movements ?? []) {
    systemEvents.set(movement.date, parseCollectionOspMoneyCents(movement.ospClosed));
    systemCounts.set(movement.date, movement.accountCount);
  }
  const dates = enumerateDates(input.from, input.to);
  let systemCumulative = Array.from(systemEvents.entries())
    .filter(([date]) => date < input.from)
    .reduce((sum, [, amount]) => sum + amount, 0n);
  const calendarAging: CollectionAgingBucket | "ALL" = input.aging ?? "ALL";
  const days = dates.map((date) => {
    const systemToday = systemEvents.get(date) ?? 0n;
    const previousSystemResult = formatCollectionOspPercentage(systemCumulative, input.totalBaseline);
    systemCumulative += systemToday;
    return {
      date,
      aging: calendarAging,
      totalOsp: formatCollectionOspMoneyCents(input.totalBaseline),
      targetOsp: formatCollectionOspMoneyCents(input.targetOsp),
      systemOspClosedToday: formatCollectionOspMoneyCents(systemToday),
      systemCumulativeOspClosed: formatCollectionOspMoneyCents(systemCumulative),
      balanceOsp: formatCollectionOspMoneyCents(input.targetOsp - systemCumulative),
      systemResultPercentage: formatCollectionOspPercentage(systemCumulative, input.totalBaseline),
      systemPreviousResultPercentage: previousSystemResult,
      systemDailyMovementPercentagePoints: signedPercentageDifference(formatCollectionOspPercentage(systemCumulative, input.totalBaseline), previousSystemResult),
      systemAchievementVsTargetPercentage: formatCollectionOspPercentage(systemCumulative, input.targetOsp),
      systemDailyAccounts: systemCounts.get(date) ?? 0,
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
  contributionSource?: "AUTOMATIC_ABORT_CP" | "MANUAL_VERIFIED_ABORT";
  page: number;
  pageSize: number;
  viewer?: CollectionOspViewer;
}) {
  // Exact-day detail is a slice of the full-period calendar's current effective
  // state, not a second historical as-of report. Later valid manual evidence
  // can establish an earlier day; truncating here would make that day empty.
  const dataset = await loadTargetReportDataset(input.targetId, input.revisionId, input.asOfDate, input.viewer, Boolean(input.date));
  const result = await buildCollectionOspDrilldownFromDataset(dataset, input.date
    ? { ...input, asOfDate: targetTrackingRange(dataset.target).end } : input);
  await assertViewerStillAuthorized(dataset.target, input.viewer);
  return result;
}

export function resolveCollectionOspDrilldownContribution(
  result: CollectionOspReconciliationAccountResult,
  hasActiveManual: boolean,
  hasExactDateFilter: boolean,
  requestedSource: "AUTOMATIC_ABORT_CP" | "MANUAL_VERIFIED_ABORT" | undefined,
): {
  source: "AUTOMATIC_ABORT_CP" | "MANUAL_VERIFIED_ABORT";
  effectiveDate: string;
} | null {
  const manualEstablishedEarlierClosure = hasActiveManual
    && parseCollectionOspMoneyCents(result.manualPriorAmount) > 0n
    && result.effectiveClosureDate !== null
    && result.effectiveClosureDate !== result.systemAbortDate;
  if (requestedSource === "AUTOMATIC_ABORT_CP") {
    return result.systemClosed && result.systemAbortDate
      ? { source: "AUTOMATIC_ABORT_CP", effectiveDate: result.systemAbortDate }
      : null;
  }
  if (requestedSource === "MANUAL_VERIFIED_ABORT") {
    return (
      result.contributionSource === "MANUAL_VERIFIED_ABORT"
      // A source-filtered current/cumulative drilldown must reconcile to the
      // current Manual summary, where native System ABORT takes precedence.
      // Retain the superseded manual event only for an exact-day historical
      // movement drilldown.
      || (hasExactDateFilter && manualEstablishedEarlierClosure)
    ) && result.effectiveClosureDate
      ? { source: "MANUAL_VERIFIED_ABORT", effectiveDate: result.effectiveClosureDate }
      : null;
  }
  if (!result.reconciledClosed || !result.effectiveClosureDate) return null;
  // Exact-day movement retains the event that first put the account into the
  // reconciled union. A cumulative/current view uses native System precedence.
  if (hasExactDateFilter && manualEstablishedEarlierClosure) {
    return { source: "MANUAL_VERIFIED_ABORT", effectiveDate: result.effectiveClosureDate };
  }
  if (result.contributionSource === "MANUAL_VERIFIED_ABORT") {
    return { source: "MANUAL_VERIFIED_ABORT", effectiveDate: result.effectiveClosureDate };
  }
  return {
    source: "AUTOMATIC_ABORT_CP",
    effectiveDate: result.systemAbortDate ?? result.effectiveClosureDate,
  };
}

async function buildCollectionOspDrilldownFromDataset(
  dataset: TargetReportDataset,
  input: {
    asOfDate: string;
    date?: string;
    aging?: CollectionAgingBucket;
    contributionSource?: "AUTOMATIC_ABORT_CP" | "MANUAL_VERIFIED_ABORT";
    page: number;
    pageSize: number;
    viewer?: CollectionOspViewer;
  },
) {
  if (input.date) assertTargetDate(dataset.target, input.date, "Drilldown date");
  if (input.aging && !dataset.target.activeRevision.agingScope.includes(input.aging)) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Aging is outside this Saved Target revision.");
  }
  if (!Number.isInteger(input.page) || input.page < 1 || !Number.isInteger(input.pageSize)
    || input.pageSize < 1 || input.pageSize > MAX_EXPORT_DETAIL_ROWS) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Detail pagination is invalid.");
  }
  const exactDay = Boolean(input.date);
  const manualEarlier = sql`(account.manual_amount > 0 AND account.effective_closure_date IS NOT NULL
    AND account.effective_closure_date IS DISTINCT FROM account.system_abort_date)`;
  const source = input.contributionSource === "AUTOMATIC_ABORT_CP" ? sql`'AUTOMATIC_ABORT_CP'::text`
    : input.contributionSource === "MANUAL_VERIFIED_ABORT" ? sql`'MANUAL_VERIFIED_ABORT'::text`
      : sql`CASE WHEN account.contribution_source = 'MANUAL_VERIFIED_ABORT' OR (${exactDay} AND ${manualEarlier})
        THEN 'MANUAL_VERIFIED_ABORT' ELSE 'AUTOMATIC_ABORT_CP' END`;
  const effectiveDate = input.contributionSource === "AUTOMATIC_ABORT_CP" ? sql`account.system_abort_date`
    : input.contributionSource === "MANUAL_VERIFIED_ABORT" ? sql`account.effective_closure_date`
      : sql`CASE WHEN account.contribution_source = 'MANUAL_VERIFIED_ABORT' OR (${exactDay} AND ${manualEarlier})
        THEN account.effective_closure_date ELSE COALESCE(account.system_abort_date, account.effective_closure_date) END`;
  const eligible = input.contributionSource === "AUTOMATIC_ABORT_CP" ? sql`account.system_closed`
    : input.contributionSource === "MANUAL_VERIFIED_ABORT" ? sql`(account.contribution_source = 'MANUAL_VERIFIED_ABORT' OR (${exactDay} AND ${manualEarlier}))`
      : sql`account.reconciled_closed`;
  const pageResult = await db.execute(sql`
    WITH ${buildCollectionOspEffectiveAccountCtes({
      targetId: dataset.target.id, revisionId: dataset.target.activeRevision.id, asOfDate: input.asOfDate,
      viewerPredicate: targetViewerPredicate(input.viewer), expectedTargetVersion: dataset.target.version,
    })}, contributions AS (
      SELECT account.*, ${source} AS detail_source, ${effectiveDate} AS effective_date
      FROM osp_effective_accounts account WHERE ${eligible}
        ${input.aging ? sql`AND account.aging_bucket = ${input.aging}` : sql``}
    ), filtered AS MATERIALIZED (
      SELECT * FROM contributions WHERE effective_date IS NOT NULL
        ${input.date ? sql`AND effective_date = ${input.date}::date` : sql``}
    ), summary AS (
      SELECT COUNT(*)::integer AS summary_count,
        COALESCE(SUM(billing_principal_osp), 0)::text AS summary_osp FROM filtered
    ), authorized_page AS MATERIALIZED (
      SELECT * FROM filtered
      ORDER BY effective_date, aging_bucket, cycle_key
      LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}
    ), closing_payments AS (
      SELECT DISTINCT ON (page.cycle_key) page.cycle_key,
        payment.amount AS closing_amount, payment.collection_staff_nickname AS closing_nickname,
        payment.payment_date AS closing_payment_date
      FROM authorized_page page JOIN osp_system_payments payment ON payment.cycle_key = page.cycle_key
      WHERE (page.detail_source = 'AUTOMATIC_ABORT_CP' AND payment.classification = 'abort_cp'
        AND payment.payment_date = page.system_abort_date)
        OR (page.detail_source = 'MANUAL_VERIFIED_ABORT' AND payment.id = page.manual_record_id)
      ORDER BY page.cycle_key, payment.payment_date, payment.created_at, payment.id
    )
    SELECT summary.*, page.*, snapshot.account_number_encrypted, snapshot.customer_name_encrypted,
      snapshot.card_number_encrypted, snapshot.identification_number_encrypted, snapshot.phone_encrypted,
      snapshot.card_number_last4, source.source_name_snapshot, source.source_filename_snapshot,
      source_data.json_data AS source_json_data,
      source_index.card_number_hash AS source_card_number_hash,
      source_index.canonical_obligation_key AS indexed_obligation_key,
      closing.closing_amount::text, closing.closing_nickname, closing.closing_payment_date,
      manual.pool_amount::text AS stored_pool_amount, manual.manual_settlement_reason,
      manual.manual_settlement_reference, manual.manual_settlement_verified_by,
      manual.manual_settlement_verified_at, manual.manual_settlement_updated_by,
      manual.manual_settlement_updated_at
    FROM summary LEFT JOIN authorized_page page ON true
    LEFT JOIN public.collection_osp_target_source_rows snapshot
      ON snapshot.target_revision_id = page.target_revision_id AND snapshot.cycle_key = page.cycle_key
    LEFT JOIN public.collection_osp_target_sources source
      ON source.target_revision_id = page.target_revision_id AND source.source_import_id = page.source_import_id
    LEFT JOIN public.data_rows source_data
      ON source_data.import_id = page.source_import_id AND source_data.id = page.source_data_row_id
    LEFT JOIN public.collection_source_rows source_index
      ON source_index.source_import_id = page.source_import_id AND source_index.source_data_row_id = page.source_data_row_id
    LEFT JOIN closing_payments closing ON closing.cycle_key = page.cycle_key
    LEFT JOIN public.collection_records manual ON manual.id = page.manual_record_id
    ORDER BY page.effective_date, page.aging_bucket, page.cycle_key
  `);
  const detailRows = rowsOf(pageResult);
  const summary = { accountCount: toNumber(detailRows[0]?.summary_count),
    ospClosed: formatCollectionOspMoneyCents(parseCollectionOspMoneyCents(detailRows[0]?.summary_osp ?? "0")) };
  const pageInfo = pagination(input.page, input.pageSize, summary.accountCount);
  const decrypt = (value: unknown): string | null => {
    if (value == null) return null;
    const plaintext = decryptCollectionPiiValueSafe(String(value));
    if (!plaintext) throw new CollectionOspV7RepositoryError("PII_UNAVAILABLE", "Saved account details could not be decrypted. Contact the administrator.");
    return plaintext;
  };
  const items = detailRows.filter((row) => row.cycle_key != null).map((row) => {
    const source = String(row.detail_source) as "AUTOMATIC_ABORT_CP" | "MANUAL_VERIFIED_ABORT";
    const effectiveDate = dateOnly(row.effective_date);
    const money = (value: unknown) => formatCollectionOspMoneyCents(parseCollectionOspMoneyCents(value ?? "0"));
    const account = decrypt(row.account_number_encrypted);
    const customer = decrypt(row.customer_name_encrypted);
    const canonical = extractCanonicalSavedCollectionMasterRow(row.source_json_data);
    const normalizedAccount = normalizeCollectionSourceIdentifier(canonical.accountNumber);
    const normalizedCard = normalizeCollectionSourceIdentifier(canonical.cardNumber);
    const accountHash = hashCollectionSourceIdentifier(normalizedAccount, "account_number");
    const cardHash = hashCollectionSourceIdentifier(normalizedCard, "card_number");
    const sourceKey = accountHash ? `account:${accountHash}` : cardHash ? `card:${cardHash}` : null;
    const trustedSourceIdentity = sourceKey === String(row.canonical_obligation_key)
      && (row.indexed_obligation_key == null || String(row.indexed_obligation_key) === sourceKey);
    const trustedCard = trustedSourceIdentity && cardHash
      && (row.source_card_number_hash == null || String(row.source_card_number_hash) === cardHash)
      && normalizedCard.slice(-4) === normalizeText(row.card_number_last4) ? normalizedCard : null;
    const legacyDetails = trustedSourceIdentity ? extractSavedCollectionDisplayDetails(row.source_json_data) : null;
    const frozenCard = decrypt(row.card_number_encrypted);
    if ((frozenCard && frozenCard.slice(-4) !== normalizeText(row.card_number_last4))
      || (account && String(row.canonical_obligation_key).startsWith("account:")
        && `account:${hashCollectionSourceIdentifier(account, "account_number")}` !== String(row.canonical_obligation_key))) {
      throw new CollectionOspV7RepositoryError("PII_UNAVAILABLE", "Saved account identity is inconsistent with its source snapshot.");
    }
    return {
      contributionSource: source,
      accountNumber: account,
      customerName: customer,
      identificationNumber: decrypt(row.identification_number_encrypted) ?? legacyDetails?.identificationNumber ?? null,
      phone: decrypt(row.phone_encrypted) ?? legacyDetails?.phone ?? null,
      cardNumber: frozenCard ?? trustedCard,
      cardNumberLast4: row.card_number_last4 == null ? null : String(row.card_number_last4),
      maskedAccountNumber: maskAccountNumber(account),
      maskedCustomerName: maskCustomerName(customer),
      sourceName: String(row.source_name_snapshot), sourceFilename: String(row.source_filename_snapshot),
      callingDate: dateOnly(row.calling_date), aging: String(row.aging_bucket) as CollectionAgingBucket,
      totalDue: money(row.total_due), systemEligibleCumulative: money(row.system_cumulative),
      systemClosureCollectionAmount: row.closing_amount == null ? null : money(row.closing_amount),
      systemClosureStaffNickname: row.closing_nickname == null ? null : String(row.closing_nickname),
      paymentDate: row.closing_payment_date == null ? effectiveDate : dateOnly(row.closing_payment_date),
      classification: source === "AUTOMATIC_ABORT_CP" ? "ABORT_CP" as const : "MANUAL_VERIFIED_ABORT" as const,
      poolAmount: money(row.stored_pool_amount), effectiveCumulative: money(row.reconciled_cumulative),
      billingPrincipalOsp: money(row.billing_principal_osp), effectiveClosedDate: effectiveDate,
      reason: row.manual_settlement_reason == null ? null : String(row.manual_settlement_reason),
      reference: row.manual_settlement_reference == null ? null : String(row.manual_settlement_reference),
      verifiedBy: row.manual_settlement_verified_by == null ? null : String(row.manual_settlement_verified_by),
      verifiedAt: row.manual_settlement_verified_at == null ? null : isoDateTime(row.manual_settlement_verified_at),
      updatedBy: row.manual_settlement_updated_by == null ? null : String(row.manual_settlement_updated_by),
      updatedAt: row.manual_settlement_updated_at == null ? null : isoDateTime(row.manual_settlement_updated_at),
    };
  });
  return { items, pagination: pageInfo, summary };
}

export async function getCollectionOspExportDatasetRepository(input: {
  targetId: string;
  revisionId: string;
  asOfDate: string;
  from: string;
  to: string;
  date?: string;
  aging?: CollectionAgingBucket;
  viewer?: CollectionOspViewer;
}) {
  const calculationDataset = await loadTargetReportDataset(input.targetId, input.revisionId, input.asOfDate, input.viewer);
  const calendarDataset = input.to === input.asOfDate ? calculationDataset
    : await loadTargetReportDataset(input.targetId, input.revisionId, input.to, input.viewer);
  const [overview, calendar] = await Promise.all([
    buildCollectionOspTargetOverviewFromDataset(
      calculationDataset,
      input.revisionId,
      input.asOfDate,
      input.viewer,
    ),
    buildCollectionOspCalendarFromDataset(calendarDataset, input),
  ]);
  await assertViewerStillAuthorized(calculationDataset.target, input.viewer);
  return {
    generatedAt: new Date().toISOString(),
    filters: {
      asOf: input.asOfDate,
      from: input.from,
      to: input.to,
      date: input.date ?? null,
      aging: input.aging ?? null,
    },
    overview,
    calendar: calendar.days,
    // Report exports contain A/B and calendar only; authorized PII is exact-day modal data.
    drilldown: [],
    drilldownTotal: 0,
  };
}
