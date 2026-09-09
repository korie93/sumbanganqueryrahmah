import assert from "node:assert/strict";
import test from "node:test";
import type { Options } from "express-rate-limit";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import {
  createRedisReconnectStrategy,
  createSharedRateLimitStore,
  REDIS_RATE_LIMIT_FALLBACK_MAX_KEYS,
  RedisRateLimitStore,
  RedisRateLimitStoreUnavailableError,
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
  multiCalls = 0;
  quitCalls = 0;
  private readonly listeners = new Map<string, Array<(error?: unknown) => void>>();

  constructor(private readonly entries: Map<string, FakeRedisEntry>) {}

  async connect(): Promise<void> {
    return undefined;
  }

  on(event: string, listener: (error?: unknown) => void) {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
    return this;
  }

  emit(event: string, error?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(error);
    }
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

  multi() {
    this.multiCalls += 1;
    const operations: Array<() => Promise<unknown>> = [];
    const pipeline = {
      get: (key: string) => {
        operations.push(() => this.get(key));
        return pipeline;
      },
      pTTL: (key: string) => {
        operations.push(() => this.pTTL(key));
        return pipeline;
      },
      exec: async () => Promise.all(operations.map((operation) => operation())),
    };
    return pipeline;
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

test("RedisRateLimitStore fails closed without worker-local quotas when Redis cannot connect", async () => {
  const warnings: unknown[] = [];
  const metricBefore = getInternalMetricsSnapshot().counters.redisRateLimitFallbackMemoryStoreUsesTotal;
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

  await assert.rejects(() => store.increment("client-1"), RedisRateLimitStoreUnavailableError);
  await assert.rejects(() => store.increment("client-1"), RedisRateLimitStoreUnavailableError);
  await assert.rejects(() => store.get("client-1"), RedisRateLimitStoreUnavailableError);
  await assert.rejects(() => store.decrement("client-1"), RedisRateLimitStoreUnavailableError);
  await assert.rejects(() => store.resetKey("client-1"), RedisRateLimitStoreUnavailableError);
  assert.equal(store.getFallbackStoreSizeForTests(), 0);
  assert.equal(
    getInternalMetricsSnapshot().counters.redisRateLimitFallbackMemoryStoreUsesTotal,
    metricBefore,
  );
  assert.equal(warnings.length, 1);

  now += 5_000;
  await assert.rejects(() => store.increment("client-1"), RedisRateLimitStoreUnavailableError);
  assert.equal(warnings.length, 2);
});

test("RedisRateLimitStore bounds fallback memory entries with LRU eviction", async () => {
  const store = new RedisRateLimitStore({
    config: {
      distributedStoreConfigured: false,
      provider: "memory",
      redisUrl: null,
    },
    logger: {
      warn() {},
    },
    prefix: "sqr:test:bounded-fallback",
  });
  initStore(store);

  for (let index = 0; index < REDIS_RATE_LIMIT_FALLBACK_MAX_KEYS + 5_000; index += 1) {
    await store.increment(`client-${index}`);
  }

  assert.ok(store.getFallbackStoreSizeForTests() <= REDIS_RATE_LIMIT_FALLBACK_MAX_KEYS);
  assert.equal(await store.get("client-0"), undefined);
  assert.equal((await store.get(`client-${REDIS_RATE_LIMIT_FALLBACK_MAX_KEYS + 4_999}`))?.totalHits, 1);
});

test("RedisRateLimitStore reads hits and TTL through a Redis pipeline", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  const client = new FakeRedisClient(entries);
  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => client,
    logger: {
      warn() {},
    },
    prefix: "sqr:test:pipeline",
  });
  initStore(store);

  await store.increment("client-1");
  assert.equal((await store.get("client-1"))?.totalHits, 1);
  assert.equal(client.multiCalls, 1);
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

  await assert.rejects(() => store.increment("client-1"), RedisRateLimitStoreUnavailableError);
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

  const rejectedIncrement = assert.rejects(
    () => store.increment("client-1"),
    RedisRateLimitStoreUnavailableError,
  );
  await new Promise((resolve) => setImmediate(resolve));
  const shutdownPromise = store.shutdown();
  resolveConnect();

  await rejectedIncrement;
  await shutdownPromise;

  assert.equal(factoryCalls, 1);
  assert.equal(createdClients[0]?.quitCalls, 1);
  await assert.rejects(() => store.increment("client-2"), RedisRateLimitStoreUnavailableError);
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

  await assert.rejects(() => store.increment("client-1"), RedisRateLimitStoreUnavailableError);
  assert.equal(createdClients[0]?.quitCalls, 1);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal(factoryCalls, 2);
});

test("RedisRateLimitStore drops disconnected clients so the next request reconnects", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  let factoryCalls = 0;
  const createdClients: FakeRedisClient[] = [];

  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => {
      factoryCalls += 1;
      const client = new FakeRedisClient(entries);
      createdClients.push(client);
      return client;
    },
    logger: {
      warn() {},
    },
    prefix: "sqr:test:disconnect",
    warningRepeatMs: 1,
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  createdClients[0]?.emit("end");

  assert.equal((await store.increment("client-1")).totalHits, 2);
  assert.equal(factoryCalls, 2);
});

