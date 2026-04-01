import type { SystemSnapshot } from "../intelligence/types";
import type { CircuitState } from "./circuitBreaker";
import type {
  InternalMonitorAlert,
  InternalMonitorSnapshot,
} from "./runtime-monitor-types";
import type { WorkerControlState, WorkerMetricsPayload } from "./worker-ipc";
import { getRamPercent, roundMetric } from "./runtime-monitor-metrics";

type RuntimeRollupRefreshSnapshot = {
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
};

type BuildInternalRuntimeMonitorSnapshotParams = {
  activeRequests: number;
  aiFailureRate: number;
  aiLatencyMs: number;
  clusterOpenCircuitCount: number;
  controlState: WorkerControlState;
  cpuPercent: number;
  dbConnections: number;
  dbLatencyMs: number;
  dbProtection: boolean;
  errorRate: number;
  eventLoopLagMs: number;
  localOpenCircuitCount: number;
  p95LatencyMs: number;
  queueLength: number;
  requestRate: number;
  rollupRefreshSnapshot: RuntimeRollupRefreshSnapshot;
  slowQueryCount: number;
  status401Count: number;
  status403Count: number;
  status429Count: number;
};

type ResolveRuntimeMonitorBottleneckTypeParams = {
  aiLatencyMs: number;
  cpuPercent: number;
  dbLatencyMs: number;
  errorRate: number;
  eventLoopLagMs: number;
  ramPercent: number;
};

type BuildWorkerMetricsPayloadParams = {
  activeRequests: number;
  aiLatencyMs: number;
  aiState: CircuitState;
  aiFailureRate: number;
  cpuPercent: number;
  dbLatencyMs: number;
  dbState: CircuitState;
  dbFailureRate: number;
  eventLoopLagMs: number;
  exportState: CircuitState;
  exportFailureRate: number;
  gcPerMinute: number;
  heapTotalMB: number;
  heapUsedMB: number;
  latencyP95Ms: number;
  pid: number;
  queueLength: number;
  requestRate: number;
  timestamp: number;
  workerId: number;
};

export function resolveRuntimeMonitorBottleneckType({
  aiLatencyMs,
  cpuPercent,
  dbLatencyMs,
  errorRate,
  eventLoopLagMs,
  ramPercent,
}: ResolveRuntimeMonitorBottleneckTypeParams): string {
  const pressureScore = [
    { type: "CPU", score: cpuPercent / 100 },
    { type: "RAM", score: ramPercent / 100 },
    { type: "DB", score: dbLatencyMs / 1200 },
    { type: "AI", score: aiLatencyMs / 1500 },
    { type: "EVENT_LOOP", score: eventLoopLagMs / 180 },
    { type: "ERRORS", score: errorRate / 10 },
  ].sort((a, b) => b.score - a.score)[0];

  if (pressureScore && pressureScore.score >= 0.5) {
    return pressureScore.type;
  }

  return "NONE";
}

export function buildInternalRuntimeMonitorSnapshot({
  activeRequests,
  aiFailureRate,
  aiLatencyMs,
  clusterOpenCircuitCount,
  controlState,
  cpuPercent,
  dbConnections,
  dbLatencyMs,
  dbProtection,
  errorRate,
  eventLoopLagMs,
  localOpenCircuitCount,
  p95LatencyMs,
  queueLength,
  requestRate,
  rollupRefreshSnapshot,
  slowQueryCount,
  status401Count,
  status403Count,
  status429Count,
}: BuildInternalRuntimeMonitorSnapshotParams): InternalMonitorSnapshot {
  const cpu = roundMetric(cpuPercent, 2);
  const ram = getRamPercent();
  const dbLatency = roundMetric(dbLatencyMs, 2);
  const aiLatency = roundMetric(aiLatencyMs, 2);
  const loopLag = roundMetric(eventLoopLagMs, 2);

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
    requestRate: roundMetric(requestRate, 2),
    activeRequests,
    queueLength,
    workerCount: controlState.workerCount,
    maxWorkers: controlState.maxWorkers,
    dbProtection,
    slowQueryCount,
    dbConnections,
    aiFailRate: roundMetric(aiFailureRate, 2),
    status401Count,
    status403Count,
    status429Count,
    localOpenCircuitCount,
    clusterOpenCircuitCount,
    bottleneckType: resolveRuntimeMonitorBottleneckType({
      aiLatencyMs: aiLatency,
      cpuPercent: cpu,
      dbLatencyMs: dbLatency,
      errorRate,
      eventLoopLagMs: loopLag,
      ramPercent: ram,
    }),
    rollupRefreshPendingCount: rollupRefreshSnapshot.pendingCount,
    rollupRefreshRunningCount: rollupRefreshSnapshot.runningCount,
    rollupRefreshRetryCount: rollupRefreshSnapshot.retryCount,
    rollupRefreshOldestPendingAgeMs: roundMetric(rollupRefreshSnapshot.oldestPendingAgeMs, 0),
    updatedAt: controlState.updatedAt,
  };
}

