import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import type { Store } from "express-rate-limit";
import { createRateLimitIdentityMiddleware, getRateLimitIdentity } from "../../auth/request-session-identity";
import { signSessionJwtWithSecret } from "../../auth/session-jwt";
import { runtimeConfig } from "../../config/runtime";
import { createCsrfProtectionMiddleware } from "../../http/csrf";
import { createApiProtectionMiddleware } from "../../internal/apiProtection";
import type { WorkerControlState } from "../../internal/runtime-monitor-manager";
import { logger } from "../../lib/logger";
import { createRateLimitedTestApp, startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { createPreAuthRateLimiter, handlePreAuthRateLimitError } from "../../middleware/pre-auth-rate-limit";
import { BoundedMemoryRateLimitStore, RedisRateLimitStoreUnavailableError } from "../../middleware/redis-rate-limit-store";
import { registerLocalHttpPipeline } from "../../internal/local-http-pipeline";

async function serve(t: test.TestContext, app: express.Express) {
  const running = await startTestServer(app);
  t.after(() => stopTestServer(running.server));
  return running.baseUrl;
}

async function status(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  await response.arrayBuffer();
  return response;
}

test("pre-auth ceiling bounds concurrent requests before identity work and resets after its window", async (t) => {
  let now = Date.now();
  let identityWork = 0;
  const app = express();
  app.use(createPreAuthRateLimiter({ requestsPerMinute: 18, store: new BoundedMemoryRateLimitStore(() => now) }), handlePreAuthRateLimitError);
  app.use((_req, _res, next) => { identityWork++; next(); });
  app.use(createRateLimitIdentityMiddleware({ secret: "synthetic-pre-auth-secret-only-for-tests" }));
  app.get("/api/fixture", (_req, res) => res.sendStatus(204));
  const baseUrl = await serve(t, app);
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => status(`${baseUrl}/api/fixture`, {
    headers: { Authorization: `Bearer forged-${i}`, "X-Forwarded-For": `198.51.100.${i + 1}` },
  })));
  assert.equal(responses.filter((r) => r.status === 204).length, 3);
  assert.equal(responses.filter((r) => r.status === 429).length, 7);
  assert.equal(identityWork, 3, "untrusted token/forwarded headers cannot buy more verification work");
  for (const response of responses.filter((r) => r.status === 429)) {
    assert.ok(Number(response.headers.get("retry-after")) > 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  now += 10_001;
  assert.equal((await status(`${baseUrl}/api/fixture`)).status, 204);
  assert.equal(identityWork, 4);
});

test("rejected CSRF requests consume admission quota and cannot reach a mutation", async (t) => {
  t.mock.method(logger, "warn", () => undefined);
  const app = express();
  let mutations = 0;
  app.use(createPreAuthRateLimiter({ requestsPerMinute: 6, store: new BoundedMemoryRateLimitStore(Date.now) }), handlePreAuthRateLimitError);
  app.use(createCsrfProtectionMiddleware());
  app.post("/api/fixture", (_req, res) => { mutations++; res.sendStatus(204); });
  const baseUrl = await serve(t, app);
  const request = { method: "POST", headers: { Cookie: "sqr_auth=synthetic", "Sec-Fetch-Site": "cross-site" } };
  assert.equal((await status(`${baseUrl}/api/fixture`, request)).status, 403);
  assert.equal((await status(`${baseUrl}/api/fixture`, request)).status, 429);
  assert.equal(mutations, 0);
});

test("exhausted admission prevents real RS256 verification without authorizing the request", async (t) => {
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const previous = { privateKey: runtimeConfig.auth.sessionJwtPrivateKey, publicKey: runtimeConfig.auth.sessionJwtPublicKey };
  runtimeConfig.auth.sessionJwtPrivateKey = keys.privateKey;
  runtimeConfig.auth.sessionJwtPublicKey = keys.publicKey;
  t.after(() => {
    runtimeConfig.auth.sessionJwtPrivateKey = previous.privateKey;
    runtimeConfig.auth.sessionJwtPublicKey = previous.publicKey;
  });
  const secret = "synthetic-unused-hmac-key-for-rsa-test";
  const token = signSessionJwtWithSecret({ userId: "staff-rsa", username: "staff", role: "user", activityId: "activity" }, secret, { expiresIn: "5m" });
  assert.equal(jwt.decode(token, { complete: true })?.header.alg, "RS256");
  const verifier = t.mock.method(jwt, "verify");
  const app = express();
  app.use(createPreAuthRateLimiter({ requestsPerMinute: 6, store: new BoundedMemoryRateLimitStore(Date.now) }), handlePreAuthRateLimitError);
  app.use(createCsrfProtectionMiddleware());
  app.use(createRateLimitIdentityMiddleware({ secret }));
  app.get("/api/fixture", (req, res) => {
    assert.equal((req as { user?: unknown }).user, undefined);
    res.json({ id: getRateLimitIdentity(req) });
  });
  const baseUrl = await serve(t, app);
  const options = { headers: { Authorization: `Bearer ${token}` } };
  const allowed = await fetch(`${baseUrl}/api/fixture`, options);
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { id: "staff-rsa" });
  assert.equal(verifier.mock.callCount(), 1);
  assert.equal((await status(`${baseUrl}/api/fixture`, options)).status, 429);
  assert.equal(verifier.mock.callCount(), 1, "blocked traffic must not execute RSA verification");
});

