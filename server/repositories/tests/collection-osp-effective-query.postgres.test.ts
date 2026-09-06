import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { db } from "../../db-postgres";
import { getCollectionOspCalendarRepository, getCollectionOspDrilldownRepository } from "../collection-osp-v7-repository-utils";
import { ensureCollectionRecordsTables } from "../../internal/collection-bootstrap-records";
import { ensureCoreDataRowsTable, ensureCoreImportsTable } from "../../internal/core-schema-bootstrap-imports";
import { ensureCoreAuditLogsTable } from "../../internal/core-schema-bootstrap-activity";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import { dropDrainedOspFixtureDatabase } from "./postgres-fixture-cleanup";
import {
  aggregateCollectionOspReconciliation,
  formatCollectionOspMoneyCents,
  parseCollectionOspMoneyCents,
  reconcileCollectionOspAccount,
  type CollectionOspReconciliationAccountResult,
} from "../../lib/collection-osp-reconciliation";
import {
  buildCollectionOspAgingAggregateQuery,
  buildCollectionOspDailyAggregateQuery,
  buildCollectionOspEffectiveAccountCtes,
  type CollectionOspEffectiveQueryScope,
} from "../collection-osp-effective-query";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const connection = {
  host: process.env.PG_HOST || "127.0.0.1", port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres", password: process.env.PG_PASSWORD || "postgres",
};
const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";
const migrations = [
  "0049_collection_record_purge_history.sql", "0052_collection_source_governance_osp.sql",
  "0053_collection_source_governance_deferred_foreign_keys.sql", "0054_collection_osp_reconciliation_persistence.sql",
  "0055_collection_manual_verified_settlement.sql", "0056_collection_osp_v9_baseline_integrity.sql",
  "0057_collection_purge_canonical_history.sql", "0059_collection_purge_manual_settlement_history.sql",
  "0060_collection_osp_v9_complete_aging_scope.sql", "0061_collection_v9_history_lookup_indexes.sql",
  "0062_collection_osp_private_client_ownership.sql",
];
const agings = ["D3", "D4", "D5", "D6"] as const;
const period = { from: "2026-08-12", to: "2026-09-11" };
const selectedSources = ["effective-source", "effective-other-selected"];
const sourceIds = [...selectedSources, "effective-unselected"];

async function availability() {
  const pool = new pg.Pool({ ...connection, database: maintenanceDatabase, max: 1, connectionTimeoutMillis: 1_500 });
  try { await pool.query("SELECT 1"); return false; }
  catch { return "PostgreSQL unavailable for isolated effective OSP differential test"; }
  finally { await pool.end(); }
}
const skip = await availability();

async function withIsolatedDatabase(run: (pool: pg.Pool) => Promise<void>) {
  const databaseName = `sqr_osp_effective_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  assert.match(databaseName, /^sqr_osp_effective_\d+_[a-f0-9]{10}$/);
  const quoted = pg.escapeIdentifier(databaseName);
  const admin = new pg.Pool({ ...connection, database: maintenanceDatabase, max: 1 });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${quoted}`);
    created = true;
    const pool = new pg.Pool({ ...connection, database: databaseName, max: 2 });
    try { await run(pool); } finally { await pool.end(); }
  } finally {
    try {
      if (created) await dropDrainedOspFixtureDatabase(admin, databaseName);
    } finally {
      await admin.end();
    }
  }
}

type PaymentSpec = {
  date: string;
  amount: string;
  classification?: "cp" | "abort_cp";
  nickname?: string;
  duplicate?: boolean;
  sourceImportId?: string | null;
  unlinkedRow?: boolean;
  wrongObligation?: boolean;
  totalDue?: string;
  osp?: string;
  manual?: { date: string; amount: string; revoked?: boolean; callingDate?: string; windowEnd?: string };
};
type AccountSpec = {
  name: string;
  callingDate?: string;
  windowEnd?: string;
  totalDue?: string;
  osp?: string;
  payments: PaymentSpec[];
};
type FixtureAccount = Omit<AccountSpec, "payments"> & {
  aging: typeof agings[number];
  cycleKey: string;
  totalDue: string;
  osp: string;
  callingDate: string;
  windowEnd: string;
  payments: Array<PaymentSpec & { id: string }>;
};

