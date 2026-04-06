import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeCollectionRecordDailyRollupSlices,
  mapCollectionRecordDailyRollupRefreshQueueSnapshotRow,
  normalizeCollectionRecordDailyRollupSlice,
  resolveCollectionRollupFreshnessStatus,
} from "../collection-record-rollup-utils";

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
