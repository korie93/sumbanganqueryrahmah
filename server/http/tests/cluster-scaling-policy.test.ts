import assert from "node:assert/strict";
import test from "node:test";
import { planClusterScaling } from "../../internal/cluster-scaling-policy";
import type { LoadTrendSnapshot } from "../../internal/loadPredictor";
import type { WorkerMetricsPayload } from "../../internal/worker-ipc";

function createWorkerMetrics(overrides: Partial<WorkerMetricsPayload> = {}): WorkerMetricsPayload {
  return {
    workerId: overrides.workerId ?? 1,
    pid: overrides.pid ?? 1001,
    cpuPercent: overrides.cpuPercent ?? 55,
    reqRate: overrides.reqRate ?? 12,
    latencyP95Ms: overrides.latencyP95Ms ?? 280,
    eventLoopLagMs: overrides.eventLoopLagMs ?? 40,
    activeRequests: overrides.activeRequests ?? 10,
    queueLength: overrides.queueLength ?? 3,
    heapUsedMB: overrides.heapUsedMB ?? 128,
    heapTotalMB: overrides.heapTotalMB ?? 256,
    oldSpaceMB: overrides.oldSpaceMB ?? 64,
    gcPerMin: overrides.gcPerMin ?? 1,
    dbLatencyMs: overrides.dbLatencyMs ?? 180,
    aiLatencyMs: overrides.aiLatencyMs ?? 260,
    ts: overrides.ts ?? 1_710_000_000_000,
    circuit: overrides.circuit ?? {
      ai: { state: "CLOSED", failureRate: 0 },
      db: { state: "CLOSED", failureRate: 0 },
      export: { state: "CLOSED", failureRate: 0 },
    },
  };
}

const neutralTrend: LoadTrendSnapshot = {
  requestRateMA: 12,
  latencyMA: 280,
  cpuMA: 55,
  requestRateTrend: 0,
  latencyTrend: 0,
  cpuTrend: 0,
  sustainedUpward: false,
  lastUpdatedAt: 1_710_000_000_000,
};

test("planClusterScaling schedules predictive scale-up and preallocation during sustained trend pressure", () => {
  const plan = planClusterScaling({
    workerMetrics: [
      createWorkerMetrics({ cpuPercent: 66, reqRate: 14, latencyP95Ms: 420 }),
    ],
    trend: { ...neutralTrend, sustainedUpward: true },
    workerCount: 1,
    maxWorkers: 3,
    canScale: true,
    now: 1_710_000_100_000,
    lowLoadSince: null,
    lowLoadHoldMs: 60_000,
    lowReqRateThreshold: 8,
    activeRequestsThreshold: 80,
    preallocateMb: 64,
    maxSpawnPerCycle: 1,
    hasPreAllocBuffer: false,
    processRssMb: 180,
    memoryScaleUpBlockMb: 1200,
  });

  assert.deepEqual(plan.spawnReasons, ["predictive-uptrend"]);
  assert.equal(plan.shouldAllocatePrealloc, true);
  assert.equal(plan.shouldReleasePrealloc, false);
  assert.equal(plan.memoryPressureHigh, false);
});

test("planClusterScaling preserves low-load cooldown and memory restart signals", () => {
  const now = 1_710_000_200_000;
  const plan = planClusterScaling({
    workerMetrics: [
      createWorkerMetrics({
        cpuPercent: 18,
        reqRate: 2,
        activeRequests: 1,
        latencyP95Ms: 120,
        heapUsedMB: 1400,
        oldSpaceMB: 1200,
      }),
    ],
    trend: neutralTrend,
    workerCount: 3,
    maxWorkers: 4,
    canScale: false,
    now,
    lowLoadSince: now - 61_000,
    lowLoadHoldMs: 60_000,
    lowReqRateThreshold: 8,
    activeRequestsThreshold: 80,
    preallocateMb: 64,
    maxSpawnPerCycle: 1,
    hasPreAllocBuffer: true,
    processRssMb: 190,
    memoryScaleUpBlockMb: 1200,
  });

  assert.equal(plan.shouldScaleDown, true);
  assert.equal(plan.nextLowLoadSince, now);
  assert.equal(plan.shouldReleasePrealloc, true);
  assert.equal(plan.shouldRestartForMemoryPressure, true);
});