export function toRuntimeIntelligenceSnapshot(
  snapshot: InternalMonitorSnapshot,
): SystemSnapshot {
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

export function appendCappedHistoryValue(series: number[], value: number, maxLength: number) {
  if (!Number.isFinite(value)) {
    return;
  }
  series.push(value);
  if (series.length > maxLength) {
    series.splice(0, series.length - maxLength);
  }
}

export function blendRuntimeLatencyValue(current: number, next: number): number {
  if (!Number.isFinite(next) || next < 0) {
    return Math.max(0, current || 0);
  }
  if (!Number.isFinite(current) || current <= 0) {
    return next;
  }
  return (current * 0.75) + (next * 0.25);
}

export function decayRuntimeLatencyValue(params: {
  lastLatencyMs: number;
  lastObservedAt: number;
  now: number;
  staleAfterMs: number;
  halfLifeMs: number;
}): number {
  if (!Number.isFinite(params.lastLatencyMs) || params.lastLatencyMs <= 0) {
    return 0;
  }
  if (params.lastObservedAt <= 0) {
    return Math.max(0, params.lastLatencyMs);
  }

  const idleMs = Math.max(0, params.now - params.lastObservedAt);
  if (idleMs <= params.staleAfterMs) {
    return Math.max(0, params.lastLatencyMs);
  }

  const decayWindowMs = idleMs - params.staleAfterMs;
  const decayFactor = Math.exp((-Math.LN2 * decayWindowMs) / params.halfLifeMs);
  return Math.max(0, params.lastLatencyMs * decayFactor);
}

export function normalizeRuntimeRollupRefreshSnapshot(
  nextSnapshot: Partial<RuntimeRollupRefreshSnapshot> | null | undefined,
): RuntimeRollupRefreshSnapshot {
  return {
    pendingCount: Math.max(0, Number(nextSnapshot?.pendingCount || 0)),
    runningCount: Math.max(0, Number(nextSnapshot?.runningCount || 0)),
    retryCount: Math.max(0, Number(nextSnapshot?.retryCount || 0)),
    oldestPendingAgeMs: Math.max(0, Number(nextSnapshot?.oldestPendingAgeMs || 0)),
  };
}

export function buildRuntimeAlertHistorySignature(
  alerts: InternalMonitorAlert[],
): string {
  return alerts
    .map((alert) => `${alert.id}:${alert.severity}:${alert.message}`)
    .sort()
    .join("|");
}

export function calculateRuntimeCpuPercent(params: {
  cpuDeltaMicros: number;
  elapsedMs: number;
  workerCount: number;
}): number {
  const cpuCorePercent = ((params.cpuDeltaMicros / 1000) / Math.max(1, params.elapsedMs)) * 100;
  return Math.max(0, Math.min(100, cpuCorePercent / Math.max(1, params.workerCount || 1)));
}

export function buildWorkerMetricsPayload({
  activeRequests,
  aiLatencyMs,
  aiState,
  aiFailureRate,
  cpuPercent,
  dbLatencyMs,
  dbState,
  dbFailureRate,
  eventLoopLagMs,
  exportState,
  exportFailureRate,
  gcPerMinute,
  heapTotalMB,
  heapUsedMB,
  latencyP95Ms,
  pid,
  queueLength,
  requestRate,
  timestamp,
  workerId,
}: BuildWorkerMetricsPayloadParams): WorkerMetricsPayload {
  return {
    workerId,
    pid,
    cpuPercent,
    reqRate: requestRate,
    latencyP95Ms,
    eventLoopLagMs,
    activeRequests,
    queueLength,
    heapUsedMB,
    heapTotalMB,
    oldSpaceMB: heapUsedMB,
    gcPerMin: gcPerMinute,
    dbLatencyMs,
    aiLatencyMs,
    ts: timestamp,
    circuit: {
      ai: { state: aiState, failureRate: aiFailureRate },
      db: { state: dbState, failureRate: dbFailureRate },
      export: { state: exportState, failureRate: exportFailureRate },
    },
  };
}
