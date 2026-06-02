import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  bindPgPoolHealthCheck,
  bindPgPoolMonitoring,
  getPgPoolSnapshot,
  getPgPoolUtilizationPercent,
  hasPgPoolPressure,
  isPgDeadlockError,
  resolvePgPoolPressureReason,
} from "../db-pool-monitor";
import { createInternalMetrics } from "../internal/metrics";

class FakePool extends EventEmitter {
  totalCount = 0;
  idleCount = 0;
  waitingCount = 0;
  options = {
    max: 0,
  };
  queryImpl: (() => Promise<unknown>) | null = null;

  async query(text: string) {
    if (!this.queryImpl) {
      return { rows: [{ "?column?": 1 }], text };
    }
    return this.queryImpl();
  }
}

test("getPgPoolSnapshot normalizes pool counters", () => {
  const pool = new FakePool();
  pool.totalCount = 4;
  pool.idleCount = 1;
  pool.waitingCount = 2;
  pool.options.max = 5;

  assert.deepEqual(getPgPoolSnapshot(pool), {
    total: 4,
    idle: 1,
    waiting: 2,
    max: 5,
  });
});

test("bindPgPoolMonitoring deduplicates repeated pressure warnings within the cooldown window", () => {
  const pool = new FakePool();
  pool.totalCount = 5;
  pool.idleCount = 0;
  pool.waitingCount = 2;
  pool.options.max = 5;

  const warnings: Array<Record<string, unknown>> = [];

  bindPgPoolMonitoring(pool, {
    warnCooldownMs: 60_000,
    logger: {
      warn: (_message, meta) => {
        warnings.push(meta || {});
      },
      error: () => undefined,
    },
  });

  pool.emit("acquire");
  pool.emit("acquire");

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.source, "pool-acquire");
  assert.equal(warnings[0]?.reason, "waiting_queue");
});

test("bindPgPoolMonitoring does not warn when the pool is only momentarily fully acquired without queueing", () => {
  const pool = new FakePool();
  pool.totalCount = 2;
  pool.idleCount = 0;
  pool.waitingCount = 0;
  pool.options.max = 5;

  const warnings: Array<Record<string, unknown>> = [];

  bindPgPoolMonitoring(pool, {
    logger: {
      warn: (_message, meta) => {
        warnings.push(meta || {});
      },
      error: () => undefined,
    },
  });

  pool.emit("acquire");

  assert.equal(warnings.length, 0);
});

test("hasPgPoolPressure reports queueing or high utilization pressure", () => {
  assert.equal(
    hasPgPoolPressure({
      total: 2,
      idle: 0,
      waiting: 0,
      max: 3,
    }),
    false,
  );

  assert.equal(
    hasPgPoolPressure({
      total: 3,
      idle: 0,
      waiting: 1,
      max: 5,
    }),
    false,
  );

  const queuedSnapshot = {
    total: 3,
    idle: 0,
    waiting: 1,
    max: 3,
  };
  assert.equal(hasPgPoolPressure(queuedSnapshot), true);
  assert.equal(resolvePgPoolPressureReason(queuedSnapshot), "waiting_queue");

  const highUtilizationSnapshot = {
    total: 9,
    idle: 0,
    waiting: 0,
    max: 10,
  };
  assert.equal(hasPgPoolPressure(highUtilizationSnapshot), true);
  assert.equal(resolvePgPoolPressureReason(highUtilizationSnapshot), "high_utilization");
  assert.equal(getPgPoolUtilizationPercent(highUtilizationSnapshot), 90);
});

test("bindPgPoolMonitoring warns before queueing when utilization crosses the high threshold", () => {
  const pool = new FakePool();
  pool.totalCount = 9;
  pool.idleCount = 0;
  pool.waitingCount = 0;
  pool.options.max = 10;

  const warnings: Array<Record<string, unknown>> = [];

  bindPgPoolMonitoring(pool, {
    logger: {
      warn: (_message, meta) => {
        warnings.push(meta || {});
      },
      error: () => undefined,
    },
  });

  pool.emit("acquire");

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.reason, "high_utilization");
  assert.equal(warnings[0]?.utilizationPercent, 90);
});

