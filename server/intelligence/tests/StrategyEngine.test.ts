import test from "node:test";
import assert from "node:assert/strict";
import { StrategyEngine } from "../strategy/StrategyEngine";

test("Strategy selection favors aggressive action under imminent critical risk", () => {
  const engine = new StrategyEngine();
  engine.recordAnomalyOutcome("CRITICAL");
  engine.recordAnomalyOutcome("EMERGENCY");
  engine.recordAnomalyOutcome("CRITICAL");

  const outcome = engine.evaluate({
    snapshot: {
      timestamp: Date.now(),
      score: 35,
      mode: "PROTECTION",
      cpuPercent: 92,
      ramPercent: 88,
      p95LatencyMs: 1650,
      errorRate: 7,
      dbLatencyMs: 1300,
      aiLatencyMs: 1700,
      eventLoopLagMs: 220,
      requestRate: 130,
      activeRequests: 240,
      queueSize: 16,
      workerCount: 1,
      maxWorkers: 3,
      dbConnections: 40,
      aiFailRate: 8,
      bottleneckType: "DB",
    },
    anomalySeverity: "EMERGENCY",
    predictiveState: "CRITICAL_IMMINENT",
    governanceState: "PROPOSED",
    stabilityAverage5m: 41,
    lastThreeAnomalyOutcomes: engine.getLastThreeOutcomes(),
  });

  assert.equal(outcome.chosen.recommendedAction, "SELECTIVE_WORKER_RESTART");
});

test("Strategy selection remains stable in healthy conditions", () => {
  const engine = new StrategyEngine();
  engine.recordOutcome("ADAPTIVE", true);
  engine.recordOutcome("ADAPTIVE", true);
  engine.recordOutcome("CONSERVATIVE", true);

  const outcome = engine.evaluate({
    snapshot: {
      timestamp: Date.now(),
      score: 95,
      mode: "NORMAL",
      cpuPercent: 35,
      ramPercent: 42,
      p95LatencyMs: 180,
      errorRate: 0.5,
      dbLatencyMs: 90,
      aiLatencyMs: 150,
      eventLoopLagMs: 12,
      requestRate: 22,
      activeRequests: 10,
      queueSize: 1,
      workerCount: 2,
      maxWorkers: 3,
      dbConnections: 8,
      aiFailRate: 0.2,
      bottleneckType: "NONE",
    },
    anomalySeverity: "NORMAL",
    predictiveState: "NORMAL",
    governanceState: "IDLE",
    stabilityAverage5m: 92,
    lastThreeAnomalyOutcomes: ["NORMAL", "NORMAL", "NORMAL"],
  });

  assert.equal(outcome.chosen.strategy, "ADAPTIVE");
  assert.equal(outcome.chosen.recommendedAction, "NONE");
});

