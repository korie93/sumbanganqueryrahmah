import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { enqueueCollectionRecordDailyRollupSlices, rebuildCollectionRecordDailyRollups, refreshCollectionRecordDailyRollupSlices } from "../collection-record-rollup-refresh-utils";
import { claimNextCollectionRecordDailyRollupRefreshSlice, completeCollectionRecordDailyRollupRefreshSlice, failCollectionRecordDailyRollupRefreshSlice } from "../collection-record-rollup-queue-utils";
import { parseBoundedCollectionRollupRepair, repairBoundedCollectionRecordRollups } from "../collection-record-rollup-repair-utils";
import { finalizeRestoredCollectionRollups } from "../backups-restore-collection-write-utils";
import { collectSqlText } from "./sql-test-utils";
import { dropDrainedOspFixtureDatabase } from "./postgres-fixture-cleanup";

const connection = {
  host: process.env.PG_HOST || "127.0.0.1", port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres", password: process.env.PG_PASSWORD || "postgres",
};
const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";

async function availability() {
  const pool = new pg.Pool({ ...connection, database: maintenanceDatabase, max: 1, connectionTimeoutMillis: 1_500 });
  try { await pool.query("SELECT 1"); return false; }
  catch { return "PostgreSQL unavailable for isolated historical rollup regression"; }
  finally { await pool.end(); }
}
const skip = await availability();