test("bindPgPoolMonitoring does not warn below high utilization while the pool can still create more clients", () => {
  const pool = new FakePool();
  pool.totalCount = 1;
  pool.idleCount = 0;
  pool.waitingCount = 1;
  pool.options.max = 5;

  const warnings: Array<Record<string, unknown>> = [];

  bindPgPoolMonitoring(pool, {
    logger: {
      warn: (_message, meta) => {
        warnings.push(meta || {});
      },
      error: () => undefined,
    },
  });

  pool.emit("acquire");

  assert.equal(warnings.length, 0);
});

test("bindPgPoolMonitoring logs pool client errors with the current snapshot", () => {
  const pool = new FakePool();
  pool.totalCount = 3;
  pool.idleCount = 1;
  pool.waitingCount = 0;
  pool.options.max = 5;

  const errors: Array<Record<string, unknown>> = [];

  bindPgPoolMonitoring(pool, {
    logger: {
      warn: () => undefined,
      error: (_message, meta) => {
        errors.push(meta || {});
      },
    },
  });

  pool.emit("error", new Error("socket lost"));

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.total, 3);
  assert.equal((errors[0]?.error as Error)?.message, "socket lost");
});

test("bindPgPoolMonitoring records connection lifecycle counters and pressure gauges", () => {
  const pool = new FakePool();
  pool.totalCount = 4;
  pool.idleCount = 1;
  pool.waitingCount = 2;
  pool.options.max = 5;
  const metrics = createInternalMetrics();

  bindPgPoolMonitoring(pool, {
    metrics,
    logger: {
      warn: () => undefined,
      error: () => undefined,
    },
  });

  pool.emit("connect");
  let snapshot = metrics.snapshot();
  assert.equal(snapshot.counters.dbPoolConnectionsCreatedTotal, 1);
  assert.equal(snapshot.gauges.dbPoolActiveConnections, 3);
  assert.equal(snapshot.gauges.dbPoolIdleConnections, 1);
  assert.equal(snapshot.gauges.dbPoolWaitingClients, 2);
  assert.equal(snapshot.gauges.dbPoolUtilizationPercent, 60);

  pool.totalCount = 3;
  pool.idleCount = 2;
  pool.waitingCount = 0;
  pool.emit("remove");
  snapshot = metrics.snapshot();
  assert.equal(snapshot.counters.dbPoolConnectionsRemovedTotal, 1);
  assert.equal(snapshot.gauges.dbPoolActiveConnections, 1);
  assert.equal(snapshot.gauges.dbPoolIdleConnections, 2);
  assert.equal(snapshot.gauges.dbPoolWaitingClients, 0);
  assert.equal(snapshot.gauges.dbPoolUtilizationPercent, 20);
});

test("isPgDeadlockError classifies PostgreSQL deadlock SQLSTATE only", () => {
  assert.equal(isPgDeadlockError(Object.assign(new Error("deadlock"), { code: "40P01" })), true);
  assert.equal(isPgDeadlockError(Object.assign(new Error("serialization"), { code: "40001" })), false);
  assert.equal(isPgDeadlockError(new Error("deadlock")), false);
});

test("bindPgPoolMonitoring records deadlocks with a sanitized metric event", () => {
  const pool = new FakePool();
  pool.totalCount = 4;
  pool.idleCount = 0;
  pool.waitingCount = 1;
  pool.options.max = 4;

  const metrics = createInternalMetrics();
  const errors: Array<{ message: string; meta: Record<string, unknown> }> = [];

  bindPgPoolMonitoring(pool, {
    metrics,
    logger: {
      warn: () => undefined,
      error: (message, meta) => {
        errors.push({ message, meta: meta || {} });
      },
    },
  });

  pool.emit("error", Object.assign(new Error("deadlock detected"), {
    code: "40P01",
    query: "SELECT secret FROM users",
  }));

  assert.equal(metrics.snapshot().counters.dbDeadlocksTotal, 1);
  assert.equal(errors[0]?.message, "PostgreSQL deadlock detected");
  assert.equal(errors[0]?.meta.event, "db_deadlock_detected");
  assert.equal(errors[0]?.meta.code, "40P01");
  assert.equal("query" in (errors[0]?.meta || {}), false);
  assert.equal(errors[1]?.message, "PostgreSQL pool client error");
});

