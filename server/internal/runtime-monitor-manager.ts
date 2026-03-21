import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import type { Pool } from "pg";
import { logger } from "../lib/logger";
import { CircuitBreaker, type CircuitSnapshot } from "./circuitBreaker";
import type {
  EvaluateSystemResult,
  SystemHistory,
  SystemSnapshot,
} from "../intelligence/types";
import {
  isControlStateMessage,
  isGracefulShutdownMessage,
  type WorkerControlState,
  type WorkerMetricsPayload,
  type WorkerToMasterMessage,
} from "./worker-ipc";

export type { WorkerControlState } from "./worker-ipc";

export type InternalMonitorSnapshot = {
  score: number;
  mode: "NORMAL" | "DEGRADED" | "PROTECTION";
  cpuPercent: number;
  ramPercent: number;
  p95LatencyMs: number;
  errorRate: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  eventLoopLagMs: number;
  requestRate: number;
  activeRequests: number;
  queueLength: number;
  workerCount: number;
  maxWorkers: number;
  dbProtection: boolean;
  slowQueryCount: number;
  dbConnections: number;
  aiFailRate: number;
  bottleneckType: string;
  updatedAt: number;
};

export type InternalMonitorAlert = {
  id: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  timestamp: string;
  source: string;
};

type LocalCircuitSnapshots = {
  ai: CircuitSnapshot;
  db: CircuitSnapshot;
  export: CircuitSnapshot;
};

type PoolWithOptions = Pool & {
  options?: {
    max?: number;
  };
};

type IpcCapableProcess = NodeJS.Process & {
  send?: (message: WorkerToMasterMessage) => void;
};

type GcCapableGlobal = typeof globalThis & {
  gc?: () => void;
};

type RuntimeMonitorManagerOptions = {
  pool: Pool;
  apiDebugLogs: boolean;
  lowMemoryMode: boolean;
  pgPoolWarnCooldownMs: number;
  aiLatencyStaleAfterMs: number;
  aiLatencyDecayHalfLifeMs: number;
  getSearchQueueLength: () => number;
  evaluateSystem: (snapshot: SystemSnapshot, history: SystemHistory) => Promise<EvaluateSystemResult>;
};

type AttachProcessHandlersOptions = {
  onGracefulShutdown: () => void;
};

type StartRuntimeLoopsOptions = {
  clearSearchCache: () => void;
};

const LATENCY_WINDOW = 400;
const MAX_INTELLIGENCE_HISTORY = 300;
const ipcProcess = process as IpcCapableProcess;
const runtimeGlobal = globalThis as GcCapableGlobal;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((clamp(p, 0, 100) / 100) * (sorted.length - 1));
  return sorted[index];
}

