import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { setImmediate as finishEventLoopTurn } from "node:timers/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { db } from "../../db-postgres";
import { ensureCollectionRecordsTables } from "../../internal/collection-bootstrap-records";
import { ensureCoreDataRowsTable, ensureCoreImportsTable } from "../../internal/core-schema-bootstrap-imports";
import { ensureCoreAuditLogsTable } from "../../internal/core-schema-bootstrap-activity";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import {
  getCollectionOspCalendarRepository,
  getCollectionOspDrilldownRepository,
  getCollectionOspExportDatasetRepository,
  getCollectionOspTargetOverviewRepository,
  listCollectionOspSavedTargetsRepository,
} from "../collection-osp-v7-repository-utils";

// This test only writes into a freshly-created, uniquely named database. The
// configured application database is never a fixture target or cleanup target.
const connection = {
  host: process.env.PG_HOST || "127.0.0.1",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "postgres",
};
const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = [
  "0049_collection_record_purge_history.sql", "0052_collection_source_governance_osp.sql",
  "0053_collection_source_governance_deferred_foreign_keys.sql", "0054_collection_osp_reconciliation_persistence.sql",
  "0055_collection_manual_verified_settlement.sql", "0056_collection_osp_v9_baseline_integrity.sql",
  "0057_collection_purge_canonical_history.sql", "0059_collection_purge_manual_settlement_history.sql",
  "0060_collection_osp_v9_complete_aging_scope.sql", "0061_collection_v9_history_lookup_indexes.sql",
  "0062_collection_osp_private_client_ownership.sql",
];

async function detectPostgres() {
  const pool = new pg.Pool({ ...connection, database: maintenanceDatabase, max: 1, connectionTimeoutMillis: 1_500 });
  try { await pool.query("SELECT 1"); return false; }
  catch { return "PostgreSQL unavailable for isolated Billing OSP performance regression"; }
  finally { await pool.end(); }
}
const skip = await detectPostgres();
type CapturedQuery = { sql: string; params: unknown[] };
type ExplainPlan = {
  "Node Type": string;
  "Subplan Name"?: string;
  "Relation Name"?: string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Index Name"?: string;
  Plans?: ExplainPlan[];
};
function planNodes(plan: ExplainPlan): ExplainPlan[] {
  return [plan, ...(plan.Plans ?? []).flatMap(planNodes)];
}

async function withIsolatedDatabase(run: (pool: pg.Pool) => Promise<void>) {
  const databaseName = `sqr_osp_perf_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  assert.match(databaseName, /^sqr_osp_perf_\d+_[a-f0-9]{10}$/);
  const quoted = pg.escapeIdentifier(databaseName);
  const admin = new pg.Pool({ ...connection, database: maintenanceDatabase, max: 1 });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${quoted}`);
    created = true;
    const pool = new pg.Pool({ ...connection, database: databaseName, max: 4 });
    try { await run(pool); } finally { await pool.end(); }
  } finally {
    if (created) {
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid() AND backend_type = 'client backend' AND usename = current_user", [databaseName]);
      await admin.query(`DROP DATABASE ${quoted}`);
    }
    await admin.end();
  }
}

async function prepareFixture(pool: pg.Pool) {
  const database = drizzle(pool);
  await ensureCollectionRecordsTables(database);
  await ensureUsersBootstrapSchema(database);
  await ensureCoreAuditLogsTable(database);
  await ensureCoreImportsTable(database);
  await ensureCoreDataRowsTable(database);
  for (const migration of migrations) await pool.query(readFileSync(path.join(repoRoot, "drizzle", migration), "utf8"));
  await pool.query(`INSERT INTO public.users (id, username, password_hash, role, status)
    VALUES ('osp-perf-manager', 'osp-perf-manager', 'not-a-login-secret', 'manager', 'active'),
      ('osp-perf-admin', 'osp-perf-admin', 'not-a-login-secret', 'admin', 'active')`);
  await pool.query(`INSERT INTO public.imports (id, name, filename, is_deleted, created_by)
    VALUES ('osp-perf-source', 'OSP performance fixture', 'osp-performance-fixture.xlsx', false, 'system')`);
  const targetId = randomUUID();
  const revisionId = randomUUID();
  await pool.query(`INSERT INTO public.collection_osp_saved_targets
    (id, target_name, normalized_name, assigned_admin_user_id, created_by, updated_by)
    VALUES ($1::uuid, 'osp performance fixture', 'osp performance fixture', 'osp-perf-admin', 'system', 'system')`, [targetId]);
  await pool.query(`INSERT INTO public.collection_osp_target_revisions
    (id, target_id, revision_number, source_scope_hash, period_from, period_to,
      tracking_start_date, tracking_end_date, created_by)
    VALUES ($1::uuid, $2::uuid, 1, $3, '2026-08-12', '2026-09-11', '2026-08-12', '2026-09-11', 'system')`,
  [revisionId, targetId, "a".repeat(64)]);
  await pool.query(`INSERT INTO public.collection_osp_target_sources
    (target_revision_id, source_import_id, source_name_snapshot, source_filename_snapshot)
    VALUES ($1::uuid, 'osp-perf-source', 'OSP performance fixture', 'osp-performance-fixture.xlsx')`, [revisionId]);
  return { targetId, revisionId };
}