async function withFixture(run: (pool: pg.Pool) => Promise<void>) {
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(connection.host), "Rollup fixtures require a loopback PostgreSQL server");
  const databaseName = `sqr_osp_rollup_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  assert.match(databaseName, /^sqr_osp_rollup_\d+_[a-f0-9]{10}$/);
  const maintenance = new pg.Pool({ ...connection, database: maintenanceDatabase, max: 1 });
  let created = false;
  try {
    await maintenance.query(`CREATE DATABASE ${pg.escapeIdentifier(databaseName)}`);
    created = true;
    const pool = new pg.Pool({ ...connection, database: databaseName, max: 4 });
    try {
      await pool.query(`
        CREATE TABLE public.collection_records (
          id uuid PRIMARY KEY, payment_date date NOT NULL, amount numeric(14,2) NOT NULL,
          created_by_login text NOT NULL, collection_staff_nickname text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.collection_record_daily_rollups (
          payment_date date NOT NULL, created_by_login text NOT NULL, collection_staff_nickname text NOT NULL,
          total_records integer NOT NULL, total_amount numeric(14,2) NOT NULL, updated_at timestamptz NOT NULL,
          PRIMARY KEY (payment_date, created_by_login, collection_staff_nickname)
        );
        CREATE TABLE public.collection_record_monthly_rollups (
          year integer NOT NULL, month integer NOT NULL, created_by_login text NOT NULL, collection_staff_nickname text NOT NULL,
          total_records integer NOT NULL, total_amount numeric(14,2) NOT NULL, updated_at timestamptz NOT NULL,
          PRIMARY KEY (year, month, created_by_login, collection_staff_nickname)
        );
        CREATE TABLE public.collection_record_daily_rollup_refresh_queue (
          payment_date date NOT NULL, created_by_login text NOT NULL, collection_staff_nickname text NOT NULL,
          status text NOT NULL, requested_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
          next_attempt_at timestamptz NOT NULL, attempt_count integer NOT NULL, last_error text,
          PRIMARY KEY (payment_date, created_by_login, collection_staff_nickname)
        );
      `);
      await run(pool);
    } finally { await pool.end(); }
  } finally {
    try { if (created) await dropDrainedOspFixtureDatabase(maintenance, databaseName); }
    finally { await maintenance.end(); }
  }
}

const slice = (paymentDate: string, nickname: string) => ({
  paymentDate, createdByLogin: "retroactive-admin", collectionStaffNickname: nickname,
});

async function insert(client: pg.PoolClient, date: string, nickname: string, amount: number) {
  const id = randomUUID();
  await client.query(`INSERT INTO public.collection_records
    (id, payment_date, amount, created_by_login, collection_staff_nickname, created_at)
    VALUES ($1, $2::date, $3, 'retroactive-admin', $4, '2026-09-06T01:00:00Z')`, [id, date, amount, nickname]);
  return id;
}

async function waitUntilBlocked(pool: pg.Pool, pid: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid]);
    if (rows[0]?.wait_event_type === "Lock") return;
    await delay(20);
  }
  assert.fail("Second writer did not reach the contested rollup lock");
}

test("concurrent independent accounts cannot lose historical daily or monthly totals", { skip }, async (t) => {
  await withFixture(async (pool) => {
    for (const secondDate of ["2026-08-27", "2026-08-28"]) {
      await t.test(`simultaneous payments on 2026-08-27 and ${secondDate}`, async () => {
        const nickname = `SW.ABU_${secondDate}`;
        const first = await pool.connect();
        const second = await pool.connect();
        let pending: Promise<void> | undefined;
        try {
          await first.query("BEGIN");
          await insert(first, "2026-08-27", nickname, 100);
          await refreshCollectionRecordDailyRollupSlices(drizzle(first), [slice("2026-08-27", nickname)]);
          await second.query("BEGIN");
          await insert(second, secondDate, nickname, 200);
          const { rows } = await second.query("SELECT pg_backend_pid() AS pid");
          pending = refreshCollectionRecordDailyRollupSlices(drizzle(second), [slice(secondDate, nickname)]);
          await waitUntilBlocked(pool, Number(rows[0].pid));
          await first.query("COMMIT");
          await pending;
          await second.query("COMMIT");
          const result = await pool.query(`SELECT total_records, total_amount::text FROM public.collection_record_monthly_rollups
            WHERE year = 2026 AND month = 8 AND collection_staff_nickname = $1`, [nickname]);
          assert.deepEqual(result.rows, [{ total_records: 2, total_amount: "300.00" }]);
          const daily = await pool.query(`SELECT SUM(total_records)::integer AS count, SUM(total_amount)::text AS amount
            FROM public.collection_record_daily_rollups WHERE collection_staff_nickname = $1`, [nickname]);
          assert.deepEqual(daily.rows, [{ count: 2, amount: "300.00" }]);
        } finally {
          await first.query("ROLLBACK");
          await pending?.catch(() => undefined);
          await second.query("ROLLBACK");
          first.release(); second.release();
        }
      });
    }
  });
});

test("backdated save, old/new date and nickname edits, deletion and repeated refresh use business-date slices", { skip }, async () => {
  await withFixture(async (pool) => {
    const client = await pool.connect();
    const executor = drizzle(client);
    const first = slice("2026-08-27", "SW.ABU_324");
    const second = slice("2026-08-28", "SW.ABU_324");
    const third = slice("2026-09-01", "SW.ABU_NEW");
    try {
      await client.query("BEGIN");
      const id = await insert(client, first.paymentDate, first.collectionStaffNickname, 500);
      await refreshCollectionRecordDailyRollupSlices(executor, [first]);
      await client.query("COMMIT");
      assert.deepEqual((await pool.query(`SELECT payment_date::text AS payment, created_at::date::text AS entered
        FROM public.collection_records WHERE id = $1`, [id])).rows, [{ payment: "2026-08-27", entered: "2026-09-06" }]);
      assert.deepEqual((await pool.query("SELECT payment_date::text AS date, total_amount::text AS amount FROM public.collection_record_daily_rollups")).rows,
        [{ date: "2026-08-27", amount: "500.00" }]);
      for (const [oldSlice, newSlice] of [[first, second], [second, third]] as const) {
        await client.query("BEGIN");
        await client.query("UPDATE public.collection_records SET payment_date = $2, collection_staff_nickname = $3 WHERE id = $1",
          [id, newSlice.paymentDate, newSlice.collectionStaffNickname]);
        await refreshCollectionRecordDailyRollupSlices(executor, [newSlice, oldSlice]);
        await refreshCollectionRecordDailyRollupSlices(executor, [oldSlice, newSlice, newSlice]);
        await client.query("COMMIT");
        assert.deepEqual((await pool.query("SELECT payment_date::text AS date, total_amount::text AS amount FROM public.collection_record_daily_rollups")).rows,
          [{ date: newSlice.paymentDate, amount: "500.00" }]);
        assert.deepEqual((await pool.query("SELECT month, total_records, total_amount::text AS amount FROM public.collection_record_monthly_rollups")).rows,
          [{ month: Number(newSlice.paymentDate.slice(5, 7)), total_records: 1, amount: "500.00" }]);
      }
      await client.query("BEGIN");
      await client.query("DELETE FROM public.collection_records WHERE id = $1", [id]);
      await refreshCollectionRecordDailyRollupSlices(executor, [third]);
      await client.query("COMMIT");
      assert.equal((await pool.query("SELECT 1 FROM public.collection_record_daily_rollups")).rowCount, 0);
      assert.equal((await pool.query("SELECT 1 FROM public.collection_record_monthly_rollups")).rowCount, 0);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
});

test("queue completion and failure cannot swallow a re-enqueued or newly claimed historical slice", { skip }, async () => {
  await withFixture(async (pool) => {
    const executor = drizzle(pool);
    const pending = slice("2026-08-27", "SW.ABU_324");
    await enqueueCollectionRecordDailyRollupSlices(executor, [pending, pending]);
    const first = await claimNextCollectionRecordDailyRollupRefreshSlice(new Date("2099-01-01"), executor);
    assert.equal(first?.paymentDate, "2026-08-27");
    assert.ok(first?.refreshClaimToken);
    await enqueueCollectionRecordDailyRollupSlices(executor, [pending]);
    await completeCollectionRecordDailyRollupRefreshSlice(first, executor);
    assert.equal((await pool.query("SELECT status FROM public.collection_record_daily_rollup_refresh_queue")).rows[0]?.status, "queued");
    const second = await claimNextCollectionRecordDailyRollupRefreshSlice(new Date("2099-01-01"), executor);
    assert.ok(second?.refreshClaimToken);
    assert.notEqual(second?.refreshClaimToken, first?.refreshClaimToken);
    await completeCollectionRecordDailyRollupRefreshSlice(first, executor);
    await failCollectionRecordDailyRollupRefreshSlice({ slice: first, errorMessage: "stale worker", nextAttemptAt: new Date("2099-02-01") }, executor);
    assert.equal((await pool.query("SELECT status FROM public.collection_record_daily_rollup_refresh_queue")).rows[0]?.status, "running");
    await completeCollectionRecordDailyRollupRefreshSlice(second, executor);
    assert.equal((await pool.query("SELECT 1 FROM public.collection_record_daily_rollup_refresh_queue")).rowCount, 0);
  });
});

test("bounded historical repair is dry-run first, limited, exact-scope, auditable and idempotent", { skip }, async () => {
  await withFixture(async (pool) => {
    const client = await pool.connect();
    const executor = drizzle(client);
    const repair = parseBoundedCollectionRollupRepair({ mode: "bounded", from: "2026-08-12", to: "2026-09-10",
      createdByLogin: "retroactive-admin", collectionStaffNickname: "SW.ABU_324" });
    try {
      await client.query("BEGIN");
      await insert(client, "2026-08-27", "SW.ABU_324", 500);
      await insert(client, "2026-08-28", "SW.ABU_324", 200);
      await insert(client, "2026-08-28", "OTHER", 25);
      await enqueueCollectionRecordDailyRollupSlices(executor, [slice("2026-08-27", "SW.ABU_324")]);
      await client.query("COMMIT");
      await client.query("BEGIN");
      const dry = await repairBoundedCollectionRecordRollups(executor, repair);
      assert.equal(dry.sliceCount, 2);
      assert.equal(dry.before.canonical_amount, "700.00");
      assert.equal(dry.before.daily_amount, "0.00");
      assert.deepEqual(dry.after, dry.before);
      await client.query("COMMIT");
      await client.query("BEGIN");
      await assert.rejects(repairBoundedCollectionRecordRollups(executor, { ...repair, dryRun: false, maxSlices: 1 }), /exceeds maxSlices/);
      await client.query("ROLLBACK");
      assert.equal((await pool.query("SELECT 1 FROM public.collection_record_daily_rollups")).rowCount, 0);
      await client.query("BEGIN");
      const fixed = await repairBoundedCollectionRecordRollups(executor, { ...repair, dryRun: false });
      assert.equal(fixed.after.daily_amount, "700.00");
      assert.equal(fixed.after.monthly_amount, "700.00");
      assert.equal(fixed.after.canonical_records, 2);
      await client.query("COMMIT");
      await client.query("BEGIN");
      const repeated = await repairBoundedCollectionRecordRollups(executor, { ...repair, dryRun: false });
      assert.deepEqual(repeated.before, repeated.after);
      await client.query("COMMIT");
      assert.equal((await pool.query("SELECT 1 FROM public.collection_record_daily_rollups WHERE collection_staff_nickname = 'OTHER'")).rowCount, 0);
      assert.equal((await pool.query("SELECT 1 FROM public.collection_records")).rowCount, 3);
      assert.equal((await pool.query("SELECT 1 FROM public.collection_record_daily_rollup_refresh_queue")).rowCount, 1);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
});

test("full rollup rebuild serializes with refreshes without overwriting a concurrent historical writer", { skip }, async () => {
  await withFixture(async (pool) => {
    const rebuilding = await pool.connect();
    const saving = await pool.connect();
    let pending: Promise<void> | undefined;
    try {
      await rebuilding.query("BEGIN");
      await rebuildCollectionRecordDailyRollups(drizzle(rebuilding));
      await saving.query("BEGIN");
      await insert(saving, "2026-08-27", "SW.ABU_324", 500);
      const { rows } = await saving.query("SELECT pg_backend_pid() AS pid");
      pending = refreshCollectionRecordDailyRollupSlices(drizzle(saving), [slice("2026-08-27", "SW.ABU_324")]);
      await waitUntilBlocked(pool, Number(rows[0].pid));
      await rebuilding.query("COMMIT");
      await pending;
      await saving.query("COMMIT");
      assert.deepEqual((await pool.query("SELECT total_records, total_amount::text AS amount FROM public.collection_record_monthly_rollups")).rows,
        [{ total_records: 1, amount: "500.00" }]);
    } finally {
      await rebuilding.query("ROLLBACK");
      await pending?.catch(() => undefined);
      await saving.query("ROLLBACK");
      rebuilding.release(); saving.release();
    }
  });
});

test("backup rollup finalization preserves a refresh generation enqueued after its rebuild", { skip }, async () => {
  await withFixture(async (pool) => {
    const client = await pool.connect();
    const executor = drizzle(client);
    let signalReady!: () => void;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    let releaseFinalizer!: () => void;
    const released = new Promise<void>((resolve) => { releaseFinalizer = resolve; });
    let finalizing: Promise<void> | undefined;
    try {
      await client.query("BEGIN");
      const wrapper = {
        execute: async (query: Parameters<typeof executor.execute>[0]) => {
          const result = await executor.execute(query);
          if (/INSERT INTO public\.collection_record_monthly_rollups/.test(collectSqlText(query))) {
            signalReady();
            await released;
          }
          return result;
        },
      };
      // Test barrier wraps the awaited result, not Drizzle's optional fluent
      // query methods. Production finalization only awaits execute().
      finalizing = finalizeRestoredCollectionRollups(wrapper as unknown as Parameters<typeof finalizeRestoredCollectionRollups>[0]);
      await Promise.race([ready, delay(5_000).then(() => { throw new Error("Backup finalizer did not reach the rebuild barrier"); })]);
      await enqueueCollectionRecordDailyRollupSlices(drizzle(pool), [slice("2026-08-27", "SW.ABU_324")]);
      releaseFinalizer();
      await finalizing;
      await client.query("COMMIT");
      assert.deepEqual((await pool.query("SELECT payment_date::text AS date, status FROM public.collection_record_daily_rollup_refresh_queue")).rows,
        [{ date: "2026-08-27", status: "queued" }]);
    } finally {
      releaseFinalizer();
      await finalizing?.catch(() => undefined);
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
