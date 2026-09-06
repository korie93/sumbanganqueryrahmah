import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { COLLECTION_OSP_AGINGS, parseCollectionOspMoneyCents } from "../lib/collection-osp-reconciliation";
import type { CollectionOspSourcePreview, CollectionOspTargetOptions, CollectionOspTargetOptionsInput, CollectionOspViewer } from "../storage-postgres-collection-types";
import type { CollectionRepositoryExecutor } from "./collection-nickname-types";
import { CollectionOspV7RepositoryError } from "./collection-osp-repository-error";
import { buildTextArraySql } from "./sql-array-utils";
import { buildLikePattern } from "./sql-like-utils";

type Row = Record<string, unknown>;
const rowsOf = (result: { rows?: unknown[] }) => (result.rows ?? []) as Row[];
const dateOnly = (value: unknown) => String(value ?? "").slice(0, 10);
export const MAX_COLLECTION_OSP_SOURCE_ROWS = 100_000;

export function assertCollectionOspBaselinePrecision(value: string): void {
  if (parseCollectionOspMoneyCents(value) > 9_999_999_999_999_999n) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "The selected Billing OSP total exceeds the supported amount for one aging bucket. Choose a smaller configured source scope.");
  }
}

function superuserPredicate(viewer: CollectionOspViewer | undefined) {
  if (viewer?.role !== "superuser" || !viewer.userId) return sql`FALSE`;
  return sql`EXISTS (SELECT 1 FROM public.users operator
    WHERE operator.id = ${viewer.userId} AND operator.role = 'superuser'
      AND operator.status = 'active' AND COALESCE(operator.is_banned, false) = false)`;
}

export async function listCollectionOspTargetOptionsRepository(input: CollectionOspTargetOptionsInput): Promise<CollectionOspTargetOptions> {
  const pageSize = Math.max(1, Math.min(100, Math.trunc(input.pageSize)));
  const sourceOffset = (Math.max(1, Math.min(10_000, Math.trunc(input.sourcePage))) - 1) * pageSize;
  const adminOffset = (Math.max(1, Math.min(10_000, Math.trunc(input.adminPage))) - 1) * pageSize;
  const allowed = superuserPredicate(input.viewer);
  const adminPattern = buildLikePattern(input.adminSearch, "contains");
  const sourcePattern = buildLikePattern(input.sourceSearch, "contains");
  const [adminResult, sourceResult] = await Promise.all([
    db.execute(sql`SELECT candidate.id, candidate.username, candidate.full_name
      FROM public.users candidate
      WHERE candidate.role = 'admin' AND candidate.status = 'active'
        AND COALESCE(candidate.is_banned, false) = false AND ${allowed}
        AND (${input.adminSearch === ""} OR candidate.username ILIKE ${adminPattern} ESCAPE '\\'
          OR candidate.full_name ILIKE ${adminPattern} ESCAPE '\\')
      ORDER BY candidate.username, candidate.id LIMIT ${pageSize + 1} OFFSET ${adminOffset}`),
    db.execute(sql`SELECT config.source_import_id, imp.name, imp.filename,
        config.valid_from, config.valid_to, config.indexed_row_count
      FROM public.collection_source_configs config
      JOIN public.imports imp ON imp.id = config.source_import_id
      WHERE config.enabled = true AND config.compatibility_status = 'compatible'
        AND imp.is_deleted = false AND ${allowed}
        AND (${input.sourceSearch === ""} OR imp.name ILIKE ${sourcePattern} ESCAPE '\\'
          OR imp.filename ILIKE ${sourcePattern} ESCAPE '\\')
      ORDER BY config.valid_from DESC, imp.name, config.source_import_id
      LIMIT ${pageSize + 1} OFFSET ${sourceOffset}`),
  ]);
  const admins = rowsOf(adminResult);
  const sources = rowsOf(sourceResult);
  return {
    admins: admins.slice(0, pageSize).map((row) => ({ id: String(row.id), username: String(row.username), fullName: row.full_name == null ? null : String(row.full_name) })),
    sources: sources.slice(0, pageSize).map((row) => ({ id: String(row.source_import_id), name: String(row.name), filename: String(row.filename), validFrom: dateOnly(row.valid_from), validTo: dateOnly(row.valid_to), recordCount: Number(row.indexed_row_count), status: "active" })),
    adminsHasMore: admins.length > pageSize, sourcesHasMore: sources.length > pageSize, pageSize,
  };
}

