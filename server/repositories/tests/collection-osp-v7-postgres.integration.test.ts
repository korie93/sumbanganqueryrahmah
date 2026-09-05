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
  getCollectionOspCalendarRepository,
  getCollectionOspDrilldownRepository,
  getCollectionOspTargetOverviewRepository,
  listCollectionOspReconciliationHistoryRepository,
  upsertCollectionOspClientResultsRepository,
} from "../collection-osp-v7-repository-utils";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import { SearchRepository } from "../search.repository";
import { listCollectionAdminGroups } from "../collection-admin-group-utils";

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
  try {
    await admin.query(`CREATE DATABASE ${quoted}`);
    const pool = new pg.Pool({ ...pgBaseConfig, database: databaseName, max: 4 });
    try { await run(pool); } finally { await pool.end().catch(() => undefined); }
  } finally {
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [databaseName]).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${quoted}`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

type MutableDb = { execute: typeof db.execute; transaction: typeof db.transaction };
async function withRepositoryDatabase<T>(pool: pg.Pool, run: () => Promise<T>) {
  const database = drizzle(pool);
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
}

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
          trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope],
          targets: completeTargetRows("50.0000"), actor: "system",
        });
        const isolatedTarget = await createCollectionOspSavedTargetRepository({
          name: "V9 isolated target", description: "Independent client position", sourceImportIds: ["saved-import-v9"], from: "2026-09-01", to: "2026-09-30",
          trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope],
          targets: completeTargetRows("40.0000"), actor: "system",
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
            trackingStartDate: "2026-09-01", trackingEndDate: "2026-09-30", timezone: "Asia/Kuala_Lumpur", nicknameScope: [], agingScope: [...completeAgingScope],
            targets: completeTargetRows("50.0000"), actor: "system",
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