const cases: AccountSpec[] = [
  { name: "automatic-one-account-many-payments", payments: [
    { date: "2026-08-13", amount: "100.00" },
    { date: "2026-08-18", amount: "400.00", classification: "abort_cp" },
    { date: "2026-08-25", amount: "50.00" },
  ] },
  { name: "cp-threshold-is-not-a-factual-abort", payments: [
    { date: "2026-08-13", amount: "100.00" }, { date: "2026-08-18", amount: "400.00" },
  ] },
  { name: "manual-with-same-day-system-total", payments: [
    { date: "2026-08-13", amount: "100.00" },
    { date: "2026-08-18", amount: "200.00", manual: { date: "2026-08-18", amount: "200.00" } },
  ] },
  { name: "later-cp-cannot-retroactively-validate-manual", payments: [
    { date: "2026-08-13", amount: "100.00", manual: { date: "2026-08-16", amount: "200.00" } },
    { date: "2026-08-20", amount: "400.00" },
  ] },
  { name: "future-manual-is-not-yet-effective", payments: [
    { date: "2026-08-13", amount: "1.00", manual: { date: "2026-08-25", amount: "500.00" } },
  ] },
  { name: "manual-first-auto-later-preserves-earliest-day", payments: [
    { date: "2026-08-13", amount: "300.00", manual: { date: "2026-08-16", amount: "200.00" } },
    { date: "2026-08-22", amount: "200.00", classification: "abort_cp" },
  ] },
  { name: "valid-manual-can-confirm-earlier-cp-threshold", payments: [
    { date: "2026-08-13", amount: "500.00", manual: { date: "2026-08-18", amount: "10.00" } },
  ] },
  { name: "manual-before-target-period-is-not-a-movement", callingDate: "2026-08-01", windowEnd: "2026-09-01", payments: [
    { date: "2026-08-13", amount: "1.00", manual: { date: "2026-08-05", amount: "500.00" } },
  ] },
  { name: "pre-period-manual-falls-back-to-in-period-auto", callingDate: "2026-08-01", windowEnd: "2026-09-01", payments: [
    { date: "2026-08-13", amount: "1.00", manual: { date: "2026-08-05", amount: "500.00" } },
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp" },
  ] },
  { name: "manual-outside-frozen-calling-window", payments: [
    { date: "2026-08-13", amount: "1.00", manual: { date: "2026-08-05", amount: "500.00", callingDate: "2026-08-01", windowEnd: "2026-09-01" } },
  ] },
  { name: "payment-before-frozen-calling-window", callingDate: "2026-08-20", windowEnd: "2026-09-20", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp" },
  ] },
  { name: "payment-at-exclusive-calling-boundary", callingDate: "2026-08-01", windowEnd: "2026-09-01", payments: [
    { date: "2026-09-01", amount: "500.00", classification: "abort_cp" },
  ] },
  { name: "payment-after-target-period", callingDate: "2026-08-20", windowEnd: "2026-09-20", payments: [
    { date: "2026-09-12", amount: "500.00", classification: "abort_cp" },
  ] },
  { name: "payment-before-target-period", callingDate: "2026-08-01", windowEnd: "2026-09-01", payments: [
    { date: "2026-08-11", amount: "500.00", classification: "abort_cp" },
  ] },
  { name: "duplicate-receipt-does-not-contribute", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", duplicate: true },
  ] },
  { name: "duplicate-manual-anchor-does-not-contribute", payments: [
    { date: "2026-08-13", amount: "1.00", duplicate: true, manual: { date: "2026-08-18", amount: "500.00" } },
  ] },
  { name: "unselected-import-is-not-source-evidence", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", sourceImportId: "effective-unselected" },
  ] },
  { name: "unselected-manual-is-not-source-evidence", payments: [
    { date: "2026-08-13", amount: "1.00", sourceImportId: "effective-unselected", manual: { date: "2026-08-18", amount: "500.00" } },
  ] },
  { name: "other-selected-import-same-logical-account-is-valid", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", sourceImportId: "effective-other-selected" },
  ] },
  { name: "null-import-is-not-evidence", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", sourceImportId: null },
  ] },
  { name: "null-source-row-is-not-evidence", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", unlinkedRow: true },
  ] },
  { name: "mismatched-obligation-is-not-evidence", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", wrongObligation: true },
  ] },
  { name: "mismatched-total-due-is-not-evidence", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", totalDue: "600.00" },
  ] },
  { name: "mismatched-billing-osp-is-not-evidence", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", osp: "900000.00" },
  ] },
  { name: "revoked-manual-never-closes", payments: [
    { date: "2026-08-13", amount: "1.00", manual: { date: "2026-08-18", amount: "500.00", revoked: true } },
  ] },
  { name: "outside-nickname-payment", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", nickname: "outside-team" },
  ] },
  { name: "manual-anchor-nickname-does-not-filter-evidence", payments: [
    { date: "2026-08-13", amount: "300.00" },
    { date: "2026-08-18", amount: "1.00", nickname: "outside-team", manual: { date: "2026-08-18", amount: "200.00" } },
  ] },
  { name: "nickname-match-is-case-insensitive", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp", nickname: "AlLoWeD" },
  ] },
  { name: "zero-billing-osp-still-counts-one-closed-account", osp: "0.00", payments: [
    { date: "2026-08-18", amount: "500.00", classification: "abort_cp" },
  ] },
  { name: "no-payment-account-remains-in-baseline", payments: [] },
  { name: "exact-cent-manual-threshold", totalDue: "0.03", osp: "90000000000.01", payments: [
    { date: "2026-08-18", amount: "0.01", manual: { date: "2026-08-18", amount: "0.02" } },
  ] },
];

