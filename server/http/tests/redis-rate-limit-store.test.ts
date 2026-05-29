import assert from "node:assert/strict";
import test from "node:test";
import type { Options } from "express-rate-limit";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import {
  createRedisReconnectStrategy,
  createSharedRateLimitStore,
  RedisRateLimitStore,
} from "../../middleware/redis-rate-limit-store";
import type { SharedRateLimitStoreConfig } from "../../middleware/rate-limit-runtime";

type FakeRedisEntry = {
  expiresAt: number;
  hits: number;
};

type WarningEntry = {
  message: unknown;
  payload: unknown;
};

function readWarningEvent(warning: WarningEntry): unknown {
  if (typeof warning.payload !== "object" || warning.payload === null || !("event" in warning.payload)) {
    return undefined;
  }

  return warning.payload.event;
}

class FakeRedisClient {
  quitCalls = 0;

  constructor(private readonly entries: Map<string, FakeRedisEntry>) {}

  async connect(): Promise<void> {
    return undefined;
  }

  on() {
    return this;
  }

  async eval(_script: string, options: { arguments: string[]; keys: string[] }): Promise<unknown> {
    const key = options.keys[0];
    const windowMs = Number.parseInt(options.arguments[0], 10);
    const nowMs = Date.now();
    const entry = this.entries.get(key);
    const nextEntry = entry && entry.expiresAt > nowMs
      ? {
          hits: entry.hits + 1,
          expiresAt: entry.expiresAt,
        }
      : {
          hits: 1,
          expiresAt: nowMs + windowMs,
        };

    this.entries.set(key, nextEntry);
    return [nextEntry.hits, Math.max(0, nextEntry.expiresAt - nowMs)];
  }

  async get(key: string): Promise<unknown> {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      return null;
    }

    return String(entry.hits);
  }

  async pTTL(key: string): Promise<unknown> {
    const entry = this.entries.get(key);
    return entry ? Math.max(-1, entry.expiresAt - Date.now()) : -2;
  }

  async decr(key: string): Promise<unknown> {
    const entry = this.entries.get(key);
    if (!entry) {
      return 0;
    }

    entry.hits -= 1;
    return entry.hits;
  }

  async del(key: string): Promise<unknown> {
    this.entries.delete(key);
    return 1;
  }

  async quit(): Promise<void> {
    this.quitCalls += 1;
    return undefined;
  }
}

const redisConfig: SharedRateLimitStoreConfig = {
  distributedStoreConfigured: true,
  provider: "redis",
  redisUrl: "redis://redis.internal:6379/0",
};

function initStore(store: RedisRateLimitStore) {
  store.init({
    windowMs: 60_000,
  } as Options);
}

test("RedisRateLimitStore shares counters across store instances", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  const createRedisClient = () => new FakeRedisClient(entries);
  const firstStore = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient,
    prefix: "sqr:test:shared",
  });
  const secondStore = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient,
    prefix: "sqr:test:shared",
  });
  initStore(firstStore);
  initStore(secondStore);

  assert.equal((await firstStore.increment("client-1")).totalHits, 1);
  assert.equal((await secondStore.increment("client-1")).totalHits, 2);
  assert.equal((await firstStore.get("client-1"))?.totalHits, 2);

  await secondStore.resetKey("client-1");
  assert.equal(await firstStore.get("client-1"), undefined);
});

test("RedisRateLimitStore falls back to memory when Redis cannot connect", async () => {
  const warnings: unknown[] = [];
  let now = 1_000;
  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => ({
      connect: async () => {
        throw new Error("redis unavailable");
      },
      decr: async () => 0,
      del: async () => 0,
      eval: async () => [1, 60_000],
      get: async () => null,
      pTTL: async () => -2,
    }),
    logger: {
      warn(message, payload) {
        warnings.push({ message, payload });
      },
    },
    now: () => now,
    prefix: "sqr:test:fallback",
    warningRepeatMs: 5_000,
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal((await store.increment("client-1")).totalHits, 2);
  assert.equal((await store.get("client-1"))?.totalHits, 2);
  assert.equal(warnings.length, 1);

  now += 5_000;
  assert.equal((await store.increment("client-1")).totalHits, 3);
  assert.equal(warnings.length, 2);
});

test("RedisRateLimitStore retries Redis after a failed connection instead of permanently disabling it", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  let factoryCalls = 0;
  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => {
      factoryCalls += 1;
      if (factoryCalls === 1) {
        return {
          connect: async () => {
            throw new Error("first redis connect failed");
          },
          decr: async () => 0,
          del: async () => 0,
          eval: async () => [1, 60_000],
          get: async () => null,
          pTTL: async () => -2,
        };
      }

      return new FakeRedisClient(entries);
    },
    logger: {
      warn() {},
    },
    prefix: "sqr:test:reconnect",
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal(factoryCalls, 1);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal(factoryCalls, 2);
  assert.equal((await store.increment("client-1")).totalHits, 2);
});

