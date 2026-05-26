import assert from "node:assert/strict";
import test from "node:test";
import {
  RedisSessionRevocationStore,
  RedisSessionRevocationUnavailableError,
} from "../redis-session-revocation-store";

test("RedisSessionRevocationStore persists revoked JWT ids with a bounded TTL", async () => {
  const values = new Map<string, string>();
  const setCalls: Array<{ key: string; options: { PX: number }; value: string }> = [];
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        return undefined;
      },
      async get(key) {
        return values.get(key) ?? null;
      },
      async set(key, value, options) {
        values.set(key, value);
        setCalls.push({ key, options, value });
        return "OK";
      },
      async quit() {
        return undefined;
      },
    }),
    prefix: "sqr:test-session-revoked",
  });

  await store.revoke({
    jwtId: "jwt-1",
    expiresAtMs: Date.now() + 120_000,
  });

  assert.equal(setCalls.length, 1);
  assert.match(setCalls[0].key, /^sqr:test-session-revoked:[a-f0-9]{64}$/);
  assert.equal(setCalls[0].value, "1");
  assert.ok(setCalls[0].options.PX > 0);
  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(await store.isRevoked("jwt-2"), false);
});

test("RedisSessionRevocationStore rejects session checks closed when Redis is unavailable", async () => {
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let now = 1_000;
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        throw new Error("redis offline");
      },
      async get() {
        throw new Error("should not get");
      },
      async set() {
        throw new Error("should not set");
      },
      async quit() {
        return undefined;
      },
    }),
    logger: {
      warn(message: string, payload: unknown) {
        warnings.push({ message, payload });
      },
    },
    now: () => now,
    warningRepeatMs: 5_000,
  });

  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, "Redis session revocation store unavailable; rejecting session checks closed");

  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(warnings.length, 1);

  now += 5_000;
  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(warnings.length, 2);
});

test("RedisSessionRevocationStore retries after a failed Redis connection", async () => {
  let factoryCalls = 0;
  let getCalls = 0;
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => {
      factoryCalls += 1;
      const shouldFailConnect = factoryCalls === 1;
      return {
        async connect() {
          if (shouldFailConnect) {
            throw new Error("first redis connect failed");
          }
        },
        async get() {
          getCalls += 1;
          return null;
        },
        async set() {
          return "OK";
        },
        async quit() {
          return undefined;
        },
      };
    },
    logger: {
      warn() {
        return undefined;
      },
    },
  });

  assert.equal(await store.isRevoked("jwt-1"), true);
  assert.equal(await store.isRevoked("jwt-1"), false);
  assert.equal(factoryCalls, 2);
  assert.equal(getCalls, 1);
});

test("RedisSessionRevocationStore rejects revocation writes when Redis is unavailable", async () => {
  const store = new RedisSessionRevocationStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        throw new Error("redis offline");
      },
      async get() {
        return null;
      },
      async set() {
        return "OK";
      },
      async quit() {
        return undefined;
      },
    }),
    logger: {
      warn() {
        return undefined;
      },
    },
  });

  await assert.rejects(
    store.revoke({
      expiresAtMs: Date.now() + 120_000,
      jwtId: "jwt-1",
    }),
    RedisSessionRevocationUnavailableError,
  );
});
