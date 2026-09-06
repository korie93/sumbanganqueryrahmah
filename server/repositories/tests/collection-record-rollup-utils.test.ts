import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeCollectionRecordDailyRollupSlices,
  mapCollectionRecordDailyRollupRefreshQueueSnapshotRow,
  normalizeCollectionRecordDailyRollupSlice,
  resolveCollectionRollupFreshnessStatus,
} from "../collection-record-rollup-utils";
import { refreshCollectionRecordDailyRollupSlices } from "../collection-record-rollup-refresh-utils";
import type { CollectionRepositoryExecutor } from "../collection-record-rollup-types";
import { collectBoundValues, collectSqlText } from "./sql-test-utils";

test("rollup edits acquire every old/new month lock in deterministic order before aggregation", async () => {
  const statements: Array<{ text: string; values: unknown[] }> = [];
  const executor = {
    execute: async (query: unknown) => {
      statements.push({ text: collectSqlText(query), values: collectBoundValues(query) });
      return { rows: [{ total_records: 0, total_amount: "0.00" }] };
    },
  } as CollectionRepositoryExecutor;
  const oldSlice = { paymentDate: "2026-09-01", createdByLogin: "admin", collectionStaffNickname: "staff" };
  const newSlice = { ...oldSlice, paymentDate: "2026-08-27" };
  await refreshCollectionRecordDailyRollupSlices(executor, [oldSlice, newSlice, oldSlice]);
  const firstAggregate = statements.findIndex((statement) => /COUNT\(\*\)/.test(statement.text));
  const acquired = statements.slice(0, firstAggregate).flatMap((statement) => statement.values)
    .filter((value): value is string => typeof value === "string" && value.startsWith('["collection-rollup-month"'));
  assert.deepEqual(acquired.slice(0, 2), [
    '["collection-rollup-month","2026-08","admin","staff"]',
    '["collection-rollup-month","2026-09","admin","staff"]',
  ]);
  assert.match(statements[0].text, /pg_advisory_xact_lock_shared/);
  assert.ok(firstAggregate > 2);
});

test("normalizeCollectionRecordDailyRollupSlice trims values and rejects incomplete slices", () => {
  assert.deepEqual(
    normalizeCollectionRecordDailyRollupSlice({
      paymentDate: " 2026-04-01 ",
      createdByLogin: " admin.user ",
      collectionStaffNickname: " Collector Alpha ",
    }),
    {
      paymentDate: "2026-04-01",
      createdByLogin: "admin.user",
      collectionStaffNickname: "Collector Alpha",
    },
  );
  assert.equal(
    normalizeCollectionRecordDailyRollupSlice({
      paymentDate: "2026-04-01",
      createdByLogin: "",
      collectionStaffNickname: "Collector Alpha",
    }),
    null,
  );
});

test("dedupeCollectionRecordDailyRollupSlices keeps one normalized slice per unique key", () => {
  assert.deepEqual(
    dedupeCollectionRecordDailyRollupSlices([
      {
        paymentDate: "2026-04-01",
        createdByLogin: "admin.user",
        collectionStaffNickname: "Collector Alpha",
      },
      {
        paymentDate: " 2026-04-01 ",
        createdByLogin: " admin.user ",
        collectionStaffNickname: " Collector Alpha ",
      },
      {
        paymentDate: "2026-04-02",
        createdByLogin: "admin.user",
        collectionStaffNickname: "Collector Beta",
      },
      null,
    ]),
    [
      {
        paymentDate: "2026-04-01",
        createdByLogin: "admin.user",
        collectionStaffNickname: "Collector Alpha",
      },
      {
        paymentDate: "2026-04-02",
        createdByLogin: "admin.user",
        collectionStaffNickname: "Collector Beta",
      },
    ],
  );
});

test("rollup refresh queue snapshot helpers normalize row values and derive freshness status", () => {
  const warmingSnapshot = mapCollectionRecordDailyRollupRefreshQueueSnapshotRow({
    pending_count: "2",
    running_count: "1",
    retry_count: "0",
    oldest_pending_age_ms: "45000",
  });
  assert.deepEqual(warmingSnapshot, {
    pendingCount: 2,
    runningCount: 1,
    retryCount: 0,
    oldestPendingAgeMs: 45_000,
  });
  assert.equal(resolveCollectionRollupFreshnessStatus(warmingSnapshot), "warming");
  assert.equal(
    resolveCollectionRollupFreshnessStatus({
      pendingCount: 0,
      runningCount: 0,
      retryCount: 0,
      oldestPendingAgeMs: 0,
    }),
    "fresh",
  );
  assert.equal(
    resolveCollectionRollupFreshnessStatus({
      pendingCount: 20,
      runningCount: 1,
      retryCount: 0,
      oldestPendingAgeMs: 10_000,
    }),
    "stale",
  );
});