async function prepareFixture(pool: pg.Pool) {
  const database = drizzle(pool);
  await ensureCollectionRecordsTables(database);
  await ensureUsersBootstrapSchema(database);
  await ensureCoreAuditLogsTable(database);
  await ensureCoreImportsTable(database);
  await ensureCoreDataRowsTable(database);
  for (const name of migrations) await pool.query(readFileSync(path.join(root, "drizzle", name), "utf8"));
  await pool.query(`INSERT INTO public.users (id, username, password_hash, role, status)
    VALUES ('effective-admin', 'effective-admin', 'not-a-login-secret', 'admin', 'active')`);
  for (const sourceId of sourceIds) {
    await pool.query("INSERT INTO public.imports (id, name, filename, is_deleted, created_by) VALUES ($1, $1, 'synthetic.xlsx', false, 'system')", [sourceId]);
    await pool.query(`INSERT INTO public.collection_source_configs
      (source_import_id, valid_from, valid_to, cycle_key, enabled, compatibility_status, compatibility_issues, indexed_row_count, configured_by)
      VALUES ($1, $2::date, $3::date, 'EFFECTIVE-DIFFERENTIAL', true, 'compatible', ARRAY[]::text[], $4, 'system')`,
    [sourceId, period.from, period.to, cases.length]);
  }
  const targetId = randomUUID();
  const revisionId = randomUUID();
  await pool.query(`INSERT INTO public.collection_osp_saved_targets
    (id, target_name, normalized_name, assigned_admin_user_id, created_by, updated_by)
    VALUES ($1::uuid, 'effective SQL fixture', 'effective sql fixture', 'effective-admin', 'system', 'system')`, [targetId]);
  await pool.query(`INSERT INTO public.collection_osp_target_revisions
    (id, target_id, revision_number, source_scope_hash, period_from, period_to, tracking_start_date, tracking_end_date, created_by)
    VALUES ($1::uuid, $2::uuid, 1, $3, $4::date, $5::date, $4::date, $5::date, 'system')`,
  [revisionId, targetId, "a".repeat(64), period.from, period.to]);
  for (const sourceId of selectedSources) {
    await pool.query(`INSERT INTO public.collection_osp_target_sources
      (target_revision_id, source_import_id, source_name_snapshot, source_filename_snapshot)
      VALUES ($1::uuid, $2, 'Frozen synthetic source', 'synthetic.xlsx')`, [revisionId, sourceId]);
  }
  const accounts: FixtureAccount[] = cases.map((account, index) => ({
    ...account, aging: agings[index % agings.length]!, cycleKey: `effective:${account.name}`,
    callingDate: account.callingDate ?? "2026-08-12", windowEnd: account.windowEnd ?? "2026-09-12",
    osp: account.osp ?? `${1000 + index}.01`, totalDue: account.totalDue ?? "500.00",
    payments: account.payments.map((payment) => ({ ...payment, id: randomUUID() })),
  }));
  for (const account of accounts) {
    for (const sourceId of sourceIds) {
      await pool.query("INSERT INTO public.data_rows (id, import_id, json_data) VALUES ($1, $2, '{}'::jsonb)", [`${sourceId}:${account.name}`, sourceId]);
    }
    await pool.query(`INSERT INTO public.collection_osp_target_source_rows
      (target_revision_id, source_import_id, source_data_row_id, canonical_obligation_key, cycle_key,
        card_number_last4, aging_bucket, calling_date, calling_window_end_exclusive, total_due, billing_principal_osp)
      VALUES ($1::uuid, 'effective-source', $2, $3, $3, '0123', $4, $5::date, $6::date, $7::numeric, $8::numeric)`,
    [revisionId, `effective-source:${account.name}`, account.cycleKey, account.aging, account.callingDate, account.windowEnd, account.totalDue, account.osp]);
    for (const payment of account.payments) {
      const sourceId = payment.sourceImportId === undefined ? "effective-source" : payment.sourceImportId;
      await pool.query(`INSERT INTO public.collection_records
        (id, source_import_id, source_data_row_id, aging_bucket, calling_date, calling_window_end_exclusive,
          total_due, billing_principal_osp, source_obligation_key, settlement_cycle_key, classification,
          batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username, duplicate_receipt_flag)
        VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::numeric, $8::numeric, $9, $10, $11,
          'P10', $12::date, $13::numeric, 'system', $14, $14, $15)`,
      [payment.id, sourceId, payment.unlinkedRow || !sourceId ? null : `${sourceId}:${account.name}`, account.aging,
        payment.manual?.callingDate ?? account.callingDate, payment.manual?.windowEnd ?? account.windowEnd,
        payment.totalDue ?? account.totalDue, payment.osp ?? account.osp,
        payment.wrongObligation ? "wrong-obligation" : account.cycleKey, account.cycleKey,
        payment.classification ?? "cp", payment.date, payment.amount, payment.nickname ?? "allowed", payment.duplicate ?? false]);
      if (payment.manual) {
        await pool.query(`UPDATE public.collection_records SET settlement_override_status = $2,
          pool_amount = $3::numeric, manual_settlement_date = $4::date,
          manual_settlement_reason = 'CLIENT_CONFIRMED_PAYMENT', manual_settlement_version = 1,
          manual_settlement_verified_by = 'system', manual_settlement_verified_at = now(),
          manual_settlement_updated_by = 'system', manual_settlement_updated_at = now(),
          manual_settlement_revoked_by = CASE WHEN $2 = 'REVOKED' THEN 'system' ELSE NULL END,
          manual_settlement_revoked_at = CASE WHEN $2 = 'REVOKED' THEN now() ELSE NULL END,
          manual_settlement_revoked_reason = CASE WHEN $2 = 'REVOKED' THEN 'Synthetic revoked evidence' ELSE NULL END
          WHERE id = $1`, [payment.id, payment.manual.revoked ? "REVOKED" : "ACTIVE", payment.manual.amount, payment.manual.date]);
      }
    }
  }
  await pool.query(`INSERT INTO public.collection_osp_target_aging_rows
    (target_revision_id, aging_bucket, total_osp_baseline, target_percentage, target_osp)
    SELECT $1::uuid, aging_bucket, SUM(billing_principal_osp), 30, ROUND(SUM(billing_principal_osp) * 0.3, 2)
    FROM public.collection_osp_target_source_rows WHERE target_revision_id = $1::uuid GROUP BY aging_bucket`, [revisionId]);
  return { targetId, revisionId, accounts };
}

