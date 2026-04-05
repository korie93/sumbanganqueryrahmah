import {
  aggregateClusterMetrics,
  buildWorkerControlState,
  type Aggregate,
} from "./cluster-control-state";
import type { LoadTrendSnapshot } from "./loadPredictor";
import type { WorkerControlState, WorkerMetricsPayload } from "./worker-ipc";

export type ClusterScalingPlan = {
  aggregate: Aggregate;
  control: WorkerControlState;
  spawnReasons: string[];
  memoryPressureHigh: boolean;
  shouldAllocatePrealloc: boolean;
  shouldReleasePrealloc: boolean;
  nextLowLoadSince: number | null;
  shouldScaleDown: boolean;
  shouldRestartForMemoryPressure: boolean;
};

export function planClusterScaling(params: {
  workerMetrics: Iterable<WorkerMetricsPayload>;
  trend: LoadTrendSnapshot;
  workerCount: number;
  maxWorkers: number;
  canScale: boolean;
  now: number;
  lowLoadSince: number | null;
  lowLoadHoldMs: number;
  lowReqRateThreshold: number;
  activeRequestsThreshold: number;
  preallocateMb: number;
  maxSpawnPerCycle: number;
  hasPreAllocBuffer: boolean;
  processRssMb: number;
  memoryScaleUpBlockMb: number;
}): ClusterScalingPlan {
  const metricSamples = Array.from(params.workerMetrics);
  const aggregate = aggregateClusterMetrics(metricSamples);
  const memoryPressureHigh = params.processRssMb > params.memoryScaleUpBlockMb;
  const spawnReasons: string[] = [];

  if (params.trend.sustainedUpward && params.canScale && !memoryPressureHigh) {
    const headroom = Math.max(0, params.maxWorkers - params.workerCount);
    const predictiveSpawnCount = Math.min(params.maxSpawnPerCycle, headroom);
    for (let index = 0; index < predictiveSpawnCount; index += 1) {
      spawnReasons.push("predictive-uptrend");
    }
  }

  const shouldAllocatePrealloc =
    params.preallocateMb > 0 &&
    params.trend.sustainedUpward &&
    spawnReasons.length > 0 &&
    !params.hasPreAllocBuffer;
  const shouldReleasePrealloc =
    params.hasPreAllocBuffer &&
    aggregate.cpuPercent < 55 &&
    aggregate.reqRate < params.lowReqRateThreshold;

  const latencyPressure = aggregate.p95 > 900 && aggregate.reqRate > params.lowReqRateThreshold;
  const highLoad =
    aggregate.cpuPercent > 70 ||
    latencyPressure ||
    aggregate.activeRequests >
      params.activeRequestsThreshold * Math.max(1, params.workerCount);
  if (
    highLoad &&
    params.canScale &&
    !memoryPressureHigh &&
    spawnReasons.length === 0 &&
    params.workerCount < params.maxWorkers
  ) {
    spawnReasons.push("reactive-high-load");
  }

  const lowLoad =
    aggregate.cpuPercent < 40 && aggregate.reqRate < params.lowReqRateThreshold;
  let nextLowLoadSince = params.lowLoadSince;
  let shouldScaleDown = false;
  if (lowLoad) {
    if (nextLowLoadSince === null) {
      nextLowLoadSince = params.now;
    }
    shouldScaleDown =
      params.now - nextLowLoadSince >= params.lowLoadHoldMs &&
      params.workerCount > 1;
    if (shouldScaleDown) {
      nextLowLoadSince = params.now;
    }
  } else {
    nextLowLoadSince = null;
  }

  const shouldRestartForMemoryPressure =
    aggregate.heapUsedMB > 0 &&
    aggregate.oldSpaceMB / Math.max(aggregate.heapUsedMB, 1) > 0.75 &&
    aggregate.heapUsedMB > 1024;

  const control = buildWorkerControlState({
    workerMetrics: metricSamples,
    trend: params.trend,
    workerCount: params.workerCount,
    maxWorkers: params.maxWorkers,
    preallocateMb: params.preallocateMb > 0 && params.trend.sustainedUpward
      ? params.preallocateMb
      : 0,
  });

  return {
    aggregate,
    control,
    spawnReasons,
    memoryPressureHigh,
    shouldAllocatePrealloc,
    shouldReleasePrealloc,
    nextLowLoadSince,
    shouldScaleDown,
    shouldRestartForMemoryPressure,
  };
}
