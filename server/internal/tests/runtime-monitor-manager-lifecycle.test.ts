import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
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

function installShutdownTimerMocks(t: TestContext) {
  const fakeHandle = {
    unrefCalled: false,
    unref() {
      this.unrefCalled = true;
      return this;
    },
  };
  let capturedHandler: (() => void) | null = null;
  const setTimeoutMock = t.mock.method(
    globalThis,
    "setTimeout",
    (((handler: () => void, delayMs?: number) => {
      assert.equal(delayMs, 50);
      capturedHandler = handler;
      return fakeHandle as unknown as ReturnType<typeof setTimeout>;
    }) as unknown) as typeof setTimeout,
  );
  const clearTimeoutMock = t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: ReturnType<typeof setTimeout>) => {
      assert.equal(handle, fakeHandle as unknown as ReturnType<typeof setTimeout>);
    }) as unknown) as typeof clearTimeout,
  );

  return {
    clearTimeoutMock,
    fakeHandle,
    getCapturedHandler: () => capturedHandler,
    setTimeoutMock,
  };
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

test("runtime monitor stop cancels pending graceful shutdown callback", (t) => {
  const timerMocks = installShutdownTimerMocks(t);
  const manager = createTestRuntimeMonitorManager();
  const before = process.listenerCount("message");
  let gracefulShutdownCalls = 0;

  manager.attachProcessMessageHandlers({
    onGracefulShutdown: () => {
      gracefulShutdownCalls += 1;
    },
  });

  (process as unknown as { emit(event: "message", message: unknown): boolean })
    .emit("message", { type: "graceful-shutdown" });
  assert.equal(timerMocks.setTimeoutMock.mock.callCount(), 1);
  assert.equal(timerMocks.fakeHandle.unrefCalled, true);
  assert.equal(process.listenerCount("message"), before + 2);

  manager.stop();
  assert.equal(timerMocks.clearTimeoutMock.mock.callCount(), 1);
  assert.equal(process.listenerCount("message"), before);

  timerMocks.getCapturedHandler()?.();
  assert.equal(gracefulShutdownCalls, 0);
});
