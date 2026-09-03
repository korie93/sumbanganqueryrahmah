import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { db } from "../../db-postgres";
import { ensureCollectionRecordsTables } from "../../internal/collection-bootstrap-records";
import {
  ensureCoreDataRowsTable,
  ensureCoreImportsTable,
} from "../../internal/core-schema-bootstrap-imports";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import {
  CollectionOspV7RepositoryError,
  createCollectionOspManualReconciliationRepository,
  createCollectionOspSavedTargetRepository,
  getCollectionOspCalendarRepository,
  getCollectionOspTargetOverviewRepository,
  listCollectionOspManualReconciliationsRepository,
  listCollectionOspReconciliationHistoryRepository,
  upsertCollectionOspClientResultsRepository,
  updateCollectionOspManualReconciliationRepository,
  voidCollectionOspManualReconciliationRepository,
} from "../collection-osp-v7-repository-utils";
import {
  findEligibleCollectionSourceMatches,
  hashCollectionSourceIdentifier,
} from "../collection-source-repository-utils";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceGovernanceMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0052_collection_source_governance_osp.sql"),
  "utf8",
);
const sourceGovernanceForeignKeysMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0053_collection_source_governance_deferred_foreign_keys.sql"),
  "utf8",
);
const reconciliationMigrationSql = readFileSync(
  path.join(repoRoot, "drizzle", "0054_collection_osp_reconciliation_persistence.sql"),
  "utf8",
);

const pgBaseConfig = {
  host: process.env.PG_HOST || "127.0.0.1",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "postgres",
};
const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";

async function detectPostgresAvailability(): Promise<string | null> {
  const pool = new pg.Pool({
    ...pgBaseConfig,
    database: maintenanceDatabase,
    max: 1,
    connectionTimeoutMillis: 1_500,
    idleTimeoutMillis: 1_500,
  });
  try {
    await pool.query("SELECT 1");
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `PostgreSQL unavailable for Collection V7 repository integration: ${message}`;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const skipReason = await detectPostgresAvailability();

async function withTempDatabase(
  run: (pool: pg.Pool) => Promise<void>,
): Promise<void> {
  const adminPool = new pg.Pool({
    ...pgBaseConfig,
    database: maintenanceDatabase,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  });
  const databaseName = `sqr_osp_v7_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const quotedDatabaseName = pg.escapeIdentifier(databaseName);
  try {
    await adminPool.query(`CREATE DATABASE ${quotedDatabaseName}`);
    const pool = new pg.Pool({
      ...pgBaseConfig,
      database: databaseName,
      max: 4,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
    });
    try {
      await run(pool);
    } finally {
      await pool.end().catch(() => undefined);
    }
  } finally {
    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    ).catch(() => undefined);
    await adminPool.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName}`);
    await adminPool.end().catch(() => undefined);
  }
}

type MutableDb = {
  execute: typeof db.execute;
  transaction: typeof db.transaction;
};

async function withRepositoryDatabase<T>(
  pool: pg.Pool,
  run: () => Promise<T>,
): Promise<T> {
  const database = drizzle(pool);
  const mutableDb = db as unknown as MutableDb;
  const originalExecute = mutableDb.execute;
  const originalTransaction = mutableDb.transaction;
  mutableDb.execute = database.execute.bind(database) as typeof db.execute;
  mutableDb.transaction = database.transaction.bind(database) as typeof db.transaction;
  try {
    return await run();
  } finally {
    mutableDb.execute = originalExecute;
    mutableDb.transaction = originalTransaction;
  }
}

async function prepareV7Schema(pool: pg.Pool): Promise<void> {
  const database = drizzle(pool);
  await ensureCollectionRecordsTables(database);
  await ensureUsersBootstrapSchema(database);
  await ensureCoreImportsTable(database);
  await ensureCoreDataRowsTable(database);
  await pool.query(sourceGovernanceMigrationSql);
  await pool.query(sourceGovernanceForeignKeysMigrationSql);
  await pool.query(reconciliationMigrationSql);
}

