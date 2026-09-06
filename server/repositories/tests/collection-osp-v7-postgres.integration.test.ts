import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { db, dbRead } from "../../db-postgres";
import { ensureCollectionRecordsTables } from "../../internal/collection-bootstrap-records";
import { ensureCoreDataRowsTable, ensureCoreImportsTable } from "../../internal/core-schema-bootstrap-imports";
import { ensureCoreAuditLogsTable } from "../../internal/core-schema-bootstrap-activity";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import { upsertCollectionManualSettlement, revokeCollectionManualSettlement } from "../collection-manual-settlement-repository-utils";
import { deleteCollectionRecord } from "../collection-record-mutation-repository-utils";
import { purgeCollectionRecordsOlderThan } from "../collection-record-purge-repository-utils";
import { recalculateCollectionSettlementCycles } from "../collection-settlement-repository-utils";
import {
  createCollectionOspManualReconciliationRepository,
  createCollectionOspSavedTargetRepository,
  updateCollectionOspSavedTargetRepository,
  getCollectionOspCalendarRepository as readCalendar,
  getCollectionOspDrilldownRepository as readDrilldown,
  getCollectionOspTargetOverviewRepository as readOverview,
  getCollectionOspSavedTargetRepository,
  listCollectionOspSavedTargetsRepository,
  getCollectionOspExportDatasetRepository,
  listCollectionOspReconciliationHistoryRepository,
  upsertCollectionOspClientResultsRepository as savePrivateClient,
} from "../collection-osp-v7-repository-utils";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import { SearchRepository } from "../search.repository";
import { listCollectionAdminGroups } from "../collection-admin-group-utils";
import { listCollectionOspTargetOptionsRepository, previewCollectionOspSourceScopeRepository } from "../collection-osp-source-scope-repository-utils";
import { protectCollectionOspPrivateClientBackup, readCollectionOspPrivateClientBackup, restoreCollectionOspPrivateClientResultsFromBackup } from "../backups-collection-osp-private-utils";
import { createBackupPayloadChunkReader } from "../backups-payload-reader-utils";
import { createRestoreStats } from "../backups-restore-stats-utils";
import { restoreUsersFromBackup } from "../backups-restore-core-datasets-utils";
import type { BackupRestoreExecutor } from "../backups-restore-shared-utils";
import { dropDrainedOspFixtureDatabase } from "./postgres-fixture-cleanup";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationFiles = [
  "0049_collection_record_purge_history.sql",
  "0052_collection_source_governance_osp.sql",
  "0053_collection_source_governance_deferred_foreign_keys.sql",
  "0054_collection_osp_reconciliation_persistence.sql",
  "0055_collection_manual_verified_settlement.sql",
  "0056_collection_osp_v9_baseline_integrity.sql",
  "0057_collection_purge_canonical_history.sql",
  "0059_collection_purge_manual_settlement_history.sql",
  "0060_collection_osp_v9_complete_aging_scope.sql",
  "0061_collection_v9_history_lookup_indexes.sql",
  "0062_collection_osp_private_client_ownership.sql",
];
const migrations = migrationFiles.map((name) => readFileSync(path.join(repoRoot, "drizzle", name), "utf8"));
const teamStableIdMigration = readFileSync(
  path.join(repoRoot, "drizzle", "0058_collection_team_stable_nickname_ids.sql"),
  "utf8",
);
const pgBaseConfig = {
  host: process.env.PG_HOST || "127.0.0.1", port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres", password: process.env.PG_PASSWORD || "postgres",
};
const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";

async function detectPostgresAvailability() {
  const pool = new pg.Pool({ ...pgBaseConfig, database: maintenanceDatabase, max: 1, connectionTimeoutMillis: 1_500, idleTimeoutMillis: 1_500 });
  try { await pool.query("SELECT 1"); return null; } catch (error) { return `PostgreSQL unavailable for Billing Principal V9 integration: ${error instanceof Error ? error.message : String(error)}`; } finally { await pool.end().catch(() => undefined); }
}
const skipReason = await detectPostgresAvailability();
const completeAgingScope = ["D3", "D4", "D5", "D6"] as const;
const repositoryViewer = { userId: "osp-repo-tester", role: "superuser" };
// These calculation-regression tests now use a real authenticated-capable actor.
// The disabled built-in system audit actor must never bypass viewer authorization.
const getCollectionOspCalendarRepository = (input: Parameters<typeof readCalendar>[0]) => readCalendar({ viewer: repositoryViewer, ...input });
const getCollectionOspDrilldownRepository = (input: Parameters<typeof readDrilldown>[0]) => readDrilldown({ viewer: repositoryViewer, ...input });
const getCollectionOspTargetOverviewRepository = (input: Parameters<typeof readOverview>[0]) => readOverview({ viewer: repositoryViewer, ...input });
const upsertCollectionOspClientResultsRepository = (input: Parameters<typeof savePrivateClient>[0]) => savePrivateClient({ ...input, actor: "osp-repo-tester", viewer: repositoryViewer });

function completeTargetRows(d3TargetPercentage: string) {
  return completeAgingScope.map((agingBucket) => ({
    agingBucket,
    totalOspBaseline: agingBucket === "D3" ? "8000.00" : "0.00",
    targetPercentage: agingBucket === "D3" ? d3TargetPercentage : "0.0000",
  }));
}

function completeClientRows(
  d3ResultPercentage: string,
  options: { note: string; reference: string; expectedVersion?: number },
) {
  return completeAgingScope.map((aging) => ({
    aging,
    targetPercentage: aging === "D3" ? "50.0000" : "0.0000",
    resultPercentage: aging === "D3" ? d3ResultPercentage : "0.0000",
    note: aging === "D3" ? options.note : null,
    reference: aging === "D3" ? options.reference : null,
    ...(options.expectedVersion === undefined ? {} : { expectedVersion: options.expectedVersion }),
  }));
}

async function withTempDatabase(run: (pool: pg.Pool) => Promise<void>) {
  const admin = new pg.Pool({ ...pgBaseConfig, database: maintenanceDatabase, max: 1 });
  const databaseName = `sqr_osp_v9_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const quoted = pg.escapeIdentifier(databaseName);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${quoted}`);
    created = true;
    const pool = new pg.Pool({ ...pgBaseConfig, database: databaseName, max: 4 });
    try { await run(pool); } finally { await pool.end(); }
  } finally {
    try {
      if (created) await dropDrainedOspFixtureDatabase(admin, databaseName);
    } finally {
      await admin.end();
    }
  }
}

type MutableDb = { execute: typeof db.execute; transaction: typeof db.transaction };
async function withRepositoryDatabase<T>(pool: pg.Pool, run: () => Promise<T>, captured?: Array<{ sql: string; params: unknown[] }>) {
  const database = drizzle(pool, captured ? { logger: { logQuery(query, params) { captured.push({ sql: query, params }); } } } : {});
  const mutables = Array.from(new Set([db, dbRead])).map((value) => value as unknown as MutableDb);
  const originals = mutables.map((mutable) => ({
    mutable,
    execute: mutable.execute,
    transaction: mutable.transaction,
  }));
  for (const mutable of mutables) {
    mutable.execute = database.execute.bind(database) as typeof db.execute;
    mutable.transaction = database.transaction.bind(database) as typeof db.transaction;
  }
  try {
    return await run();
  } finally {
    for (const original of originals) {
      original.mutable.execute = original.execute;
      original.mutable.transaction = original.transaction;
    }
  }
}

async function prepareSchema(pool: pg.Pool) {
  const database = drizzle(pool);
  await ensureCollectionRecordsTables(database); await ensureUsersBootstrapSchema(database);
  await ensureCoreAuditLogsTable(database);
  await ensureCoreImportsTable(database); await ensureCoreDataRowsTable(database);
  for (const migration of migrations) await pool.query(migration);
  await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ('osp-repo-tester', 'osp-repo-tester', 'not-a-login-secret', 'superuser', 'active')");
  await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ('osp-repo-admin', 'osp-repo-admin', 'not-a-login-secret', 'admin', 'active')");
}