test("RedisRateLimitStore shutdown waits for pending connect and blocks new Redis clients", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  let factoryCalls = 0;
  let resolveConnect: () => void = () => {
    throw new Error("Slow Redis connect was not initialized.");
  };
  const createdClients: FakeRedisClient[] = [];

  class SlowFakeRedisClient extends FakeRedisClient {
    async connect(): Promise<void> {
      await new Promise<void>((resolve) => {
        resolveConnect = resolve;
      });
    }
  }

  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => {
      factoryCalls += 1;
      const client = new SlowFakeRedisClient(entries);
      createdClients.push(client);
      return client;
    },
    logger: {
      warn() {},
    },
    prefix: "sqr:test:shutdown-race",
  });
  initStore(store);

  const incrementPromise = store.increment("client-1");
  await new Promise((resolve) => setImmediate(resolve));
  const shutdownPromise = store.shutdown();
  resolveConnect();

  assert.equal((await incrementPromise).totalHits, 1);
  await shutdownPromise;

  assert.equal(factoryCalls, 1);
  assert.equal(createdClients[0]?.quitCalls, 1);
  assert.equal((await store.increment("client-2")).totalHits, 1);
  assert.equal(factoryCalls, 1);
});

test("RedisRateLimitStore closes a failed command client before retrying", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  let factoryCalls = 0;
  const createdClients: FakeRedisClient[] = [];

  class FailingEvalRedisClient extends FakeRedisClient {
    async eval(_script: string, _options: { arguments: string[]; keys: string[] }): Promise<unknown> {
      throw new Error("redis command failed");
    }
  }

  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => {
      factoryCalls += 1;
      const client = factoryCalls === 1
        ? new FailingEvalRedisClient(entries)
        : new FakeRedisClient(entries);
      createdClients.push(client);
      return client;
    },
    logger: {
      warn() {},
    },
    prefix: "sqr:test:command-failure",
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal(createdClients[0]?.quitCalls, 1);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal(factoryCalls, 2);
});

test("RedisRateLimitStore records eval type errors when Lua returns null", async () => {
  const warnings: WarningEntry[] = [];
  const metricBefore = getInternalMetricsSnapshot().counters.redisRateLimitEvalTypeErrorsTotal;
  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => ({
      connect: async () => undefined,
      decr: async () => 0,
      del: async () => 0,
      eval: async () => null,
      get: async () => null,
      pTTL: async () => -2,
      quit: async () => undefined,
    }),
    logger: {
      warn(message, payload) {
        warnings.push({ message, payload });
      },
    },
    prefix: "sqr:test:eval-null",
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal(
    getInternalMetricsSnapshot().counters.redisRateLimitEvalTypeErrorsTotal,
    metricBefore + 1,
  );
  assert.ok(warnings.some((warning) => readWarningEvent(warning) === "redis_rate_limit_eval_type_error"));
});

test("RedisRateLimitStore rejects string values from eval instead of coercing them", async () => {
  const warnings: WarningEntry[] = [];
  const metricBefore = getInternalMetricsSnapshot().counters.redisRateLimitEvalTypeErrorsTotal;
  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => ({
      connect: async () => undefined,
      decr: async () => 0,
      del: async () => 0,
      eval: async () => ["3", "57"],
      get: async () => null,
      pTTL: async () => -2,
      quit: async () => undefined,
    }),
    logger: {
      warn(message, payload) {
        warnings.push({ message, payload });
      },
    },
    prefix: "sqr:test:eval-string",
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal(
    getInternalMetricsSnapshot().counters.redisRateLimitEvalTypeErrorsTotal,
    metricBefore + 1,
  );
  assert.ok(warnings.some((warning) => readWarningEvent(warning) === "redis_rate_limit_eval_type_error"));
});

test("createRedisReconnectStrategy uses bounded exponential backoff and structured warnings", () => {
  const warnings: unknown[] = [];
  const strategy = createRedisReconnectStrategy({
    warn(message, payload) {
      warnings.push({ message, payload });
    },
  });

  assert.equal(strategy(0, new Error("redis down")), 500);
  assert.equal(strategy(3, new Error("redis down")), 4_000);
  assert.equal(strategy(20, new Error("redis down")), 30_000);
  assert.equal(warnings.length, 3);
});

test("createSharedRateLimitStore only builds Redis stores for redis configuration", () => {
  assert.equal(
    createSharedRateLimitStore({
      config: {
        distributedStoreConfigured: false,
        provider: "memory",
        redisUrl: null,
      },
      prefix: "sqr:test:memory",
    }),
    undefined,
  );
  assert.ok(
    createSharedRateLimitStore({
      config: redisConfig,
      prefix: "sqr:test:redis",
    }) instanceof RedisRateLimitStore,
  );
});
