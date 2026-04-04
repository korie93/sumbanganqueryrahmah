import type { LoadTrendSnapshot } from "./loadPredictor";
import type {
  ControlStateMessage,
  GracefulShutdownMessage,
  WorkerControlState,
  WorkerMetricsPayload,
} from "./worker-ipc";

export type Aggregate = {
  cpuPercent: number;
  reqRate: number;
  p95: number;
  eventLoopLagMs: number;
  activeRequests: number;
  queueLength: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  heapUsedMB: number;
  oldSpaceMB: number;
};

export function round(value: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

export function aggregateClusterMetrics(samples: Iterable<WorkerMetricsPayload>): Aggregate {
  const values = Array.from(samples);
  if (values.length === 0) {
    return {
      cpuPercent: 0,
      reqRate: 0,
      p95: 0,
      eventLoopLagMs: 0,
      activeRequests: 0,
      queueLength: 0,
      dbLatencyMs: 0,
      aiLatencyMs: 0,
      heapUsedMB: 0,
      oldSpaceMB: 0,
    };
  }

  const cpuPercent = values.reduce((sum, sample) => sum + sample.cpuPercent, 0) / values.length;
  const reqRate = values.reduce((sum, sample) => sum + sample.reqRate, 0);
  const p95 = values.reduce((max, sample) => Math.max(max, sample.latencyP95Ms), 0);
  const eventLoopLagMs = values.reduce((max, sample) => Math.max(max, sample.eventLoopLagMs), 0);
  const activeRequests = values.reduce((sum, sample) => sum + sample.activeRequests, 0);
  const queueLength = values.reduce((sum, sample) => sum + sample.queueLength, 0);
  const dbLatencyMs = values.reduce((max, sample) => Math.max(max, sample.dbLatencyMs), 0);
  const aiLatencyMs = values.reduce((max, sample) => Math.max(max, sample.aiLatencyMs), 0);
  const heapUsedMB = values.reduce((sum, sample) => sum + sample.heapUsedMB, 0);
  const oldSpaceMB = values.reduce((sum, sample) => sum + sample.oldSpaceMB, 0);

  return {
    cpuPercent: round(cpuPercent),
    reqRate: round(reqRate),
    p95: round(p95),
    eventLoopLagMs: round(eventLoopLagMs),
    activeRequests,
    queueLength,
    dbLatencyMs: round(dbLatencyMs),
    aiLatencyMs: round(aiLatencyMs),
    heapUsedMB: round(heapUsedMB),
    oldSpaceMB: round(oldSpaceMB),
  };
}

export function computeClusterHealthScore(
  aggregate: Aggregate,
  workerCount: number,
  maxWorkers: number,
): number {
  const cpuPenalty = Math.min(30, (aggregate.cpuPercent / 100) * 30);
  const dbPenalty = aggregate.dbLatencyMs > 0 ? Math.min(20, (aggregate.dbLatencyMs / 1000) * 20) : 0;
  const aiPenalty = aggregate.aiLatencyMs > 0 ? Math.min(10, (aggregate.aiLatencyMs / 1500) * 10) : 0;
  const lagPenalty = Math.min(10, (aggregate.eventLoopLagMs / 200) * 10);
  const queuePenalty = Math.min(10, aggregate.queueLength / 10);
  const workerPressure = maxWorkers > 0 ? workerCount / maxWorkers : 0;
  const workerPenalty = workerPressure > 0.85 ? (workerPressure - 0.85) * 40 : 0;
  const raw = 100 - cpuPenalty - dbPenalty - aiPenalty - lagPenalty - queuePenalty - workerPenalty;
  return Math.max(0, Math.min(100, round(raw)));
}

export function buildWorkerControlState(params: {
  workerMetrics: Iterable<WorkerMetricsPayload>;
  trend: LoadTrendSnapshot;
  workerCount: number;
  maxWorkers: number;
  preallocateMb: number;
}): WorkerControlState {
  const aggregate = aggregateClusterMetrics(params.workerMetrics);
  const healthScore = computeClusterHealthScore(
    aggregate,
    params.workerCount,
    params.maxWorkers,
  );

  let nextMode: WorkerControlState["mode"] = "NORMAL";
  if (healthScore < 50 || aggregate.dbLatencyMs > 1000) {
    nextMode = "PROTECTION";
  } else if (
    aggregate.cpuPercent > 70 ||
    aggregate.p95 > 600 ||
    aggregate.eventLoopLagMs > 120 ||
    params.trend.sustainedUpward
  ) {
    nextMode = "DEGRADED";
  }

  const rejectHeavyRoutes =
    nextMode === "PROTECTION" ||
    (params.workerCount >= params.maxWorkers && aggregate.cpuPercent > 85);

  let throttleFactor = 1;
  if (nextMode === "PROTECTION") throttleFactor = 0.4;
  else if (params.workerCount >= params.maxWorkers && aggregate.cpuPercent > 85) throttleFactor = 0.5;
  else if (nextMode === "DEGRADED") throttleFactor = 0.75;

  const samples = Array.from(params.workerMetrics);
  const workers = samples.map((sample) => ({
    workerId: sample.workerId,
    pid: sample.pid,
    cpuPercent: round(sample.cpuPercent),
    reqRate: round(sample.reqRate),
    latencyP95Ms: round(sample.latencyP95Ms),
    eventLoopLagMs: round(sample.eventLoopLagMs),
    activeRequests: sample.activeRequests,
    heapUsedMB: round(sample.heapUsedMB),
    oldSpaceMB: round(sample.oldSpaceMB),
    dbLatencyMs: round(sample.dbLatencyMs),
    aiLatencyMs: round(sample.aiLatencyMs),
    ts: sample.ts,
  }));

  const circuits = {
    aiOpenWorkers: samples.filter((sample) => sample.circuit.ai.state === "OPEN").length,
    dbOpenWorkers: samples.filter((sample) => sample.circuit.db.state === "OPEN").length,
    exportOpenWorkers: samples.filter((sample) => sample.circuit.export.state === "OPEN").length,
  };

  return {
    mode: nextMode,
    healthScore,
    dbProtection: aggregate.dbLatencyMs > 1000 || nextMode === "PROTECTION",
    rejectHeavyRoutes,
    throttleFactor,
    predictor: params.trend,
    workerCount: params.workerCount,
    maxWorkers: params.maxWorkers,
    queueLength: aggregate.queueLength,
    preAllocateMB: params.preallocateMb,
    updatedAt: Date.now(),
    workers,
    circuits,
  };
}

export function toControlStateMessage(control: WorkerControlState): ControlStateMessage {
  return {
    type: "control-state",
    payload: control,
  };
}

export function toGracefulShutdownMessage(reason: string): GracefulShutdownMessage {
  return {
    type: "graceful-shutdown",
    reason,
  };
}