test("Billing OSP V3 additive schema preserves legacy history and constrains private stable ownership", { skip: skipReason || false, timeout: 60_000 }, async () => {
  await withTempDatabase(async (pool) => {
    await prepareSchema(pool);
    const targetId = randomUUID();
    const revisionId = randomUUID();
    const otherTargetId = randomUUID();
    for (const [id, username, role] of [
      ["osp-admin-id", "osp-admin", "admin"],
      ["osp-manager-id", "osp-manager", "manager"],
      ["osp-superuser-id", "osp-superuser", "superuser"],
    ]) {
      await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ($1, $2, 'not-a-login-secret', $3, 'active')", [id, username, role]);
    }
    for (const [id, name] of [[targetId, "private schema target"], [otherTargetId, "other schema target"]]) {
      await pool.query(`INSERT INTO public.collection_osp_saved_targets
        (id, target_name, normalized_name, created_by, updated_by)
        VALUES ($1::uuid, $2, $2, 'osp-superuser', 'osp-superuser')`, [id, name]);
    }
    await pool.query(`INSERT INTO public.collection_osp_target_revisions
      (id, target_id, revision_number, source_scope_hash, period_from, period_to,
        tracking_start_date, tracking_end_date, created_by)
      VALUES ($1::uuid, $2::uuid, 1, $3, '2026-08-12', '2026-09-11',
        '2026-08-12', '2026-09-11', 'osp-superuser')`, [revisionId, targetId, "a".repeat(64)]);
    await pool.query(`INSERT INTO public.collection_osp_client_results
      (id, target_id, target_revision_id, as_of_date, aging_bucket, result_percentage,
        osp_closed, created_by, updated_by)
      VALUES ($1::uuid, $2::uuid, $3::uuid, '2026-09-01', 'D3', 20, 200000,
        'osp-superuser', 'osp-manager')`, [randomUUID(), targetId, revisionId]);
    // Re-running both migration and runtime bootstrap must not infer assignment,
    // create private ownership, or destroy an ambiguous shared legacy save.
    await pool.query(migrations[migrations.length - 1]!);
    await ensureCollectionRecordsTables(drizzle(pool));
    assert.equal((await pool.query("SELECT assigned_admin_user_id FROM public.collection_osp_saved_targets WHERE id = $1", [targetId])).rows[0]?.assigned_admin_user_id, null);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM public.collection_osp_private_client_results")).rows[0]?.count, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM public.collection_osp_client_results")).rows[0]?.count, 1);
    await assert.rejects(pool.query("UPDATE public.collection_osp_saved_targets SET assigned_admin_user_id = 'missing-user' WHERE id = $1", [targetId]), { code: "23503" });
    await pool.query("UPDATE public.collection_osp_saved_targets SET assigned_admin_user_id = 'osp-admin-id' WHERE id = $1", [targetId]);
    const insertPrivate = (owner: string, actor: string, aging = "D3", privateTarget = "30", target = targetId) => pool.query(`
      INSERT INTO public.collection_osp_private_client_results
        (id, target_id, target_revision_id, owner_user_id, aging_bucket,
          target_percentage, result_percentage, osp_closed, as_of_date, created_by, updated_by)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 20, 200000,
        '2026-09-01', $7, $7)`, [randomUUID(), target, revisionId, owner, aging, privateTarget, actor]);
    await insertPrivate("osp-admin-id", "osp-admin", "D3", "40");
    await insertPrivate("osp-manager-id", "osp-manager", "D3", "35");
    await insertPrivate("osp-superuser-id", "osp-superuser", "D3", "25");
    assert.deepEqual((await pool.query(`SELECT owner_user_id, target_percentage::text
      FROM public.collection_osp_private_client_results ORDER BY owner_user_id`)).rows, [
      { owner_user_id: "osp-admin-id", target_percentage: "40.0000" },
      { owner_user_id: "osp-manager-id", target_percentage: "35.0000" },
      { owner_user_id: "osp-superuser-id", target_percentage: "25.0000" },
    ]);
    await assert.rejects(insertPrivate("osp-admin-id", "osp-admin"), { code: "23505" });
    await assert.rejects(insertPrivate("missing-user", "osp-admin"), { code: "23503" });
    await assert.rejects(insertPrivate("osp-admin-id", "osp-admin", "ALL"), { code: "23514" });
    await assert.rejects(insertPrivate("osp-admin-id", "osp-admin", "D4", "101"), { code: "23514" });
    await assert.rejects(insertPrivate("osp-admin-id", "osp-admin", "D4", "-1"), { code: "23514" });
    await assert.rejects(insertPrivate("osp-admin-id", "osp-admin", "D4", "30", otherTargetId), { code: "23503" });
    await pool.query("UPDATE public.users SET username = 'osp-admin-renamed' WHERE id = 'osp-admin-id'");
    const renamed = (await pool.query("SELECT owner_user_id, created_by, updated_by FROM public.collection_osp_private_client_results WHERE owner_user_id = 'osp-admin-id'")).rows[0];
    assert.deepEqual(renamed, { owner_user_id: "osp-admin-id", created_by: "osp-admin-renamed", updated_by: "osp-admin-renamed" });
    await assert.rejects(pool.query("DELETE FROM public.users WHERE id = 'osp-admin-id'"), { code: "23503" });
    const indexes = (await pool.query(`SELECT indexname FROM pg_indexes
      WHERE tablename = 'collection_osp_private_client_results' OR
        indexname = 'idx_collection_osp_saved_targets_assigned_admin_active'`)).rows.map((row) => row.indexname);
    assert.ok(indexes.includes("idx_collection_osp_private_client_results_owner_aging_unique"));
    assert.ok(indexes.includes("idx_collection_osp_saved_targets_assigned_admin_active"));
  });
});