test("bindPgPoolMonitoring cleanup removes all pool listeners across restarts", () => {
  const pool = new FakePool();

  for (let index = 0; index < 12; index += 1) {
    const stopMonitoring = bindPgPoolMonitoring(pool, {
      logger: {
        warn: () => undefined,
        error: () => undefined,
      },
    });

    assert.equal(pool.listenerCount("connect"), 1);
    assert.equal(pool.listenerCount("acquire"), 1);
    assert.equal(pool.listenerCount("remove"), 1);
    assert.equal(pool.listenerCount("error"), 1);

    stopMonitoring();

    assert.equal(pool.listenerCount("connect"), 0);
    assert.equal(pool.listenerCount("acquire"), 0);
    assert.equal(pool.listenerCount("remove"), 0);
    assert.equal(pool.listenerCount("error"), 0);
  }
});

test("bindPgPoolMonitoring cleanup supports EventEmitter removeListener fallback", () => {
  const pool = new FakePool();
  Object.defineProperty(pool, "off", {
    configurable: true,
    value: undefined,
  });

  const stopMonitoring = bindPgPoolMonitoring(pool, {
    logger: {
      warn: () => undefined,
      error: () => undefined,
    },
  });

  assert.equal(pool.listenerCount("acquire"), 1);
  stopMonitoring();
  assert.equal(pool.listenerCount("connect"), 0);
  assert.equal(pool.listenerCount("acquire"), 0);
  assert.equal(pool.listenerCount("remove"), 0);
  assert.equal(pool.listenerCount("error"), 0);
});

test("bindPgPoolMonitoring cleanup fails visibly when listener removal is unavailable", () => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const pool = {
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    options: { max: 0 },
    on(event: string, listener: (...args: unknown[]) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
  };
  const errors: Array<{ message: string; meta: Record<string, unknown> }> = [];

  const stopMonitoring = bindPgPoolMonitoring(pool, {
    logger: {
      warn: () => undefined,
      error: (message, meta) => {
        errors.push({ message, meta: meta || {} });
      },
    },
  });

  assert.throws(stopMonitoring, /listener removal is unavailable/);
  assert.equal(errors.length, 4);
  assert.equal(errors[0]?.message, "Failed to remove PostgreSQL pool listener");
  assert.equal(errors[0]?.meta.event, "pg_pool_listener_removal_failed");
  assert.equal(listeners.get("connect")?.length, 1);
  assert.equal(listeners.get("acquire")?.length, 1);
  assert.equal(listeners.get("remove")?.length, 1);
  assert.equal(listeners.get("error")?.length, 1);
});

test("bindPgPoolMonitoring warns when registering above the listener threshold", () => {
  const pool = new FakePool();
  const noop = () => undefined;
  for (let index = 0; index < 6; index += 1) {
    pool.on("acquire", noop);
  }
  const warnings: Array<Record<string, unknown>> = [];

  const stopMonitoring = bindPgPoolMonitoring(pool, {
    logger: {
      warn: (_message, meta) => {
        warnings.push(meta || {});
      },
      error: () => undefined,
    },
  });

  stopMonitoring();
  pool.removeAllListeners("acquire");

  assert.equal(warnings.some((warning) => warning.event === "pg_pool_listener_count_high"), true);
  assert.equal(warnings.find((warning) => warning.event === "pg_pool_listener_count_high")?.poolEvent, "acquire");
});

