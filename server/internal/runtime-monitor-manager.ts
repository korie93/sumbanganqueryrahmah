import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";
import {
  createRuntimeControlStateManager,
} from "./runtime-monitor-control-state";
import {
  resolveRuntimeMonitorTaskIntervalMs,
  shouldRunRuntimeMonitorTask,
} from "./runtime-monitor-cadence";
import { createRuntimeRequestTracker } from "./runtime-monitor-request-tracker";
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
  buildInternalRuntimeMonitorSnapshot,
  buildWorkerMetricsPayload,
  calculateRuntimeCpuPercent,
} from "./runtime-monitor-manager-utils";
import { createRuntimeMonitorCircuitRuntime } from "./runtime-monitor-circuit-runtime";
import {
  createRuntimeMonitorSyncState,
  createEmptyRuntimeRollupRefreshSnapshot,
} from "./runtime-monitor-sync-state";
import type {
  AttachProcessHandlersOptions,
  GcCapableGlobal,
  InternalMonitorSnapshot,
  IpcCapableProcess,
  RuntimeMonitorManagerOptions,
  StartRuntimeLoopsOptions,
} from "./runtime-monitor-types";

export type { WorkerControlState } from "./worker-ipc";
export type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
} from "./runtime-monitor-types";

const ipcProcess = process as IpcCapableProcess;
const runtimeGlobal = globalThis as GcCapableGlobal;

