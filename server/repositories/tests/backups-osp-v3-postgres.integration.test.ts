import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { db, dbRead } from "../../db-postgres";
import { ensureCollectionRecordsTables } from "../../internal/collection-bootstrap-records";
import { ensureCoreAuditLogsTable } from "../../internal/core-schema-bootstrap-activity";
import { ensureCoreDataRowsTable, ensureCoreImportsTable } from "../../internal/core-schema-bootstrap-imports";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import { decryptCollectionPiiValueSafe } from "../../lib/collection-pii-encryption";
import { decodeBackupDataFromStorage, type BackupEncryptionConfig } from "../backups-encryption";
import { prepareBackupPayloadFileForCreate, readPreparedBackupPayloadForStorage } from "../backups-payload-utils";
import type { BackupDataPayload } from "../backups-repository-types";
import { restoreFromBackup } from "../backups-restore-utils";
import {
  createCollectionOspSavedTargetRepository,
  getCollectionOspTargetOverviewRepository,
  upsertCollectionOspClientResultsRepository,
} from "../collection-osp-v7-repository-utils";
import { buildCollectionSourceScopeHash, hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import { dropDrainedOspFixtureDatabase } from "./postgres-fixture-cleanup";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = [
  "0049_collection_record_purge_history.sql", "0052_collection_source_governance_osp.sql",
  "0053_collection_source_governance_deferred_foreign_keys.sql", "0054_collection_osp_reconciliation_persistence.sql",
  "0055_collection_manual_verified_settlement.sql", "0056_collection_osp_v9_baseline_integrity.sql",
  "0057_collection_purge_canonical_history.sql", "0059_collection_purge_manual_settlement_history.sql",
  "0060_collection_osp_v9_complete_aging_scope.sql", "0061_collection_v9_history_lookup_indexes.sql",
  "0062_collection_osp_private_client_ownership.sql",
].map((name) => readFileSync(path.join(repoRoot, "drizzle", name), "utf8"));
const pgBaseConfig = {
  host: process.env.PG_HOST || "127.0.0.1", port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres", password: process.env.PG_PASSWORD || "postgres",
};
const AGINGS = ["D3", "D4", "D5", "D6"] as const;
const ADMIN_ID = "osp-backup-admin:stable-text-id";
const MANAGER_ID = "osp-backup-manager:stable-text-id";
const SUPERUSER_ID = "osp-backup-superuser:stable-text-id";
const PRIVATE_NOTE = "Private client evidence line one\nLine two\r\nLine three\tcolumn two";
const PRIVATE_REFERENCE = "Private reference\nSecond reference";

async function detectPostgresAvailability(): Promise<string | null> {
  if (!["127.0.0.1", "localhost", "::1"].includes(pgBaseConfig.host)) return "This backup integration test only creates isolated databases on local PostgreSQL.";
  const pool = new pg.Pool({ ...pgBaseConfig, database: "postgres", max: 1, connectionTimeoutMillis: 1_500 });
  try { await pool.query("SELECT 1"); return null; }
  catch { return "Local PostgreSQL is unavailable for the isolated OSP V3 backup integration test."; }
  finally { await pool.end(); }
}
const skipReason = await detectPostgresAvailability();

async function withTempDatabase(run: (pool: pg.Pool) => Promise<void>): Promise<void> {
  const admin = new pg.Pool({ ...pgBaseConfig, database: "postgres", max: 1 });
  const name = `sqr_osp_backup_v3_${Date.now()}_${randomBytes(5).toString("hex")}`;
  assert.match(name, /^sqr_osp_backup_v3_\d+_[0-9a-f]{10}$/);
  const quoted = pg.escapeIdentifier(name);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${quoted}`);
    created = true;
    const pool = new pg.Pool({ ...pgBaseConfig, database: name, max: 4 });
    try { await run(pool); } finally { await pool.end(); }
  } finally {
    try {
      if (created) await dropDrainedOspFixtureDatabase(admin, name);
    } finally {
      await admin.end();
    }
  }
}

type MutableDb = { execute: typeof db.execute; transaction: typeof db.transaction };
async function withRepositoryDatabase<T>(pool: pg.Pool, run: () => Promise<T>): Promise<T> {
  const database = drizzle(pool);
  const originals = Array.from(new Set([db, dbRead])).map((value) => {
    const mutable = value as unknown as MutableDb;
    return { mutable, execute: mutable.execute, transaction: mutable.transaction };
  });
  for (const { mutable } of originals) {
    mutable.execute = database.execute.bind(database) as typeof db.execute;
    mutable.transaction = database.transaction.bind(database) as typeof db.transaction;
  }
  try { return await run(); }
  finally {
    for (const original of originals) {
      original.mutable.execute = original.execute;
      original.mutable.transaction = original.transaction;
    }
  }
}

async function prepareSchema(pool: pg.Pool): Promise<void> {
  const database = drizzle(pool);
  await ensureCollectionRecordsTables(database);
  await ensureUsersBootstrapSchema(database);
  await ensureCoreAuditLogsTable(database);
  await ensureCoreImportsTable(database);
  await ensureCoreDataRowsTable(database);
  for (const migration of migrations) await pool.query(migration);
}

async function* backupPayloadChunks(payload: string): AsyncGenerator<string> {
  // Force dataset names, row values and encrypted envelopes across parser chunks.
  for (let offset = 0; offset < payload.length; offset += 97) {
    yield payload.slice(offset, offset + 97);
  }
}

async function seedBackupSource(pool: pg.Pool) {
  for (const [id, username, role] of [
    [SUPERUSER_ID, "osp-backup-superuser", "superuser"],
    [ADMIN_ID, "osp-backup-admin", "admin"],
    [MANAGER_ID, "osp-backup-manager", "manager"],
  ]) {
    await pool.query("INSERT INTO public.users (id, username, password_hash, role, status) VALUES ($1, $2, 'synthetic-not-a-login-secret', $3, 'active')", [id, username, role]);
  }
  await pool.query("INSERT INTO public.imports (id, name, filename, is_deleted, created_by) VALUES ('osp-backup-source', 'OSP backup source', 'osp-backup.xlsx', false, 'osp-backup-superuser')");
  await pool.query("INSERT INTO public.data_rows (id, import_id, json_data) VALUES ('osp-backup-row', 'osp-backup-source', $1::jsonb)", [JSON.stringify({
    "Customer Name": "Backup Example Customer", "Account Number": "0001234567890123", "Card Number": "4111111111119876",
    "IC Number": "900101-10-1234", Phone: "012-3456789", "TOTAL DUE": "500.00",
    "Billing Principal (OSP)": "1000.00", DC_STS: "D3", "Calling Date": "2026-08-12",
  })]);
  await pool.query(`INSERT INTO public.collection_source_configs
    (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by)
    VALUES ('osp-backup-source', '2026-08-12', '2026-09-11', 'OSP-BACKUP', true, 'compatible', ARRAY[]::text[], 1, 'osp-backup-superuser')`);
  const accountHash = hashCollectionSourceIdentifier("0001234567890123", "account_number");
  const cardHash = hashCollectionSourceIdentifier("4111111111119876", "card_number");
  await pool.query(`INSERT INTO public.collection_source_rows
    (source_import_id, source_data_row_id, account_number_hash, card_number_hash, card_number_last4,
      canonical_obligation_key, total_due, billing_principal_osp, aging_bucket, calling_date)
    VALUES ('osp-backup-source', 'osp-backup-row', $1, $2, '9876', $3, 500, 1000, 'D3', '2026-08-12')`, [accountHash, cardHash, `account:${accountHash}`]);
  const target = await createCollectionOspSavedTargetRepository({
    name: "Saved backup ownership target", assignedAdminUserId: ADMIN_ID,
    viewer: { userId: SUPERUSER_ID, role: "superuser" }, sourceImportIds: ["osp-backup-source"],
    timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...AGINGS], actor: "osp-backup-superuser",
    targets: AGINGS.map((agingBucket) => ({ agingBucket, targetPercentage: "30.0000", totalOspBaseline: null })),
  });
  for (const [userId, actor, role, targetPercentage, resultPercentage] of [
    [ADMIN_ID, "osp-backup-admin", "admin", "40", "25"],
    [MANAGER_ID, "osp-backup-manager", "manager", "35", "15"],
  ]) {
    await upsertCollectionOspClientResultsRepository({
      targetId: target.id, revisionId: target.activeRevision.id, viewer: { userId: userId!, role: role! }, actor: actor!, receivedDate: "2026-09-05",
      rows: AGINGS.map((aging) => ({ aging, targetPercentage: targetPercentage!, resultPercentage: aging === "D3" ? resultPercentage! : "0",
        note: PRIVATE_NOTE, reference: PRIVATE_REFERENCE })),
    });
  }
  await pool.query(`INSERT INTO public.collection_osp_client_results
    (id, target_id, target_revision_id, as_of_date, aging_bucket, result_percentage, osp_closed, created_by, updated_by)
    VALUES ($1::uuid, $2::uuid, $3::uuid, '2026-09-05', 'D3', 70, 700, 'osp-backup-superuser', 'osp-backup-superuser')`, [randomUUID(), target.id, target.activeRevision.id]);
  await pool.query(`INSERT INTO public.collection_osp_targets
    (id, source_scope_hash, source_import_ids, period_from, period_to, aging_bucket,
      total_osp_baseline, target_percentage, configured_by)
    VALUES ($1::uuid, $2, ARRAY['osp-backup-source']::text[], '2026-08-12', '2026-09-11',
      'D3', 1000, 30, 'osp-backup-superuser')`, [randomUUID(), buildCollectionSourceScopeHash(["osp-backup-source"])]);
  await pool.query(`UPDATE public.users SET status = 'disabled', must_change_password = true,
    password_reset_by_superuser = true WHERE id = $1`, [MANAGER_ID]);
  return target;
}

test("OSP V3 encrypted backup file restores assigned targets, stable owners, private evidence and frozen PII into a fresh database", { skip: skipReason || false, timeout: 120_000 }, async () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "osp-v3-backup-file-synthetic-test-key";
  try {
    await withTempDatabase(async (source) => {
      await prepareSchema(source);
      const snapshot = await withRepositoryDatabase(source, async () => {
        const target = await seedBackupSource(source);
        const config: BackupEncryptionConfig = { requireEncryption: true, primaryKeyId: "osp_test", keysById: new Map([["osp_test", randomBytes(32)]]) };
        const prepared = await prepareBackupPayloadFileForCreate(config);
        try {
          assert.equal(prepared.counts.collectionOspPrivateClientResultsCount, 8);
          assert.equal(prepared.counts.collectionOspTargetSourceRowsCount, 1);
          const fileBytes = readFileSync(prepared.tempFilePath);
          assert.equal(fileBytes.includes(Buffer.from(PRIVATE_NOTE)), false);
          assert.equal(fileBytes.includes(Buffer.from("4111111111119876")), false);
          const stored = await readPreparedBackupPayloadForStorage(prepared);
          assert.match(stored, /^enc:v3:osp_test\./);
          const plainPayload = decodeBackupDataFromStorage(stored, config);
          const payload = JSON.parse(plainPayload) as BackupDataPayload;
          assert.equal(payload.collectionOspPrivateClientResults?.length, 8);
          assert.doesNotMatch(JSON.stringify(payload.collectionOspPrivateClientResults), /ownerUserId|targetPercentage|resultPercentage|Private client evidence/);
          assert.equal(payload.collectionOspSavedTargets?.[0]?.assignedAdminUserId, ADMIN_ID);
          assert.equal(payload.users.find((user) => user.id === MANAGER_ID)?.status, "disabled");
          return { target, plainPayload, payload };
        } finally { await prepared.cleanup(); }
      });

      await withTempDatabase(async (destination) => {
        await prepareSchema(destination);
        await withRepositoryDatabase(destination, async () => {
          const restored = await restoreFromBackup(backupPayloadChunks(snapshot.plainPayload));
          assert.equal(restored.success, true);
          assert.equal(restored.stats.collectionOspSavedTargets.inserted, 1);
          assert.equal(restored.stats.collectionOspPrivateClientResults.inserted, 8);
          assert.equal(restored.stats.collectionOspClientResults.inserted, 1);
          assert.equal(restored.stats.collectionOspTargets.inserted, 1, "Legacy OSP audit data remains restorable.");
          const accounts = await destination.query("SELECT id, username FROM public.users WHERE username LIKE 'osp-backup-%' ORDER BY username");
          assert.deepEqual(accounts.rows, [
            { id: ADMIN_ID, username: "osp-backup-admin" },
            { id: MANAGER_ID, username: "osp-backup-manager" },
            { id: SUPERUSER_ID, username: "osp-backup-superuser" },
          ]);
          const restoredManager = (await destination.query(`SELECT status, must_change_password, password_reset_by_superuser
            FROM public.users WHERE id = $1`, [MANAGER_ID])).rows[0];
          assert.deepEqual(restoredManager, { status: "disabled", must_change_password: true, password_reset_by_superuser: true });
          await assert.rejects(getCollectionOspTargetOverviewRepository({ targetId: snapshot.target.id,
            revisionId: snapshot.target.activeRevision.id, viewer: { userId: MANAGER_ID, role: "manager" }, asOfDate: "2026-09-05" }),
          /not found/i, "A disabled owner must not regain private report access through restore.");
          // Explicit test-only reactivation allows verifying this owner's retained
          // private values separately from the restored lifecycle denial above.
          await destination.query(`UPDATE public.users SET status = 'active', must_change_password = false,
            password_reset_by_superuser = false WHERE id = $1`, [MANAGER_ID]);
          const targetRow = (await destination.query("SELECT assigned_admin_user_id FROM public.collection_osp_saved_targets WHERE id = $1", [snapshot.target.id])).rows[0];
          assert.equal(targetRow?.assigned_admin_user_id, ADMIN_ID);
          const details = (await destination.query("SELECT account_number_encrypted, card_number_encrypted, identification_number_encrypted, phone_encrypted FROM public.collection_osp_target_source_rows")).rows[0];
          assert.equal(decryptCollectionPiiValueSafe(details.account_number_encrypted), "0001234567890123");
          assert.equal(decryptCollectionPiiValueSafe(details.card_number_encrypted), "4111111111119876");
          assert.equal(decryptCollectionPiiValueSafe(details.identification_number_encrypted), "900101-10-1234");
          assert.equal(decryptCollectionPiiValueSafe(details.phone_encrypted), "012-3456789");
          for (const [userId, role, targetPercentage, resultPercentage] of [
            [ADMIN_ID, "admin", "40.0000", "25.0000"], [MANAGER_ID, "manager", "35.0000", "15.0000"],
          ]) {
            const overview = await getCollectionOspTargetOverviewRepository({ targetId: snapshot.target.id, revisionId: snapshot.target.activeRevision.id,
              viewer: { userId: userId!, role: role! }, asOfDate: "2026-09-05" });
            assert.equal(overview.clientResult.rows[0]?.targetPercentage, targetPercentage);
            assert.equal(overview.clientResult.rows[0]?.resultPercentage, resultPercentage);
            assert.equal(overview.clientResult.rows[0]?.note, PRIVATE_NOTE);
            assert.equal(overview.clientResult.rows[0]?.reference, PRIVATE_REFERENCE);
            assert.equal(overview.target.activeRevision.trackingStartDate, "2026-08-12");
            assert.equal(overview.target.activeRevision.trackingEndDate, "2026-09-11");
          }
          const superuserView = await getCollectionOspTargetOverviewRepository({ targetId: snapshot.target.id, revisionId: snapshot.target.activeRevision.id,
            viewer: { userId: SUPERUSER_ID, role: "superuser" }, asOfDate: "2026-09-05" });
          assert.equal(superuserView.clientResult.all.receivedDate, null, "Legacy shared values must not become the superuser's private fallback.");

          const currentAdmin = await getCollectionOspTargetOverviewRepository({ targetId: snapshot.target.id,
            revisionId: snapshot.target.activeRevision.id, viewer: { userId: ADMIN_ID, role: "admin" }, asOfDate: "2026-09-05" });
          await upsertCollectionOspClientResultsRepository({
            targetId: snapshot.target.id, revisionId: snapshot.target.activeRevision.id,
            viewer: { userId: ADMIN_ID, role: "admin" }, actor: "osp-backup-admin", receivedDate: "2026-09-06",
            rows: AGINGS.map((aging) => ({ aging, targetPercentage: "60", resultPercentage: aging === "D3" ? "10" : "0",
              expectedVersion: currentAdmin.clientResult.rows.find((row) => row.aging === aging)?.version ?? null,
              note: "New evidence after restore", reference: "New reference" })),
          });
          const repeated = await restoreFromBackup(backupPayloadChunks(snapshot.plainPayload));
          assert.equal(repeated.stats.collectionOspPrivateClientResults.inserted, 0);
          assert.equal(repeated.stats.collectionOspPrivateClientResults.skipped, 8);
          const afterRepeated = await getCollectionOspTargetOverviewRepository({ targetId: snapshot.target.id,
            revisionId: snapshot.target.activeRevision.id, viewer: { userId: ADMIN_ID, role: "admin" }, asOfDate: "2026-09-05" });
          assert.equal(afterRepeated.clientResult.rows[0]?.targetPercentage, "60.0000");
          assert.equal(afterRepeated.clientResult.rows[0]?.resultPercentage, "10.0000");
          assert.equal(afterRepeated.clientResult.rows[0]?.ospClosed, "100.00");
          assert.equal(afterRepeated.clientResult.rows[0]?.balanceOsp, "500.00");
          assert.equal(afterRepeated.clientResult.rows[0]?.note, "New evidence after restore");
          assert.equal(afterRepeated.clientResult.rows[0]?.version, 2, "Restoring an older file must never overwrite newer private versions.");
        });
      });

      await withTempDatabase(async (failedDestination) => {
        await prepareSchema(failedDestination);
        const missingOwnerPayload = { ...snapshot.payload, users: snapshot.payload.users.filter((user) => user.id !== MANAGER_ID) };
        await withRepositoryDatabase(failedDestination, async () => {
          await assert.rejects(restoreFromBackup(JSON.stringify(missingOwnerPayload)), /original account\/revision\/baseline/);
        });
        for (const table of ["imports", "data_rows", "collection_osp_saved_targets", "collection_osp_private_client_results"]) {
          assert.equal((await failedDestination.query(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0]?.count, 0, `${table} must roll back completely.`);
        }
        assert.equal((await failedDestination.query("SELECT count(*)::int AS count FROM public.users WHERE username LIKE 'osp-backup-%'")).rows[0]?.count, 0);
      });
    });
  } finally {
    if (previousKey === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    else process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
  }
});