function money(value: unknown): string {
  return formatCollectionOspMoneyCents(parseCollectionOspMoneyCents(value));
}

function eligibleIdentity(account: FixtureAccount, payment: PaymentSpec) {
  const sourceId = payment.sourceImportId === undefined ? "effective-source" : payment.sourceImportId;
  return !payment.duplicate && sourceId !== null && selectedSources.includes(sourceId)
    && !payment.unlinkedRow && !payment.wrongObligation
    && money(payment.totalDue ?? account.totalDue) === money(account.totalDue)
    && money(payment.osp ?? account.osp) === money(account.osp);
}

function referenceResult(account: FixtureAccount, revisionId: string, asOfDate: string, nicknameScope: string[]) {
  const events = account.payments.filter((payment) => eligibleIdentity(account, payment)
    && payment.date >= period.from && payment.date <= period.to && payment.date <= asOfDate
    && payment.date >= account.callingDate && payment.date < account.windowEnd
    && (!nicknameScope.length || nicknameScope.includes((payment.nickname ?? "allowed").toLowerCase())));
  const manual = account.payments.find((payment) => eligibleIdentity(account, payment)
    && payment.manual && !payment.manual.revoked && payment.manual.date >= account.callingDate
    // Current source validity governs the manual business date too. Evidence
    // outside it contributes neither OSP nor a reconciled amount/remaining value.
    && payment.manual.date >= period.from && payment.manual.date <= period.to
    && payment.manual.date < account.windowEnd)?.manual;
  const result = reconcileCollectionOspAccount({
    targetRevisionId: revisionId, cycleKey: account.cycleKey, aging: account.aging,
    totalDue: account.totalDue, billingPrincipalOsp: account.osp, systemPayments: events,
    systemAbortDate: events.find((payment) => payment.classification === "abort_cp")?.date ?? null,
    manual: manual ? { amount: manual.amount, asOfDate: manual.date, active: true } : null, asOfDate,
  });
  // Independent BigInt oracle retains the original target-period boundary:
  // a pre-period manual event cannot erase a later in-period factual ABORT.
  const effectiveDate = result.effectiveClosureDate && result.effectiveClosureDate < period.from && result.systemClosed
    ? result.systemAbortDate : result.effectiveClosureDate;
  const reconciledClosed = Boolean(result.reconciledClosed && effectiveDate && effectiveDate >= period.from && effectiveDate <= period.to);
  return {
    ...result, reconciledClosed, effectiveClosureDate: reconciledClosed ? effectiveDate : null,
    contributionSource: result.systemClosed ? "SYSTEM_ABORT_CP" as const
      : reconciledClosed && result.manualPriorAmount !== "0.00" ? "MANUAL_VERIFIED_ABORT" as const : "OPEN" as const,
  };
}

