import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeMonitorManager } from "../runtime-monitor-manager";
import type { RuntimeMonitorManagerOptions } from "../runtime-monitor-types";

function createTestRuntimeMonitorManager(
  overrides: Partial<RuntimeMonitorManagerOptions> = {},
) {
  return createRuntimeMonitorManager({
    pool: {
      totalCount: 0,
      waitingCount: 0,
    } as RuntimeMonitorManagerOptions["pool"],
    apiDebugLogs: false,
    lowMemoryMode: false,
    pgPoolWarnCooldownMs: 1_000,
    aiLatencyStaleAfterMs: 30_000,
    aiLatencyDecayHalfLifeMs: 60_000,
    getSearchQueueLength: () => 0,
    evaluateSystem: async () => ({
      stabilityIndex: 100,
      anomalySummary: {
        score: 0,
        severity: "NORMAL",
        breakdown: {
          normalizedZScore: 0,
          slopeWeight: 0,
          percentileShift: 0,
          correlationWeight: 0,
          forecastRisk: 0,
          mutationFactor: 0,
          weightedScore: 0,
        },
      },
      recommendedAction: "NONE",
      predictiveState: "NORMAL",
      governanceState: "IDLE",
    }),
    ...overrides,
  });
}

test("runtime monitor stop removes process message handlers and allows reattach", () => {
  const manager = createTestRuntimeMonitorManager();
  const before = process.listenerCount("message");

  manager.attachProcessMessageHandlers({
    onGracefulShutdown: () => undefined,
  });
  assert.equal(process.listenerCount("message"), before + 2);

  manager.stop();
  assert.equal(process.listenerCount("message"), before);

  manager.attachProcessMessageHandlers({
    onGracefulShutdown: () => undefined,
  });
  assert.equal(process.listenerCount("message"), before + 2);

  manager.stop();
  assert.equal(process.listenerCount("message"), before);
});
