import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request } from "express";
import { createCsrfProtectionMiddleware } from "../../http/csrf";
import { createApiProtectionMiddleware } from "../../internal/apiProtection";
import type { WorkerControlState } from "../../internal/runtime-monitor-manager";
import { logger } from "../../lib/logger";
import {
  clearAdaptiveRateLimitCooldownsForTests,
  createAuthRouteRateLimiters,
  stopAdaptiveRateLimitCooldownSweep,
} from "../../middleware/rate-limit";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { runtimeConfig } from "../../config/runtime";
import { RedisRateLimitStore, RedisRateLimitStoreUnavailableError } from "../../middleware/redis-rate-limit-store";

type Actor = { userId: string; username: string };
type TestRequest = Request & { user?: Actor };

async function harness(t: test.TestContext, withProtection = false) {
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "warn", () => undefined);
  t.mock.method(logger, "info", () => undefined);
  const app = express();
  app.use(express.json());
  app.set("trust proxy", ["loopback"]);
  app.use(createCsrfProtectionMiddleware());
  let currentActor: Actor | undefined;
  // Stand-in for the existing authoritative authentication guard: test actors
  // are assigned server-side, never derived from the request's identity hints.
  app.use((req, _res, next) => {
    if (currentActor) (req as TestRequest).user = currentActor;
    next();
  });
  if (withProtection) {
    const protection = createApiProtectionMiddleware({
      getDbProtection: () => false,
      getControlState: () => ({ mode: "PROTECTION", throttleFactor: 0.2 }) as WorkerControlState,
    });
    app.use(protection.adaptiveRateLimit);
    t.after(protection.stopAdaptiveRateStateSweep);
  }
  const limits = createAuthRouteRateLimiters();
  for (const action of ["setup", "enable", "disable"]) {
    app.post(`/api/auth/two-factor/${action}`, limits.twoFactorManagement, limits.authenticatedAuth, (_req, res) => res.sendStatus(204));
  }
  const running = await startTestServer(app);
  t.after(async () => {
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    await stopTestServer(running.server);
  });
  const csrf = "b".repeat(64);
  return {
    async post(action: string, options: {
      actor?: Actor;
      ip?: string;
      hints?: number;
      csrfValid?: boolean;
    } = {}) {
      currentActor = options.actor;
      const response = await fetch(`${running.baseUrl}/api/auth/two-factor/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `Office Browser ${options.hints ?? 0}`,
          "Accept-Language": `en-US,x-test-${options.hints ?? 0}`,
          "X-Forwarded-For": options.ip ?? "192.0.2.20",
          Cookie: `sqr_auth=synthetic-session; sqr_csrf=${csrf}`,
          ...(options.csrfValid === false ? {} : { "X-CSRF-Token": csrf }),
        },
        body: JSON.stringify({ code: "000000", userId: `ignored-${options.hints ?? 0}`, username: `ignored-${options.hints ?? 0}` }),
      });
      // Finish each local response before selecting the next server-side actor.
      const body = await response.text();
      return { status: response.status, headers: response.headers, body };
    },
  };
}

test("30 authenticated staff sharing one NAT can set up, verify and disable 2FA under strict adaptive and CSRF guards", async (t) => {
  const h = await harness(t, true);
  assert.equal((await h.post("setup", { actor: { userId: "csrf-staff", username: "csrf.staff" }, csrfValid: false })).status, 403);
  for (let index = 0; index < 30; index++) {
    const actor = { userId: `staff-${index}`, username: `office.staff.${index}` };
    for (const action of ["setup", "enable", "disable"]) {
      assert.equal((await h.post(action, { actor })).status, 204, `${actor.userId} ${action}`);
    }
  }
});

for (const action of ["setup", "enable", "disable"]) {
  test(`2FA ${action} quota survives browser, network, username, body and equivalent route changes`, async (t) => {
    const h = await harness(t);
    for (let index = 0; index < 6; index++) {
      const response = await h.post(index % 2 ? `${action.toUpperCase()}/` : action, {
        actor: { userId: "same-account", username: `renamed.account.${index}` },
        ip: `198.51.100.${index + 1}`,
        hints: index,
      });
      assert.equal(response.status, index < 5 ? 204 : 429);
      if (index === 5) {
        assert.equal(response.headers.get("ratelimit-limit"), "5");
        assert.ok(Number(response.headers.get("retry-after")) > 0);
        assert.doesNotMatch(response.body, /000000|same-account|renamed|ignored/);
      }
    }
    assert.equal((await h.post(action, { actor: { userId: "other-account", username: "other.staff" } })).status, 204);
  });
}

test("missing authenticated identity uses a strict network fallback despite rotated client hints and aliases", async (t) => {
  const h = await harness(t);
  for (let index = 0; index < 6; index++) {
    assert.equal((await h.post(index % 2 ? "ENABLE/" : "enable", { hints: index })).status, index < 5 ? 204 : 429);
  }
  assert.equal((await h.post("enable", { actor: { userId: "verified-account", username: "verified.staff" } })).status, 204);
});

test("configured Redis failure rejects 2FA management closed", async (t) => {
  const previousProvider = runtimeConfig.rateLimiting.store.provider;
  t.mock.method(RedisRateLimitStore.prototype, "increment", async () => { throw new RedisRateLimitStoreUnavailableError(); });
  runtimeConfig.rateLimiting.store.provider = "redis";
  t.after(() => { runtimeConfig.rateLimiting.store.provider = previousProvider; });
  const h = await harness(t);
  for (const action of ["setup", "enable", "disable"]) {
    const response = await h.post(action, { actor: { userId: "redis-account", username: "redis.staff" } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "5");
  }
});
