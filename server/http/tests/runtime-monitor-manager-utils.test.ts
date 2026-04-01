import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCappedHistoryValue,
  buildWorkerMetricsPayload,
  calculateRuntimeCpuPercent,
  resolveRuntimeMonitorBottleneckType,
} from "../../internal/runtime-monitor-manager-utils";

test("appendCappedHistoryValue keeps only the latest entries", () => {
  const series = [1, 2, 3];
  appendCappedHistoryValue(series, 4, 3);
  assert.deepEqual(series, [2, 3, 4]);
});

test("resolveRuntimeMonitorBottleneckType picks the strongest pressure signal", () => {
  assert.equal(
    resolveRuntimeMonitorBottleneckType({
      aiLatencyMs: 200,
      cpuPercent: 22,
      dbLatencyMs: 1450,
      errorRate: 1,
      eventLoopLagMs: 12,
      ramPercent: 48,
    }),
    "DB",
  );
});

test("calculateRuntimeCpuPercent normalizes by worker count and clamps bounds", () => {
  assert.equal(
    calculateRuntimeCpuPercent({
      cpuDeltaMicros: 250_000,
      elapsedMs: 1000,
      workerCount: 2,
    }),
    12.5,
  );
});

test("buildWorkerMetricsPayload keeps metrics shape stable", () => {
  const payload = buildWorkerMetricsPayload({
    activeRequests: 3,
    aiState: "CLOSED",
    aiFailureRate: 0,
    aiLatencyMs: 50,
    cpuPercent: 14.2,
    dbState: "OPEN",
    dbFailureRate: 0.12,
    dbLatencyMs: 120,
    eventLoopLagMs: 7,
    exportState: "CLOSED",
    exportFailureRate: 0,
    gcPerMinute: 2,
    heapTotalMB: 128,
    heapUsedMB: 64,
    latencyP95Ms: 140,
    pid: 1234,
    queueLength: 5,
    requestRate: 11,
    timestamp: 999,
    workerId: 2,
  });

  assert.equal(payload.workerId, 2);
  assert.equal(payload.oldSpaceMB, 64);
  assert.equal(payload.circuit.db.failureRate, 0.12);
  assert.equal(payload.circuit.db.state, "OPEN");
  assert.equal(payload.circuit.ai.state, "CLOSED");
});
