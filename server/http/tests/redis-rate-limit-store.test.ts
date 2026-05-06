import assert from "node:assert/strict";
import test from "node:test";
import type { Options } from "express-rate-limit";
import {
  createSharedRateLimitStore,
  RedisRateLimitStore,
} from "../../middleware/redis-rate-limit-store";
import type { SharedRateLimitStoreConfig } from "../../middleware/rate-limit-runtime";

type FakeRedisEntry = {
  expiresAt: number;
  hits: number;
};

class FakeRedisClient {
  constructor(private readonly entries: Map<string, FakeRedisEntry>) {}

  async connect() {
    return undefined;
  }

  on() {
    return this;
  }

  async eval(_script: string, options: { arguments: string[]; keys: string[] }) {
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

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      return null;
    }

    return String(entry.hits);
  }

  async pTTL(key: string) {
    const entry = this.entries.get(key);
    return entry ? Math.max(-1, entry.expiresAt - Date.now()) : -2;
  }

  async decr(key: string) {
    const entry = this.entries.get(key);
    if (!entry) {
      return 0;
    }

    entry.hits -= 1;
    return entry.hits;
  }

  async del(key: string) {
    this.entries.delete(key);
    return 1;
  }

  async quit() {
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
    prefix: "sqr:test:fallback",
  });
  initStore(store);

  assert.equal((await store.increment("client-1")).totalHits, 1);
  assert.equal((await store.increment("client-1")).totalHits, 2);
  assert.equal((await store.get("client-1"))?.totalHits, 2);
  assert.equal(warnings.length, 1);
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