function comparable(result: CollectionOspReconciliationAccountResult) {
  return {
    cycleKey: result.cycleKey, aging: result.aging, systemCumulative: result.systemCumulative,
    manualAmount: result.manualPriorAmount, reconciledCumulative: result.reconciledCumulative,
    remaining: result.remainingAmount, systemClosed: result.systemClosed,
    systemAbortDate: result.systemAbortDate, reconciledClosed: result.reconciledClosed,
    effectiveDate: result.effectiveClosureDate, manualEffectiveDate: result.manualEffectiveDate,
    contributionSource: result.contributionSource, manualSuperseded: result.manualSuperseded,
  };
}

test("set-based effective OSP matches dated BigInt reconciliation across governed source, manual, and nickname boundaries", { skip, timeout: 60_000 }, async () => {
  await withIsolatedDatabase(async (pool) => {
    const { accounts, targetId, revisionId } = await prepareFixture(pool);
    const database = drizzle(pool);
    const baseline = Object.fromEntries(agings.map((aging) => [aging, formatCollectionOspMoneyCents(accounts
      .filter((account) => account.aging === aging)
      .reduce((sum, account) => sum + parseCollectionOspMoneyCents(account.osp), 0n))]));
    for (const nicknameScope of [[], ["allowed"], ["outside-team"]]) {
      await pool.query("UPDATE public.collection_osp_target_revisions SET nickname_scope = $2::text[] WHERE id = $1::uuid", [revisionId, nicknameScope.map((value) => value.toUpperCase())]);
      for (const asOfDate of ["2026-08-13", "2026-08-18", "2026-08-22", "2026-09-11"]) {
        const scope: CollectionOspEffectiveQueryScope = {
          targetId, revisionId, asOfDate, expectedTargetVersion: 1,
          viewerPredicate: sql`target.assigned_admin_user_id = ${"effective-admin"}`,
        };
        const expected = accounts.map((account) => referenceResult(account, revisionId, asOfDate, nicknameScope));
        const actual = await database.execute(sql`WITH ${buildCollectionOspEffectiveAccountCtes(scope)}
          SELECT cycle_key, aging_bucket, system_cumulative::text, manual_amount::text,
            reconciled_cumulative::text, remaining_amount::text, system_abort_date::text,
            system_closed, effective_closure_date::text, reconciled_closed, manual_effective_date::text,
            contribution_source, manual_superseded FROM osp_effective_accounts ORDER BY cycle_key`);
        assert.equal(actual.rows.length, cases.length, "The SQL CTE has exactly one row per immutable logical account.");
        for (const row of actual.rows) {
          const reference = expected.find((result) => result.cycleKey === row.cycle_key)!;
          assert.deepEqual({
            cycleKey: row.cycle_key, aging: row.aging_bucket, systemCumulative: money(row.system_cumulative),
            manualAmount: money(row.manual_amount), reconciledCumulative: money(row.reconciled_cumulative),
            remaining: money(row.remaining_amount), systemClosed: row.system_closed,
            systemAbortDate: row.system_abort_date, reconciledClosed: row.reconciled_closed,
            effectiveDate: row.effective_closure_date, manualEffectiveDate: row.manual_effective_date,
            contributionSource: row.contribution_source, manualSuperseded: row.manual_superseded,
          }, comparable(reference), `${reference.cycleKey}, ${asOfDate}, nickname=${nicknameScope.join(",") || "ALL"}`);
        }
        const agingRows = (await database.execute(buildCollectionOspAgingAggregateQuery(scope))).rows;
        assert.equal(agingRows.length, 4, "No account-sized result escapes the grouped aging query.");
        for (const mode of ["system", "manual", "reconciled"] as const) {
          const oracle = aggregateCollectionOspReconciliation(expected, baseline, mode);
          for (const row of agingRows) {
            const reference = oracle.find((candidate) => candidate.aging === row.aging_bucket)!;
            assert.equal(money(row[`${mode}_osp_closed`]), reference.ospClosed);
            assert.equal(row[`${mode}_account_count`], reference.closedAccountCount);
            assert.equal(money(row.snapshot_total_osp), baseline[String(row.aging_bucket)]);
            assert.equal(row.has_saved_source_scope, true);
          }
        }
        for (const aging of [undefined, ...agings]) {
          const dailyRows = (await database.execute(buildCollectionOspDailyAggregateQuery({ ...scope, ...(aging ? { aging } : {}) }))).rows;
          const grouped = new Map<string, { osp: bigint; count: number }>();
          for (const result of expected) {
            if (!result.reconciledClosed || !result.effectiveClosureDate || (aging && result.aging !== aging)) continue;
            const current = grouped.get(result.effectiveClosureDate) ?? { osp: 0n, count: 0 };
            current.osp += parseCollectionOspMoneyCents(result.billingPrincipalOsp);
            current.count += 1;
            grouped.set(result.effectiveClosureDate, current);
          }
          assert.deepEqual(dailyRows.map((row) => ({ date: row.date, osp: money(row.osp_closed), count: row.account_count })),
            [...grouped].sort(([left], [right]) => left.localeCompare(right))
              .map(([date, value]) => ({ date, osp: formatCollectionOspMoneyCents(value.osp), count: value.count })));
        }
      }
    }
  });
});

