import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { signSessionJwt } from "../../auth/session-jwt";
import { hashOpaqueToken } from "../../auth/passwords";
import { runtimeConfig } from "../../config/runtime";
import { createCsrfProtectionMiddleware } from "../../http/csrf";
import { createApiProtectionMiddleware } from "../../internal/apiProtection";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { createAuthRouteRateLimiters, clearAdaptiveRateLimitCooldownsForTests, stopAdaptiveRateLimitCooldownSweep } from "../../middleware/rate-limit";
import type { AuthRecoveryRateLimitStorage } from "../../middleware/auth-rate-limit-subjects";
import { RedisRateLimitStore, RedisRateLimitStoreUnavailableError } from "../../middleware/redis-rate-limit-store";

function challenge(userId: string) {
  return signSessionJwt({ purpose: "two_factor_login", userId }, { expiresIn: "5m" });
}

async function harness(t: test.TestContext, withProtection = false, lookupThrows = false) {
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "warn", () => undefined);
  t.mock.method(logger, "info", () => undefined);
  const app = express();
  app.use(express.json());
  let lookups = 0;
  const records = new Map(Array.from({ length: 600 }, (_, i) => [hashOpaqueToken(`recovery-${i}`), { userId: `staff-${i}` }]));
  const lookup = async (hash: string) => {
    lookups++;
    if (lookupThrows) throw new Error("private token lookup failure");
    return records.get(hash) ?? null;
  };
  const storage = { getActivationTokenRecordByHash: lookup, getPasswordResetTokenRecordByHash: lookup } as unknown as AuthRecoveryRateLimitStorage;
  if (withProtection) {
    app.use(createCsrfProtectionMiddleware());
    const protection = createApiProtectionMiddleware({
      getDbProtection: () => false,
      getControlState: () => ({
        mode: "PROTECTION", healthScore: 50, dbProtection: false, rejectHeavyRoutes: true,
        throttleFactor: 0.2, workerCount: 1, maxWorkers: 1, queueLength: 0, preAllocateMB: 0,
        updatedAt: Date.now(), workers: [], circuits: { aiOpenWorkers: 0, dbOpenWorkers: 0, exportOpenWorkers: 0 },
        predictor: { requestRateMA: 0, latencyMA: 0, cpuMA: 0, requestRateTrend: 0, latencyTrend: 0,
          cpuTrend: 0, sustainedUpward: false, lastUpdatedAt: null },
      }),
    });
    app.use(protection.adaptiveRateLimit);
    app.use(protection.systemProtectionMiddleware);
  }
  const limits = createAuthRouteRateLimiters(storage);
  app.post("/api/auth/verify-two-factor-login", limits.twoFactorLogin, (_req, res) => res.sendStatus(204));
  for (const path of ["activate-account", "validate-activation-token", "validate-password-reset-token", "reset-password-with-token", "request-password-reset"]) {
    app.post(`/api/auth/${path}`, limits.publicRecovery, (_req, res) => res.sendStatus(204));
  }
  const running = await startTestServer(app);
  t.after(async () => { stopAdaptiveRateLimitCooldownSweep(); clearAdaptiveRateLimitCooldownsForTests(); await stopTestServer(running.server); });
  const csrf = "a".repeat(64);
  return {
    lookups: () => lookups,
    post: (path: string, body: object, csrfValid = true, userAgent = "Office Browser") => fetch(`${running.baseUrl}/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": userAgent,
        Cookie: `sqr_auth=stale-session; sqr_csrf=${csrf}`, ...(csrfValid ? { "X-CSRF-Token": csrf } : {}) },
      body: JSON.stringify(body),
    }),
  };
}

test("30 distinct signed challenges and recovery accounts behind one NAT pass strict adaptive and CSRF pipeline", async (t) => {
  const h = await harness(t, true);
  assert.equal((await h.post("verify-two-factor-login", { challengeToken: challenge("csrf-denied") }, false)).status, 403);
  for (const path of ["verify-two-factor-login", "validate-activation-token", "activate-account", "validate-password-reset-token", "reset-password-with-token", "request-password-reset"]) {
    for (let i = 0; i < 30; i++) {
      const response = await h.post(path, { challengeToken: challenge(`staff-${i}`), token: `recovery-${i}`, identifier: `staff-${i}` });
      assert.equal(response.status, 204, `${path} staff ${i}`);
    }
  }
});

test("2FA account cap survives renewed challenges and rotated ignored hints; other staff remain unblocked", async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 6; i++) {
    const response = await h.post("verify-two-factor-login", { challengeToken: challenge("same-account"), username: `ignored-${i}`, code: "wrong" }, true, `Rotated ${i}`);
    assert.equal(response.status, i < 5 ? 204 : 429);
  }
  assert.equal((await h.post("verify-two-factor-login", { challengeToken: challenge("different-account") })).status, 204);
});

test("invalid and wrong-purpose 2FA tokens cannot rotate the strict unverified network quota", async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 6; i++) {
    const token = i % 2 ? signSessionJwt({ purpose: "session", userId: `forged-${i}` }) : `invalid-${i}`;
    assert.equal((await h.post("verify-two-factor-login", { challengeToken: token, identifier: `ignored-${i}` }, true, `UA ${i}`)).status, i < 5 ? 204 : 429);
  }
  assert.equal((await h.post("verify-two-factor-login", { challengeToken: challenge("valid-after-invalid") })).status, 204);
});

test("recovery token identity comes from storage, ignores hints, and retains strict per-account quota", async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 21; i++) {
    const response = await h.post("reset-password-with-token", { token: "recovery-0", identifier: `ignored-${i}`, username: `other-${i}` }, true, `UA ${i}`);
    assert.equal(response.status, i < 20 ? 204 : 429);
  }
  assert.equal((await h.post("reset-password-with-token", { token: "recovery-1" })).status, 204);
});

test("unknown recovery tokens share a strict fallback and do not suppress valid account buckets", async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 21; i++) {
    assert.equal((await h.post("activate-account", { token: `unknown-${i}`, identifier: `rotate-${i}` })).status, i < 20 ? 204 : 429);
  }
  assert.equal((await h.post("activate-account", { token: "recovery-1" })).status, 204);
});

test("network flood admission precedes recovery DB lookup despite token and browser rotation", async (t) => {
  const h = await harness(t);
  const max = runtimeConfig.rateLimiting.loginIpAttemptsPer15Minutes;
  for (let i = 0; i < max; i++) {
    assert.equal((await h.post("validate-password-reset-token", { token: `recovery-${i}` }, true, `UA ${i}`)).status, 204);
  }
  const before = h.lookups();
  const response = await h.post("validate-password-reset-token", { token: "new-token" });
  assert.equal(response.status, 429);
  assert.equal(h.lookups(), before);
  assert.equal(response.headers.get("ratelimit-limit"), String(max));
});

test("recovery lookup outages fail closed with a safe retry response", async (t) => {
  const h = await harness(t, false, true);
  const response = await h.post("activate-account", { token: "recovery-0" });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.doesNotMatch(await response.text(), /private|recovery-0/);
});

test("Express case and trailing-slash aliases cannot reset account or invalid-token admission", async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 6; i++) {
    const path = i % 2 ? "VERIFY-TWO-FACTOR-LOGIN/" : "verify-two-factor-login";
    assert.equal((await h.post(path, { challengeToken: challenge("alias-account") })).status, i < 5 ? 204 : 429);
  }
  for (let i = 0; i < 21; i++) {
    const path = i % 2 ? "ACTIVATE-ACCOUNT/" : "activate-account";
    assert.equal((await h.post(path, { token: "recovery-4" })).status, i < 20 ? 204 : 429);
  }
});

test("expired signed 2FA challenges cannot manufacture fresh account buckets", async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 6; i++) {
    const expired = signSessionJwt({ purpose: "two_factor_login", userId: `expired-${i}` }, { expiresIn: -1 });
    assert.equal((await h.post("verify-two-factor-login", { challengeToken: expired })).status, i < 5 ? 204 : 429);
  }
});

test("configured Redis outage closes 2FA and recovery admission before account lookups", async (t) => {
  const prior = runtimeConfig.rateLimiting.store.provider;
  t.mock.method(RedisRateLimitStore.prototype, "increment", async () => { throw new RedisRateLimitStoreUnavailableError(); });
  runtimeConfig.rateLimiting.store.provider = "redis";
  t.after(() => { runtimeConfig.rateLimiting.store.provider = prior; });
  const h = await harness(t);
  for (const path of ["verify-two-factor-login", "activate-account"]) {
    const response = await h.post(path, { challengeToken: challenge("redis-user"), token: "recovery-1" });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "5");
  }
  assert.equal(h.lookups(), 0);
});
