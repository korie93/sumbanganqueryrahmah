import { logger } from "../lib/logger";
import type { SystemHistory, SystemSnapshot } from "../intelligence/types";
import { buildInternalMonitorAlerts } from "./runtime-monitor-alerts";
import {
  appendCappedHistoryValue,
  buildRuntimeAlertHistorySignature,
  normalizeRuntimeRollupRefreshSnapshot,
  toRuntimeIntelligenceSnapshot,
} from "./runtime-monitor-manager-utils";
import type { InternalMonitorSnapshot, RuntimeMonitorManagerOptions } from "./runtime-monitor-types";

const MAX_INTELLIGENCE_HISTORY = 300;

export type RuntimeRollupRefreshSnapshot = {
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
};

export function createEmptyRuntimeRollupRefreshSnapshot(): RuntimeRollupRefreshSnapshot {
  return {
    pendingCount: 0,
    runningCount: 0,
    retryCount: 0,
    oldestPendingAgeMs: 0,
  };
}

export function createRuntimeIntelligenceHistory(): SystemHistory {
  return {
    cpuPercent: [],
    p95LatencyMs: [],
    dbLatencyMs: [],
    errorRate: [],
    aiLatencyMs: [],
    queueSize: [],
    ramPercent: [],
    requestRate: [],
    workerCount: [],
  };
}

function appendRuntimeIntelligenceSnapshot(history: SystemHistory, snapshot: SystemSnapshot) {
  appendCappedHistoryValue(history.cpuPercent, snapshot.cpuPercent, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.p95LatencyMs, snapshot.p95LatencyMs, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.dbLatencyMs, snapshot.dbLatencyMs, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.errorRate, snapshot.errorRate, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.aiLatencyMs, snapshot.aiLatencyMs, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.queueSize, snapshot.queueSize, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.ramPercent, snapshot.ramPercent, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.requestRate, snapshot.requestRate, MAX_INTELLIGENCE_HISTORY);
  appendCappedHistoryValue(history.workerCount, snapshot.workerCount, MAX_INTELLIGENCE_HISTORY);
}

type CreateRuntimeMonitorSyncStateOptions = {
  apiDebugLogs: boolean;
  evaluateSystem: RuntimeMonitorManagerOptions["evaluateSystem"];
  getCollectionRollupRefreshQueueSnapshot?: RuntimeMonitorManagerOptions["getCollectionRollupRefreshQueueSnapshot"];
  syncAlertHistory?: RuntimeMonitorManagerOptions["syncAlertHistory"];
};

export function createRuntimeMonitorSyncState({
  apiDebugLogs,
  evaluateSystem,
  getCollectionRollupRefreshQueueSnapshot,
  syncAlertHistory,
}: CreateRuntimeMonitorSyncStateOptions) {
  let intelligenceInFlight = false;
  let rollupRefreshSnapshot = createEmptyRuntimeRollupRefreshSnapshot();
  let alertHistorySyncInFlight = false;
  let lastRollupRefreshSnapshotAt = 0;
  let lastAlertHistorySyncAt = 0;
  let lastIntelligenceEvaluationAt = 0;
  let lastAlertHistorySignature = "";
  let alertHistorySyncInitialized = false;

  const intelligenceHistory = createRuntimeIntelligenceHistory();

  function getRollupRefreshSnapshot() {
    return rollupRefreshSnapshot;
  }

  function getIntelligenceHistory() {
    return intelligenceHistory;
  }

  function getLastRollupRefreshSnapshotAt() {
    return lastRollupRefreshSnapshotAt;
  }

  function getLastAlertHistorySyncAt() {
    return lastAlertHistorySyncAt;
  }

  function getLastIntelligenceEvaluationAt() {
    return lastIntelligenceEvaluationAt;
  }

  async function refreshCollectionRollupRefreshQueueSnapshot(): Promise<void> {
    if (!getCollectionRollupRefreshQueueSnapshot) {
      return;
    }

    try {
      const nextSnapshot = await getCollectionRollupRefreshQueueSnapshot();
      rollupRefreshSnapshot = normalizeRuntimeRollupRefreshSnapshot(nextSnapshot);
      lastRollupRefreshSnapshotAt = Date.now();
    } catch (error) {
      if (apiDebugLogs) {
        logger.warn("Collection rollup queue snapshot refresh failed", { error });
      }
    }
  }

  async function runIntelligenceCycle(
    computeInternalMonitorSnapshot: () => InternalMonitorSnapshot,
  ) {
    if (intelligenceInFlight) return;
    intelligenceInFlight = true;
    try {
      const monitorSnapshot = computeInternalMonitorSnapshot();
      const snapshot = toRuntimeIntelligenceSnapshot(monitorSnapshot);
      appendRuntimeIntelligenceSnapshot(intelligenceHistory, snapshot);
      await evaluateSystem(snapshot, intelligenceHistory);
    } catch (err) {
      if (apiDebugLogs) {
        logger.warn("Intelligence cycle error", { error: err });
      }
    } finally {
      lastIntelligenceEvaluationAt = Date.now();
      intelligenceInFlight = false;
    }
  }

  async function syncAlertHistoryIfNeeded(
    computeInternalMonitorSnapshot: () => InternalMonitorSnapshot,
  ): Promise<void> {
    if (!syncAlertHistory || alertHistorySyncInFlight) {
      return;
    }

    alertHistorySyncInFlight = true;
    try {
      const snapshot = computeInternalMonitorSnapshot();
      const alerts = buildInternalMonitorAlerts(snapshot);
      const nextSignature = buildRuntimeAlertHistorySignature(alerts);
      if (alertHistorySyncInitialized && nextSignature === lastAlertHistorySignature) {
        lastAlertHistorySyncAt = Date.now();
        return;
      }
      await syncAlertHistory(snapshot, alerts, new Date());
      lastAlertHistorySignature = nextSignature;
      lastAlertHistorySyncAt = Date.now();
      alertHistorySyncInitialized = true;
    } catch (err) {
      if (apiDebugLogs) {
        logger.warn("Monitor alert history sync failed", { error: err });
      }
    } finally {
      alertHistorySyncInFlight = false;
    }
  }

  return {
    getIntelligenceHistory,
    getLastAlertHistorySyncAt,
    getLastIntelligenceEvaluationAt,
    getLastRollupRefreshSnapshotAt,
    getRollupRefreshSnapshot,
    refreshCollectionRollupRefreshQueueSnapshot,
    runIntelligenceCycle,
    syncAlertHistoryIfNeeded,
  };
}