test("exact-day drilldown reconciles full-period calendar when later manual verification confirms an earlier closure", { skip, timeout: 60_000 }, async () => {
  await withIsolatedDatabase(async (pool) => {
    const { targetId, revisionId } = await prepareFixture(pool);
    const database = drizzle(pool);
    const mutable = db as unknown as { execute: typeof db.execute };
    const original = mutable.execute;
    mutable.execute = database.execute.bind(database) as typeof db.execute;
    try {
      const scope = { targetId, revisionId, viewer: { userId: "effective-admin", role: "admin" } };
      const calendar = await getCollectionOspCalendarRepository({ ...scope, from: period.from, to: period.to, asOfDate: period.to });
      const day = calendar.days.find((item) => item.date === "2026-08-13")!;
      assert.ok(day.systemDailyAccounts > 0, "future-dated manual verification confirms the earlier CP threshold in this fixture");
      const details = await getCollectionOspDrilldownRepository({ ...scope, asOfDate: "2026-08-13", date: "2026-08-13", page: 1, pageSize: 10 });
      assert.deepEqual(details.summary, { accountCount: day.systemDailyAccounts, ospClosed: day.systemOspClosedToday });
      assert.ok(details.items.every((item) => item.effectiveClosedDate === "2026-08-13"));
    } finally { mutable.execute = original; }
  });
});

