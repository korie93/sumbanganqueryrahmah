import test from "node:test";
import assert from "node:assert/strict";
import { StatisticalEngine } from "../statistical/StatisticalEngine";
import { CorrelationEngine } from "../correlation/CorrelationEngine";

test("Correlation detection with strong positive relationship", () => {
  const stats = new StatisticalEngine();
  const engine = new CorrelationEngine(stats);
  const result = engine.evaluate({
    cpuPercent: [10, 20, 30, 40, 50, 60],
    p95LatencyMs: [100, 200, 300, 400, 500, 600],
    dbLatencyMs: [90, 100, 110, 120, 130],
    errorRate: [1, 1.1, 1.2, 1.3, 1.4],
    aiLatencyMs: [200, 210, 220, 230],
    queueSize: [2, 2.2, 2.4, 2.6],
    ramPercent: [50, 52, 54, 56],
    requestRate: [10, 11, 12, 13],
    workerCount: [2, 2, 3, 3],
  });

  assert.ok(result.matrix.cpuToLatency > 0.99);
  assert.ok(result.matrix.boostedPairs.includes("CPU↔P95_LATENCY"));
});

test("Correlation engine handles unequal array lengths", () => {
  const stats = new StatisticalEngine();
  const engine = new CorrelationEngine(stats);
  const result = engine.evaluate({
    cpuPercent: [1, 2, 3, 4, 5, 6, 7],
    p95LatencyMs: [10, 20, 30],
    dbLatencyMs: [10, 12, 14, 16, 18],
    errorRate: [1, 1.2],
    aiLatencyMs: [5, 10, 15, 20],
    queueSize: [1, 2, 3, 4, 5, 6],
    ramPercent: [],
    requestRate: [],
    workerCount: [],
  });

  assert.ok(Number.isFinite(result.matrix.cpuToLatency));
  assert.ok(Number.isFinite(result.matrix.dbToErrors));
  assert.ok(Number.isFinite(result.matrix.aiToQueue));
});