function roundMetric(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function getRamPercent(): number {
  const total = Number(os.totalmem() || 0);
  const free = Number(os.freemem() || 0);
  if (total <= 0) return 0;
  return roundMetric(((total - free) / total) * 100, 2);
}

function sendWorkerMessage(message: WorkerToMasterMessage) {
  if (typeof ipcProcess.send !== "function") return;
  ipcProcess.send(message);
}

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
    const nearMax = max > 0 ? total >= Math.max(1, max - 1) : false;
    const hasPressure = waiting > 0 || idle === 0 || nearMax;

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
      bottleneckType,
      updatedAt: controlState.updatedAt,
    };
  }

  function buildInternalMonitorAlerts(snapshot: InternalMonitorSnapshot): InternalMonitorAlert[] {
    const alerts: InternalMonitorAlert[] = [];
    const timestamp = new Date(snapshot.updatedAt || Date.now()).toISOString();

    const pushAlert = (
      severity: InternalMonitorAlert["severity"],
      source: string,
      message: string,
    ) => {
      alerts.push({
        id: `${source.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_${severity.toLowerCase()}`,
        severity,
        source,
        message,
        timestamp,
      });
    };

    if (snapshot.mode === "PROTECTION") {
      pushAlert("CRITICAL", "MODE", "System is in PROTECTION mode. Heavy routes are restricted.");
    } else if (snapshot.mode === "DEGRADED") {
      pushAlert("WARNING", "MODE", "System is in DEGRADED mode. Throughput throttling is active.");
    }

    if (snapshot.cpuPercent >= 88) {
      pushAlert("CRITICAL", "CPU", `CPU usage is critically high at ${snapshot.cpuPercent.toFixed(1)}%.`);
    } else if (snapshot.cpuPercent >= 75) {
      pushAlert("WARNING", "CPU", `CPU usage is elevated at ${snapshot.cpuPercent.toFixed(1)}%.`);
    }

    if (snapshot.ramPercent >= 92) {
      pushAlert("CRITICAL", "RAM", `RAM usage is critically high at ${snapshot.ramPercent.toFixed(1)}%.`);
    } else if (snapshot.ramPercent >= 80) {
      pushAlert("WARNING", "RAM", `RAM usage is elevated at ${snapshot.ramPercent.toFixed(1)}%.`);
    }

    if (snapshot.dbLatencyMs >= 1000) {
      pushAlert("CRITICAL", "DB", `Database latency is critical (${snapshot.dbLatencyMs.toFixed(0)} ms).`);
    } else if (snapshot.dbLatencyMs >= 400) {
      pushAlert("WARNING", "DB", `Database latency is elevated (${snapshot.dbLatencyMs.toFixed(0)} ms).`);
    }

    if (snapshot.aiLatencyMs >= 1400) {
      pushAlert("CRITICAL", "AI", `AI latency is critical (${snapshot.aiLatencyMs.toFixed(0)} ms).`);
    } else if (snapshot.aiLatencyMs >= 700) {
      pushAlert("WARNING", "AI", `AI latency is elevated (${snapshot.aiLatencyMs.toFixed(0)} ms).`);
    }

    if (snapshot.eventLoopLagMs >= 170) {
      pushAlert("CRITICAL", "EVENT_LOOP", `Event loop lag is critical (${snapshot.eventLoopLagMs.toFixed(1)} ms).`);
    } else if (snapshot.eventLoopLagMs >= 90) {
      pushAlert("WARNING", "EVENT_LOOP", `Event loop lag is elevated (${snapshot.eventLoopLagMs.toFixed(1)} ms).`);
    }

    if (snapshot.errorRate >= 5) {
      pushAlert("CRITICAL", "ERRORS", `Runtime failure rate is high (${snapshot.errorRate.toFixed(2)}%).`);
    } else if (snapshot.errorRate >= 2) {
      pushAlert("WARNING", "ERRORS", `Runtime failure rate is elevated (${snapshot.errorRate.toFixed(2)}%).`);
    }

    if (snapshot.queueLength >= 10) {
      pushAlert("CRITICAL", "QUEUE", `Request queue is saturated (${snapshot.queueLength} pending).`);
    } else if (snapshot.queueLength >= 5) {
      pushAlert("WARNING", "QUEUE", `Request queue is growing (${snapshot.queueLength} pending).`);
    }

    if (snapshot.workerCount >= snapshot.maxWorkers && snapshot.maxWorkers > 0) {
      pushAlert("WARNING", "WORKERS", `Worker capacity reached (${snapshot.workerCount}/${snapshot.maxWorkers}).`);
    }

    return alerts;
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
      intelligenceInFlight = false;
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

  function recordRequestFinished(elapsedMs: number) {
    activeRequests = Math.max(0, activeRequests - 1);
    recordLatency(elapsedMs);
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
        sendWorkerMessage({
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
        sendWorkerMessage({ type: "worker-event", payload: { kind: "memory-pressure" } });
        if (typeof runtimeGlobal.gc === "function" && activeRequests === 0) {
          try {
            runtimeGlobal.gc();
          } catch {
            // noop
          }
        }
      }

      void runIntelligenceCycle();
    }, 5_000);

    runtimeLoopHandle.unref();
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
