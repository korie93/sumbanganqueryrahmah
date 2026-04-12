import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  bindPgPoolHealthCheck,
  bindPgPoolMonitoring,
  getPgPoolSnapshot,
  hasPgPoolPressure,
} from "../db-pool-monitor";

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

test("hasPgPoolPressure only reports pressure when clients are queueing", () => {
  assert.equal(
    hasPgPoolPressure({
      total: 3,
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

  assert.equal(
    hasPgPoolPressure({
      total: 3,
      idle: 0,
      waiting: 1,
      max: 3,
    }),
    true,
  );
});

test("bindPgPoolMonitoring does not warn while the pool can still create more clients", () => {
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