test("RedisRateLimitStore ignores late client errors after shutdown", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  const warnings: WarningEntry[] = [];
  const createdClients: FakeRedisClient[] = [];

  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => {
      const client = new FakeRedisClient(entries);
      createdClients.push(client);
      return client;
    },
    logger: {
      warn(message, payload) {
        warnings.push({ message, payload });
      },
    },
    prefix: "sqr:test:late-shutdown-error",
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  await store.shutdown();
  createdClients[0]?.emit("error", new Error("late redis error after shutdown"));

  assert.equal(warnings.length, 0);
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

  await assert.rejects(() => store.increment("client-1"), RedisRateLimitStoreUnavailableError);
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

  await assert.rejects(() => store.increment("client-1"), RedisRateLimitStoreUnavailableError);
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

test("RedisRateLimitStore concurrent workers share account counters but isolate account and network subjects", async () => {
  const entries = new Map<string, FakeRedisEntry>();
  const stores = Array.from({ length: 4 }, () => new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => new FakeRedisClient(entries),
    prefix: "sqr:test:login-nat",
  }));
  stores.forEach(initStore);
  try {
    const hits = await Promise.all(Array.from({ length: 100 }, (_value, index) =>
      stores[index % stores.length].increment("account:staff-one")));
    assert.deepEqual(
      hits.map((hit) => hit.totalHits).sort((a, b) => a - b),
      Array.from({ length: 100 }, (_value, index) => index + 1),
    );
    assert.equal((await stores[0].increment("account:staff-two")).totalHits, 1);
    assert.equal((await stores[1].increment("network:staff-one")).totalHits, 1);
    assert.equal((await stores[2].get("account:staff-one"))?.totalHits, 100);
    assert.equal(entries.size, 3);
    assert.ok([...entries.keys()].every((key) => /^sqr:test:login-nat:[a-f0-9]{64}$/.test(key)));
    assert.ok(stores.every((store) => store.getFallbackStoreSizeForTests() === 0));
  } finally {
    await Promise.all(stores.map((store) => store.shutdown()));
  }
});

test("RedisRateLimitStore fixed windows retain expiry and reuse keys after reset", async (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const entries = new Map<string, FakeRedisEntry>();
  const store = new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => new FakeRedisClient(entries),
    prefix: "sqr:test:fixed-window",
  });
  initStore(store);
  try {
    const first = await store.increment("account:staff-one");
    assert.equal(first.resetTime?.getTime(), 61_000);
    now = 60_999;
    const second = await store.increment("account:staff-one");
    assert.equal(second.totalHits, 2);
    assert.equal(second.resetTime?.getTime(), 61_000);
    now = 61_000;
    assert.equal(await store.get("account:staff-one"), undefined);
    const nextWindow = await store.increment("account:staff-one");
    assert.equal(nextWindow.totalHits, 1);
    assert.equal(nextWindow.resetTime?.getTime(), 121_000);
    assert.equal(entries.size, 1);
  } finally {
    await store.shutdown();
  }
});

test("RedisRateLimitStore Redis failure rejects concurrent workers instead of granting independent account allowances", async () => {
  const metricBefore = getInternalMetricsSnapshot().counters.redisRateLimitFallbackMemoryStoreUsesTotal;
  const stores = Array.from({ length: 4 }, () => new RedisRateLimitStore({
    config: redisConfig,
    createRedisClient: () => ({
      async connect() {},
      async eval() { throw new Error("Redis connection interrupted"); },
      async get() { return null; },
      async pTTL() { return -2; },
      async decr() { return 0; },
      async del() { return 0; },
      async quit() {},
    }),
    logger: { warn() {} },
    prefix: "sqr:test:fail-closed-workers",
  }));
  stores.forEach(initStore);
  try {
    const results = await Promise.allSettled(Array.from({ length: 100 }, (_value, index) =>
      stores[index % stores.length].increment("account:staff-one")));
    assert.ok(results.every((result) =>
      result.status === "rejected" && result.reason instanceof RedisRateLimitStoreUnavailableError));
    assert.ok(stores.every((store) => store.getFallbackStoreSizeForTests() === 0));
    assert.equal(getInternalMetricsSnapshot().counters.redisRateLimitFallbackMemoryStoreUsesTotal, metricBefore);
  } finally {
    await Promise.all(stores.map((store) => store.shutdown()));
  }
});

test("RedisRateLimitStore explicit memory provider counts concurrent same-key increments atomically", async () => {
  const store = new RedisRateLimitStore({
    config: { distributedStoreConfigured: false, provider: "memory", redisUrl: null },
    prefix: "sqr:test:explicit-memory",
  });
  initStore(store);
  try {
    const hits = await Promise.all(Array.from({ length: 100 }, () => store.increment("account:staff-one")));
    assert.deepEqual(hits.map((hit) => hit.totalHits), Array.from({ length: 100 }, (_value, index) => index + 1));
    assert.equal((await store.get("account:staff-one"))?.totalHits, 100);
  } finally {
    await store.shutdown();
  }
});