test("Billing OSP V3 repository isolates assigned targets and private percentages through shared edits and reassignment", { skip: skipReason || false, timeout: 60_000 }, async () => {
  const previousPiiKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-v3-private-postgres-test-key-2026";
  try {
    await withTempDatabase(async (pool) => {
      await prepareSchema(pool);
      for (const [id, role] of [["private-admin-a", "admin"], ["private-admin-b", "admin"], ["private-manager", "manager"], ["private-user", "user"]]) {
        await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ($1, $1, 'not-a-login-secret', $2, 'active')", [id, role]);
      }
      const accountHash = hashCollectionSourceIdentifier("1234567890123456", "account_number")!;
      const cardHash = hashCollectionSourceIdentifier("4377044001076221", "card_number")!;
      await pool.query("INSERT INTO public.imports (id, name, filename, is_deleted, created_by) VALUES ('private-source', 'Private source', 'private-source.xlsx', false, 'system')");
      await pool.query("INSERT INTO public.data_rows (id, import_id, json_data) VALUES ('private-row', 'private-source', $1::jsonb)", [JSON.stringify({ "Customer Name": "Private Fixture Customer", "Account Number": "1234567890123456", "Card Number": "4377044001076221", "IC Number": "931120115437", "Phone": "0176936143", "TOTAL DUE": "500.00", "Billing Principal (OSP)": "1000000.00", DC_STS: "D3", "Calling Date": "2026-08-12" })]);
      await pool.query("INSERT INTO public.collection_source_configs (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by) VALUES ('private-source', '2026-08-12', '2026-09-11', 'V3-PRIVATE', true, 'compatible', ARRAY[]::text[], 1, 'system')");
      await pool.query("INSERT INTO public.collection_source_rows (source_import_id, source_data_row_id, account_number_hash, card_number_hash, card_number_last4, canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date) VALUES ('private-source', 'private-row', $1, $2, '6221', $3, 500, 1000000, 'D3', '2026-08-12')", [accountHash, cardHash, `account:${accountHash}`]);
      await withRepositoryDatabase(pool, async () => {
        const options = await listCollectionOspTargetOptionsRepository({ viewer: repositoryViewer, sourceSearch: "Private", adminSearch: "private-admin", sourcePage: 1, adminPage: 1, pageSize: 1 });
        assert.equal(options.sources[0]?.validFrom, "2026-08-12");
        assert.equal(options.sources[0]?.validTo, "2026-09-11");
        assert.equal(options.sources[0]?.recordCount, 1);
        assert.equal(options.admins.length, 1);
        assert.equal(options.adminsHasMore, true);
        assert.deepEqual(Object.keys(options.admins[0]!).sort(), ["fullName", "id", "username"]);
        const preview = await previewCollectionOspSourceScopeRepository({ viewer: repositoryViewer, sourceImportIds: ["private-source"] });
        assert.equal(preview.rows[0]?.totalOsp, "1000000.00", "preview uses Billing Principal OSP, never TOTAL DUE 500");
        assert.equal(preview.rows.length, 4);
        await assert.rejects(previewCollectionOspSourceScopeRepository({ viewer: repositoryViewer, sourceImportIds: ["missing-source"] }), /unavailable or incompatible/);
        const target = await createCollectionOspSavedTargetRepository({
          name: "V3 private role fixture", sourceImportIds: ["private-source"],
          assignedAdminUserId: "private-admin-a", viewer: repositoryViewer,
          timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope],
          targets: completeAgingScope.map((agingBucket) => ({ agingBucket, totalOspBaseline: agingBucket === "D3" ? "1000000.00" : "0.00", targetPercentage: "30.0000" })), actor: "osp-repo-tester",
        });
        assert.equal(target.assignedAdminUserId, "private-admin-a");
        assert.equal(target.activeRevision.from, "2026-08-12");
        assert.equal(target.activeRevision.to, "2026-09-11");
        assert.equal(target.activeRevision.sourceValidityVerified, true, "only newly verified canonical source revisions carry verified validity");
        const createAudit = (await pool.query("SELECT performed_by, timestamp, details FROM public.audit_logs WHERE action = 'COLLECTION_OSP_TARGET_CREATED' AND target_resource = $1", [target.id])).rows[0];
        const createDetails = JSON.parse(createAudit.details);
        assert.equal(createAudit.performed_by, repositoryViewer.userId);
        assert.ok(createAudit.timestamp);
        assert.equal(createDetails.name, target.name);
        assert.equal(createDetails.oldAssignedAdminUserId, null);
        assert.equal(createDetails.assignedAdminUserId, "private-admin-a");
        assert.deepEqual(createDetails.sourceImportIds, ["private-source"]);
        assert.equal(createDetails.targets.length, 4);
        const createProbe = (overrides: Partial<Parameters<typeof createCollectionOspSavedTargetRepository>[0]>) => createCollectionOspSavedTargetRepository({
          name: "V3 invalid-create probe", sourceImportIds: ["private-source"], assignedAdminUserId: "private-admin-a", viewer: repositoryViewer,
          timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope], actor: repositoryViewer.userId,
          targets: completeAgingScope.map((agingBucket) => ({ agingBucket, totalOspBaseline: null, targetPercentage: "30" })), ...overrides,
        });
        await assert.rejects(createProbe({ assignedAdminUserId: "private-manager" }), /eligible admin/);
        await assert.rejects(createProbe({ assignedAdminUserId: "private-user" }), /eligible admin/);
        await assert.rejects(createProbe({ from: "2026-08-01" }), /configured source validity/);
        await assert.rejects(createProbe({ assignedAdminUserId: "private-admin-b" }), /already assigned to another admin/);
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM public.collection_osp_saved_targets")).rows[0]?.count, 1, "failed creation rolls back target and source snapshots");
        const scope = { targetId: target.id, revisionId: target.activeRevision.id, asOfDate: "2026-09-05" };
        const adminA = { userId: "private-admin-a", role: "admin" };
        const adminB = { userId: "private-admin-b", role: "admin" };
        const manager = { userId: "private-manager", role: "manager" };
        const normalUser = { userId: "private-user", role: "user" };
        assert.deepEqual(await listCollectionOspSavedTargetsRepository(), []);
        assert.equal(await getCollectionOspSavedTargetRepository(target.id), undefined);
        assert.equal((await listCollectionOspSavedTargetsRepository({ viewer: adminA })).length, 1);
        assert.deepEqual(await listCollectionOspSavedTargetsRepository({ viewer: adminB }), []);
        assert.equal((await listCollectionOspSavedTargetsRepository({ viewer: manager })).length, 1);
        assert.equal((await listCollectionOspSavedTargetsRepository({ viewer: repositoryViewer })).length, 1);
        const expectHidden = async (viewer: typeof adminA) => {
          assert.equal(await getCollectionOspSavedTargetRepository(target.id, target.activeRevision.id, viewer), undefined);
          await assert.rejects(readOverview({ ...scope, viewer }), /not found/);
          await assert.rejects(readCalendar({ ...scope, viewer, from: "2026-08-12", to: "2026-09-05" }), /not found/);
          await assert.rejects(readDrilldown({ ...scope, viewer, date: "2026-09-05", page: 1, pageSize: 10 }), /not found/);
          await assert.rejects(getCollectionOspExportDatasetRepository({ ...scope, viewer, from: "2026-08-12", to: "2026-09-05" }), /not found/);
        };
        await expectHidden(adminB);
        await expectHidden(normalUser);
        await expectHidden({ userId: "system-user", role: "superuser" });
        await pool.query(`INSERT INTO public.collection_osp_client_results
          (id, target_id, target_revision_id, as_of_date, aging_bucket, result_percentage, osp_closed, created_by, updated_by)
          VALUES ($1, $2, $3, '2026-09-05', 'D3', 99, 990000, 'osp-repo-tester', 'private-manager')`, [randomUUID(), target.id, target.activeRevision.id]);
        assert.equal((await readOverview({ ...scope, viewer: repositoryViewer })).clientResult.all.receivedDate, null, "legacy global result cannot become a viewer's fallback");
        const privateRows = (targetPercentage: string, resultPercentage: string, expectedVersion?: number) => completeAgingScope.map((aging) => ({
          aging, targetPercentage, resultPercentage: aging === "D3" ? resultPercentage : "0.0000",
          ...(expectedVersion === undefined ? {} : { expectedVersion }),
        }));
        for (const [viewer, targetPercentage, resultPercentage, targetOsp, closed, balance] of [
          [repositoryViewer, "25", "20", "250000.00", "200000.00", "50000.00"],
          [manager, "35", "28", "350000.00", "280000.00", "70000.00"],
          [adminA, "40", "30", "400000.00", "300000.00", "100000.00"],
        ] as const) {
          const saved = await savePrivateClient({ ...scope, viewer, actor: viewer.userId, receivedDate: "2026-09-05", rows: privateRows(targetPercentage, resultPercentage) });
          assert.equal(saved.all.targetOsp, targetOsp);
          assert.equal(saved.all.ospClosed, closed);
          assert.equal(saved.all.balanceOsp, balance);
          const reloaded = await readOverview({ ...scope, viewer, asOfDate: "2026-08-12" });
          assert.equal(reloaded.clientResult.all.targetOsp, targetOsp, "private latest result is independent of System as-of date");
          assert.equal(reloaded.clientResult.all.ospClosed, closed);
          assert.equal(reloaded.systemResult.rows[0]?.targetPercentage, "30.0000");
          const exported = await getCollectionOspExportDatasetRepository({ ...scope, viewer, from: "2026-08-12", to: "2026-09-05" });
          assert.equal(exported.overview.clientResult.all.ospClosed, closed);
        }
        const edited = await updateCollectionOspSavedTargetRepository({
          targetId: target.id, expectedVersion: 1, viewer: repositoryViewer, actor: repositoryViewer.userId,
          targets: completeAgingScope.map((agingBucket) => ({ agingBucket, totalOspBaseline: null, targetPercentage: "32" })),
        });
        assert.equal(edited.activeRevision.id, target.activeRevision.id);
        assert.equal(edited.version, 2);
        await assert.rejects(updateCollectionOspSavedTargetRepository({ targetId: target.id, name: "Stale", expectedVersion: 1, viewer: repositoryViewer, actor: repositoryViewer.userId }), /another session/);
        assert.equal((await readOverview({ ...scope, viewer: adminA })).clientResult.rows[0]?.targetPercentage, "40.0000");
        assert.equal((await readOverview({ ...scope, viewer: manager })).clientResult.rows[0]?.targetPercentage, "35.0000");
        const concurrent = await Promise.allSettled(["21", "22"].map((percentage) => savePrivateClient({
          ...scope, viewer: repositoryViewer, actor: repositoryViewer.userId, receivedDate: "2026-09-05", rows: privateRows("25", percentage, 1),
        })));
        assert.equal(concurrent.filter((outcome) => outcome.status === "fulfilled").length, 1);
        assert.equal(concurrent.filter((outcome) => outcome.status === "rejected").length, 1);
        await pool.query("UPDATE public.collection_source_configs SET enabled = false WHERE source_import_id = 'private-source'");
        assert.equal((await readOverview({ ...scope, viewer: manager })).clientResult.all.targetOsp, "350000.00");
        const reassigned = await updateCollectionOspSavedTargetRepository({ targetId: target.id, assignedAdminUserId: "private-admin-b", expectedVersion: 2, viewer: repositoryViewer, actor: repositoryViewer.userId });
        assert.equal(reassigned.version, 3);
        const updateDetails = (await pool.query("SELECT details FROM public.audit_logs WHERE action = 'COLLECTION_OSP_TARGET_UPDATED' AND target_resource = $1", [target.id]))
          .rows.map((row) => JSON.parse(row.details)).find((details) => details.toVersion === 3);
        assert.equal(updateDetails.before.assignedAdminUserId, "private-admin-a");
        assert.equal(updateDetails.after.assignedAdminUserId, "private-admin-b");
        assert.equal(updateDetails.after.name, target.name);
        assert.deepEqual(updateDetails.sourceImportIds, ["private-source"]);
        assert.equal(updateDetails.from, "2026-08-12");
        assert.equal(updateDetails.to, "2026-09-11");
        assert.equal(updateDetails.after.targets.length, 4);
        await expectHidden(adminA);
        await assert.rejects(savePrivateClient({ ...scope, viewer: adminA, actor: adminA.userId, receivedDate: "2026-09-05", rows: privateRows("40", "30", 1) }), /not found/);
        const newAdmin = await readOverview({ ...scope, viewer: adminB });
        assert.equal(newAdmin.clientResult.all.receivedDate, null);
        assert.equal(newAdmin.clientResult.rows[0]?.targetPercentage, "32.0000", "new admin receives unsaved A default, never previous admin's private save");
        assert.equal((await readOverview({ ...scope, viewer: manager })).clientResult.rows[0]?.targetPercentage, "35.0000");
        const privateAudit = await pool.query("SELECT details FROM public.audit_logs WHERE action = 'COLLECTION_OSP_PRIVATE_CLIENT_SAVED'");
        assert.ok(privateAudit.rows.length > 0);
        assert.equal(privateAudit.rows.some((row) => /targetPercentage|resultPercentage|note|reference/.test(String(row.details))), false);
        for (const readDuringReassignment of [
          () => readOverview({ ...scope, viewer: adminB }),
          () => readCalendar({ ...scope, viewer: adminB, from: "2026-08-12", to: "2026-09-05" }),
          () => readDrilldown({ ...scope, viewer: adminB, date: "2026-09-05", page: 1, pageSize: 10 }),
          () => getCollectionOspExportDatasetRepository({ ...scope, viewer: adminB, from: "2026-08-12", to: "2026-09-05" }),
        ]) {
          const mutable = db as unknown as MutableDb;
          const original = mutable.execute;
          let reassignedDuringRead = false;
          mutable.execute = (async (query: Parameters<typeof db.execute>[0]) => {
            const result = await original(query);
            const firstRow = result.rows[0] as Record<string, unknown> | undefined;
            if (!reassignedDuringRead && firstRow && "reconciled_osp_closed" in firstRow) {
              reassignedDuringRead = true;
              await pool.query("UPDATE public.collection_osp_saved_targets SET assigned_admin_user_id = 'private-admin-a', version = version + 1 WHERE id = $1::uuid", [target.id]);
            }
            return result;
          }) as typeof db.execute;
          try {
            await assert.rejects(readDuringReassignment(), /not found|changed|unavailable/i,
              "private financial or PII data must not escape after assignment changes during SQL aggregation");
            assert.equal(reassignedDuringRead, true);
          } finally {
            mutable.execute = original;
            await pool.query("UPDATE public.collection_osp_saved_targets SET assigned_admin_user_id = 'private-admin-b', version = version + 1 WHERE id = $1::uuid", [target.id]);
          }
        }
        // A write waiting behind reassignment must evaluate the new assignment,
        // not authorize from the SELECT snapshot taken before the row lock.
        const blocking = await pool.connect();
        let pendingSave: Promise<unknown> | undefined;
        try {
          await blocking.query("BEGIN");
          await blocking.query("UPDATE public.collection_osp_saved_targets SET assigned_admin_user_id = 'private-admin-a', version = version + 1 WHERE id = $1::uuid", [target.id]);
          pendingSave = savePrivateClient({ ...scope, viewer: adminB, actor: adminB.userId,
            receivedDate: "2026-09-05", rows: privateRows("10", "10") });
          const rejected = assert.rejects(pendingSave, /not found/i);
          const deadline = Date.now() + 5_000;
          for (;;) {
            const waiting = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE OF target%' AND pid <> pg_backend_pid()");
            if (waiting.rowCount) break;
            assert.ok(Date.now() < deadline, "private save must reach the contested target lock");
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          await blocking.query("COMMIT");
          await rejected;
          assert.equal((await pool.query("SELECT count(*)::int AS count FROM public.collection_osp_private_client_results WHERE target_id = $1::uuid AND owner_user_id = 'private-admin-b'", [target.id])).rows[0].count, 0);
        } finally {
          await blocking.query("ROLLBACK"); blocking.release();
          await pendingSave?.catch(() => undefined);
          await pool.query("UPDATE public.collection_osp_saved_targets SET assigned_admin_user_id = 'private-admin-b', version = version + 1 WHERE id = $1::uuid", [target.id]);
        }
        await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ('osp-second-superuser', 'osp-second-superuser', 'not-a-login-secret', 'superuser', 'active')");
        const sharedVersion = (await getCollectionOspSavedTargetRepository(target.id, undefined, repositoryViewer))!.version;
        const sharedRace = await Promise.allSettled([repositoryViewer, { userId: "osp-second-superuser", role: "superuser" }].map((viewer) =>
          updateCollectionOspSavedTargetRepository({ targetId: target.id, expectedVersion: sharedVersion,
            name: `Shared race ${viewer.userId}`, actor: viewer.userId, viewer })));
        assert.equal(sharedRace.filter((outcome) => outcome.status === "fulfilled").length, 1);
        assert.equal(sharedRace.filter((outcome) => outcome.status === "rejected").length, 1, "two distinct superusers cannot overwrite the same target version");
        // Two independent target names must still serialize the same source claim.
        await pool.query("INSERT INTO public.imports (id, name, filename, is_deleted, created_by) VALUES ('race-source', 'Race source', 'race.xlsx', false, 'system')");
        await pool.query("INSERT INTO public.data_rows (id, import_id, json_data) SELECT 'race-row', 'race-source', json_data FROM public.data_rows WHERE id = 'private-row'");
        await pool.query("INSERT INTO public.collection_source_configs (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by) VALUES ('race-source', '2026-08-12', '2026-09-11', 'RACE-V3', true, 'compatible', ARRAY[]::text[], 1, 'system')");
        await pool.query("INSERT INTO public.collection_source_rows (source_import_id, source_data_row_id, account_number_hash, card_number_hash, card_number_last4, canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date) SELECT 'race-source', 'race-row', account_number_hash, card_number_hash, card_number_last4, canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date FROM public.collection_source_rows WHERE source_import_id = 'private-source'");
        const claims = await Promise.allSettled(["private-admin-a", "private-admin-b"].map((assignedAdminUserId) => createProbe({ sourceImportIds: ["race-source"], name: `Race ${assignedAdminUserId}`, assignedAdminUserId })));
        assert.equal(claims.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(claims.filter((result) => result.status === "rejected").length, 1);
        await pool.query("UPDATE public.collection_source_configs SET enabled = true WHERE source_import_id = 'private-source'");
        await pool.query("UPDATE public.collection_source_configs SET valid_to = '2026-09-12' WHERE source_import_id = 'race-source'");
        await assert.rejects(previewCollectionOspSourceScopeRepository({ viewer: repositoryViewer, sourceImportIds: ["private-source", "race-source"] }), /same configured validity/);
        await assert.rejects(createProbe({ sourceImportIds: ["private-source", "race-source"], name: "Mixed validity" }), /same configured validity/);
        await assert.rejects(previewCollectionOspSourceScopeRepository({ viewer: manager, sourceImportIds: ["private-source"] }), /not found/);
      });
    });
  } finally {
    if (previousPiiKey === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    else process.env.COLLECTION_PII_ENCRYPTION_KEY = previousPiiKey;
  }
});

test("Billing OSP V3 exact-day SQL pages reconcile full calendar and preserve authorized frozen customer detail", { skip: skipReason || false, timeout: 60_000 }, async () => {
  const previousPiiKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "osp-v3-day-detail-isolated-test-key-2026";
  try {
    await withTempDatabase(async (pool) => {
      await prepareSchema(pool);
      await pool.query("INSERT INTO public.imports (id, name, filename, is_deleted, created_by) VALUES ('day-source', 'Day source', 'day-source.xlsx', false, 'system')");
      await pool.query("INSERT INTO public.collection_source_configs (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by) VALUES ('day-source', '2026-08-12', '2026-09-11', 'DAY-V3', true, 'compatible', ARRAY[]::text[], 6, 'system')");
      const agings = ["D3", "D3", "D3", "D4", "D4", "D5"] as const;
      const cycleKeys: string[] = [];
      for (const [index, aging] of agings.entries()) {
        const account = `00000000000${index + 1}`;
        const card = `411111111111100${index + 1}`;
        const accountHash = hashCollectionSourceIdentifier(account, "account_number");
        const cardHash = hashCollectionSourceIdentifier(card, "card_number");
        const obligation = `account:${accountHash}`;
        cycleKeys.push(`2026-08-12:${obligation}`);
        const rowId = `day-row-${index}`;
        const osp = (index + 1) * 1000;
        await pool.query("INSERT INTO public.data_rows (id, import_id, json_data) VALUES ($1, 'day-source', $2::jsonb)", [rowId, JSON.stringify({
          "Customer Name": `Example Customer ${index + 1}`, "Account Number": account, "Card Number": card,
          "IC Number": "900101-10-1234", "Phone": "012-3456789", "TOTAL DUE": "500.00",
          "Billing Principal (OSP)": String(osp), DC_STS: aging, "Calling Date": "2026-08-12",
        })]);
        await pool.query("INSERT INTO public.collection_source_rows (source_import_id, source_data_row_id, account_number_hash, card_number_hash, card_number_last4, canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date) VALUES ('day-source', $1, $2, $3, $4, $5, 500, $6, $7, '2026-08-12')", [rowId, accountHash, cardHash, card.slice(-4), obligation, osp, aging]);
        // Multiple payments per logical account must still produce one closure.
        for (const [date, amount] of [["2026-08-13", 100], ["2026-08-20", 400], ["2026-08-21", 50]] as const) {
          await pool.query(`INSERT INTO public.collection_records
            (id, source_import_id, source_data_row_id, source_import_name, source_filename, aging_bucket,
              calling_date, calling_window_end_exclusive, total_due, billing_principal_osp,
              source_match_basis, source_match_accuracy, source_obligation_key, settlement_cycle_key,
              classification, cumulative_collected, remaining_amount, batch, payment_date, amount,
              created_by_login, collection_staff_nickname, staff_username)
            VALUES ($1::uuid, 'day-source', $2, 'Day source', 'day-source.xlsx', $3, '2026-08-12',
              '2026-09-12', 500, $4, 'account_number', 100, $5, $6, 'cp', 0, 500, 'P10', $7::date, $8,
              'system', 'collector.day', 'collector.day')`, [randomUUID(), rowId, aging, osp, obligation, `2026-08-12:${obligation}`, date, amount]);
        }
      }
      await withRepositoryDatabase(pool, async () => {
        await db.transaction((tx) => recalculateCollectionSettlementCycles(tx, cycleKeys));
        const target = await createCollectionOspSavedTargetRepository({ name: "Full period day test", description: null,
          assignedAdminUserId: "osp-repo-admin", viewer: repositoryViewer, sourceImportIds: ["day-source"],
          timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope], actor: "osp-repo-tester",
          targets: completeAgingScope.map((agingBucket) => ({ agingBucket, totalOspBaseline: null, targetPercentage: "50" })),
        });
        const scope = { targetId: target.id, revisionId: target.activeRevision.id, viewer: { userId: "osp-repo-admin", role: "admin" } };
        const calendar = await readCalendar({ ...scope, from: "2026-08-12", to: "2026-09-11", asOfDate: "2026-08-13" });
        assert.equal(calendar.days.length, 31);
        assert.equal(calendar.days[0]?.date, "2026-08-12");
        assert.equal(calendar.days[calendar.days.length - 1]?.date, "2026-09-11");
        const closedDay = calendar.days.find((day) => day.date === "2026-08-20")!;
        assert.equal(closedDay.systemDailyAccounts, 6);
        assert.equal(closedDay.systemOspClosedToday, "21000.00");
        assert.equal(closedDay.balanceOsp, "-10500.00");
        assert.equal(calendar.days.find((day) => day.date === "2026-08-21")?.systemDailyAccounts, 0);
        const pages = await Promise.all([1, 2, 3].map((page) => readDrilldown({ ...scope, asOfDate: "2026-08-20", date: "2026-08-20", page, pageSize: 2 })));
        for (const page of pages) {
          assert.equal(page.items.length, 2);
          assert.deepEqual(page.summary, { accountCount: 6, ospClosed: "21000.00" });
          assert.equal(page.pagination.totalPages, 3);
        }
        const items = pages.flatMap((page) => page.items);
        assert.equal(new Set(items.map((item) => item.accountNumber)).size, 6);
        assert.deepEqual(items.map((item) => item.aging), [...agings]);
        assert.deepEqual((await readDrilldown({ ...scope, asOfDate: "2026-08-20", date: "2026-08-20", page: 2, pageSize: 2 })).items, pages[1]?.items);
        const first = items.find((item) => item.accountNumber === "000000000001")!;
        assert.equal(first.customerName, "Example Customer 1");
        assert.equal(first.cardNumber, "4111111111111001");
        assert.equal(first.identificationNumber, "900101-10-1234");
        assert.equal(first.phone, "012-3456789");
        assert.equal(first.systemClosureStaffNickname, "collector.day");
        assert.equal(first.paymentDate, "2026-08-20");
        assert.equal(first.classification, "ABORT_CP");
        assert.equal(first.systemClosureCollectionAmount, "400.00");
        assert.equal(first.billingPrincipalOsp, "1000.00");
        assert.equal(first.totalDue, "500.00");
        for (const [aging, accountCount, ospClosed] of [["D3", 3, "6000.00"], ["D4", 2, "9000.00"], ["D5", 1, "6000.00"], ["D6", 0, "0.00"]] as const) {
          const detail = await readDrilldown({ ...scope, aging, asOfDate: "2026-08-20", date: "2026-08-20", page: 1, pageSize: 10 });
          const filteredCalendar = await readCalendar({ ...scope, aging, from: "2026-08-12", to: "2026-09-11", asOfDate: "2026-08-13" });
          const day = filteredCalendar.days.find((value) => value.date === "2026-08-20")!;
          assert.deepEqual(detail.summary, { accountCount, ospClosed });
          assert.equal(day.systemDailyAccounts, detail.summary.accountCount);
          assert.equal(day.systemOspClosedToday, detail.summary.ospClosed);
        }
        // Saved encrypted detail must not silently change when the original JSON or enabled flag changes.
        await pool.query("UPDATE public.collection_source_configs SET enabled = false WHERE source_import_id = 'day-source'");
        await pool.query("UPDATE public.data_rows SET json_data = '{\"Account Number\":\"different\",\"Phone\":\"different\"}'::jsonb WHERE import_id = 'day-source'");
        const historical = await readDrilldown({ ...scope, asOfDate: "2026-08-20", date: "2026-08-20", page: 1, pageSize: 10 });
        assert.equal(historical.items.find((item) => item.accountNumber === "000000000001")?.phone, "012-3456789");
        assert.equal(historical.items.find((item) => item.accountNumber === "000000000001")?.cardNumber, "4111111111111001");
        const exported = await getCollectionOspExportDatasetRepository({ ...scope, asOfDate: "2026-08-13", from: "2026-08-12", to: "2026-09-11" });
        assert.equal(exported.calendar.length, 31);
        assert.equal(exported.calendar.find((day) => day.date === "2026-08-20")?.systemDailyAccounts, 6);
        assert.deepEqual(exported.drilldown, []);
        assert.equal(exported.drilldownTotal, 0);
        assert.doesNotMatch(JSON.stringify(exported), /000000000001|4111111111111001|900101-10-1234|012-3456789/);
        const privateRows = await savePrivateClient({ ...scope, actor: "osp-repo-admin", receivedDate: "2026-08-20",
          rows: completeAgingScope.map((aging) => ({ aging, targetPercentage: "25", resultPercentage: aging === "D6" ? "0" : "20", note: "private evidence", reference: null })),
        });
        const storedRows = await pool.query(`SELECT id, target_id AS "targetId", target_revision_id AS "targetRevisionId",
          owner_user_id AS "ownerUserId", aging_bucket AS "agingBucket", target_percentage::text AS "targetPercentage",
          result_percentage::text AS "resultPercentage", osp_closed::text AS "ospClosed", as_of_date::text AS "asOfDate",
          note, client_reference AS "clientReference", version, created_by AS "createdBy", created_at AS "createdAt",
          updated_by AS "updatedBy", updated_at AS "updatedAt" FROM public.collection_osp_private_client_results WHERE target_id = $1`, [target.id]);
        const encryptedPrivate = storedRows.rows.map(protectCollectionOspPrivateClientBackup);
        assert.doesNotMatch(JSON.stringify(encryptedPrivate), /private evidence|ownerUserId|targetPercentage|resultPercentage/);
        assert.throws(() => readCollectionOspPrivateClientBackup({ ...encryptedPrivate[0]!, id: randomUUID() }), /identity binding/);
        // This deletion is confined to the uniquely created temporary test database.
        await pool.query("DELETE FROM public.collection_osp_private_client_results WHERE target_id = $1::uuid", [target.id]);
        const restoreStats = createRestoreStats();
        await db.transaction(async (tx) => {
          await restoreCollectionOspPrivateClientResultsFromBackup(tx as BackupRestoreExecutor,
            createBackupPayloadChunkReader({ imports: [], dataRows: [], users: [], auditLogs: [], collectionOspPrivateClientResults: encryptedPrivate }), restoreStats);
        });
        assert.equal(restoreStats.collectionOspPrivateClientResults.inserted, 4);
        const afterRestore = await readOverview({ ...scope, asOfDate: "2026-08-20" });
        assert.deepEqual(afterRestore.clientResult, privateRows);
        const missingOwner = protectCollectionOspPrivateClientBackup({ ...storedRows.rows[0], id: randomUUID(), ownerUserId: "missing-stable-owner" });
        await assert.rejects(db.transaction(async (tx) => restoreCollectionOspPrivateClientResultsFromBackup(tx as BackupRestoreExecutor,
          createBackupPayloadChunkReader({ imports: [], dataRows: [], users: [], auditLogs: [], collectionOspPrivateClientResults: [missingOwner] }), createRestoreStats())), /original account/);
        await db.transaction(async (tx) => restoreUsersFromBackup(tx as BackupRestoreExecutor,
          createBackupPayloadChunkReader({ imports: [], dataRows: [], auditLogs: [], users: [{ id: "restored-stable-text-id", username: "restored-account", role: "admin", passwordHash: "not-a-login-secret", isBanned: false }] }), createRestoreStats()));
        assert.equal((await pool.query("SELECT id FROM public.users WHERE username = 'restored-account'")).rows[0]?.id, "restored-stable-text-id");
        await assert.rejects(readDrilldown({ ...scope, viewer: { userId: "foreign-admin", role: "admin" }, asOfDate: "2026-08-20", date: "2026-08-20", page: 1, pageSize: 10 }));
      });
    });
  } finally {
    if (previousPiiKey === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    else process.env.COLLECTION_PII_ENCRYPTION_KEY = previousPiiKey;
  }
});

test("Billing Principal V9 keeps legacy Table C audit-only and counts due 500 + system 150 + POOL 350 as OSP 8000 once", { skip: skipReason || false, timeout: 60_000 }, async () => {
  const previousPiiKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-v9-postgres-integration-key-2026";
  try {
    await withTempDatabase(async (pool) => {
      await prepareSchema(pool);
      const v9Indexes = await pool.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname
      `, [[
        "idx_audit_logs_manual_settlement_target_order",
        "idx_collection_records_obligation_history_order",
      ]]);
      assert.deepEqual(v9Indexes.rows.map((row) => row.indexname), [
        "idx_audit_logs_manual_settlement_target_order",
        "idx_collection_records_obligation_history_order",
      ]);
      const accountHash = hashCollectionSourceIdentifier("A001", "account_number");
      const cardHash = hashCollectionSourceIdentifier("4111111111119876", "card_number");
      assert.ok(accountHash);
      assert.ok(cardHash);
      const obligationKey = `account:${accountHash}`;
      const cycleKey = `2026-09-01:${obligationKey}`;
      const recordId = randomUUID();
      await pool.query("INSERT INTO public.imports (id, name, filename, is_deleted, created_by) VALUES ('saved-import-v9', 'September master', 'september-master.xlsx', false, 'system')");
      await pool.query("INSERT INTO public.data_rows (id, import_id, json_data) VALUES ('saved-row-v9', 'saved-import-v9', $1::jsonb)", [JSON.stringify({ "Customer Name": "Customer One", "Account Number": "A001", "Card Number": "4111111111119876", "TOTAL DUE": "500.00", "Billing Principal (OSP)": "8000.00", DC_STS: "D3", "Calling Date": "2026-09-01" })]);
      await pool.query("INSERT INTO public.collection_source_configs (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by) VALUES ('saved-import-v9', DATE '2026-09-01', DATE '2026-09-30', 'P10-SEP26', true, 'compatible', ARRAY[]::text[], 1, 'system')");
      await pool.query("INSERT INTO public.collection_source_rows (source_import_id, source_data_row_id, account_number_hash, card_number_hash, card_number_last4, canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date) VALUES ('saved-import-v9', 'saved-row-v9', $1, $2, '9876', $3, 500.00, 8000.00, 'D3', DATE '2026-09-01')", [accountHash, cardHash, obligationKey]);
      await pool.query(`INSERT INTO public.collection_records (id, source_import_id, source_data_row_id, source_import_name, source_filename, aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp, source_match_basis, source_match_accuracy, source_obligation_key, settlement_cycle_key, classification, cumulative_collected, remaining_amount, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username) VALUES ($1::uuid, 'saved-import-v9', 'saved-row-v9', 'September master', 'september-master.xlsx', 'D3', DATE '2026-09-01', DATE '2026-10-01', 500.00, 8000.00, 'account_number', 100, $2, $3, 'cp', 150.00, 350.00, 'P10', DATE '2026-09-03', 150.00, 'system', 'collector.alpha', 'collector.alpha')`, [recordId, obligationKey, cycleKey]);

      await withRepositoryDatabase(pool, async () => {
        const target = await createCollectionOspSavedTargetRepository({
          name: "V9 target", description: "Two-table target", sourceImportIds: ["saved-import-v9"], from: "2026-09-01", to: "2026-09-30",
          assignedAdminUserId: "osp-repo-admin", viewer: repositoryViewer,
          trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope],
          targets: completeTargetRows("50.0000"), actor: "osp-repo-tester",
        });
        const isolatedTarget = await createCollectionOspSavedTargetRepository({
          name: "V9 isolated target", description: "Independent client position", sourceImportIds: ["saved-import-v9"], from: "2026-09-01", to: "2026-09-30",
          assignedAdminUserId: "osp-repo-admin", viewer: repositoryViewer,
          trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope],
          targets: completeTargetRows("40.0000"), actor: "osp-repo-tester",
        });
        await upsertCollectionOspClientResultsRepository({
          targetId: isolatedTarget.id, revisionId: isolatedTarget.activeRevision.id, receivedDate: "2026-09-02",
          rows: completeClientRows("20.0000", { note: "Target B independent", reference: "CLIENT-B" }), actor: "system",
        });

        await pool.query("UPDATE public.collection_source_configs SET enabled = false WHERE source_import_id = 'saved-import-v9'");
        const deactivatedSourceOverview = await getCollectionOspTargetOverviewRepository({
          targetId: isolatedTarget.id,
          revisionId: isolatedTarget.activeRevision.id,
          asOfDate: "2026-09-30",
        });
        assert.equal(deactivatedSourceOverview.systemResult.all.totalOsp, "8000.00", "a Saved Target keeps its immutable baseline after source deactivation");
        assert.equal(deactivatedSourceOverview.clientResult.all.ospClosed, "1600.00", "source deactivation cannot erase Table B");
        assert.equal(deactivatedSourceOverview.latestComparison.differencePercentagePoints, "-20.0000");
        await assert.rejects(
          createCollectionOspSavedTargetRepository({
            name: "V9 disabled-source target", description: null, sourceImportIds: ["saved-import-v9"], from: "2026-09-01", to: "2026-09-30",
            assignedAdminUserId: "osp-repo-admin", viewer: repositoryViewer,
            trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope],
            targets: completeTargetRows("50.0000"), actor: "osp-repo-tester",
          }),
          /unavailable or incompatible/,
          "a disabled source is unavailable for a new Saved Target",
        );

        const legacy = await createCollectionOspManualReconciliationRepository({
          targetId: target.id, revisionId: target.activeRevision.id, sourceImportId: "saved-import-v9", sourceDataRowId: "saved-row-v9",
          manualPriorAmount: "350.00", asOfDate: "2026-09-15", actualPaymentDate: "2026-09-05", reason: "HISTORICAL_PAYMENT_MISSING",
          note: "Legacy evidence retained", reference: "LEGACY-C-1", actor: "system", actorRole: "superuser", requestId: "legacy-c-create",
        });
        const beforePool = await getCollectionOspTargetOverviewRepository({ targetId: target.id, revisionId: target.activeRevision.id, asOfDate: "2026-09-30" });
        assert.equal(beforePool.systemResult.all.ospClosed, "0.00", "legacy Table C data must contribute zero");
        assert.equal("manualReconciliation" in beforePool, false);
        assert.equal("reconciledResult" in beforePool, false);

        const concurrentVerification = await Promise.allSettled([
          upsertCollectionManualSettlement({
            recordId, poolAmount: "350.00", settlementDate: "2026-09-03", reason: "EXTERNAL_UNASSIGNED_PAYMENT", note: "Verified external payment", reference: "POOL-350", expectedVersion: null, actor: "system", actorRole: "superuser", requestId: "pool-create-a",
          }),
          upsertCollectionManualSettlement({
            recordId, poolAmount: "350.00", settlementDate: "2026-09-03", reason: "EXTERNAL_UNASSIGNED_PAYMENT", note: "Concurrent retry", reference: "POOL-350", expectedVersion: null, actor: "system", actorRole: "superuser", requestId: "pool-create-b",
          }),
        ]);
        const successfulVerification = concurrentVerification.filter(
          (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof upsertCollectionManualSettlement>>> => result.status === "fulfilled",
        );
        assert.equal(
          successfulVerification.length,
          1,
          `concurrent verification leaves one canonical active override; outcomes=${concurrentVerification.map((result) => result.status === "fulfilled" ? "fulfilled" : String(result.reason)).join(" | ")}`,
        );
        assert.equal(concurrentVerification.filter((result) => result.status === "rejected").length, 1);
        const verified = successfulVerification[0]?.value;
        assert.equal(verified?.amount, "150.00", "the collector claim remains the actual Collection amount");
        assert.equal(verified?.manualSettlement?.poolAmount, "350.00");
        assert.equal(verified?.cpStatus, "abort_cp");
        await assert.rejects(
          deleteCollectionRecord(recordId),
          /COLLECTION_MANUAL_SETTLEMENT_ACTIVE_DELETE_BLOCKED/,
          "an active POOL anchor cannot be deleted into a stale effective settlement",
        );
        const duplicatePoolRecordId = randomUUID();
        const duplicatePoolCycleKey = `2026-09-02:${obligationKey}`;
        await pool.query(`INSERT INTO public.collection_records (id, source_import_id, source_data_row_id, source_import_name, source_filename, aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp, source_match_basis, source_match_accuracy, source_obligation_key, settlement_cycle_key, classification, cumulative_collected, remaining_amount, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username) VALUES ($1::uuid, 'saved-import-v9', 'saved-row-v9', 'September master', 'september-master.xlsx', 'D3', DATE '2026-09-02', DATE '2026-10-02', 500.00, 8000.00, 'account_number', 100, $2, $3, 'cp', 150.00, 350.00, 'P10', DATE '2026-09-03', 150.00, 'system', 'collector.alpha', 'collector.alpha')`, [duplicatePoolRecordId, obligationKey, duplicatePoolCycleKey]);
        await assert.rejects(
          upsertCollectionManualSettlement({
            recordId: duplicatePoolRecordId, poolAmount: "350.00", settlementDate: "2026-09-03", reason: "EXTERNAL_UNASSIGNED_PAYMENT", note: "Duplicate evidence", reference: "POOL-350", expectedVersion: null, actor: "system", actorRole: "superuser", requestId: "pool-duplicate",
          }),
        );
        const activePoolEvidence = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM public.collection_records WHERE source_obligation_key = $1 AND settlement_override_status = 'ACTIVE' AND manual_settlement_date = DATE '2026-09-03' AND pool_amount = 350.00 AND lower(trim(COALESCE(manual_settlement_reference, ''))) = 'pool-350'", [obligationKey]);
        assert.equal(activePoolEvidence.rows[0]?.count, "1");

        const overview = await getCollectionOspTargetOverviewRepository({ targetId: target.id, revisionId: target.activeRevision.id, asOfDate: "2026-09-30" });
        assert.equal(overview.systemResult.rows[0]?.ospClosed, "8000.00");
        assert.equal(overview.systemResult.rows[0]?.closedAccountCount, 1);
        assert.equal(overview.systemResult.all.ospClosed, "8000.00");
        const manualDrilldown = await getCollectionOspDrilldownRepository({
          targetId: target.id,
          revisionId: target.activeRevision.id,
          asOfDate: "2026-09-30",
          contributionSource: "MANUAL_VERIFIED_ABORT",
          page: 1,
          pageSize: 10,
        });
        assert.equal(manualDrilldown.items[0]?.cardNumber, "4111111111119876");

        // Reproduce a stale override after its underlying same-day Collection
        // is edited down. A later CP restores the current cumulative to RM150,
        // but it did not exist on the 03 Sep settlement date and therefore
        // cannot restore the POOL assertion's validity in either consumer.
        const postSettlementPaymentRecordId = randomUUID();
        await pool.query("UPDATE public.collection_records SET amount = 100.00 WHERE id = $1::uuid", [recordId]);
        await pool.query(`INSERT INTO public.collection_records (id, source_import_id, source_data_row_id, source_import_name, source_filename, aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp, source_match_basis, source_match_accuracy, source_obligation_key, settlement_cycle_key, classification, cumulative_collected, remaining_amount, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username) VALUES ($1::uuid, 'saved-import-v9', 'saved-row-v9', 'September master', 'september-master.xlsx', 'D3', DATE '2026-09-01', DATE '2026-10-01', 500.00, 8000.00, 'account_number', 100, $2, $3, 'cp', 0.00, 0.00, 'P10', DATE '2026-09-04', 50.00, 'system', 'collector.alpha', 'collector.alpha')`, [postSettlementPaymentRecordId, obligationKey, cycleKey]);
        await db.transaction((tx) => recalculateCollectionSettlementCycles(tx, [cycleKey]));

        const invalidatedOverview = await getCollectionOspTargetOverviewRepository({
          targetId: target.id,
          revisionId: target.activeRevision.id,
          asOfDate: "2026-09-30",
        });
        assert.equal(
          invalidatedOverview.systemResult.all.ospClosed,
          "0.00",
          "Table A validates POOL against System Collection through the settlement date only",
        );

        const invalidatedHistory = await new SearchRepository().findCollectionHistoryForRow({
          candidate: {
            rowId: "saved-row-v9",
            sourceImportId: "saved-import-v9",
            icHash: null,
            icValue: null,
            phoneHash: null,
            phoneValue: null,
            accountHashes: [],
            accountValues: [],
          },
          sourceObligationKey: obligationKey,
          viewerScope: { kind: "all" },
          includeManualAuditDetails: true,
          includeSourceDetails: true,
          page: 1,
          pageSize: 10,
        });
        assert.equal(
          invalidatedHistory.summary.collectionAmount,
          "300.00",
          "history totals every collection row for the canonical obligation, including the duplicate-evidence probe",
        );
        assert.equal(invalidatedHistory.summary.poolAmount, "0.00");
        assert.equal(invalidatedHistory.summary.totalCoveredAmount, "300.00");
        assert.equal(invalidatedHistory.summary.effectiveStatus, "requires_revalidation");
        assert.equal(
          invalidatedHistory.items.find((item) => item.kind === "pool")?.effectiveStatus,
          "requires_revalidation",
          "General Search cannot let a later Collection payment validate an earlier POOL event",
        );

        await pool.query("DELETE FROM public.collection_records WHERE id = $1::uuid", [postSettlementPaymentRecordId]);
        await pool.query("UPDATE public.collection_records SET amount = 150.00 WHERE id = $1::uuid", [recordId]);
        await db.transaction((tx) => recalculateCollectionSettlementCycles(tx, [cycleKey]));
        const restoredOverview = await getCollectionOspTargetOverviewRepository({
          targetId: target.id,
          revisionId: target.activeRevision.id,
          asOfDate: "2026-09-30",
        });
        assert.equal(restoredOverview.systemResult.all.ospClosed, "8000.00");

        const initialClientResult = await upsertCollectionOspClientResultsRepository({
          targetId: target.id, revisionId: target.activeRevision.id, receivedDate: "2026-09-01",
          rows: completeClientRows("70.0000", { note: "Client Monday position", reference: "CLIENT-MON" }), actor: "system",
        });
        assert.equal(initialClientResult.rows[0]?.version, 1);
        const concurrentClientUpdates = await Promise.allSettled([
          upsertCollectionOspClientResultsRepository({
            targetId: target.id, revisionId: target.activeRevision.id, receivedDate: "2026-09-04",
            rows: completeClientRows("75.0000", { note: "Client Friday position", reference: "CLIENT-FRI", expectedVersion: 1 }), actor: "system",
          }),
          upsertCollectionOspClientResultsRepository({
            targetId: target.id, revisionId: target.activeRevision.id, receivedDate: "2026-09-04",
            rows: completeClientRows("75.0000", { note: "Concurrent Friday retry", reference: "CLIENT-FRI", expectedVersion: 1 }), actor: "system",
          }),
        ]);
        assert.equal(concurrentClientUpdates.filter((result) => result.status === "fulfilled").length, 1, "one optimistic-concurrency update wins");
        assert.equal(concurrentClientUpdates.filter((result) => result.status === "rejected").length, 1, "a stale Table B tab is rejected");

        const historicalSystemView = await getCollectionOspTargetOverviewRepository({
          targetId: target.id,
          revisionId: target.activeRevision.id,
          asOfDate: "2026-09-02",
        });
        assert.equal(historicalSystemView.systemResult.all.ospClosed, "0.00", "the selected Table A date remains historical");
        assert.equal(historicalSystemView.clientResult.all.receivedDate, "2026-09-04", "Table B always uses the latest client position");
        assert.equal(historicalSystemView.clientResult.all.ospClosed, "6000.00");
        assert.equal(historicalSystemView.latestComparison.system.resultPercentage, "100.0000", "comparison uses latest System rather than selected history");
        assert.equal(historicalSystemView.latestComparison.differencePercentagePoints, "25.0000");
        const withClient = await getCollectionOspTargetOverviewRepository({ targetId: target.id, revisionId: target.activeRevision.id, asOfDate: "2026-09-20" });
        assert.equal(withClient.clientResult.all.ospClosed, "6000.00");
        assert.equal(withClient.latestComparison.client?.resultPercentage, "75.0000");
        assert.equal(withClient.latestComparison.differencePercentagePoints, "25.0000");
        const isolatedAfterTargetAUpdate = await getCollectionOspTargetOverviewRepository({
          targetId: isolatedTarget.id,
          revisionId: isolatedTarget.activeRevision.id,
          asOfDate: "2026-09-20",
        });
        assert.equal(isolatedAfterTargetAUpdate.clientResult.all.resultPercentage, "20.0000", "Target A Table B cannot leak into Target B");
        assert.equal(isolatedAfterTargetAUpdate.clientResult.all.ospClosed, "1600.00");

        const calendar = await getCollectionOspCalendarRepository({ targetId: target.id, revisionId: target.activeRevision.id, from: "2026-09-01", to: "2026-09-30", asOfDate: "2026-09-30", aging: "D3" });
        const closure = calendar.days.find((day) => day.date === "2026-09-03");
        assert.equal(closure?.systemOspClosedToday, "8000.00");
        assert.equal(Object.keys(closure || {}).some((key) => /manual|reconcil|client/i.test(key)), false);

        const revoked = await revokeCollectionManualSettlement({ recordId, expectedVersion: 1, revokeReason: "Evidence withdrawn", actor: "system", actorRole: "superuser", requestId: "pool-revoke" });
        assert.equal(revoked?.manualSettlement?.status, "REVOKED");
        const afterRevoke = await getCollectionOspTargetOverviewRepository({ targetId: target.id, revisionId: target.activeRevision.id, asOfDate: "2026-09-30" });
        assert.equal(afterRevoke.systemResult.all.ospClosed, "0.00");
        assert.equal(afterRevoke.clientResult.all.ospClosed, "6000.00", "revoking TABLE A settlement cannot rewrite TABLE B");
        assert.equal(afterRevoke.latestComparison.differencePercentagePoints, "-75.0000");

        const automaticAbortRecordId = randomUUID();
        await pool.query(`INSERT INTO public.collection_records (id, source_import_id, source_data_row_id, source_import_name, source_filename, aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp, source_match_basis, source_match_accuracy, source_obligation_key, settlement_cycle_key, classification, cumulative_collected, remaining_amount, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username) VALUES ($1::uuid, 'saved-import-v9', 'saved-row-v9', 'September master', 'september-master.xlsx', 'D3', DATE '2026-09-01', DATE '2026-10-01', 500.00, 8000.00, 'account_number', 100, $2, $3, 'cp', 0.00, 0.00, 'P10', DATE '2026-09-04', 350.00, 'system', 'collector.alpha', 'collector.alpha')`, [automaticAbortRecordId, obligationKey, cycleKey]);
        await db.transaction((tx) => recalculateCollectionSettlementCycles(tx, [cycleKey]));
        const automaticOverview = await getCollectionOspTargetOverviewRepository({ targetId: target.id, revisionId: target.activeRevision.id, asOfDate: "2026-09-30" });
        assert.equal(automaticOverview.systemResult.all.ospClosed, "8000.00");
        assert.equal(automaticOverview.systemResult.all.closedAccountCount, 1);
        assert.equal(automaticOverview.clientResult.all.ospClosed, "6000.00");

        const laterPaymentRecordId = randomUUID();
        await pool.query(`INSERT INTO public.collection_records (id, source_import_id, source_data_row_id, source_import_name, source_filename, aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp, source_match_basis, source_match_accuracy, source_obligation_key, settlement_cycle_key, classification, cumulative_collected, remaining_amount, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username) VALUES ($1::uuid, 'saved-import-v9', 'saved-row-v9', 'September master', 'september-master.xlsx', 'D3', DATE '2026-09-01', DATE '2026-10-01', 500.00, 8000.00, 'account_number', 100, $2, $3, 'cp', 0.00, 0.00, 'P10', DATE '2026-09-04', 100.00, 'system', 'collector.alpha', 'collector.alpha')`, [laterPaymentRecordId, obligationKey, cycleKey]);
        await db.transaction((tx) => recalculateCollectionSettlementCycles(tx, [cycleKey]));
        const afterLaterPayment = await getCollectionOspTargetOverviewRepository({ targetId: target.id, revisionId: target.activeRevision.id, asOfDate: "2026-09-30" });
        assert.equal(afterLaterPayment.systemResult.all.ospClosed, "8000.00", "later payment cannot duplicate OSP");
        assert.equal(afterLaterPayment.systemResult.all.closedAccountCount, 1);

        const history = await listCollectionOspReconciliationHistoryRepository({ targetId: target.id, revisionId: target.activeRevision.id, reconciliationId: legacy.id, limit: 20 });
        assert.equal(history.some((entry) => entry.after?.status === "ACTIVE"), true, "legacy evidence remains auditable");
        const auditCount = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM public.audit_logs WHERE target_resource = $1 AND action LIKE 'COLLECTION_MANUAL_SETTLEMENT_%'", [recordId]);
        assert.equal(auditCount.rows[0]?.count, "2");

        const purgeResult = await purgeCollectionRecordsOlderThan("2026-09-04", "system");
        assert.equal(purgeResult.totalRecords, 2);
        const canonicalArchiveRows = await pool.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM public.collection_record_purge_history WHERE source_obligation_key = $1",
          [obligationKey],
        );
        assert.equal(canonicalArchiveRows.rows[0]?.count, "2");
        const archivedPool = await pool.query<{
          status: string | null;
          pool_amount: string | null;
          reference: string | null;
          revoked_reason: string | null;
        }>(
          `SELECT
             settlement_override_status AS status,
             pool_amount::text,
             manual_settlement_reference AS reference,
             manual_settlement_revoked_reason AS revoked_reason
           FROM public.collection_record_purge_history
           WHERE original_record_id = $1::uuid`,
          [recordId],
        );
        assert.deepEqual(archivedPool.rows[0], {
          status: "REVOKED",
          pool_amount: "350.00",
          reference: "POOL-350",
          revoked_reason: "Evidence withdrawn",
        });

        await pool.query("INSERT INTO public.imports (id, name, filename, is_deleted, created_by) VALUES ('replacement-import-v9', 'October master', 'october-master.xlsx', false, 'system')");
        await pool.query("INSERT INTO public.data_rows (id, import_id, json_data) VALUES ('replacement-row-v9', 'replacement-import-v9', $1::jsonb)", [JSON.stringify({ "Customer Name": "Customer One", "Account Number": "A001", "Card Number": "4111111111119876", "TOTAL DUE": "500.00", "Billing Principal (OSP)": "8000.00", DC_STS: "D3", "Calling Date": "2026-10-01" })]);
        await pool.query("INSERT INTO public.collection_source_configs (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by) VALUES ('replacement-import-v9', DATE '2026-10-01', DATE '2026-10-31', 'P10-OCT26', true, 'compatible', ARRAY[]::text[], 1, 'system')");
        await pool.query("INSERT INTO public.collection_source_rows (source_import_id, source_data_row_id, account_number_hash, canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date) VALUES ('replacement-import-v9', 'replacement-row-v9', $1, $2, 500.00, 8000.00, 'D3', DATE '2026-10-01')", [accountHash, obligationKey]);
        const searchRepository = new SearchRepository();
        const replacementSource = await searchRepository.findCollectionHistorySourceRow({
          sourceImportId: "replacement-import-v9",
          sourceDataRowId: "replacement-row-v9",
        });
        assert.equal(replacementSource?.sourceObligationKey, obligationKey);
        const crossImportHistory = await searchRepository.findCollectionHistoryForRow({
          candidate: {
            rowId: "replacement-row-v9",
            sourceImportId: "replacement-import-v9",
            icHash: null,
            icValue: null,
            phoneHash: null,
            phoneValue: null,
            accountHashes: [],
            accountValues: [],
          },
          sourceObligationKey: replacementSource?.sourceObligationKey ?? null,
          viewerScope: { kind: "all" },
          includeManualAuditDetails: true,
          includeSourceDetails: false,
          page: 1,
          pageSize: 10,
        });
        assert.equal(crossImportHistory.summary.activeRecordCount, 2);
        assert.equal(crossImportHistory.summary.historicalRecordCount, 2, "purged Collection history survives a new source/import row");
        assert.equal(crossImportHistory.summary.recordCount, 4);
        assert.equal(crossImportHistory.summary.poolContributionCount, 1, "revoked POOL evidence survives retention purge");
        assert.equal(crossImportHistory.summary.poolAmount, "0.00", "revoked POOL never contributes to the current effective total");
        assert.equal(crossImportHistory.total, 5);
        const purgedPool = crossImportHistory.items.find((item) => item.kind === "pool");
        assert.equal(purgedPool?.isHistorical, true);
        assert.equal(purgedPool?.effectiveStatus, "revoked");
        assert.equal(purgedPool?.amount, "350.00");
        assert.equal(purgedPool?.reference, "POOL-350");
      });
    });
  } finally {
    if (previousPiiKey === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    else process.env.COLLECTION_PII_ENCRYPTION_KEY = previousPiiKey;
  }
});

test("V3 target pagination, literal option searches and in-flight assignment rechecks stay scoped", { skip: skipReason || false, timeout: 60_000 }, async () => {
  await withTempDatabase(async (pool) => {
    await prepareSchema(pool);
    for (const [id, role] of [["paging-other-admin", "admin"], ["paging-manager", "manager"]]) {
      await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ($1, $1, 'not-a-login-secret', $2, 'active')", [id, role]);
    }
    const ids: string[] = [];
    for (let index = 0; index < 63; index += 1) {
      const targetId = randomUUID(); ids.push(targetId);
      await pool.query(`INSERT INTO public.collection_osp_saved_targets
        (id, target_name, normalized_name, assigned_admin_user_id, created_by, updated_by)
        VALUES ($1::uuid, $2, $2, $3, 'system', 'system')`,
      [targetId, `paging-${index}`, index < 53 ? "osp-repo-admin" : index < 60 ? "paging-other-admin" : null]);
      await pool.query(`INSERT INTO public.collection_osp_target_revisions
        (id, target_id, revision_number, source_scope_hash, period_from, period_to, tracking_start_date, tracking_end_date, created_by)
        VALUES ($1::uuid, $2::uuid, 1, $3, '2026-08-12', '2026-09-11', '2026-08-12', '2026-09-11', 'system')`, [randomUUID(), targetId, "b".repeat(64)]);
    }
    for (const [id, name] of [["literal-percent", "Literal % Source"], ["literal-underscore", "Literal _ Source"], ["literal-slash", "Literal \\ Source"], ["literal-normal", "Literal ordinary Source"]]) {
      await pool.query("INSERT INTO public.imports (id, name, filename, created_by) VALUES ($1, $2, 'fixture.xlsx', 'system')", [id, name]);
      await pool.query(`INSERT INTO public.collection_source_configs
        (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by)
        VALUES ($1, '2026-08-12', '2026-09-11', $1, true, 'compatible', ARRAY[]::text[], 1, 'system')`, [id]);
    }
    await withRepositoryDatabase(pool, async () => {
      const admin = { userId: "osp-repo-admin", role: "admin" };
      const first = await listCollectionOspSavedTargetsRepository({ viewer: admin, limit: 50 });
      const second = await listCollectionOspSavedTargetsRepository({ viewer: admin, limit: 50, offset: 50 });
      assert.equal(first.length, 50); assert.equal(second.length, 3);
      assert.equal(new Set([...first, ...second].map((target) => target.id)).size, 53);
      assert.ok([...first, ...second].every((target) => target.assignedAdminUserId === admin.userId));
      assert.ok([...first, ...second].every((target) => target.activeRevision.sourceValidityVerified === false), "legacy revision dates are not silently declared verified");
      assert.deepEqual(await listCollectionOspSavedTargetsRepository({ viewer: admin, limit: 50, offset: 100 }), []);
      assert.equal((await listCollectionOspSavedTargetsRepository({ viewer: { userId: "paging-manager", role: "manager" } })).length, 63);
      for (const [search, expected] of [["%", "literal-percent"], ["_", "literal-underscore"], ["\\", "literal-slash"]]) {
        const options = await listCollectionOspTargetOptionsRepository({ viewer: repositoryViewer, sourceSearch: search!, adminSearch: "", sourcePage: 1, adminPage: 1, pageSize: 25 });
        assert.deepEqual(options.sources.map((source) => source.id), [expected], "wildcards are literal search data, not broad matching instructions");
      }
      const mutable = db as unknown as MutableDb;
      const original = mutable.execute;
      let intercepted = false;
      mutable.execute = (async (query: Parameters<typeof db.execute>[0]) => {
        const result = await original(query);
        if (!intercepted) {
          intercepted = true;
          await pool.query("UPDATE public.collection_osp_saved_targets SET assigned_admin_user_id = 'paging-other-admin', version = version + 1 WHERE id = ANY($1::uuid[])", [first.map((target) => target.id)]);
        }
        return result;
      }) as typeof db.execute;
      try {
        const overlapping = await listCollectionOspSavedTargetsRepository({ viewer: admin, limit: 50 });
        assert.deepEqual(overlapping, [], "targets reassigned after initial SQL selection are removed before response release");
      } finally { mutable.execute = original; }
      assert.equal((await listCollectionOspSavedTargetsRepository({ viewer: admin })).length, 3);
    });
  });
});

test("V3 admin list EXPLAIN uses assignment index and bounds revision metadata before joining", { skip: skipReason || false, timeout: 30_000 }, async (context) => {
  await withTempDatabase(async (pool) => {
    await prepareSchema(pool);
    await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ('index-other-admin', 'index-other-admin', 'not-a-login-secret', 'admin', 'active')");
    await pool.query(`INSERT INTO public.collection_osp_saved_targets
      (id, target_name, normalized_name, assigned_admin_user_id, created_by, updated_by)
      SELECT gen_random_uuid(), 'index-target-' || n, 'index-target-' || n,
        CASE WHEN n = 1 THEN 'osp-repo-admin' ELSE 'index-other-admin' END, 'system', 'system'
      FROM generate_series(1, 10000) n`);
    await pool.query(`INSERT INTO public.collection_osp_target_revisions
      (id, target_id, revision_number, source_scope_hash, period_from, period_to, tracking_start_date, tracking_end_date, created_by)
      SELECT gen_random_uuid(), id, 1, repeat('d', 64), '2026-08-12'::date, '2026-09-11'::date,
        '2026-08-12'::date, '2026-09-11'::date, 'system' FROM public.collection_osp_saved_targets`);
    await pool.query("ANALYZE public.collection_osp_saved_targets; ANALYZE public.collection_osp_target_revisions");
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    await withRepositoryDatabase(pool, async () => {
      assert.equal((await listCollectionOspSavedTargetsRepository({ viewer: { userId: 'osp-repo-admin', role: 'admin' }, limit: 50 })).length, 1);
      assert.equal(queries.length, 3);
      const query = queries[0]!;
      const explained = (await pool.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) ${query.sql}`, query.params)).rows[0]["QUERY PLAN"][0];
      assert.match(JSON.stringify(explained), /idx_collection_osp_saved_targets_assigned_admin_active/);
      assert.equal(explained.Plan["Actual Rows"], 1);
      assert.match(query.sql, /authorized_targets AS MATERIALIZED/);
      assert.doesNotMatch(query.sql, /DISTINCT ON/);
      context.diagnostic(`10,000 target assignment EXPLAIN: indexed authorized metadata returned in ${explained["Execution Time"]}ms; three fixed queries.`);
    }, queries);
  });
});

