import assert from "node:assert/strict";
import test from "node:test";
import { RedisTwoFactorReplayStore } from "../redis-two-factor-replay-store";

test("RedisTwoFactorReplayStore consumes a TOTP code once using SET NX with a bounded TTL", async () => {
  const setCalls: Array<{ key: string; options: { NX: true; PX: number }; value: string }> = [];
  const store = new RedisTwoFactorReplayStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        return undefined;
      },
      async set(key, value, options) {
        setCalls.push({ key, options, value });
        return setCalls.length === 1 ? "OK" : null;
      },
      async quit() {
        return undefined;
      },
    }),
    prefix: "sqr:test-2fa-replay",
    ttlMs: 120_000,
  });

  assert.equal(await store.consume({ code: "123456", purpose: "login", subjectId: "user-1" }), true);
  assert.equal(await store.consume({ code: "123456", purpose: "login", subjectId: "user-1" }), false);
  assert.equal(setCalls.length, 2);
  assert.match(setCalls[0].key, /^sqr:test-2fa-replay:[a-f0-9]{64}$/);
  assert.deepEqual(setCalls[0].options, { NX: true, PX: 120_000 });
  assert.equal(setCalls[0].value, "1");
});

test("RedisTwoFactorReplayStore rejects replay checks closed when Redis is unavailable", async () => {
  const warnings: Array<{ message: string; payload: unknown }> = [];
  const store = new RedisTwoFactorReplayStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        throw new Error("redis offline");
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
  });

  assert.equal(await store.consume({ code: "123456", purpose: "login", subjectId: "user-1" }), false);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, "Redis 2FA replay store unavailable; rejecting TOTP replay checks closed");
});

test("RedisTwoFactorReplayStore retries after a failed Redis connection", async () => {
  let factoryCalls = 0;
  let setCalls = 0;
  const store = new RedisTwoFactorReplayStore({
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
        async set() {
          setCalls += 1;
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

  assert.equal(await store.consume({ code: "654321", purpose: "setup", subjectId: "user-1" }), false);
  assert.equal(await store.consume({ code: "654321", purpose: "setup", subjectId: "user-1" }), true);
  assert.equal(factoryCalls, 2);
  assert.equal(setCalls, 1);
});