/** Called inside create/preview transactions. Dates and import identities are
 * authoritative configured-source facts, not browser date-picker defaults. */
export async function loadCollectionOspConfiguredSourceScope(executor: CollectionRepositoryExecutor, sourceIds: readonly string[]) {
  if (sourceIds.length < 1 || sourceIds.length > 5 || new Set(sourceIds).size !== sourceIds.length
    || sourceIds.some((id) => !id.trim() || id.length > 200)) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Select between 1 and 5 unique configured Saved sources.");
  }
  const sources = rowsOf(await executor.execute(sql`
    SELECT config.source_import_id, config.valid_from, config.valid_to, config.indexed_row_count,
      imp.name, imp.filename, imp.created_at, imp.content_hash_sha256
    FROM public.collection_source_configs config
    JOIN public.imports imp ON imp.id = config.source_import_id
    WHERE config.source_import_id = ANY(${buildTextArraySql([...sourceIds])})
      AND config.enabled = true AND config.compatibility_status = 'compatible' AND imp.is_deleted = false
    ORDER BY config.source_import_id FOR SHARE OF config, imp
  `));
  if (sources.length !== sourceIds.length) throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "One or more Saved sources are unavailable or incompatible.");
  const from = dateOnly(sources[0]!.valid_from);
  const to = dateOnly(sources[0]!.valid_to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to
    || (Date.parse(to) - Date.parse(from)) / 86_400_000 >= 366
    || sources.some((source) => dateOnly(source.valid_from) !== from || dateOnly(source.valid_to) !== to)) {
    throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Selected sources must have the same configured validity, within 366 days.");
  }
  if (sources.reduce((sum, source) => sum + Number(source.indexed_row_count), 0) > MAX_COLLECTION_OSP_SOURCE_ROWS) {
    throw new CollectionOspV7RepositoryError("DATASET_TOO_LARGE", "Saved Target source scope exceeds 100,000 rows.");
  }
  return { sources, from, to };
}

export async function previewCollectionOspSourceScopeRepository(input: { viewer: CollectionOspViewer; sourceImportIds: string[] }): Promise<CollectionOspSourcePreview> {
  return db.transaction(async (tx) => {
    if (rowsOf(await tx.execute(sql`SELECT 1 WHERE ${superuserPredicate(input.viewer)}`)).length === 0) {
      throw new CollectionOspV7RepositoryError("NOT_FOUND", "Billing source configuration was not found.");
    }
    const sourceIds = [...input.sourceImportIds].sort();
    const { from, to } = await loadCollectionOspConfiguredSourceScope(tx, sourceIds);
    const values = rowsOf(await tx.execute(sql`
      WITH canonical AS (
        SELECT DISTINCT ON (source_row.canonical_obligation_key)
          source_row.aging_bucket, source_row.billing_principal_osp
        FROM public.collection_source_rows source_row
        JOIN public.collection_source_configs source_config
          ON source_config.source_import_id = source_row.source_import_id
        WHERE source_row.source_import_id = ANY(${buildTextArraySql(sourceIds)})
        ORDER BY source_row.canonical_obligation_key, source_row.calling_date DESC,
          source_config.valid_from DESC, source_config.updated_at DESC,
          source_row.source_import_id, source_row.source_data_row_id
        LIMIT ${MAX_COLLECTION_OSP_SOURCE_ROWS + 1}
      )
      SELECT aging_bucket, SUM(billing_principal_osp)::text AS total_osp,
        COUNT(*)::int AS account_count
      FROM canonical GROUP BY aging_bucket ORDER BY aging_bucket
    `));
    const count = values.reduce((sum, row) => sum + Number(row.account_count), 0);
    for (const row of values) assertCollectionOspBaselinePrecision(String(row.total_osp));
    if (count === 0 || count > MAX_COLLECTION_OSP_SOURCE_ROWS) {
      throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Configured sources must contain between 1 and 100,000 compatible accounts.");
    }
    return {
      from, to, sourceImportIds: sourceIds,
      rows: COLLECTION_OSP_AGINGS.map((aging) => {
        const row = values.find((value) => value.aging_bucket === aging);
        return { aging, totalOsp: row ? String(row.total_osp) : "0.00", accountCount: row ? Number(row.account_count) : 0 };
      }),
    };
  });
}

