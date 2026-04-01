import type { SystemSnapshot } from "../intelligence/types";
import type { CircuitState } from "./circuitBreaker";
import type { InternalMonitorSnapshot } from "./runtime-monitor-types";
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
