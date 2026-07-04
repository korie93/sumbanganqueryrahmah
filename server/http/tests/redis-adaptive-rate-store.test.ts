import assert from "node:assert/strict";
import test from "node:test";
import { RedisAdaptiveRateStateStore } from "../../internal/redis-adaptive-rate-store";

test("RedisAdaptiveRateStateStore increments adaptive buckets through Redis with bounded TTL inputs", async () => {
  const evalCalls: Array<{ arguments: string[]; keys: string[] }> = [];
  let connectCalls = 0;
  let quitCalls = 0;
  const store = new RedisAdaptiveRateStateStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        connectCalls += 1;
      },
      async eval(_script, options) {
        evalCalls.push(options);
        return [3, 1_000, 11_000];
      },
      async quit() {
        quitCalls += 1;
      },
    }),
    prefix: "sqr:test-adaptive",
  });

  const bucket = await store.increment({
    bucketKey: "203.0.113.10:api",
    now: 1_000,
    staleGraceMs: 10_000,
    windowMs: 10_000,
  });

  assert.deepEqual(bucket, {
    count: 3,
    lastSeenAt: 1_000,
    resetAt: 11_000,
  });
  assert.equal(connectCalls, 1);
  assert.equal(evalCalls.length, 1);
  assert.match(evalCalls[0].keys[0], /^sqr:test-adaptive:[a-f0-9]{64}$/);
  assert.deepEqual(evalCalls[0].arguments, ["1000", "10000", "10000"]);

  await store.close();
  assert.equal(quitCalls, 1);
});

test("RedisAdaptiveRateStateStore keeps concurrent adaptive increments on atomic Redis eval", async () => {
  const evalCalls: Array<{ script: string; arguments: string[]; keys: string[] }> = [];
  let connectCalls = 0;
  let count = 0;
  const store = new RedisAdaptiveRateStateStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        connectCalls += 1;
      },
      async eval(script, options) {
        evalCalls.push({ script, ...options });
        await Promise.resolve();
        count += 1;
        return [count, Number(options.arguments[0]), Number(options.arguments[0]) + Number(options.arguments[1])];
      },
      async quit() {
        return undefined;
      },
    }),
    prefix: "sqr:test-adaptive-concurrent",
  });

  const buckets = await Promise.all(
    Array.from({ length: 50 }, (_value, index) =>
      store.increment({
        bucketKey: "203.0.113.10:api",
        now: 1_000 + index,
        staleGraceMs: 10_000,
        windowMs: 10_000,
      })),
  );

  assert.equal(connectCalls, 1);
  assert.equal(evalCalls.length, 50);
  assert.deepEqual(
    buckets.map((bucket) => bucket?.count),
    Array.from({ length: 50 }, (_value, index) => index + 1),
  );
  assert.equal(new Set(evalCalls.map((call) => call.keys[0])).size, 1);
  assert.match(evalCalls[0].script, /redis\.call\("GET", KEYS\[1\]\)/);
  assert.match(evalCalls[0].script, /redis\.call\("SET", KEYS\[1\], nextBucket, "PX", ttlMs\)/);
  assert.doesNotMatch(evalCalls[0].script, /\bINCR\b/);

  await store.close();
});

test("RedisAdaptiveRateStateStore returns null after Redis failures so middleware can fail closed", async () => {
  const warnings: Array<{ message: string; payload: unknown }> = [];
  let now = 1_000;
  const store = new RedisAdaptiveRateStateStore({
    config: {
      distributedStoreConfigured: true,
      provider: "redis",
      redisUrl: "redis://localhost:6379/0",
    },
    createRedisClient: () => ({
      async connect() {
        throw new Error("redis offline");
      },
      async eval() {
        throw new Error("should not eval");
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

  const bucket = await store.increment({
    bucketKey: "203.0.113.10:api",
    now: 1_000,
    staleGraceMs: 10_000,
    windowMs: 10_000,
  });

  assert.equal(bucket, null);
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0].message,
    "Redis adaptive rate state unavailable; protected requests will fail closed",
  );

  assert.equal(await store.increment({
    bucketKey: "203.0.113.10:api",
    now: 2_000,
    staleGraceMs: 10_000,
    windowMs: 10_000,
  }), null);
  assert.equal(warnings.length, 1);

  now += 5_000;
  assert.equal(await store.increment({
    bucketKey: "203.0.113.10:api",
    now: 3_000,
    staleGraceMs: 10_000,
    windowMs: 10_000,
  }), null);
  assert.equal(warnings.length, 2);
});

test("RedisAdaptiveRateStateStore retries Redis after a failed adaptive connection", async () => {
  let factoryCalls = 0;
  let evalCalls = 0;
  const store = new RedisAdaptiveRateStateStore({
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
        async eval() {
          evalCalls += 1;
          return [1, 2_000, 12_000];
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

  const firstBucket = await store.increment({
    bucketKey: "203.0.113.20:api",
    now: 1_000,
    staleGraceMs: 10_000,
    windowMs: 10_000,
  });
  const secondBucket = await store.increment({
    bucketKey: "203.0.113.20:api",
    now: 2_000,
    staleGraceMs: 10_000,
    windowMs: 10_000,
  });

  assert.equal(firstBucket, null);
  assert.deepEqual(secondBucket, {
    count: 1,
    lastSeenAt: 2_000,
    resetAt: 12_000,
  });
  assert.equal(factoryCalls, 2);
  assert.equal(evalCalls, 1);
});
