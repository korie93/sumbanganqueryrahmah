import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";
import { logger } from "../lib/logger";
import { hasPgPoolPressure } from "../db-pool-monitor";
import { CircuitBreaker } from "./circuitBreaker";
import {
  createRuntimeControlStateManager,
} from "./runtime-monitor-control-state";
import {
  resolveRuntimeMonitorTaskIntervalMs,
  shouldRunRuntimeMonitorTask,
} from "./runtime-monitor-cadence";
import { createRuntimeRequestTracker } from "./runtime-monitor-request-tracker";
import type {
  SystemHistory,
  SystemSnapshot,
} from "../intelligence/types";
import {
  isControlStateMessage,
  isGracefulShutdownMessage,
  type WorkerControlState,
} from "./worker-ipc";
import { buildInternalMonitorAlerts } from "./runtime-monitor-alerts";
import {
  clamp,
  sendWorkerMessage,
} from "./runtime-monitor-metrics";
import {
  appendCappedHistoryValue,
  buildRuntimeAlertHistorySignature,
  buildInternalRuntimeMonitorSnapshot,
  buildWorkerMetricsPayload,
  calculateRuntimeCpuPercent,
  normalizeRuntimeRollupRefreshSnapshot,
  toRuntimeIntelligenceSnapshot,
} from "./runtime-monitor-manager-utils";
import type {
  AttachProcessHandlersOptions,
  GcCapableGlobal,
  InternalMonitorSnapshot,
  IpcCapableProcess,
  LocalCircuitSnapshots,
  RuntimeMonitorManagerOptions,
  StartRuntimeLoopsOptions,
} from "./runtime-monitor-types";

export type { WorkerControlState } from "./worker-ipc";
export type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
} from "./runtime-monitor-types";

const MAX_INTELLIGENCE_HISTORY = 300;
const EMPTY_ROLLUP_REFRESH_SNAPSHOT = {
  pendingCount: 0,
  runningCount: 0,
  retryCount: 0,
  oldestPendingAgeMs: 0,
};
const ipcProcess = process as IpcCapableProcess;
const runtimeGlobal = globalThis as GcCapableGlobal;

