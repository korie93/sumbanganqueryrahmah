import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";
import { logger } from "../lib/logger";
import { hasPgPoolPressure } from "../db-pool-monitor";
import { CircuitBreaker } from "./circuitBreaker";
import {
  resolveRuntimeMonitorTaskIntervalMs,
  shouldRunRuntimeMonitorTask,
} from "./runtime-monitor-cadence";
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
  getRamPercent,
  percentile,
  roundMetric,
  sendWorkerMessage,
} from "./runtime-monitor-metrics";
import type {
  AttachProcessHandlersOptions,
  GcCapableGlobal,
  InternalMonitorSnapshot,
  IpcCapableProcess,
  LocalCircuitSnapshots,
  PoolWithOptions,
  RuntimeMonitorManagerOptions,
  StartRuntimeLoopsOptions,
} from "./runtime-monitor-types";

export type { WorkerControlState } from "./worker-ipc";
export type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
} from "./runtime-monitor-types";

const LATENCY_WINDOW = 400;
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
  const defaultControlState: WorkerControlState = {
    mode: "NORMAL",
    healthScore: 100,
    dbProtection: false,
    rejectHeavyRoutes: false,
    throttleFactor: 1,
    predictor: {
      requestRateMA: 0,
      latencyMA: 0,
      cpuMA: 0,
      requestRateTrend: 0,
      latencyTrend: 0,
      cpuTrend: 0,
      sustainedUpward: false,
      lastUpdatedAt: null,
    },
    workerCount: 1,
    maxWorkers: 1,
    queueLength: 0,
    preAllocateMB: 0,
    updatedAt: Date.now(),
    workers: [],
    circuits: {
      aiOpenWorkers: 0,
      dbOpenWorkers: 0,
      exportOpenWorkers: 0,
    },
  };

  let controlState: WorkerControlState = defaultControlState;
  let preAllocatedBuffer: Buffer | null = null;

  let activeRequests = 0;
  const latencySamples: number[] = [];
  let requestCounter = 0;
  let reqRatePerSec = 0;
  let status401Window = 0;
  let status403Window = 0;
  let status429Window = 0;
  let status401Count = 0;
  let status403Count = 0;
  let status429Count = 0;
  let lastCpuUsage = process.cpuUsage();
  let lastCpuTs = Date.now();
  let cpuPercent = 0;
  let gcCountWindow = 0;
  let gcPerMinute = 0;
  let lastDbLatencyMs = 0;
  let lastAiLatencyMs = 0;
  let lastAiLatencyObservedAt = 0;
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

  let gcObserver: PerformanceObserver | null = null;
  let gcObserverAttached = false;
  let processHandlersAttached = false;
  let runtimeLoopHandle: NodeJS.Timeout | null = null;

  function getEventLoopLagMs(): number {
    const lagMs = Number(eventLoopHistogram.mean) / 1_000_000;
    return Number.isFinite(lagMs) ? lagMs : 0;
  }

  function recordLatency(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    latencySamples.push(ms);
    if (latencySamples.length > LATENCY_WINDOW) {
      latencySamples.splice(0, latencySamples.length - LATENCY_WINDOW);
    }
  }

  function observeDbLatency(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    if (lastDbLatencyMs <= 0) {
      lastDbLatencyMs = ms;
    } else {
      lastDbLatencyMs = (lastDbLatencyMs * 0.75) + (ms * 0.25);
    }
  }

  function observeAiLatency(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    if (lastAiLatencyMs <= 0) {
      lastAiLatencyMs = ms;
    } else {
      lastAiLatencyMs = (lastAiLatencyMs * 0.75) + (ms * 0.25);
    }
    lastAiLatencyObservedAt = Date.now();
  }

  function getEffectiveAiLatencyMs(now = Date.now()): number {
    if (!Number.isFinite(lastAiLatencyMs) || lastAiLatencyMs <= 0) return 0;
    if (lastAiLatencyObservedAt <= 0) return Math.max(0, lastAiLatencyMs);

    const idleMs = Math.max(0, now - lastAiLatencyObservedAt);
    if (idleMs <= options.aiLatencyStaleAfterMs) {
      return Math.max(0, lastAiLatencyMs);
    }

    const decayWindowMs = idleMs - options.aiLatencyStaleAfterMs;
    const decayFactor = Math.exp((-Math.LN2 * decayWindowMs) / options.aiLatencyDecayHalfLifeMs);
    return Math.max(0, lastAiLatencyMs * decayFactor);
  }

  function maybeWarnPgPoolPressure(source: string) {
    const total = Number(options.pool.totalCount || 0);
    const idle = Number(options.pool.idleCount || 0);
    const waiting = Number(options.pool.waitingCount || 0);
    const max = Number((options.pool as PoolWithOptions).options?.max || 0);
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
        observeDbLatency(Date.now() - start);
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
        observeAiLatency(Date.now() - start);
      }
    });
  }

  async function withExportCircuit<T>(operation: () => Promise<T>): Promise<T> {
    return circuitExport.execute(operation);
  }

  function getControlState(): WorkerControlState {
    return controlState;
  }

  function applyControlState(payload: Partial<WorkerControlState>) {
    controlState = {
      ...defaultControlState,
      ...payload,
    };

    const preAllocateMB = clamp(controlState.preAllocateMB, 0, options.lowMemoryMode ? 8 : 32);
    if (preAllocateMB > 0) {
      const targetBytes = preAllocateMB * 1024 * 1024;
      if (!preAllocatedBuffer || preAllocatedBuffer.length !== targetBytes) {
        preAllocatedBuffer = Buffer.alloc(targetBytes);
      }
    } else {
      preAllocatedBuffer = null;
    }
  }

  function getDbProtection(): boolean {
    return controlState.dbProtection || lastDbLatencyMs > 1000;
  }

  async function refreshCollectionRollupRefreshQueueSnapshot(): Promise<void> {
    if (!options.getCollectionRollupRefreshQueueSnapshot) {
      return;
    }

    try {
      const nextSnapshot = await options.getCollectionRollupRefreshQueueSnapshot();
      rollupRefreshSnapshot = {
        pendingCount: Math.max(0, Number(nextSnapshot?.pendingCount || 0)),
        runningCount: Math.max(0, Number(nextSnapshot?.runningCount || 0)),
        retryCount: Math.max(0, Number(nextSnapshot?.retryCount || 0)),
        oldestPendingAgeMs: Math.max(0, Number(nextSnapshot?.oldestPendingAgeMs || 0)),
      };
      lastRollupRefreshSnapshotAt = Date.now();
    } catch (error) {
      if (options.apiDebugLogs) {
        logger.warn("Collection rollup queue snapshot refresh failed", { error });
      }
    }
  }

  function computeInternalMonitorSnapshot(): InternalMonitorSnapshot {
    const workerSamples = controlState.workers || [];
    const maxWorkerP95 = workerSamples.reduce(
      (max, worker) => Math.max(max, Number(worker.latencyP95Ms || 0)),
      0,
    );
    const p95LatencyMs = Math.max(percentile(latencySamples, 95), maxWorkerP95);
    const slowQueryCount = workerSamples.filter(
      (worker) => Number(worker.dbLatencyMs || 0) > 600,
    ).length;

    const aiFailureRate = clamp(circuitAi.getSnapshot().failureRate * 100, 0, 100);
    const dbFailureRate = clamp(circuitDb.getSnapshot().failureRate * 100, 0, 100);
    const exportFailureRate = clamp(circuitExport.getSnapshot().failureRate * 100, 0, 100);
    const errorRate = Math.max(aiFailureRate, dbFailureRate, exportFailureRate);

    const cpu = roundMetric(cpuPercent, 2);
    const ram = getRamPercent();
    const dbLatency = roundMetric(lastDbLatencyMs, 2);
    const aiLatency = roundMetric(getEffectiveAiLatencyMs(), 2);
    const loopLag = roundMetric(getEventLoopLagMs(), 2);

    let bottleneckType = "NONE";
    const pressureScore = [
      { type: "CPU", score: cpu / 100 },
      { type: "RAM", score: ram / 100 },
      { type: "DB", score: dbLatency / 1200 },
      { type: "AI", score: aiLatency / 1500 },
      { type: "EVENT_LOOP", score: loopLag / 180 },
      { type: "ERRORS", score: errorRate / 10 },
    ].sort((a, b) => b.score - a.score)[0];

    if (pressureScore && pressureScore.score >= 0.5) {
      bottleneckType = pressureScore.type;
    }

    const localOpenCircuitCount = [
      circuitAi.getState(),
      circuitDb.getState(),
      circuitExport.getState(),
    ].filter((state) => state === "OPEN").length;
    const clusterOpenCircuitCount =
      Number(controlState.circuits?.aiOpenWorkers || 0)
      + Number(controlState.circuits?.dbOpenWorkers || 0)
      + Number(controlState.circuits?.exportOpenWorkers || 0);

    return {
      score: roundMetric(controlState.healthScore, 2),
      mode: controlState.mode,
      cpuPercent: cpu,
      ramPercent: ram,
      p95LatencyMs: roundMetric(p95LatencyMs, 2),
      errorRate: roundMetric(errorRate, 2),
      dbLatencyMs: dbLatency,
      aiLatencyMs: aiLatency,
      eventLoopLagMs: loopLag,
      requestRate: roundMetric(reqRatePerSec, 2),
      activeRequests,
      queueLength: options.getSearchQueueLength(),
      workerCount: controlState.workerCount,
      maxWorkers: controlState.maxWorkers,
      dbProtection: getDbProtection(),
      slowQueryCount,
      dbConnections: Math.max(
        0,
        Number(options.pool.totalCount || 0) + Number(options.pool.waitingCount || 0),
      ),
      aiFailRate: roundMetric(aiFailureRate, 2),
      status401Count,
      status403Count,
      status429Count,
      localOpenCircuitCount,
      clusterOpenCircuitCount,
      bottleneckType,
      rollupRefreshPendingCount: rollupRefreshSnapshot.pendingCount,
      rollupRefreshRunningCount: rollupRefreshSnapshot.runningCount,
      rollupRefreshRetryCount: rollupRefreshSnapshot.retryCount,
      rollupRefreshOldestPendingAgeMs: roundMetric(rollupRefreshSnapshot.oldestPendingAgeMs, 0),
      updatedAt: controlState.updatedAt,
    };
  }

  function appendIntelligenceValue(key: keyof SystemHistory, value: number) {
    if (!Number.isFinite(value)) return;
    const series = intelligenceHistory[key];
    series.push(value);
    if (series.length > MAX_INTELLIGENCE_HISTORY) {
      series.splice(0, series.length - MAX_INTELLIGENCE_HISTORY);
    }
  }

  function toIntelligenceSnapshot(snapshot: InternalMonitorSnapshot): SystemSnapshot {
    return {
      timestamp: snapshot.updatedAt || Date.now(),
      score: snapshot.score,
      mode: snapshot.mode,
      cpuPercent: snapshot.cpuPercent,
      ramPercent: snapshot.ramPercent,
      p95LatencyMs: snapshot.p95LatencyMs,
      errorRate: snapshot.errorRate,
      dbLatencyMs: snapshot.dbLatencyMs,
      aiLatencyMs: snapshot.aiLatencyMs,
      eventLoopLagMs: snapshot.eventLoopLagMs,
      requestRate: snapshot.requestRate,
      activeRequests: snapshot.activeRequests,
      queueSize: snapshot.queueLength,
      workerCount: snapshot.workerCount,
      maxWorkers: snapshot.maxWorkers,
      dbConnections: snapshot.dbConnections,
      aiFailRate: snapshot.aiFailRate,
      bottleneckType: snapshot.bottleneckType,
    };
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
      const nextSignature = alerts
        .map((alert) => `${alert.id}:${alert.severity}:${alert.message}`)
        .sort()
        .join("|");
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
    return reqRatePerSec;
  }

  function getLatencyP95(): number {
    return percentile(latencySamples, 95);
  }

  function getLocalCircuitSnapshots(): LocalCircuitSnapshots {
    return {
      ai: circuitAi.getSnapshot(),
      db: circuitDb.getSnapshot(),
      export: circuitExport.getSnapshot(),
    };
  }

  function recordGcEntries(entryCount: number) {
    if (entryCount > 0) {
      gcCountWindow += entryCount;
    }
  }

  function recordRequestStarted() {
    activeRequests += 1;
    requestCounter += 1;
  }

  function recordRequestFinished(elapsedMs: number, statusCode = 0) {
    activeRequests = Math.max(0, activeRequests - 1);
    recordLatency(elapsedMs);
    if (statusCode === 401) {
      status401Window += 1;
    } else if (statusCode === 403) {
      status403Window += 1;
    } else if (statusCode === 429) {
      status429Window += 1;
    }
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
      reqRatePerSec = requestCounter / 5;
      requestCounter = 0;
      status401Count = status401Window;
      status403Count = status403Window;
      status429Count = status429Window;
      status401Window = 0;
      status403Window = 0;
      status429Window = 0;
      gcPerMinute = gcCountWindow * 12;
      gcCountWindow = 0;

      const now = Date.now();
      const currentCpu = process.cpuUsage();
      const cpuDeltaMicros = (currentCpu.user - lastCpuUsage.user) + (currentCpu.system - lastCpuUsage.system);
      const elapsedMs = Math.max(1, now - lastCpuTs);
      const cpuCorePercent = ((cpuDeltaMicros / 1000) / elapsedMs) * 100;
      cpuPercent = clamp(cpuCorePercent / Math.max(1, controlState.workerCount || 1), 0, 100);
      lastCpuUsage = currentCpu;
      lastCpuTs = now;

      if (typeof ipcProcess.send === "function") {
        const mem = process.memoryUsage();
        sendWorkerMessage(ipcProcess, {
          type: "worker-metrics",
          payload: {
            workerId: Number(process.env.NODE_UNIQUE_ID || 0),
            pid: process.pid,
            cpuPercent,
            reqRate: reqRatePerSec,
            latencyP95Ms: percentile(latencySamples, 95),
            eventLoopLagMs: getEventLoopLagMs(),
            activeRequests,
            queueLength: options.getSearchQueueLength(),
            heapUsedMB: mem.heapUsed / (1024 * 1024),
            heapTotalMB: mem.heapTotal / (1024 * 1024),
            oldSpaceMB: mem.heapUsed / (1024 * 1024),
            gcPerMin: gcPerMinute,
            dbLatencyMs: lastDbLatencyMs,
            aiLatencyMs: getEffectiveAiLatencyMs(),
            ts: Date.now(),
            circuit: {
              ai: { state: circuitAi.getState(), failureRate: circuitAi.getSnapshot().failureRate },
              db: { state: circuitDb.getState(), failureRate: circuitDb.getSnapshot().failureRate },
              export: { state: circuitExport.getState(), failureRate: circuitExport.getSnapshot().failureRate },
            },
          },
        });
      }

      const mem = process.memoryUsage();
      const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;
      if (heapRatio > 0.88) {
        clearSearchCache();
        sendWorkerMessage(ipcProcess, { type: "worker-event", payload: { kind: "memory-pressure" } });
        if (typeof runtimeGlobal.gc === "function" && activeRequests === 0) {
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
