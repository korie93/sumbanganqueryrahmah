import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { RequestHandler } from "express";
import type { Options } from "express-rate-limit";
import { createClient } from "redis";

const redisUrl = process.env.SQR_RATE_LIMIT_TEST_REDIS_URL;
const required = process.env.SQR_RATE_LIMIT_TEST_REDIS_REQUIRED === "1";

function invoke(handler: RequestHandler, userId: string, ip = "203.0.113.20", pathname = "/api/settings/tab-visibility") {
  return new Promise<{ status: number; limiter?: string; reason?: string }>((resolve, reject) => {
    let status = 200;
    handler({
      method: "GET", path: pathname, ip, headers: {}, socket: { remoteAddress: ip },
      user: { userId },
    } as never, {
      headersSent: false,
      setHeader: () => undefined,
      status(code: number) { status = code; return this; },
      json(body: { limiter?: string; reason?: string }) { resolve({ status, ...body }); return this; },
    } as never, (error?: unknown) => error ? reject(error) : resolve({ status }));
  });
}

test("live Redis Lua preserves NAT quotas, atomicity, TTL and fail-closed state across four workers", {
  skip: !redisUrl && !required ? "Set SQR_RATE_LIMIT_TEST_REDIS_URL to an isolated test Redis instance." : false,
  timeout: 60_000,
}, async (t) => {
  assert.ok(redisUrl, "Live Redis verification is required; SQR_RATE_LIMIT_TEST_REDIS_URL must be set.");
  // These controls belong to this isolated test process, not production's strict
  // SQR_* environment schema. Consume them before importing the runtime modules.
  delete process.env.SQR_RATE_LIMIT_TEST_REDIS_URL;
  delete process.env.SQR_RATE_LIMIT_TEST_REDIS_REQUIRED;
  const [
    { createApiProtectionMiddleware },
    { RedisAdaptiveRateStateStore },
    { createDefaultWorkerControlState },
    { RedisRateLimitStore, RedisRateLimitStoreUnavailableError },
  ] = await Promise.all([
    import("../../internal/apiProtection"),
    import("../../internal/redis-adaptive-rate-store"),
    import("../../internal/runtime-monitor-control-state"),
    import("../../middleware/redis-rate-limit-store"),
  ]);
  const prefix = `sqr:test:nat:${randomUUID()}`;
  const knownKeys = new Set<string>();
  const config = { provider: "redis" as const, redisUrl, distributedStoreConfigured: true };
  const logger = { warn: () => undefined };
  const clients: Array<ReturnType<typeof createClient>> = [];
  const control = createClient({ url: redisUrl, socket: { reconnectStrategy: false, connectTimeout: 3_000 } });
  control.on("error", () => undefined);
  try {
    await control.connect();
  } catch {
    if (control.isOpen) control.destroy();
    assert.fail("The required test Redis service is unavailable (connection details withheld).");
  }
  const createRedisClient = () => {
    const client = createClient({
      url: redisUrl, disableOfflineQueue: true,
      socket: { reconnectStrategy: false, connectTimeout: 3_000 },
    });
    clients.push(client);
    client.on("error", () => undefined);
    return {
      connect: () => client.connect(),
      eval: (script: string, options: { arguments: string[]; keys: string[] }) => {
        for (const key of options.keys) {
          assert.ok(key.startsWith(`${prefix}:`), "Live tests must only touch their isolated random prefix.");
          knownKeys.add(key);
          assert.ok(knownKeys.size <= 1_000, "Live fixture key count must remain bounded.");
        }
        return client.eval(script, options);
      },
      get: (key: string) => client.get(key),
      pTTL: (key: string) => client.pTTL(key),
      decr: (key: string) => client.decr(key),
      del: (key: string) => client.del(key),
      quit: async () => { if (client.isOpen) await client.quit(); },
    };
  };
  const adaptive = Array.from({ length: 4 }, () => new RedisAdaptiveRateStateStore({
    config, createRedisClient, logger, prefix: `${prefix}:adaptive`,
  }));
  const account = Array.from({ length: 4 }, () => new RedisRateLimitStore({
    config, createRedisClient, logger, prefix: `${prefix}:login-account`,
  }));
  account.forEach((store) => store.init({ windowMs: 60_000 } as Options));
  const state = { ...createDefaultWorkerControlState(), mode: "PROTECTION" as const, throttleFactor: 0.2 };
  const protection = adaptive.map((store) => createApiProtectionMiddleware({
    adaptiveRateStore: store, getControlState: () => state, getDbProtection: () => false,
  }));
  const redisKey = (namespace: "adaptive" | "login-account", key: string) =>
    `${prefix}:${namespace}:${createHash("sha256").update(key).digest("hex")}`;
  try {
    for (const userCount of [20, 50, 100]) {
      await t.test(`${userCount} distinct users share one NAT across four independent worker stores`, async () => {
        const results = await Promise.all(Array.from({ length: userCount }, async (_unused, user) => {
          const handler = protection[user % 4].adaptiveRateLimit;
          for (let read = 0; read < 6; read += 1) {
            assert.equal((await invoke(handler, `nat-${userCount}-${user}`)).status, 200);
          }
          return user;
        }));
        assert.equal(results.length, userCount);
      });
    }
    await t.test("one user's quota and aggregate flood quota are shared, but do not collide", async () => {
      const limited = adaptive.map((store) => createApiProtectionMiddleware({
        adaptiveRateStore: store, getControlState: () => state, getDbProtection: () => false,
        userLimitsPerMinute: { reads: 60 }, authenticatedIpLimitPerMinute: 120_000,
      }));
      try {
        for (let index = 0; index < 10; index += 1) {
          assert.equal((await invoke(limited[index % 4].adaptiveRateLimit, "abusive-user")).status, 200);
        }
        const blocked = await invoke(limited[2].adaptiveRateLimit, "abusive-user");
        assert.equal(blocked.status, 429);
        assert.equal(blocked.limiter, "user-rate-limit");
        assert.equal((await invoke(limited[3].adaptiveRateLimit, "healthy-neighbour")).status, 200);
        const flood = adaptive.map((store) => createApiProtectionMiddleware({
          adaptiveRateStore: store, getControlState: () => state, getDbProtection: () => false,
          authenticatedIpLimitPerMinute: 36,
        }));
        try {
          for (let index = 0; index < 6; index += 1) {
            assert.equal((await invoke(flood[index % 4].adaptiveRateLimit, `flood-${index}`, "203.0.113.21")).status, 200);
          }
          const denied = await invoke(flood[3].adaptiveRateLimit, "flood-7", "203.0.113.21");
          assert.equal(denied.status, 429);
          assert.equal(denied.limiter, "aggregate-ip-flood-guard");
        } finally {
          // These facades share the four stores; stop them only after all live checks.
          protection.push(...flood);
        }
      } finally {
        protection.push(...limited);
      }
    });
    await t.test("actual Lua increments remain atomic for 400 concurrent requests from four clients", async () => {
      const now = Date.now();
      const buckets = await Promise.all(Array.from({ length: 400 }, (_unused, index) => adaptive[index % 4].increment({
        bucketKey: "atomic-subject", now, windowMs: 10_000, staleGraceMs: 1_000,
      })));
      assert.deepEqual(buckets.map((bucket) => bucket?.count).sort((a, b) => Number(a) - Number(b)),
        Array.from({ length: 400 }, (_unused, index) => index + 1));
      const ttl = await control.pTTL(redisKey("adaptive", "atomic-subject"));
      assert.ok(ttl > 0 && ttl <= 11_000);
      const hits = await Promise.all(Array.from({ length: 400 }, (_unused, index) => account[index % 4].increment("atomic-subject")));
      assert.deepEqual(hits.map((result) => result.totalHits).sort((a, b) => a - b),
        Array.from({ length: 400 }, (_unused, index) => index + 1));
      assert.notEqual(redisKey("adaptive", "atomic-subject"), redisKey("login-account", "atomic-subject"));
      assert.equal(await control.get(redisKey("login-account", "atomic-subject")), "400");
    });
    await t.test("strict account hits and TTL survive worker switching and expiry starts a fresh window", async () => {
      for (let index = 0; index < 6; index += 1) {
        const result = await account[index % 4].increment("login:one-account");
        assert.equal(result.totalHits, index + 1);
        assert.equal(result.totalHits > 5, index === 5);
      }
      assert.equal((await account[3].increment("login:other-account")).totalHits, 1);
      const key = redisKey("login-account", "login:one-account");
      const ttl = await control.pTTL(key);
      assert.ok(ttl > 0 && ttl <= 60_000);
      await control.pExpire(key, 1);
      await delay(20);
      assert.equal((await account[2].increment("login:one-account")).totalHits, 1);
      const now = Date.now();
      const initial = await adaptive[0].increment({ bucketKey: "expiry", now, windowMs: 1_000, staleGraceMs: 100 });
      const reset = await adaptive[3].increment({ bucketKey: "expiry", now: now + 1_000, windowMs: 1_000, staleGraceMs: 100 });
      assert.equal(initial?.count, 1);
      assert.equal(reset?.count, 1);
      assert.equal(reset?.resetAt, now + 2_000);
    });
    await t.test("closed live store connections fail closed without worker-local fallback", async () => {
      await adaptive[0].close();
      const denied = await invoke(protection[0].adaptiveRateLimit, "post-shutdown-user");
      assert.equal(denied.status, 503);
      assert.equal(denied.reason, "adaptive_rate_state_unavailable");
      await account[0].shutdown();
      await assert.rejects(account[0].increment("post-shutdown-account"), RedisRateLimitStoreUnavailableError);
      assert.equal(account[0].getFallbackStoreSizeForTests(), 0);
      assert.equal((await account[1].increment("still-connected-account")).totalHits, 1);
    });
    assert.equal(clients.length, 8, "Four adaptive and four route stores must hold independent real connections.");
  } finally {
    protection.forEach((middleware) => middleware.stopAdaptiveRateStateSweep());
    await Promise.all(adaptive.map((store) => store.close()));
    await Promise.all(account.map((store) => store.shutdown()));
    for (const client of clients) if (client.isOpen) client.destroy();
    // Never scan or flush a shared database: delete only exact keys recorded by this fixture.
    assert.ok(knownKeys.size <= 1_000);
    for (const key of knownKeys) assert.ok(key.startsWith(`${prefix}:`));
    if (knownKeys.size > 0) await control.del([...knownKeys]);
    await control.quit();
  }
});