test(
  "Collection V7 PostgreSQL flow isolates targets, survives source untick, and recalculates edit/void without duplicate OSP",
  { skip: skipReason || false, timeout: 60_000 },
  async () => {
    const previousPiiKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
    process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-v7-postgres-integration-key-2026";
    try {
      await withTempDatabase(async (pool) => {
        await prepareV7Schema(pool);
        const accountHash = hashCollectionSourceIdentifier("A001", "account_number");
        assert.ok(accountHash);
        const obligationKey = `account:${accountHash}`;
        const cycleKey = `2026-09-01:${obligationKey}`;

        await pool.query(`
          INSERT INTO public.imports (id, name, filename, is_deleted, created_by)
          VALUES ('saved-import-v7', 'September master', 'september-master.xlsx', false, 'system')
        `);
        await pool.query(
          `
            INSERT INTO public.data_rows (id, import_id, json_data)
            VALUES ('saved-row-v7', 'saved-import-v7', $1::jsonb)
          `,
          [JSON.stringify({
            "Customer Name": "Customer One",
            "Account Number": "A001",
            "TOTAL DUE": "1000.00",
            "Billing Principal (OSP)": "8000.00",
            DC_STS: "D3",
            "Calling Date": "2026-09-01",
          })],
        );
        await pool.query(`
          INSERT INTO public.collection_source_configs (
            source_import_id, valid_from, valid_to, cycle_key, enabled,
            compatibility_status, compatibility_issues, indexed_row_count,
            configured_by
          ) VALUES (
            'saved-import-v7', DATE '2026-09-01', DATE '2026-09-30',
            'P10-SEP26', true, 'compatible', ARRAY[]::text[], 1, 'system'
          )
        `);
        await pool.query(
          `
            INSERT INTO public.collection_source_rows (
              source_import_id, source_data_row_id, account_number_hash,
              canonical_obligation_key, total_due, billing_principal_osp,
              aging_bucket, calling_date
            ) VALUES (
              'saved-import-v7', 'saved-row-v7', $1,
              $2, 1000.00, 8000.00, 'D3', DATE '2026-09-01'
            )
          `,
          [accountHash, obligationKey],
        );

        await withRepositoryDatabase(pool, async () => {
          const targetInput = {
            description: "Persisted reconciliation scope",
            sourceImportIds: ["saved-import-v7"],
            from: "2026-09-01",
            to: "2026-09-30",
            trackingStartDate: "2026-09-01",
            trackingEndDate: "2026-09-30",
            timezone: "Asia/Kuala_Lumpur",
            nicknameScope: [],
            agingScope: ["D3" as const],
            targets: [{
              agingBucket: "D3" as const,
              totalOspBaseline: "8000.00",
              targetPercentage: "50.0000",
            }],
            actor: "system",
          };
          const targetA = await createCollectionOspSavedTargetRepository({
            ...targetInput,
            name: "Target A",
          });
          const targetB = await createCollectionOspSavedTargetRepository({
            ...targetInput,
            name: "Target B",
          });

          await pool.query(
            `
              INSERT INTO public.collection_records (
                id, source_import_id, source_data_row_id, source_import_name,
                source_filename, aging_bucket, calling_date,
                calling_window_end_exclusive, total_due, billing_principal_osp,
                source_match_basis, source_match_accuracy, source_obligation_key,
                settlement_cycle_key, classification, cumulative_collected,
                remaining_amount, batch, payment_date, amount,
                created_by_login, collection_staff_nickname, staff_username
              ) VALUES (
                $1::uuid, 'saved-import-v7', 'saved-row-v7', 'September master',
                'september-master.xlsx', 'D3', DATE '2026-09-01',
                DATE '2026-10-01', 1000.00, 8000.00,
                'account_number', 100, $2, $3, 'cp', 700.00, 300.00,
                'P10', DATE '2026-09-10', 700.00,
                'system', 'collector.alpha', 'collector.alpha'
              )
            `,
            [randomUUID(), obligationKey, cycleKey],
          );

          const createInput = {
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            sourceImportId: "saved-import-v7",
            sourceDataRowId: "saved-row-v7",
            manualPriorAmount: "300.00",
            asOfDate: "2026-09-15",
            actualPaymentDate: "2026-09-05",
            reason: "HISTORICAL_PAYMENT_MISSING" as const,
            note: "Verified prior payment",
            reference: "CLIENT-REF-001",
            actor: "system",
            actorRole: "superuser",
          };

          const concurrentCreates = await Promise.allSettled([
            createCollectionOspManualReconciliationRepository({
              ...createInput,
              requestId: "concurrent-create-1",
            }),
            createCollectionOspManualReconciliationRepository({
              ...createInput,
              requestId: "concurrent-create-2",
            }),
          ]);
          const fulfilled = concurrentCreates.filter(
            (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createCollectionOspManualReconciliationRepository>>> =>
              result.status === "fulfilled",
          );
          const rejected = concurrentCreates.filter(
            (result): result is PromiseRejectedResult => result.status === "rejected",
          );
          assert.equal(fulfilled.length, 1);
          assert.equal(rejected.length, 1);
          assert.ok(rejected[0]?.reason instanceof CollectionOspV7RepositoryError);
          assert.equal((rejected[0]?.reason as CollectionOspV7RepositoryError).reason, "DUPLICATE");

          const created = fulfilled[0]!.value;
          assert.equal(created.rawSystemClassification, "CP");
          assert.equal(created.systemEligibleCumulative, "700.00");
          assert.equal(created.reconciledCumulative, "1000.00");
          assert.equal(created.reconciledStatus, "RECONCILED_CLOSED");
          assert.equal(created.reconciledClosedEffectiveDate, "2026-09-10");

          const rawRecord = await pool.query<{ classification: string }>(
            "SELECT classification FROM public.collection_records LIMIT 1",
          );
          assert.equal(rawRecord.rows[0]?.classification, "cp");

          const activeA = await listCollectionOspManualReconciliationsRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
            search: "",
            status: "ACTIVE",
            page: 1,
            pageSize: 20,
          });
          const activeB = await listCollectionOspManualReconciliationsRepository({
            targetId: targetB.id,
            revisionId: targetB.activeRevision.id,
            asOfDate: "2026-09-30",
            search: "",
            status: "ACTIVE",
            page: 1,
            pageSize: 20,
          });
          assert.equal(activeA.pagination.total, 1);
          assert.equal(activeB.pagination.total, 0);

          const overviewA = await getCollectionOspTargetOverviewRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
          });
          const overviewB = await getCollectionOspTargetOverviewRepository({
            targetId: targetB.id,
            revisionId: targetB.activeRevision.id,
            asOfDate: "2026-09-30",
          });
          assert.equal(overviewA.systemResult.rows[0]?.ospClosed, "0.00");
          assert.equal(overviewA.manualReconciliation.rows[0]?.ospClosed, "8000.00");
          assert.equal(overviewA.reconciledResult.rows[0]?.reconciledOspClosed, "8000.00");
          assert.equal(overviewB.manualReconciliation.rows[0]?.ospClosed, "0.00");
          assert.equal(overviewB.reconciledResult.rows[0]?.reconciledOspClosed, "0.00");

          await upsertCollectionOspClientResultsRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
            rows: [{
              aging: "D3",
              resultPercentage: "75.0000",
              ospClosed: "6000.00",
              note: "Client month-end result",
              reference: "CLIENT-SUMMARY-SEP26",
            }],
            actor: "system",
          });
          const overviewWithClient = await getCollectionOspTargetOverviewRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
          });
          const d3Comparison = overviewWithClient.comparison.rows.find((row) => row.aging === "D3");
          assert.equal(d3Comparison?.systemVsClientResultPercentagePointDifference, "-75.0000");
          assert.equal(d3Comparison?.reconciledVsClientResultPercentagePointDifference, "25.0000");
          assert.equal(d3Comparison?.systemVsClientOspDifference, "-6000.00");
          assert.equal(d3Comparison?.reconciledVsClientOspDifference, "2000.00");

          const calendarBeforeEdit = await getCollectionOspCalendarRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            from: "2026-09-01",
            to: "2026-09-30",
            asOfDate: "2026-09-30",
            aging: "D3",
          });
          const closureDayBeforeEdit = calendarBeforeEdit.days.find((day) => day.date === "2026-09-10");
          assert.equal(closureDayBeforeEdit?.systemOspClosedToday, "0.00");
          assert.equal(closureDayBeforeEdit?.manualReconciliationOspClosedToday, "8000.00");
          assert.equal(closureDayBeforeEdit?.reconciledOspClosedToday, "8000.00");

          await pool.query(
            "UPDATE public.collection_source_configs SET enabled = false, updated_at = now() WHERE source_import_id = 'saved-import-v7'",
          );
          const futureMatch = await findEligibleCollectionSourceMatches({
            paymentDate: "2026-09-20",
            accountNumber: "A001",
          });
          assert.equal(futureMatch.eligibleSourceCount, 0);
          assert.deepEqual(futureMatch.matches, []);

          const historicalAfterUntick = await getCollectionOspTargetOverviewRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
          });
          assert.equal(historicalAfterUntick.manualReconciliation.rows[0]?.ospClosed, "8000.00");
          assert.equal(historicalAfterUntick.reconciledResult.rows[0]?.reconciledOspClosed, "8000.00");

          const editedDown = await updateCollectionOspManualReconciliationRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            reconciliationId: created.id,
            expectedVersion: created.version,
            manualPriorAmount: "100.00",
            asOfDate: "2026-09-15",
            actualPaymentDate: "2026-09-05",
            reason: "HISTORICAL_PAYMENT_MISSING",
            note: "Corrected downward",
            reference: "CLIENT-REF-001",
            actor: "system",
            actorRole: "superuser",
            requestId: "edit-down-1",
          });
          assert.equal(editedDown.version, 2);
          assert.equal(editedDown.reconciledCumulative, "800.00");
          assert.equal(editedDown.reconciledStatus, "RECONCILED_OPEN");
          const overviewAfterEditDown = await getCollectionOspTargetOverviewRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
          });
          assert.equal(overviewAfterEditDown.manualReconciliation.rows[0]?.ospClosed, "0.00");
          assert.equal(overviewAfterEditDown.reconciledResult.rows[0]?.reconciledOspClosed, "0.00");
          const calendarAfterEditDown = await getCollectionOspCalendarRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            from: "2026-09-01",
            to: "2026-09-30",
            asOfDate: "2026-09-30",
            aging: "D3",
          });
          assert.equal(
            calendarAfterEditDown.days.some((day) => (
              day.manualReconciliationOspClosedToday !== "0.00"
              || day.reconciledOspClosedToday !== "0.00"
            )),
            false,
          );

          const editedUp = await updateCollectionOspManualReconciliationRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            reconciliationId: created.id,
            expectedVersion: editedDown.version,
            manualPriorAmount: "300.00",
            asOfDate: "2026-09-15",
            actualPaymentDate: "2026-09-05",
            reason: "HISTORICAL_PAYMENT_MISSING",
            note: "Restored verified value",
            reference: "CLIENT-REF-001",
            actor: "system",
            actorRole: "superuser",
            requestId: "edit-up-1",
          });
          assert.equal(editedUp.reconciledStatus, "RECONCILED_CLOSED");

          const voided = await voidCollectionOspManualReconciliationRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            reconciliationId: created.id,
            expectedVersion: editedUp.version,
            reason: "Evidence withdrawn",
            asOfDate: "2026-09-30",
            actor: "system",
            actorRole: "superuser",
            requestId: "void-1",
          });
          assert.equal(voided.status, "VOIDED");
          assert.equal(voided.version, 4);
          assert.equal(voided.reconciledStatus, "RECONCILED_OPEN");

          const overviewAfterVoid = await getCollectionOspTargetOverviewRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
          });
          assert.equal(overviewAfterVoid.systemResult.rows[0]?.ospClosed, "0.00");
          assert.equal(overviewAfterVoid.manualReconciliation.rows[0]?.ospClosed, "0.00");
          assert.equal(overviewAfterVoid.reconciledResult.rows[0]?.reconciledOspClosed, "0.00");
          const calendarAfterVoid = await getCollectionOspCalendarRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            from: "2026-09-01",
            to: "2026-09-30",
            asOfDate: "2026-09-30",
            aging: "D3",
          });
          assert.equal(
            calendarAfterVoid.days.some((day) => (
              day.manualReconciliationOspClosedToday !== "0.00"
              || day.reconciledOspClosedToday !== "0.00"
            )),
            false,
          );

          const voidedRows = await listCollectionOspManualReconciliationsRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            asOfDate: "2026-09-30",
            search: "",
            status: "VOIDED",
            page: 1,
            pageSize: 20,
          });
          assert.equal(voidedRows.pagination.total, 1);
          assert.equal(voidedRows.reconciliations[0]?.id, created.id);

          const history = await listCollectionOspReconciliationHistoryRepository({
            targetId: targetA.id,
            revisionId: targetA.activeRevision.id,
            reconciliationId: created.id,
            limit: 20,
          });
          assert.deepEqual(
            history.map((entry) => entry.operation).sort(),
            ["CREATE", "UPDATE", "UPDATE", "VOID"].sort(),
          );
          assert.equal(history.some((entry) => entry.before?.manualPriorAmount === "300.00"), true);
          assert.equal(history.some((entry) => entry.after?.status === "VOIDED"), true);
          assert.equal(rawRecord.rows[0]?.classification, "cp");
        });
      });
    } finally {
      if (previousPiiKey === undefined) {
        delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
      } else {
        process.env.COLLECTION_PII_ENCRYPTION_KEY = previousPiiKey;
      }
    }
  },
);