test("bindPgPoolMonitoring rejects listener registration at the hard limit and cleans up partial registrations", () => {
  const pool = new FakePool();
  const noop = () => undefined;
  for (let index = 0; index < 10; index += 1) {
    pool.on("acquire", noop);
  }
  const metrics = createInternalMetrics();
  const errors: Array<{ message: string; meta: Record<string, unknown> }> = [];

  assert.throws(
    () => bindPgPoolMonitoring(pool, {
      metrics,
      logger: {
        warn: () => undefined,
        error: (message, meta) => {
          errors.push({ message, meta: meta || {} });
        },
      },
    }),
    /listener hard limit reached/,
  );

  assert.equal(pool.listenerCount("connect"), 0);
  assert.equal(pool.listenerCount("acquire"), 10);
  assert.equal(pool.listenerCount("remove"), 0);
  assert.equal(pool.listenerCount("error"), 0);
  assert.equal(metrics.snapshot().counters.dbPoolListenerRegistrationRejectedTotal, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "PostgreSQL pool listener hard limit reached");
  assert.equal(errors[0]?.meta.event, "pg_pool_listener_count_hard_limit");
  assert.equal(errors[0]?.meta.action, "listener_rejected");
  assert.equal(errors[0]?.meta.hardLimit, 10);
  assert.equal(errors[0]?.meta.listenerCount, 10);
  assert.equal(errors[0]?.meta.poolEvent, "acquire");

  pool.removeAllListeners("acquire");
});

