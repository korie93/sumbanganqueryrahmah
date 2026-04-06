import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeMonitorCircuitRuntime } from "../runtime-monitor-circuit-runtime";

test("runtime monitor circuit runtime records db and ai latency through circuit wrappers", async () => {
  const observedDbLatencies: number[] = [];
  const observedAiLatencies: number[] = [];
  const runtime = createRuntimeMonitorCircuitRuntime({
    pool: {
      totalCount: 1,
      idleCount: 1,
      waitingCount: 0,
      options: { max: 10 },
    } as any,
    pgPoolWarnCooldownMs: 30_000,
    observeDbLatency: (ms) => observedDbLatencies.push(ms),
    observeAiLatency: (ms) => observedAiLatencies.push(ms),
  });

  const originalDateNow = Date.now;
  const dateSamples = [1_000, 1_040, 2_000, 2_080];
  Date.now = () => dateSamples.shift() ?? originalDateNow();

  try {
    await runtime.withDbCircuit(async () => "db-ok");
    await runtime.withAiCircuit(async () => "ai-ok");
  } finally {
    Date.now = originalDateNow;
  }

  assert.deepEqual(observedDbLatencies, [40]);
  assert.deepEqual(observedAiLatencies, [80]);
  assert.equal(runtime.getLocalCircuitSnapshots().db.totalRequests, 1);
  assert.equal(runtime.getLocalCircuitSnapshots().ai.totalRequests, 1);
});