test("synthetic fixture routes have real admission control even outside /api", async (t) => {
  const app = createRateLimitedTestApp(6);
  let actions = 0;
  app.get("/fixture/expensive", (_req, res) => { actions++; res.sendStatus(204); });
  const baseUrl = await serve(t, app);
  assert.equal((await status(`${baseUrl}/fixture/expensive`)).status, 204);
  assert.equal((await status(`${baseUrl}/fixture/expensive`)).status, 429);
  assert.equal(actions, 1);
});

test("actual runtime pipeline rejects an exhausted quota before CSRF and later guards", async (t) => {
  assert.equal(runtimeConfig.rateLimiting.store.provider, "memory", "synthetic fixture must not use external Redis");
  const previousLimit = runtimeConfig.rateLimiting.authenticatedIpRequestsPerMinute;
  runtimeConfig.rateLimiting.authenticatedIpRequestsPerMinute = 6;
  t.after(() => { runtimeConfig.rateLimiting.authenticatedIpRequestsPerMinute = previousLimit; });
  t.mock.method(logger, "info", () => undefined);
  t.mock.method(logger, "warn", () => undefined);
  const app = express();
  let protectedWork = 0;
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb", collectionBodyLimit: "1mb", defaultBodyLimit: "8kb",
    uploadsRootDir: "/unused-synthetic-upload-root",
    recordRequestStarted() {}, recordRequestFinished() {},
    adaptiveRateLimit: (_req, _res, next) => { protectedWork++; next(); },
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.use((_req, res) => res.sendStatus(204));
  const baseUrl = await serve(t, app);
  assert.equal((await status(`${baseUrl}/api/fixture`)).status, 204);
  const rejected = await status(`${baseUrl}/api/fixture`, {
    method: "POST", headers: { Cookie: "sqr_auth=synthetic", "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(rejected.status, 429, "admission must run before CSRF's 403 response");
  assert.equal(protectedWork, 1);
  assert.ok(rejected.headers.get("content-security-policy"));
  assert.equal(rejected.headers.get("cache-control"), "no-store");
});

test("unavailable shared admission state fails closed before CSRF and JWT work", async (t) => {
  let downstream = 0;
  const store: Store = {
    async increment() { throw new RedisRateLimitStoreUnavailableError(); },
    async decrement() {}, async resetKey() {},
  };
  const app = express();
  app.use(createPreAuthRateLimiter({ store }), handlePreAuthRateLimitError);
  app.use((_req, res) => { downstream++; res.sendStatus(204); });
  const baseUrl = await serve(t, app);
  const response = await fetch(`${baseUrl}/api/fixture`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.equal((await response.json()).error.code, "SERVICE_UNAVAILABLE");
  assert.equal(downstream, 0);
});

test("two workers sharing an admission store enforce one quota", async (t) => {
  const counts = new Map<string, number>();
  const createStore = (): Store => ({
    async increment(key) {
      const totalHits = (counts.get(key) ?? 0) + 1;
      counts.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + 10_000) };
    },
    async decrement() {}, async resetKey() {},
  });
  const urls: string[] = [];
  for (let i = 0; i < 2; i++) {
    const app = express();
    app.use(createPreAuthRateLimiter({ requestsPerMinute: 12, store: createStore() }), handlePreAuthRateLimitError);
    app.get("/api/fixture", (_req, res) => res.sendStatus(204));
    urls.push(await serve(t, app));
  }
  assert.equal((await status(`${urls[0]}/api/fixture`)).status, 204);
  assert.equal((await status(`${urls[1]}/api/fixture`)).status, 204);
  assert.equal((await status(`${urls[0]}/api/fixture`)).status, 429);
  assert.equal(counts.size, 1);
});

test("admission uses trusted proxy IPs and groups IPv6 hosts in the same /56", async (t) => {
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(createPreAuthRateLimiter({ requestsPerMinute: 6, store: new BoundedMemoryRateLimitStore(Date.now) }), handlePreAuthRateLimitError);
  app.get("/api/fixture", (_req, res) => res.sendStatus(204));
  const baseUrl = await serve(t, app);
  const request = (ip: string) => status(`${baseUrl}/api/fixture`, { headers: { "X-Forwarded-For": ip } });
  assert.equal((await request("2001:db8:1234:5601::1")).status, 204);
  assert.equal((await request("2001:db8:1234:5602::2")).status, 429);
  assert.equal((await request("2001:db8:1234:5701::1")).status, 204);
});

test("static routes do not consume API quota; legacy telemetry does", async (t) => {
  const app = express();
  app.use(createPreAuthRateLimiter({ requestsPerMinute: 6, store: new BoundedMemoryRateLimitStore(Date.now) }), handlePreAuthRateLimitError);
  app.use((_req, res) => res.sendStatus(204));
  const baseUrl = await serve(t, app);
  for (const path of ["/", "/login", "/assets/example.js"]) {
    assert.equal((await status(`${baseUrl}${path}`)).status, 204);
  }
  assert.equal((await status(`${baseUrl}/telemetry/web-vitals`, { method: "POST" })).status, 204);
  assert.equal((await status(`${baseUrl}/api/fixture`)).status, 429);
});

test("case-insensitive Express routes cannot bypass admission with path casing", async (t) => {
  const app = express();
  app.use(createPreAuthRateLimiter({ requestsPerMinute: 6, store: new BoundedMemoryRateLimitStore(Date.now) }), handlePreAuthRateLimitError);
  app.get("/api/fixture", (_req, res) => res.sendStatus(204));
  const baseUrl = await serve(t, app);
  assert.equal((await status(`${baseUrl}/API/fixture`)).status, 204);
  assert.equal((await status(`${baseUrl}/Api/fixture`)).status, 429);
});

for (const mode of ["NORMAL", "DEGRADED", "PROTECTION"] as const) {
  test(`pre-auth guard preserves independent quotas for 100 same-IP staff in ${mode}`, async (t) => {
    t.mock.method(logger, "warn", () => undefined);
    const secret = "synthetic-nat-pre-auth-secret-only-for-tests";
    const app = express();
    app.use(createPreAuthRateLimiter({ store: new BoundedMemoryRateLimitStore(Date.now) }), handlePreAuthRateLimitError);
    app.use(createCsrfProtectionMiddleware());
    app.use(createRateLimitIdentityMiddleware({ secret }));
    const protection = createApiProtectionMiddleware({
      getDbProtection: () => false,
      getControlState: () => ({ mode, throttleFactor: 0.2 }) as WorkerControlState,
    });
    t.after(protection.stopAdaptiveRateStateSweep);
    app.use(protection.adaptiveRateLimit);
    app.get("/api/collection/fixture", (req, res) => res.json({ id: getRateLimitIdentity(req) }));
    const baseUrl = await serve(t, app);
    const tokens = Array.from({ length: 100 }, (_, i) => signSessionJwtWithSecret({
      userId: `staff-${i}`, username: `staff-${i}`, role: "user", activityId: `activity-${i}`,
    }, secret, { expiresIn: "5m" }));
    // Ten reads per person in one burst exceeds the old anonymous/NAT bucket.
    for (let round = 0; round < 10; round++) {
      const responses = await Promise.all(tokens.map((token) => status(`${baseUrl}/api/collection/fixture`, {
        headers: { Authorization: `Bearer ${token}` },
      })));
      assert.ok(responses.every((r) => r.status === 200));
    }
    assert.equal(runtimeConfig.rateLimiting.authenticatedIpRequestsPerMinute, 120_000);
  });
}