test("Collection V9 team migration backfills and reads stable nickname identities", { skip: skipReason || false, timeout: 30_000 }, async () => {
  await withTempDatabase(async (pool) => {
    const leaderId = "11111111-1111-4111-8111-111111111111";
    const memberId = "22222222-2222-4222-8222-222222222222";
    const groupId = "33333333-3333-4333-8333-333333333333";
    await pool.query(`
      CREATE TABLE public.collection_staff_nicknames (
        id uuid PRIMARY KEY,
        nickname text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        role_scope text NOT NULL DEFAULT 'both'
      );
      CREATE TABLE public.admin_groups (
        id uuid PRIMARY KEY,
        leader_nickname text NOT NULL,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.admin_group_members (
        id uuid PRIMARY KEY,
        admin_group_id uuid NOT NULL,
        member_nickname text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(
      `INSERT INTO public.collection_staff_nicknames (id, nickname, role_scope)
       VALUES ($1::uuid, 'Leader Old', 'admin'), ($2::uuid, 'Member Old', 'user')`,
      [leaderId, memberId],
    );
    await pool.query(
      `INSERT INTO public.admin_groups (id, leader_nickname) VALUES ($1::uuid, 'leader old')`,
      [groupId],
    );
    await pool.query(
      `INSERT INTO public.admin_group_members (id, admin_group_id, member_nickname)
       VALUES ('44444444-4444-4444-8444-444444444444'::uuid, $1::uuid, 'MEMBER OLD')`,
      [groupId],
    );

    await pool.query(teamStableIdMigration);
    await pool.query(teamStableIdMigration);

    const persisted = await pool.query<{
      leader_nickname_id: string;
      member_nickname_id: string;
    }>(`
      SELECT team.leader_nickname_id::text, member.member_nickname_id::text
      FROM public.admin_groups team
      JOIN public.admin_group_members member ON member.admin_group_id = team.id
      WHERE team.id = $1::uuid
    `, [groupId]);
    assert.deepEqual(persisted.rows[0], {
      leader_nickname_id: leaderId,
      member_nickname_id: memberId,
    });

    await pool.query(
      `UPDATE public.collection_staff_nicknames
       SET nickname = CASE id WHEN $1::uuid THEN 'Leader Renamed' ELSE 'Member Renamed' END`,
      [leaderId],
    );
    const groups = await listCollectionAdminGroups(drizzle(pool));
    assert.equal(groups[0]?.leaderNicknameId, leaderId);
    assert.equal(groups[0]?.leaderNickname, "Leader Renamed");
    assert.deepEqual(groups[0]?.memberNicknameIds, [memberId]);
    assert.deepEqual(groups[0]?.memberNicknames, ["Member Renamed"]);
  });
});