async function growAccounts(pool: pg.Pool, revisionId: string, start: number, end: number) {
  await pool.query(`INSERT INTO public.data_rows (id, import_id, json_data)
    SELECT 'osp-perf-row-' || n, 'osp-perf-source',
      jsonb_build_object('Customer Name', 'Synthetic performance row ' || n, 'Fixture Padding', repeat(md5(n::text), 256))
    FROM generate_series($1::int, $2::int) n`, [start, end]);
  await pool.query(`INSERT INTO public.collection_osp_target_source_rows
    (target_revision_id, source_import_id, source_data_row_id, canonical_obligation_key,
      cycle_key, card_number_last4, aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp)
    SELECT $1::uuid, 'osp-perf-source', 'osp-perf-row-' || n, 'perf:' || n,
      '2026-08-12:perf:' || n, lpad((n % 10000)::text, 4, '0'), 'D' || (3 + ((n - 1) % 4)),
      '2026-08-12'::date, '2026-09-12'::date, 500, 1000
    FROM generate_series($2::int, $3::int) n`, [revisionId, start, end]);
  await pool.query(`INSERT INTO public.collection_source_rows
    (source_import_id, source_data_row_id, account_number_hash, canonical_obligation_key,
      total_due, billing_principal_osp, aging_bucket, calling_date)
    SELECT 'osp-perf-source', 'osp-perf-row-' || n, repeat(md5(n::text), 2), 'perf:' || n,
      500, 1000, 'D' || (3 + ((n - 1) % 4)), '2026-08-12'::date
    FROM generate_series($1::int, $2::int) n`, [start, end]);
  await pool.query(`INSERT INTO public.collection_records
    (id, source_import_id, source_data_row_id, aging_bucket, calling_date, calling_window_end_exclusive,
      total_due, billing_principal_osp, source_obligation_key, settlement_cycle_key, classification,
      batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username)
    SELECT md5('osp-perf-payment-' || n)::uuid, 'osp-perf-source', 'osp-perf-row-' || n,
      'D' || (3 + ((n - 1) % 4)), '2026-08-12'::date, '2026-09-12'::date, 500, 1000,
      'perf:' || n, '2026-08-12:perf:' || n, 'abort_cp', 'P10', '2026-09-02'::date, 500,
      'system', 'osp.perf.fixture', 'osp.perf.fixture'
    FROM generate_series($1::int, $2::int) n`, [start, end]);
  await pool.query(`INSERT INTO public.collection_osp_target_aging_rows
    (target_revision_id, aging_bucket, total_osp_baseline, target_percentage, target_osp)
    SELECT $1::uuid, aging_bucket, SUM(billing_principal_osp), 30, SUM(billing_principal_osp) * 0.3
    FROM public.collection_osp_target_source_rows WHERE target_revision_id = $1::uuid GROUP BY aging_bucket
    ON CONFLICT (target_revision_id, aging_bucket) DO UPDATE SET
      total_osp_baseline = EXCLUDED.total_osp_baseline, target_osp = EXCLUDED.target_osp`, [revisionId]);
  await pool.query("ANALYZE public.collection_records; ANALYZE public.collection_osp_target_source_rows; ANALYZE public.data_rows; ANALYZE public.collection_source_rows");
}