test("bindPgPoolHealthCheck logs failures from a periodic SELECT 1 probe", async () => {
  const pool = new FakePool();
  const warnings: Array<Record<string, unknown>> = [];
  let queryCalls = 0;
  pool.queryImpl = async () => {
    queryCalls += 1;
    throw new Error("database unavailable");
  };

  const stopHealthCheck = bindPgPoolHealthCheck(pool, {
    intervalMs: 1_000,
    timeoutMs: 250,
    logger: {
      warn: (_message, meta) => {
        warnings.push(meta || {});
      },
      error: () => undefined,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  stopHealthCheck();

  assert.equal(queryCalls > 0, true);
  assert.equal(warnings.length > 0, true);
  assert.equal((warnings[0]?.error as Error)?.message, "database unavailable");
});

test("bindPgPoolHealthCheck catches synchronous query failures and recovers with backoff probes", async () => {
  const pool = new FakePool();
  let currentTime = 10_000;
  let queryCalls = 0;
  let queryShouldFail = true;
  pool.query = () => {
    queryCalls += 1;
    if (queryShouldFail) {
      throw new Error("sync database failure");
    }
    return Promise.resolve({ rows: [{ ok: 1 }] });
  };
  const metrics = createInternalMetrics();
  const warnings: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let intervalCallback: (() => void) | null = null;
  let clearCalls = 0;
  let unrefCalls = 0;

  globalThis.setInterval = (((handler: TimerHandler, _timeout?: number, ..._args: unknown[]) => {
    intervalCallback = typeof handler === "function" ? () => handler() : null;
    const fakeHandle = {
      unref() {
        unrefCalls += 1;
        return fakeHandle;
      },
    } as ReturnType<typeof setInterval>;
    return fakeHandle;
  }) as unknown) as typeof setInterval;

  globalThis.clearInterval = (((handle?: Parameters<typeof clearInterval>[0]) => {
    if (handle) {
      clearCalls += 1;
    }
  }) as unknown) as typeof clearInterval;

  try {
    const stopHealthCheck = bindPgPoolHealthCheck(pool, {
      intervalMs: 1_000,
      timeoutMs: 250,
      metrics,
      now: () => currentTime,
      random: () => 0,
      recoveryBaseDelayMs: 1_000,
      recoveryMaxDelayMs: 1_000,
      logger: {
        warn: (_message, meta) => {
          warnings.push(meta || {});
        },
        error: (_message, meta) => {
          errors.push(meta || {});
        },
      },
    });

    assert.equal(unrefCalls, 1);
    assert.notEqual(intervalCallback, null);

    const triggerInterval = () => {
      const callback = intervalCallback;
      if (!callback) {
        throw new Error("Expected captured interval callback");
      }
      callback();
    };

    for (let index = 0; index < 5; index += 1) {
      triggerInterval();
      await new Promise((resolve) => setImmediate(resolve));
    }

    let snapshot = metrics.snapshot();
    assert.equal(queryCalls, 5);
    assert.equal(snapshot.counters.dbHealthCheckFailuresTotal, 5);
    assert.equal(snapshot.counters.dbHealthCheckCircuitBreaksTotal, 1);
    assert.equal(snapshot.counters.dbHealthCheckRecoveryAttemptsTotal, 0);
    assert.equal(warnings.length, 5);
    assert.equal(errors.length, 1);
    assert.equal(clearCalls, 0);

    triggerInterval();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(queryCalls, 5);

    currentTime += 1_000;
    queryShouldFail = false;
    triggerInterval();
    await new Promise((resolve) => setImmediate(resolve));

    snapshot = metrics.snapshot();
    assert.equal(queryCalls, 6);
    assert.equal(snapshot.counters.dbHealthCheckRecoveryAttemptsTotal, 1);
    assert.equal(snapshot.counters.dbHealthCheckRecoverySuccessTotal, 1);
    stopHealthCheck();
    assert.equal(clearCalls, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("bindPgPoolHealthCheck skips concurrent probes and releases the running flag on success", async () => {
  const pool = new FakePool();
  const metrics = createInternalMetrics();
  let resolveQuery: ((value: unknown) => void) | null = null;
  let queryCalls = 0;
  pool.queryImpl = () => {
    queryCalls += 1;
    return new Promise((resolve) => {
      resolveQuery = resolve;
    });
  };
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let intervalCallback: (() => void) | null = null;

  globalThis.setInterval = (((handler: TimerHandler, _timeout?: number, ..._args: unknown[]) => {
    intervalCallback = typeof handler === "function" ? () => handler() : null;
    const fakeHandle = {
      unref() {
        return fakeHandle;
      },
    } as ReturnType<typeof setInterval>;
    return fakeHandle;
  }) as unknown) as typeof setInterval;

  globalThis.clearInterval = ((() => undefined) as unknown) as typeof clearInterval;

  try {
    const stopHealthCheck = bindPgPoolHealthCheck(pool, {
      intervalMs: 1_000,
      timeoutMs: 1_000,
      metrics,
      logger: {
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const triggerInterval = () => {
      const callback = intervalCallback;
      if (!callback) {
        throw new Error("Expected captured interval callback");
      }
      callback();
    };
    const resolvePendingQuery = () => {
      const resolve = resolveQuery;
      if (!resolve) {
        throw new Error("Expected pending query resolver");
      }
      resolve({ rows: [{ ok: 1 }] });
    };

    triggerInterval();
    triggerInterval();
    assert.equal(queryCalls, 1);
    assert.equal(metrics.snapshot().counters.dbHealthCheckSkippedConcurrentTotal, 1);

    resolvePendingQuery();
    await new Promise((resolve) => setImmediate(resolve));
    triggerInterval();
    assert.equal(queryCalls, 2);

    resolvePendingQuery();
    await new Promise((resolve) => setImmediate(resolve));
    stopHealthCheck();
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("bindPgPoolHealthCheck cleanup stops future interval probes", async () => {
  const pool = new FakePool();
  let queryCalls = 0;
  pool.queryImpl = async () => {
    queryCalls += 1;
    return { rows: [{ ok: 1 }] };
  };

  const stopHealthCheck = bindPgPoolHealthCheck(pool, {
    intervalMs: 1_000,
    timeoutMs: 250,
    logger: {
      warn: () => undefined,
      error: () => undefined,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  stopHealthCheck();
  const callsAfterStop = queryCalls;
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(callsAfterStop > 0, true);
  assert.equal(queryCalls, callsAfterStop);
});