test("effective OSP SQL preserves bounded baseline evidence and fails closed on viewer/version mismatch", { skip, timeout: 60_000 }, async () => {
  await withIsolatedDatabase(async (pool) => {
    const { targetId, revisionId } = await prepareFixture(pool);
    const database = drizzle(pool);
    const scope: CollectionOspEffectiveQueryScope = { targetId, revisionId, asOfDate: period.to, viewerPredicate: sql`TRUE`, expectedTargetVersion: 1 };
    const row = (await database.execute(sql`WITH ${buildCollectionOspEffectiveAccountCtes(scope)} SELECT * FROM osp_effective_accounts LIMIT 1`)).rows[0]!;
    assert.equal(Object.keys(row).some((key) => /encrypted|json|customer|phone|private|percentage/.test(key)), false,
      "The reusable financial CTE must not project PII, imported JSON, or private TABLE B state.");
    await pool.query("UPDATE public.collection_osp_target_aging_rows SET total_osp_baseline = total_osp_baseline + 1, target_osp = ROUND((total_osp_baseline + 1) * target_percentage / 100, 2) WHERE target_revision_id = $1::uuid AND aging_bucket = 'D3'", [revisionId]);
    const evidence = (await database.execute(buildCollectionOspAgingAggregateQuery(scope))).rows.find((item) => item.aging_bucket === "D3")!;
    assert.notEqual(money(evidence.total_osp_baseline), money(evidence.snapshot_total_osp),
      "The immutable snapshot SUM remains independently available to the repository's baseline-integrity rejection.");
    for (const denied of [
      { ...scope, viewerPredicate: sql`FALSE` },
      { ...scope, viewerPredicate: sql`target.assigned_admin_user_id = ${"unassigned-admin"}` },
      { ...scope, expectedTargetVersion: 2 },
      { ...scope, targetId: randomUUID() },
      { ...scope, revisionId: randomUUID() },
    ]) {
      assert.deepEqual((await database.execute(buildCollectionOspAgingAggregateQuery(denied))).rows, []);
      assert.deepEqual((await database.execute(buildCollectionOspDailyAggregateQuery(denied))).rows, []);
    }
    await pool.query("UPDATE public.collection_osp_saved_targets SET status = 'DELETED', deleted_at = now(), deleted_by = 'system' WHERE id = $1::uuid", [targetId]);
    assert.deepEqual((await database.execute(buildCollectionOspAgingAggregateQuery(scope))).rows, []);
  });
});
