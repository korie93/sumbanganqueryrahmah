import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateClusterMetrics,
  buildWorkerControlState,
  computeClusterHealthScore,
  toControlStateMessage,
  toGracefulShutdownMessage,
} from "../../internal/cluster-control-state";
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

test("aggregateClusterMetrics combines worker samples conservatively", () => {
  const aggregate = aggregateClusterMetrics([
    createWorkerMetrics({ cpuPercent: 50, reqRate: 8, latencyP95Ms: 220, activeRequests: 4 }),
    createWorkerMetrics({
      workerId: 2,
      pid: 1002,
      cpuPercent: 70,
      reqRate: 10,
      latencyP95Ms: 410,
      activeRequests: 6,
      queueLength: 5,
      dbLatencyMs: 240,
      aiLatencyMs: 320,
    }),
  ]);

  assert.equal(aggregate.cpuPercent, 60);
  assert.equal(aggregate.reqRate, 18);
  assert.equal(aggregate.p95, 410);
  assert.equal(aggregate.activeRequests, 10);
  assert.equal(aggregate.queueLength, 8);
  assert.equal(aggregate.dbLatencyMs, 240);
  assert.equal(aggregate.aiLatencyMs, 320);
});

test("buildWorkerControlState escalates to degraded mode on sustained upward pressure", () => {
  const samples = [
    createWorkerMetrics({
      cpuPercent: 76,
      latencyP95Ms: 650,
      circuit: {
        ai: { state: "OPEN", failureRate: 0.4 },
        db: { state: "CLOSED", failureRate: 0 },
        export: { state: "OPEN", failureRate: 0.2 },
      },
    }),
  ];

  const control = buildWorkerControlState({
    workerMetrics: samples,
    trend: { ...neutralTrend, sustainedUpward: true },
    workerCount: 3,
    maxWorkers: 4,
    preallocateMb: 64,
  });

  assert.equal(control.mode, "DEGRADED");
  assert.equal(control.throttleFactor, 0.75);
  assert.equal(control.preAllocateMB, 64);
  assert.equal(control.circuits.aiOpenWorkers, 1);
  assert.equal(control.circuits.exportOpenWorkers, 1);
});

test("computeClusterHealthScore stays bounded and IPC helpers preserve message shape", () => {
  const score = computeClusterHealthScore(
    {
      cpuPercent: 95,
      reqRate: 40,
      p95: 1200,
      eventLoopLagMs: 240,
      activeRequests: 100,
      queueLength: 30,
      dbLatencyMs: 1500,
      aiLatencyMs: 1800,
      heapUsedMB: 900,
      oldSpaceMB: 700,
    },
    4,
    4,
  );

  assert.equal(score >= 0 && score <= 100, true);

  const controlMessage = toControlStateMessage({
    ...buildWorkerControlState({
      workerMetrics: [createWorkerMetrics()],
      trend: neutralTrend,
      workerCount: 1,
      maxWorkers: 4,
      preallocateMb: 0,
    }),
    updatedAt: 123,
  });
  const shutdownMessage = toGracefulShutdownMessage("rolling-restart");

  assert.equal(controlMessage.type, "control-state");
  assert.equal(shutdownMessage.type, "graceful-shutdown");
  assert.equal(shutdownMessage.reason, "rolling-restart");
});
