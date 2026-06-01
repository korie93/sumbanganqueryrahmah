import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePgPoolShutdownTimeoutMs,
  shutdownPgPoolSafely,
} from "../../internal/pg-pool-shutdown";

function createLogger() {
  return {
    infoCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    warnCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    errorCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    info(message: string, metadata?: Record<string, unknown>) {
      this.infoCalls.push({ message, metadata });
    },
    warn(message: string, metadata?: Record<string, unknown>) {
      this.warnCalls.push({ message, metadata });
    },
    error(message: string, metadata?: Record<string, unknown>) {
      this.errorCalls.push({ message, metadata });
    },
  };
}

function lastCall<T>(calls: T[]): T | undefined {
  return calls[calls.length - 1];
}

test("resolvePgPoolShutdownTimeoutMs keeps shutdown bounds inside a safe window", () => {
  assert.equal(resolvePgPoolShutdownTimeoutMs(25_000), 5_000);
  assert.equal(resolvePgPoolShutdownTimeoutMs(3_000), 1_500);
  assert.equal(resolvePgPoolShutdownTimeoutMs(500), 1_000);
});

test("shutdownPgPoolSafely logs pool end failures instead of swallowing them", async () => {
  const logger = createLogger();
  let stopBackgroundTasksCalls = 0;

  const closed = await shutdownPgPoolSafely({
    logger,
    phase: "graceful-shutdown",
    timeoutMs: 1_000,
    stopBackgroundTasks: () => {
      stopBackgroundTasksCalls += 1;
    },
    poolRef: {
      end: async () => {
        throw new Error("pool close failed");
      },
    },
  });

  assert.equal(closed, false);
  assert.equal(stopBackgroundTasksCalls, 1);
  assert.equal(logger.errorCalls[0]?.message, "Failed to close PostgreSQL pool during shutdown");
  assert.equal(logger.errorCalls[0]?.metadata?.event, "db_pool_drain_error");
  assert.equal(logger.infoCalls[0]?.metadata?.event, "db_pool_drain_start");
  assert.equal(lastCall(logger.infoCalls)?.metadata?.event, "db_pool_drain_complete");
  assert.equal(lastCall(logger.infoCalls)?.metadata?.outcome, "error");
});

test("shutdownPgPoolSafely enforces a timeout boundary when pool close hangs", async () => {
  const logger = createLogger();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let clearedHandle: ReturnType<typeof setTimeout> | null = null;

  globalThis.setTimeout = (((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
    const fakeHandle = {
      unref() {
        return fakeHandle;
      },
    } as ReturnType<typeof setTimeout>;
    void args;
    queueMicrotask(() => {
      if (typeof handler === "function") {
        handler();
      }
    });
    return fakeHandle;
  }) as unknown) as typeof setTimeout;

  globalThis.clearTimeout = (((handle?: Parameters<typeof clearTimeout>[0]) => {
    if (handle) {
      clearedHandle = handle as ReturnType<typeof setTimeout>;
    }
  }) as unknown) as typeof clearTimeout;

  try {
    const closed = await shutdownPgPoolSafely({
      logger,
      phase: "startup-failure",
      timeoutMs: 50,
      stopBackgroundTasks: () => undefined,
      poolRef: {
        end: () => new Promise<void>(() => undefined),
      },
    });

    assert.equal(closed, false);
    assert.equal(logger.errorCalls[0]?.message, "PostgreSQL pool shutdown timed out");
    assert.equal(logger.warnCalls[0]?.message, "PostgreSQL pool shutdown drain timed out");
    assert.equal(logger.warnCalls[0]?.metadata?.event, "db_pool_drain_timeout");
    assert.equal(logger.warnCalls[0]?.metadata?.action, "continue_shutdown_after_timeout");
    assert.equal(lastCall(logger.infoCalls)?.metadata?.outcome, "timeout");
    assert.notEqual(clearedHandle, null);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("shutdownPgPoolSafely logs background task cleanup failures too", async () => {
  const logger = createLogger();

  const closed = await shutdownPgPoolSafely({
    logger,
    phase: "graceful-shutdown",
    timeoutMs: 1_000,
    stopBackgroundTasks: () => {
      throw new Error("stop failed");
    },
    poolRef: {
      end: async () => undefined,
    },
  });

  assert.equal(closed, true);
  assert.equal(
    logger.errorCalls[0]?.message,
    "Failed to stop PostgreSQL pool background tasks during shutdown",
  );
  assert.equal(logger.infoCalls[0]?.metadata?.event, "db_pool_drain_start");
  assert.equal(lastCall(logger.infoCalls)?.metadata?.outcome, "closed");
});

test("shutdownPgPoolSafely logs start and completion when pool closes cleanly", async () => {
  const logger = createLogger();

  const closed = await shutdownPgPoolSafely({
    logger,
    phase: "graceful-shutdown",
    timeoutMs: 1_000,
    stopBackgroundTasks: () => undefined,
    poolRef: {
      end: async () => undefined,
    },
  });

  assert.equal(closed, true);
  assert.equal(logger.infoCalls[0]?.message, "PostgreSQL pool shutdown drain started");
  assert.equal(logger.infoCalls[0]?.metadata?.event, "db_pool_drain_start");
  assert.equal(lastCall(logger.infoCalls)?.message, "PostgreSQL pool shutdown drain completed");
  assert.equal(lastCall(logger.infoCalls)?.metadata?.event, "db_pool_drain_complete");
  assert.equal(lastCall(logger.infoCalls)?.metadata?.outcome, "closed");
});