export function createRuntimeMonitorManager(options: RuntimeMonitorManagerOptions) {
  let lastCpuUsage = process.cpuUsage();
  let lastCpuTs = Date.now();
  let cpuPercent = 0;
  let rollupRefreshSnapshot = createEmptyRuntimeRollupRefreshSnapshot();
  const rollupRefreshSnapshotIntervalMs = resolveRuntimeMonitorTaskIntervalMs("rollupRefreshSnapshot", {
    lowMemoryMode: options.lowMemoryMode,
  });
  const alertHistorySyncIntervalMs = resolveRuntimeMonitorTaskIntervalMs("alertHistorySync", {
    lowMemoryMode: options.lowMemoryMode,
  });
  const intelligenceEvaluationIntervalMs = resolveRuntimeMonitorTaskIntervalMs("intelligenceEvaluation", {
    lowMemoryMode: options.lowMemoryMode,
  });

  const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();
  const requestTracker = createRuntimeRequestTracker({
    latencyWindow: 400,
    aiLatencyStaleAfterMs: options.aiLatencyStaleAfterMs,
    aiLatencyDecayHalfLifeMs: options.aiLatencyDecayHalfLifeMs,
  });
  const circuitRuntime = createRuntimeMonitorCircuitRuntime({
    pool: options.pool,
    pgPoolWarnCooldownMs: options.pgPoolWarnCooldownMs,
    observeDbLatency: requestTracker.observeDbLatency,
    observeAiLatency: requestTracker.observeAiLatency,
  });
  const syncState = createRuntimeMonitorSyncState({
    apiDebugLogs: options.apiDebugLogs,
    evaluateSystem: options.evaluateSystem,
    getCollectionRollupRefreshQueueSnapshot: options.getCollectionRollupRefreshQueueSnapshot,
    syncAlertHistory: options.syncAlertHistory,
  });
  const controlStateManager = createRuntimeControlStateManager({
    lowMemoryMode: options.lowMemoryMode,
    getLastDbLatencyMs: requestTracker.getLastDbLatencyMs,
  });

  let gcObserver: PerformanceObserver | null = null;
  let gcObserverAttached = false;
  let processHandlersAttached = false;
  let processControlStateHandler: ((message: unknown) => void) | null = null;
  let processGracefulShutdownHandler: ((message: unknown) => void) | null = null;
  let runtimeLoopHandle: NodeJS.Timeout | null = null;
  let stopped = false;

  function getEventLoopLagMs(): number {
    const lagMs = Number(eventLoopHistogram.mean) / 1_000_000;
    return Number.isFinite(lagMs) ? lagMs : 0;
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

  function computeInternalMonitorSnapshot(): InternalMonitorSnapshot {
    const controlState = controlStateManager.getControlState();
    const circuitState = circuitRuntime.getCircuitState();
    const workerSamples = controlState.workers || [];
    const maxWorkerP95 = workerSamples.reduce(
      (max, worker) => Math.max(max, Number(worker.latencyP95Ms || 0)),
      0,
    );
    const p95LatencyMs = Math.max(requestTracker.getLatencyP95(), maxWorkerP95);
    const slowQueryCount = workerSamples.filter(
      (worker) => Number(worker.dbLatencyMs || 0) > 600,
    ).length;

    const aiFailureRate = clamp(circuitState.aiSnapshot.failureRate * 100, 0, 100);
    const dbFailureRate = clamp(circuitState.dbSnapshot.failureRate * 100, 0, 100);
    const exportFailureRate = clamp(circuitState.exportSnapshot.failureRate * 100, 0, 100);
    const errorRate = Math.max(aiFailureRate, dbFailureRate, exportFailureRate);

    const localOpenCircuitCount = [
      circuitState.aiState,
      circuitState.dbState,
      circuitState.exportState,
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

  function getRequestRate(): number {
    return requestTracker.getRequestRate();
  }

  function getLatencyP95(): number {
    return requestTracker.getLatencyP95();
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
    stopped = false;
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
    stopped = false;
    if (processHandlersAttached || typeof process.on !== "function") {
      return;
    }

    processHandlersAttached = true;

    processControlStateHandler = (message: unknown) => {
      if (!isControlStateMessage(message)) return;
      applyControlState(message.payload);
    };

    processGracefulShutdownHandler = (message: unknown) => {
      if (!isGracefulShutdownMessage(message)) return;
      setTimeout(() => {
        onGracefulShutdown();
      }, 50);
    };

    process.on("message", processControlStateHandler);
    process.on("message", processGracefulShutdownHandler);
  }

  function startRuntimeLoops({ clearSearchCache }: StartRuntimeLoopsOptions) {
    stopped = false;
    eventLoopHistogram.enable();
    if (runtimeLoopHandle) return;

    runtimeLoopHandle = setInterval(() => {
      if (stopped) {
        return;
      }
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
        const circuitState = circuitRuntime.getCircuitState();
        sendWorkerMessage(ipcProcess, {
          type: "worker-metrics",
          payload: buildWorkerMetricsPayload({
            activeRequests: requestTracker.getActiveRequests(),
            aiFailureRate: circuitState.aiSnapshot.failureRate,
            aiLatencyMs: requestTracker.getEffectiveAiLatencyMs(),
            aiState: circuitState.aiState,
            cpuPercent,
            dbFailureRate: circuitState.dbSnapshot.failureRate,
            dbLatencyMs: requestTracker.getLastDbLatencyMs(),
            dbState: circuitState.dbState,
            eventLoopLagMs: getEventLoopLagMs(),
            exportFailureRate: circuitState.exportSnapshot.failureRate,
            exportState: circuitState.exportState,
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
        lastRunAt: syncState.getLastRollupRefreshSnapshotAt(),
        now: taskNow,
        intervalMs: rollupRefreshSnapshotIntervalMs,
      })) {
        void syncState.refreshCollectionRollupRefreshQueueSnapshot();
      }
      if (shouldRunRuntimeMonitorTask({
        lastRunAt: syncState.getLastAlertHistorySyncAt(),
        now: taskNow,
        intervalMs: alertHistorySyncIntervalMs,
      })) {
        void syncState.syncAlertHistoryIfNeeded(computeInternalMonitorSnapshot);
      }
      if (shouldRunRuntimeMonitorTask({
        lastRunAt: syncState.getLastIntelligenceEvaluationAt(),
        now: taskNow,
        intervalMs: intelligenceEvaluationIntervalMs,
      })) {
        void syncState.runIntelligenceCycle(computeInternalMonitorSnapshot);
      }
    }, 5_000);

    runtimeLoopHandle.unref();
    void syncState.refreshCollectionRollupRefreshQueueSnapshot();
    void syncState.syncAlertHistoryIfNeeded(computeInternalMonitorSnapshot);
    void syncState.runIntelligenceCycle(computeInternalMonitorSnapshot);
  }

  function stop() {
    stopped = true;

    if (runtimeLoopHandle) {
      clearInterval(runtimeLoopHandle);
      runtimeLoopHandle = null;
    }

    if (gcObserver) {
      gcObserver.disconnect();
      gcObserver = null;
    }
    gcObserverAttached = false;
    eventLoopHistogram.disable();

    if (processHandlersAttached && typeof process.off === "function") {
      if (processControlStateHandler) {
        process.off("message", processControlStateHandler);
      }
      if (processGracefulShutdownHandler) {
        process.off("message", processGracefulShutdownHandler);
      }
    }
    processHandlersAttached = false;
    processControlStateHandler = null;
    processGracefulShutdownHandler = null;
  }

  return {
    attachGcObserver,
    attachProcessMessageHandlers,
    buildInternalMonitorAlerts,
    computeInternalMonitorSnapshot,
    getControlState,
    getDbProtection,
    getLatencyP95,
    getLocalCircuitSnapshots: circuitRuntime.getLocalCircuitSnapshots,
    getRequestRate,
    recordRequestFinished,
    recordRequestStarted,
    startRuntimeLoops,
    stop,
    withAiCircuit: circuitRuntime.withAiCircuit,
    withDbCircuit: circuitRuntime.withDbCircuit,
    withExportCircuit: circuitRuntime.withExportCircuit,
  };
}
