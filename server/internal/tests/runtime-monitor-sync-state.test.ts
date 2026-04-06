import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyRuntimeRollupRefreshSnapshot,
  createRuntimeIntelligenceHistory,
  createRuntimeMonitorSyncState,
} from "../runtime-monitor-sync-state";
import type { InternalMonitorSnapshot } from "../runtime-monitor-types";

function createSnapshot(overrides: Partial<InternalMonitorSnapshot> = {}): InternalMonitorSnapshot {
  return {
    score: 92,
    mode: "NORMAL",
    cpuPercent: 35,
    ramPercent: 42,
    p95LatencyMs: 120,
    errorRate: 0.5,
    dbLatencyMs: 80,
    aiLatencyMs: 140,
    eventLoopLagMs: 12,
    requestRate: 3,
    activeRequests: 1,
    queueLength: 0,
    workerCount: 2,
    maxWorkers: 4,
    dbProtection: false,
    slowQueryCount: 0,
    dbConnections: 3,
    aiFailRate: 0,
    status401Count: 0,
    status403Count: 0,
    status429Count: 0,
    localOpenCircuitCount: 0,
    clusterOpenCircuitCount: 0,
    bottleneckType: "NONE",
    rollupRefreshPendingCount: 0,
    rollupRefreshRunningCount: 0,
    rollupRefreshRetryCount: 0,
    rollupRefreshOldestPendingAgeMs: 0,
    updatedAt: 1_000,
    ...overrides,
  };
}

test("runtime monitor sync state normalizes rollup refresh snapshots", async () => {
  const state = createRuntimeMonitorSyncState({
    apiDebugLogs: false,
    evaluateSystem: async () => ({ score: 90, mode: "NORMAL" } as any),
    getCollectionRollupRefreshQueueSnapshot: async () => ({
      pendingCount: -4,
      runningCount: 2,
      retryCount: Number.NaN,
      oldestPendingAgeMs: -50,
    }),
  });

  await state.refreshCollectionRollupRefreshQueueSnapshot();

  assert.deepEqual(state.getRollupRefreshSnapshot(), {
    pendingCount: 0,
    runningCount: 2,
    retryCount: 0,
    oldestPendingAgeMs: 0,
  });
  assert.ok(state.getLastRollupRefreshSnapshotAt() > 0);
});

test("runtime monitor sync state appends intelligence history and deduplicates alert sync", async () => {
  const evaluations: Array<{ snapshotScore: number; historyPoints: number }> = [];
  const syncedAlerts: string[] = [];
  const state = createRuntimeMonitorSyncState({
    apiDebugLogs: false,
    evaluateSystem: async (snapshot, history) => {
      evaluations.push({
        snapshotScore: snapshot.score,
        historyPoints: history.cpuPercent.length,
      });
      return { score: snapshot.score, mode: snapshot.mode } as any;
    },
    syncAlertHistory: async (_snapshot, alerts) => {
      syncedAlerts.push(alerts.map((alert) => alert.id).join(","));
    },
  });

  const computeSnapshot = () => createSnapshot();

  await state.runIntelligenceCycle(computeSnapshot);
  await state.syncAlertHistoryIfNeeded(computeSnapshot);
  await state.syncAlertHistoryIfNeeded(computeSnapshot);

  assert.deepEqual(evaluations, [{ snapshotScore: 92, historyPoints: 1 }]);
  assert.equal(state.getIntelligenceHistory().cpuPercent.length, 1);
  assert.equal(syncedAlerts.length, 1);
  assert.ok(state.getLastIntelligenceEvaluationAt() > 0);
  assert.ok(state.getLastAlertHistorySyncAt() > 0);
});

test("runtime monitor sync state exposes stable empty helpers", () => {
  assert.deepEqual(createEmptyRuntimeRollupRefreshSnapshot(), {
    pendingCount: 0,
    runningCount: 0,
    retryCount: 0,
    oldestPendingAgeMs: 0,
  });
  assert.deepEqual(createRuntimeIntelligenceHistory(), {
    cpuPercent: [],
    p95LatencyMs: [],
    dbLatencyMs: [],
    errorRate: [],
    aiLatencyMs: [],
    queueSize: [],
    ramPercent: [],
    requestRate: [],
    workerCount: [],
  });
});