export async function assertCollectionOspEligibleAdmin(executor: CollectionRepositoryExecutor, assignedAdminUserId: string) {
  const admin = rowsOf(await executor.execute(sql`
    SELECT id FROM public.users WHERE id = ${assignedAdminUserId} AND role = 'admin'
      AND status = 'active' AND COALESCE(is_banned, false) = false FOR SHARE
  `))[0];
  if (!admin) throw new CollectionOspV7RepositoryError("INVALID_SOURCE", "Select an active eligible admin account.");
}

export async function assertCollectionOspSuperuserActor(executor: CollectionRepositoryExecutor, viewer: CollectionOspViewer | undefined, actor: string) {
  const operator = rowsOf(await executor.execute(sql`SELECT id FROM public.users
    WHERE id = ${viewer?.userId ?? null} AND username = ${actor}
      AND role = 'superuser' AND ${viewer?.role === "superuser"}
      AND status = 'active' AND COALESCE(is_banned, false) = false FOR SHARE`))[0];
  if (!operator) throw new CollectionOspV7RepositoryError("NOT_FOUND", "Saved Target management is unavailable for this account.");
}

/** Lock actual source IDs in deterministic order before checking exclusivity.
 * Same admin may maintain separate named targets; another admin cannot claim
 * the same source and validity. Different historical periods remain valid. */
export async function assertCollectionOspSourceAssignment(executor: CollectionRepositoryExecutor, input: {
  sourceImportIds: readonly string[]; from: string; to: string; assignedAdminUserId: string; targetId?: string;
}) {
  for (const sourceId of [...new Set(input.sourceImportIds)].sort()) {
    await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`collection-osp-assignment:${sourceId}`}, 0))`);
  }
  const conflict = rowsOf(await executor.execute(sql`
    SELECT 1 FROM public.collection_osp_saved_targets target
    JOIN public.collection_osp_target_revisions revision ON revision.target_id = target.id
    JOIN public.collection_osp_target_sources source ON source.target_revision_id = revision.id
    LEFT JOIN public.collection_source_configs config ON config.source_import_id = source.source_import_id
    WHERE target.status = 'ACTIVE' AND target.assigned_admin_user_id IS NOT NULL
      AND target.assigned_admin_user_id <> ${input.assignedAdminUserId}
      AND (${input.targetId ?? null}::uuid IS NULL OR target.id <> ${input.targetId ?? null}::uuid)
      AND source.source_import_id = ANY(${buildTextArraySql([...input.sourceImportIds])})
      AND COALESCE(config.valid_from, revision.period_from) <= ${input.to}::date
      AND COALESCE(config.valid_to, revision.period_to) >= ${input.from}::date
      AND NOT EXISTS (SELECT 1 FROM public.collection_osp_target_revisions newer
        WHERE newer.target_id = target.id AND newer.revision_number > revision.revision_number)
    LIMIT 1
  `))[0];
  if (conflict) throw new CollectionOspV7RepositoryError("DUPLICATE", "This source validity is already assigned to another admin. Review the existing target assignment.");
}