test("Billing OSP V3 supports the entire 100,000-account scope with bounded queries and authorized SQL-page identity reads", { skip, timeout: 120_000 }, async (context) => {
  await withIsolatedDatabase(async (pool) => {
    const ids = await prepareFixture(pool);
    const captured: CapturedQuery[] = [];
    const database = drizzle(pool, { logger: { logQuery(sql, params) { captured.push({ sql, params }); } } });
    const mutable = db as unknown as { execute: typeof db.execute };
    const original = mutable.execute;
    mutable.execute = database.execute.bind(database) as typeof db.execute;
    const viewer = { userId: "osp-perf-manager", role: "manager" };
    const scope = { ...ids, viewer, asOfDate: "2026-09-05" };
    async function measure<T>(run: () => Promise<T>) {
      captured.length = 0;
      const started = performance.now();
      const value = await run();
      return { value, queries: [...captured], elapsedMs: Math.round(performance.now() - started) };
    }
    async function settledHeapUsed() {
      captured.length = 0;
      // Awaiting a repository promise resumes in the same microtask turn;
      // the just-completed pg query and async continuation can still retain
      // their transient dataset until the event loop finishes that turn.
      await finishEventLoopTurn();
      global.gc?.();
      await finishEventLoopTurn();
      global.gc?.();
      return process.memoryUsage().heapUsed;
    }
    async function exerciseRepeatedDetails(expectedSummary: { accountCount: number; ospClosed: string }, queryCount: number) {
      for (let iteration = 0; iteration < 3; iteration += 1) {
        const repeated = await measure(() => getCollectionOspDrilldownRepository({ ...scope, date: "2026-09-02", page: 9_998 + iteration, pageSize: 10 }));
        assert.equal(repeated.value.items.length, 10);
        assert.deepEqual(repeated.value.summary, expectedSummary);
        assert.equal(repeated.queries.length, queryCount);
      }
    }
    try {
      await growAccounts(pool, ids.revisionId, 1, 40);
      const smallCalendar = await measure(() => getCollectionOspCalendarRepository({ ...scope, from: "2026-09-01", to: "2026-09-02" }));
      const smallOverview = await measure(() => getCollectionOspTargetOverviewRepository(scope));
      const smallDetail = await measure(() => getCollectionOspDrilldownRepository({ ...scope, date: "2026-09-02", page: 1, pageSize: 10 }));
      const smallExport = await measure(() => getCollectionOspExportDatasetRepository({ ...scope, from: "2026-08-12", to: "2026-09-11" }));
      // Exercise the entire accepted source scope, including the former 5k
      // export/10k calendar caps and the 32,767-account threshold where two
      // individual bind parameters per account overflow PostgreSQL's protocol.
      await growAccounts(pool, ids.revisionId, 41, 100_000);
      const calendar = await measure(() => getCollectionOspCalendarRepository({ ...scope, from: "2026-08-12", to: "2026-09-11" }));
      const overview = await measure(() => getCollectionOspTargetOverviewRepository(scope));
      const detail = await measure(() => getCollectionOspDrilldownRepository({ ...scope, date: "2026-09-02", page: 2, pageSize: 10 }));
      const exported = await measure(() => getCollectionOspExportDatasetRepository({ ...scope, from: "2026-08-12", to: "2026-09-11" }));
      for (const [label, small, large] of [
        ["calendar", smallCalendar, calendar], ["overview", smallOverview, overview],
        ["detail", smallDetail, detail], ["export", smallExport, exported],
      ] as const) {
        assert.equal(large.queries.length, small.queries.length, `${label}: account/day growth must not produce application N+1 queries`);
        assert.ok(large.queries.length <= 30, `${label}: query count remains bounded`);
        assert.ok(large.elapsedMs < 30_000, `${label}: fixture must finish within the repository safety timeout`);
        context.diagnostic(`${label}: 40 -> 100,000 accounts; ${large.queries.length} SQL statements; ${small.elapsedMs}ms -> ${large.elapsedMs}ms`);
      }
      assert.equal(calendar.value.days.length, 31);
      assert.equal(calendar.value.days.find((day) => day.date === "2026-09-02")?.systemDailyAccounts, 100_000);
      assert.equal(calendar.value.days.find((day) => day.date === "2026-09-02")?.systemOspClosedToday, "100000000.00");
      assert.equal(overview.value.systemResult.all.balanceOsp, "-70000000.00");
      assert.deepEqual(detail.value.summary, { accountCount: 100_000, ospClosed: "100000000.00" });
      assert.equal(detail.value.items.length, 10);
      assert.equal(detail.value.pagination.total, 100_000);
      const aging = await measure(() => getCollectionOspDrilldownRepository({ ...scope, date: "2026-09-02", aging: "D6", page: 1, pageSize: 10 }));
      assert.deepEqual(aging.value.summary, { accountCount: 25_000, ospClosed: "25000000.00" });
      assert.equal(aging.queries.length, detail.queries.length);
      assert.ok(aging.value.items.every((item) => item.aging === "D6"));
      for (const read of [calendar, overview, exported]) {
        assert.ok(read.queries.every((query) => !/source_json_data|json_data|account_number_encrypted/i.test(query.sql)), "financial and export reads must not load wide masterlisting JSON or encrypted identity");
      }
      const detailQuery = detail.queries.find((query) => query.sql.includes("authorized_page AS MATERIALIZED"));
      assert.ok(detailQuery, "PII detail query must preserve the SQL-page boundary before wide joins");
      assert.ok(detailQuery.params.length < 30, "large exact-day drilldowns must bind typed arrays, not exceed PostgreSQL's 65,535-parameter limit");
      assert.equal(detail.queries.filter((query) => query.sql.includes("source_json_data")).length, 1);
      const explained = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${detailQuery.sql}`, detailQuery.params);
      const explanation = explained.rows[0]["QUERY PLAN"][0] as { Plan: ExplainPlan; "Execution Time": number };
      const nodes = planNodes(explanation.Plan);
      const page = nodes.find((node) => node["Subplan Name"] === "CTE authorized_page");
      assert.ok(page, "EXPLAIN must retain the authorized page materialization");
      assert.equal(page["Node Type"], "Limit");
      assert.equal(page["Actual Rows"], 10);
      assert.equal(explanation.Plan["Actual Rows"], 10);
      for (const node of nodes.filter((node) => ["data_rows", "collection_source_rows"].includes(node["Relation Name"] ?? ""))) {
        context.diagnostic(`Identity lookup ${node["Relation Name"]}: ${node["Node Type"]}; ${node["Actual Rows"]} rows x ${node["Actual Loops"]} loops`);
        assert.ok(node["Actual Rows"] * node["Actual Loops"] <= 10, "the detail query must not scan wide JSON outside its ten-row authorized page");
      }
      context.diagnostic(`EXPLAIN ANALYZE: 100,000 eligible identities -> 10-row materialized page; ${detailQuery.params.length} bind parameters; ${explanation["Execution Time"]}ms`);
      assert.deepEqual(exported.value.drilldown, []);
      const listed = await measure(() => listCollectionOspSavedTargetsRepository({ viewer, limit: 10 }));
      assert.equal(listed.value.length, 1);
      assert.equal(listed.queries.length, 3, "target/source metadata and final access validation are three set-based queries");
      // With --expose-gc this is a retained-heap regression, not a guess based
      // on when V8 happens to collect transient financial datasets. In the
      // regular suite the repeated reads still verify stable results/counts.
      const initialHeap = await settledHeapUsed();
      await exerciseRepeatedDetails(detail.value.summary, detail.queries.length);
      const retainedHeapGrowth = await settledHeapUsed() - initialHeap;
      context.diagnostic(`Three repeated 100,000-account detail reads: retained heap delta ${(retainedHeapGrowth / 1024 / 1024).toFixed(1)} MiB; explicit GC ${global.gc ? "enabled" : "not enabled"}`);
      if (global.gc) assert.ok(retainedHeapGrowth < 32 * 1024 * 1024, "financial datasets and paginated identity arrays must be collectible after each request");
      await growAccounts(pool, ids.revisionId, 100_001, 100_001);
      await assert.rejects(() => getCollectionOspTargetOverviewRepository(scope), { reason: "DATASET_TOO_LARGE" }, "the 100,001st account must fail closed before loading the financial dataset");
    } finally { mutable.execute = original; }
  });
});