export function createRuntimeMonitorManager(options: RuntimeMonitorManagerOptions) {
  let lastCpuUsage = process.cpuUsage();
  let lastCpuTs = Date.now();
  let cpuPercent = 0;
  let intelligenceInFlight = false;
  let lastPgPoolWarningAt = 0;
  let lastPgPoolWarningSignature = "";
  let rollupRefreshSnapshot = {
    ...EMPTY_ROLLUP_REFRESH_SNAPSHOT,
  };
  let alertHistorySyncInFlight = false;
  let lastRollupRefreshSnapshotAt = 0;
  let lastAlertHistorySyncAt = 0;
  let lastIntelligenceEvaluationAt = 0;
  let lastAlertHistorySignature = "";
  let alertHistorySyncInitialized = false;
  const rollupRefreshSnapshotIntervalMs = resolveRuntimeMonitorTaskIntervalMs("rollupRefreshSnapshot", {
    lowMemoryMode: options.lowMemoryMode,
  });
  const alertHistorySyncIntervalMs = resolveRuntimeMonitorTaskIntervalMs("alertHistorySync", {
    lowMemoryMode: options.lowMemoryMode,
  });
  const intelligenceEvaluationIntervalMs = resolveRuntimeMonitorTaskIntervalMs("intelligenceEvaluation", {
    lowMemoryMode: options.lowMemoryMode,
  });

  const intelligenceHistory: SystemHistory = {
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

  const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();

  const circuitAi = new CircuitBreaker({
    name: "ai",
    threshold: 0.4,
    minRequests: 10,
    cooldownMs: 8000,
  });
  const circuitDb = new CircuitBreaker({
    name: "db",
    threshold: 0.35,
    minRequests: 20,
    cooldownMs: 12000,
  });
  const circuitExport = new CircuitBreaker({
    name: "export",
    threshold: 0.4,
    minRequests: 8,
    cooldownMs: 15000,
  });
  const requestTracker = createRuntimeRequestTracker({
    latencyWindow: 400,
    aiLatencyStaleAfterMs: options.aiLatencyStaleAfterMs,
    aiLatencyDecayHalfLifeMs: options.aiLatencyDecayHalfLifeMs,
  });
  const controlStateManager = createRuntimeControlStateManager({
    lowMemoryMode: options.lowMemoryMode,
    getLastDbLatencyMs: requestTracker.getLastDbLatencyMs,
  });

  let gcObserver: PerformanceObserver | null = null;
  let gcObserverAttached = false;
  let processHandlersAttached = false;
  let runtimeLoopHandle: NodeJS.Timeout | null = null;

  function getEventLoopLagMs(): number {
    const lagMs = Number(eventLoopHistogram.mean) / 1_000_000;
    return Number.isFinite(lagMs) ? lagMs : 0;
  }

  function maybeWarnPgPoolPressure(source: string) {
    const total = Number(options.pool.totalCount || 0);
    const idle = Number(options.pool.idleCount || 0);
    const waiting = Number(options.pool.waitingCount || 0);
    const max = Number(options.pool.options?.max || 0);
    const hasPressure = hasPgPoolPressure({
      total,
      idle,
      waiting,
      max,
    });

    if (!hasPressure) {
      lastPgPoolWarningSignature = "";
      return;
    }

    const signature = `${total}:${idle}:${waiting}:${max}`;
    const now = Date.now();
    if (
      signature === lastPgPoolWarningSignature &&
      now - lastPgPoolWarningAt < options.pgPoolWarnCooldownMs
    ) {
      return;
    }

    lastPgPoolWarningAt = now;
    lastPgPoolWarningSignature = signature;
    logger.warn("PostgreSQL pool pressure detected", { total, idle, waiting, max, source });
  }

  async function withDbCircuit<T>(operation: () => Promise<T>): Promise<T> {
    return circuitDb.execute(async () => {
      const start = Date.now();
      try {
        return await operation();
      } finally {
        requestTracker.observeDbLatency(Date.now() - start);
        maybeWarnPgPoolPressure("db-circuit");
      }
    });
  }

  async function withAiCircuit<T>(operation: () => Promise<T>): Promise<T> {
    return circuitAi.execute(async () => {
      const start = Date.now();
      try {
        return await operation();
      } finally {
        requestTracker.observeAiLatency(Date.now() - start);
      }
    });
  }

  async function withExportCircuit<T>(operation: () => Promise<T>): Promise<T> {
    return circuitExport.execute(operation);
  }

  function getControlState(): WorkerControlState {
    return controlStateManager.getControlState();
  }

  function getDbProtection(): boolean {
    return controlStateManager.getDbProtection();
  }

  function applyControlState(payload: Partial<WorkerControlState>) {
    controlStateManager.applyControlState(payload);
  }

  async function refreshCollectionRollupRefreshQueueSnapshot(): Promise<void> {
    if (!options.getCollectionRollupRefreshQueueSnapshot) {
      return;
    }

    try {
      const nextSnapshot = await options.getCollectionRollupRefreshQueueSnapshot();
      rollupRefreshSnapshot = normalizeRuntimeRollupRefreshSnapshot(nextSnapshot);
      lastRollupRefreshSnapshotAt = Date.now();
    } catch (error) {
      if (options.apiDebugLogs) {
        logger.warn("Collection rollup queue snapshot refresh failed", { error });
      }
    }
  }

  function computeInternalMonitorSnapshot(): InternalMonitorSnapshot {
    const controlState = controlStateManager.getControlState();
    const workerSamples = controlState.workers || [];
    const maxWorkerP95 = workerSamples.reduce(
      (max, worker) => Math.max(max, Number(worker.latencyP95Ms || 0)),
      0,
    );
    const p95LatencyMs = Math.max(requestTracker.getLatencyP95(), maxWorkerP95);
    const slowQueryCount = workerSamples.filter(
      (worker) => Number(worker.dbLatencyMs || 0) > 600,
    ).length;

    const aiFailureRate = clamp(circuitAi.getSnapshot().failureRate * 100, 0, 100);
    const dbFailureRate = clamp(circuitDb.getSnapshot().failureRate * 100, 0, 100);
    const exportFailureRate = clamp(circuitExport.getSnapshot().failureRate * 100, 0, 100);
    const errorRate = Math.max(aiFailureRate, dbFailureRate, exportFailureRate);

    const localOpenCircuitCount = [
      circuitAi.getState(),
      circuitDb.getState(),
      circuitExport.getState(),
    ].filter((state) => state === "OPEN").length;
    const clusterOpenCircuitCount =
      Number(controlState.circuits?.aiOpenWorkers || 0)
      + Number(controlState.circuits?.dbOpenWorkers || 0)
      + Number(controlState.circuits?.exportOpenWorkers || 0);

    return buildInternalRuntimeMonitorSnapshot({
      activeRequests: requestTracker.getActiveRequests(),
      aiFailureRate,
      aiLatencyMs: requestTracker.getEffectiveAiLatencyMs(),
      clusterOpenCircuitCount,
      controlState,
      cpuPercent,
      dbConnections: Math.max(
        0,
        Number(options.pool.totalCount || 0) + Number(options.pool.waitingCount || 0),
      ),
      dbLatencyMs: requestTracker.getLastDbLatencyMs(),
      dbProtection: getDbProtection(),
      errorRate,
      eventLoopLagMs: getEventLoopLagMs(),
      localOpenCircuitCount,
      p95LatencyMs,
      queueLength: options.getSearchQueueLength(),
      requestRate: requestTracker.getRequestRate(),
      rollupRefreshSnapshot,
      slowQueryCount,
      ...requestTracker.getStatusCounts(),
    });
  }

  function appendIntelligenceValue(key: keyof SystemHistory, value: number) {
    appendCappedHistoryValue(intelligenceHistory[key], value, MAX_INTELLIGENCE_HISTORY);
  }

  function toIntelligenceSnapshot(snapshot: InternalMonitorSnapshot): SystemSnapshot {
    return toRuntimeIntelligenceSnapshot(snapshot);
  }

  async function runIntelligenceCycle() {
    if (intelligenceInFlight) return;
    intelligenceInFlight = true;
    try {
      const monitorSnapshot = computeInternalMonitorSnapshot();
      const snapshot = toIntelligenceSnapshot(monitorSnapshot);

      appendIntelligenceValue("cpuPercent", snapshot.cpuPercent);
      appendIntelligenceValue("p95LatencyMs", snapshot.p95LatencyMs);
      appendIntelligenceValue("dbLatencyMs", snapshot.dbLatencyMs);
      appendIntelligenceValue("errorRate", snapshot.errorRate);
      appendIntelligenceValue("aiLatencyMs", snapshot.aiLatencyMs);
      appendIntelligenceValue("queueSize", snapshot.queueSize);
      appendIntelligenceValue("ramPercent", snapshot.ramPercent);
      appendIntelligenceValue("requestRate", snapshot.requestRate);
      appendIntelligenceValue("workerCount", snapshot.workerCount);

      await options.evaluateSystem(snapshot, intelligenceHistory);
    } catch (err) {
      if (options.apiDebugLogs) {
        logger.warn("Intelligence cycle error", { error: err });
      }
    } finally {
      lastIntelligenceEvaluationAt = Date.now();
      intelligenceInFlight = false;
    }
  }

  async function syncAlertHistoryIfNeeded(): Promise<void> {
    if (!options.syncAlertHistory || alertHistorySyncInFlight) {
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
      await options.syncAlertHistory(snapshot, alerts, new Date());
      lastAlertHistorySignature = nextSignature;
      lastAlertHistorySyncAt = Date.now();
      alertHistorySyncInitialized = true;
    } catch (err) {
      if (options.apiDebugLogs) {
        logger.warn("Monitor alert history sync failed", { error: err });
      }
    } finally {
      alertHistorySyncInFlight = false;
    }
  }

  function getRequestRate(): number {
    return requestTracker.getRequestRate();
  }

  function getLatencyP95(): number {
    return requestTracker.getLatencyP95();
  }

  function getLocalCircuitSnapshots(): LocalCircuitSnapshots {
    return {
      ai: circuitAi.getSnapshot(),
      db: circuitDb.getSnapshot(),
      export: circuitExport.getSnapshot(),
    };
  }

  function recordGcEntries(entryCount: number) {
    requestTracker.recordGcEntries(entryCount);
  }

  function recordRequestStarted() {
    requestTracker.recordRequestStarted();
  }

  function recordRequestFinished(elapsedMs: number, statusCode = 0) {
    requestTracker.recordRequestFinished(elapsedMs, statusCode);
  }

  function attachGcObserver() {
    if (gcObserverAttached) return;
    gcObserverAttached = true;

    try {
      gcObserver = new PerformanceObserver((list) => {
        recordGcEntries(list.getEntries().length);
      });
      gcObserver.observe({ entryTypes: ["gc"] });
    } catch {
      // GC observer is best-effort only.
    }
  }

  function attachProcessMessageHandlers({ onGracefulShutdown }: AttachProcessHandlersOptions) {
    if (processHandlersAttached || typeof process.on !== "function") {
      return;
    }

    processHandlersAttached = true;

    process.on("message", (message: unknown) => {
      if (!isControlStateMessage(message)) return;
      applyControlState(message.payload);
    });

    process.on("message", (message: unknown) => {
      if (!isGracefulShutdownMessage(message)) return;
      setTimeout(() => {
        onGracefulShutdown();
      }, 50);
    });
  }

  function startRuntimeLoops({ clearSearchCache }: StartRuntimeLoopsOptions) {
    if (runtimeLoopHandle) return;

    runtimeLoopHandle = setInterval(() => {
      requestTracker.rollFiveSecondWindow();

      const now = Date.now();
      const currentCpu = process.cpuUsage();
      const cpuDeltaMicros = (currentCpu.user - lastCpuUsage.user) + (currentCpu.system - lastCpuUsage.system);
      const elapsedMs = Math.max(1, now - lastCpuTs);
      const controlState = controlStateManager.getControlState();
      cpuPercent = calculateRuntimeCpuPercent({
        cpuDeltaMicros,
        elapsedMs,
        workerCount: controlState.workerCount || 1,
      });
      lastCpuUsage = currentCpu;
      lastCpuTs = now;

      if (typeof ipcProcess.send === "function") {
        const mem = process.memoryUsage();
        sendWorkerMessage(ipcProcess, {
          type: "worker-metrics",
          payload: buildWorkerMetricsPayload({
            activeRequests: requestTracker.getActiveRequests(),
            aiFailureRate: circuitAi.getSnapshot().failureRate,
            aiLatencyMs: requestTracker.getEffectiveAiLatencyMs(),
            aiState: circuitAi.getState(),
            cpuPercent,
            dbFailureRate: circuitDb.getSnapshot().failureRate,
            dbLatencyMs: requestTracker.getLastDbLatencyMs(),
            dbState: circuitDb.getState(),
            eventLoopLagMs: getEventLoopLagMs(),
            exportFailureRate: circuitExport.getSnapshot().failureRate,
            exportState: circuitExport.getState(),
            gcPerMinute: requestTracker.getGcPerMinute(),
            heapTotalMB: mem.heapTotal / (1024 * 1024),
            heapUsedMB: mem.heapUsed / (1024 * 1024),
            latencyP95Ms: requestTracker.getLatencyP95(),
            pid: process.pid,
            queueLength: options.getSearchQueueLength(),
            requestRate: requestTracker.getRequestRate(),
            timestamp: Date.now(),
            workerId: Number(process.env.NODE_UNIQUE_ID || 0),
          }),
        });
      }

      const mem = process.memoryUsage();
      const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;
      if (heapRatio > 0.88) {
        clearSearchCache();
        sendWorkerMessage(ipcProcess, { type: "worker-event", payload: { kind: "memory-pressure" } });
        if (typeof runtimeGlobal.gc === "function" && requestTracker.getActiveRequests() === 0) {
          try {
            runtimeGlobal.gc();
          } catch {
            // noop
          }
        }
      }

      const taskNow = Date.now();
      if (shouldRunRuntimeMonitorTask({
        lastRunAt: lastRollupRefreshSnapshotAt,
        now: taskNow,
        intervalMs: rollupRefreshSnapshotIntervalMs,
      })) {
        void refreshCollectionRollupRefreshQueueSnapshot();
      }
      if (shouldRunRuntimeMonitorTask({
        lastRunAt: lastAlertHistorySyncAt,
        now: taskNow,
        intervalMs: alertHistorySyncIntervalMs,
      })) {
        void syncAlertHistoryIfNeeded();
      }
      if (shouldRunRuntimeMonitorTask({
        lastRunAt: lastIntelligenceEvaluationAt,
        now: taskNow,
        intervalMs: intelligenceEvaluationIntervalMs,
      })) {
        void runIntelligenceCycle();
      }
    }, 5_000);

    runtimeLoopHandle.unref();
    void refreshCollectionRollupRefreshQueueSnapshot();
    void syncAlertHistoryIfNeeded();
    void runIntelligenceCycle();
  }

  return {
    attachGcObserver,
    attachProcessMessageHandlers,
    buildInternalMonitorAlerts,
    computeInternalMonitorSnapshot,
    getControlState,
    getDbProtection,
    getLatencyP95,
    getLocalCircuitSnapshots,
    getRequestRate,
    recordRequestFinished,
    recordRequestStarted,
    startRuntimeLoops,
    withAiCircuit,
    withDbCircuit,
    withExportCircuit,
  };
}
