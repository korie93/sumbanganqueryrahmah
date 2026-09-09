import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { createAuthGuards, type AuthenticatedRequest } from "../../auth/guards";
import { getRateLimitIdentity } from "../../auth/request-session-identity";
import { AUTH_SESSION_REFRESH_HEADER_NAME } from "../../auth/session-cookie";
import {
  configureSessionRevocationStoreForRuntime,
  resetSessionRevocationStoreForTests,
} from "../../auth/session-revocation-store";
import { getSessionSecret } from "../../config/security";
import { createApiProtectionMiddleware } from "../../internal/apiProtection";
import { registerLocalHttpPipeline } from "../../internal/local-http-pipeline";
import type { WorkerControlState } from "../../internal/runtime-monitor-manager";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { applyTrustedProxies } from "../trust-proxy";

function createSessionFixture(userCount = 1) {
  const now = new Date();
  const snapshot = {
    activity: {
      id: "nat-activity-1", userId: "nat-user-1", username: "nat.user", role: "admin",
      pcName: null, browser: "Chrome", fingerprint: "nat-fingerprint", ipAddress: "203.0.113.20",
      loginTime: now, logoutTime: null, lastActivityTime: now, isActive: true, logoutReason: null,
    },
    user: {
      id: "nat-user-1", username: "nat.user", passwordHash: "unused", fullName: "NAT User",
      email: "nat.user@example.test", role: "admin", status: "active", mustChangePassword: false,
      passwordResetBySuperuser: false, createdBy: "system", createdAt: now, updatedAt: now,
      passwordChangedAt: null, activatedAt: null, lastLoginAt: null, isBanned: false,
      twoFactorEnabled: false, twoFactorSecretEncrypted: null, twoFactorConfiguredAt: null,
      failedLoginAttempts: 0, lockedAt: null, lockedReason: null, lockedBySystem: false,
    },
    isVisitorBanned: false,
  };
  const calls = { snapshot: 0, touch: 0 };
  const guards = createAuthGuards({
    secret: getSessionSecret(),
    storage: {
      getAuthenticatedSessionSnapshot: async (activityId) => {
        calls.snapshot += 1;
        if (userCount === 1) return snapshot;
        const index = Number(activityId.replace("nat-activity-", ""));
        assert.ok(Number.isInteger(index) && index >= 1 && index <= userCount);
        return {
          ...snapshot,
          activity: { ...snapshot.activity, id: activityId, userId: `nat-user-${index}`, username: `nat.user.${index}` },
          user: { ...snapshot.user, id: `nat-user-${index}`, username: `nat.user.${index}` },
        };
      },
      getActivityById: async () => { throw new Error("Unexpected fallback activity lookup"); },
      getUser: async () => { throw new Error("Unexpected fallback user lookup"); },
      getUserByUsername: async () => { throw new Error("Unexpected fallback username lookup"); },
      isVisitorBanned: async () => { throw new Error("Unexpected fallback ban lookup"); },
      updateActivity: async () => { calls.touch += 1; return undefined; },
      getRoleTabVisibility: async () => ({}),
    },
  });
  const token = jwt.sign({
    userId: snapshot.user.id,
    username: snapshot.user.username,
    role: "admin",
    activityId: snapshot.activity.id,
    jti: "nat-session-1",
  }, getSessionSecret(), { expiresIn: "1h" });
  return { calls, guards, snapshot, token };
}

test("real pipeline supplies a signed quota identity before live route auth, with no duplicate verification or side effects", async (t) => {
  const { calls, guards, token } = createSessionFixture();
  const verifier = t.mock.method(jwt, "verify");
  const observed: Array<{ user: string | undefined; quotaId: string | null; snapshots: number }> = [];
  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb", collectionBodyLimit: "1mb", defaultBodyLimit: "100kb",
    uploadsRootDir: "uploads", recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (req: AuthenticatedRequest, _res, next) => {
      observed.push({ user: req.user?.userId, quotaId: getRateLimitIdentity(req), snapshots: calls.snapshot });
      next();
    },
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.get("/api/me", guards.authenticateToken, (req: AuthenticatedRequest, res) => {
    res.json({ userId: req.user?.userId });
  });
  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId: "nat-user-1" });
    assert.deepEqual(observed, [{ user: undefined, quotaId: "nat-user-1", snapshots: 0 }]);
    assert.deepEqual(calls, { snapshot: 1, touch: 1 });
    assert.equal(verifier.mock.callCount(), 1);
  } finally {
    guards.stopTabVisibilityCacheSweep();
    await stopTestServer(server);
  }
});

test("signed quota identity never bypasses live revocation, session validity, account bans or database role changes", async (t) => {
  for (const scenario of ["cookie", "revoked", "inactive", "banned", "demoted", "password-change", "revocation-unavailable"] as const) {
    await t.test(scenario, async () => {
      const { calls, guards, snapshot, token } = createSessionFixture();
      let revocationReads = 0;
      await configureSessionRevocationStoreForRuntime({
        isRevoked: async () => {
          revocationReads += 1;
          if (scenario === "revocation-unavailable") throw new Error("Session store unavailable");
          return scenario === "revoked";
        },
        revoke: async () => undefined,
      });
      if (scenario === "inactive") snapshot.activity.isActive = false;
      if (scenario === "banned") snapshot.user.isBanned = true;
      if (scenario === "demoted") snapshot.user.role = "user";
      if (scenario === "password-change") snapshot.user.mustChangePassword = true;
      const app = express();
      const observed: Array<{ user: unknown; quotaId: string | null }> = [];
      registerLocalHttpPipeline(app, {
        importBodyLimit: "1mb", collectionBodyLimit: "1mb", defaultBodyLimit: "100kb",
        uploadsRootDir: "uploads", recordRequestStarted: () => undefined,
        recordRequestFinished: () => undefined,
        adaptiveRateLimit: (req: AuthenticatedRequest, _res, next) => {
          observed.push({ user: req.user, quotaId: getRateLimitIdentity(req) });
          next();
        },
        systemProtectionMiddleware: (_req, _res, next) => next(),
        maintenanceGuard: (_req, _res, next) => next(),
      });
      app.get("/api/analytics/summary", guards.authenticateToken, guards.requireRole("admin"), (_req, res) => {
        res.json({ ok: true });
      });
      const { server, baseUrl } = await startTestServer(app);
      try {
        const response = await fetch(`${baseUrl}/api/analytics/summary`, {
          headers: { cookie: `sqr_auth=${encodeURIComponent(token)}` },
        });
        const expectedStatus = scenario === "cookie" ? 200
          : ["banned", "demoted", "password-change"].includes(scenario) ? 403 : 401;
        assert.equal(response.status, expectedStatus);
        assert.equal(revocationReads, 1);
        assert.deepEqual(observed, [{ user: undefined, quotaId: "nat-user-1" }]);
        assert.equal(calls.snapshot, scenario === "revoked" || scenario === "revocation-unavailable" ? 0 : 1);
        assert.equal(calls.touch, ["cookie", "banned", "demoted"].includes(scenario) ? 1 : 0);
      } finally {
        guards.stopTabVisibilityCacheSweep();
        await stopTestServer(server);
        await resetSessionRevocationStoreForTests();
      }
    });
  }
});

test("20, 50 and 100 signed users on one trusted-proxy NAT traverse actual protection and auth across observed endpoints", async (t) => {
  t.mock.method(logger, "info", () => undefined);
  for (const userCount of [20, 50, 100]) {
    await t.test(`${userCount} users`, async () => {
      const { calls, guards } = createSessionFixture(userCount);
      const controlState: WorkerControlState = {
        mode: "PROTECTION", healthScore: 30, dbProtection: true, rejectHeavyRoutes: true,
        throttleFactor: 0.2, workerCount: 1, maxWorkers: 1, queueLength: 0, preAllocateMB: 0,
        updatedAt: Date.now(), workers: [], circuits: { aiOpenWorkers: 0, dbOpenWorkers: 0, exportOpenWorkers: 0 },
        predictor: {
          requestRateMA: 0, latencyMA: 0, cpuMA: 0, requestRateTrend: 0, latencyTrend: 0,
          cpuTrend: 0, sustainedUpward: false, lastUpdatedAt: null,
        },
      };
      const protection = createApiProtectionMiddleware({
        getControlState: () => controlState,
        getDbProtection: () => true,
      });
      const app = express();
      applyTrustedProxies(app, ["127.0.0.1/32"]);
      registerLocalHttpPipeline(app, {
        importBodyLimit: "1mb", collectionBodyLimit: "1mb", defaultBodyLimit: "100kb",
        uploadsRootDir: "uploads", recordRequestStarted: () => undefined,
        recordRequestFinished: () => undefined,
        adaptiveRateLimit: protection.adaptiveRateLimit,
        systemProtectionMiddleware: protection.systemProtectionMiddleware,
        maintenanceGuard: (_req, _res, next) => next(),
      });
      const endpoints = [
        ["GET", "/api/settings/tab-visibility"], ["GET", "/api/app-config"],
        ["GET", "/api/maintenance-status"], ["GET", "/api/analytics/summary"],
        ["GET", "/api/me"], ["GET", "/api/collection/daily/overview"],
        ["GET", "/api/collection/report/billing-principal/target/overview"],
        ["GET", "/api/collection/report/billing-principal/target/calendar"],
        ["POST", "/api/activity/heartbeat"], ["POST", "/api/collection"],
      ] as const;
      for (const [method, pathname] of endpoints) {
        const handler = (req: AuthenticatedRequest, res: express.Response) => {
          res.json({ userId: req.user?.userId, ip: req.ip });
        };
        if (method === "GET") app.get(pathname, guards.authenticateToken, handler);
        else app.post(pathname, guards.authenticateToken, handler);
      }
      const { server, baseUrl } = await startTestServer(app);
      try {
        await Promise.all(Array.from({ length: userCount }, async (_unused, offset) => {
          const index = offset + 1;
          const token = jwt.sign({
            userId: `nat-user-${index}`, username: `nat.user.${index}`, role: "admin",
            activityId: `nat-activity-${index}`, jti: `nat-load-session-${index}`,
          }, getSessionSecret(), { expiresIn: "1h" });
          for (const [method, pathname] of endpoints) {
            const response = await fetch(`${baseUrl}${pathname}`, {
              method,
              headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "192.0.2.99, 203.0.113.20" },
            });
            assert.equal(response.status, 200, `${userCount}-user NAT: ${method} ${pathname}, user ${index}`);
            assert.deepEqual(await response.json(), { userId: `nat-user-${index}`, ip: "203.0.113.20" });
          }
        }));
        assert.equal(calls.snapshot, userCount * endpoints.length);
        assert.equal(calls.touch, userCount);
      } finally {
        protection.stopAdaptiveRateStateSweep();
        guards.stopTabVisibilityCacheSweep();
        await stopTestServer(server);
      }
    });
  }
});

test("CSRF rejection remains before quota identity verification and all rate/auth side effects", async (t) => {
  const { calls, guards, token } = createSessionFixture();
  const verifier = t.mock.method(jwt, "verify");
  let adaptiveCalls = 0;
  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb", collectionBodyLimit: "1mb", defaultBodyLimit: "100kb",
    uploadsRootDir: "uploads", recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (_req, _res, next) => { adaptiveCalls += 1; next(); },
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.post("/api/collection", guards.authenticateToken, (_req, res) => res.json({ ok: true }));
  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection`, {
      method: "POST", headers: { cookie: `sqr_auth=${token}` },
    });
    assert.equal(response.status, 403);
    assert.equal(adaptiveCalls, 0);
    assert.equal(verifier.mock.callCount(), 0);
    assert.deepEqual(calls, { snapshot: 0, touch: 0 });
  } finally {
    guards.stopTabVisibilityCacheSweep();
    await stopTestServer(server);
  }
});

test("pre-rate identity verification leaves session refresh and revocation side effects single-execution", async (t) => {
  const { calls, guards, snapshot } = createSessionFixture();
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const oldToken = jwt.sign({
    userId: snapshot.user.id, username: snapshot.user.username, role: "admin",
    activityId: snapshot.activity.id, jti: "nat-refresh-session", iat: nowSeconds - 3_300, exp: nowSeconds + 300,
  }, getSessionSecret());
  const verifier = t.mock.method(jwt, "verify");
  const revokedIds: string[] = [];
  let revocationChecks = 0;
  await configureSessionRevocationStoreForRuntime({
    isRevoked: async () => { revocationChecks += 1; return false; },
    revoke: async (record) => { revokedIds.push(record.jwtId); },
  });
  const app = express();
  registerLocalHttpPipeline(app, {
    importBodyLimit: "1mb", collectionBodyLimit: "1mb", defaultBodyLimit: "100kb",
    uploadsRootDir: "uploads", recordRequestStarted: () => undefined,
    recordRequestFinished: () => undefined,
    adaptiveRateLimit: (req, _res, next) => {
      assert.equal(getRateLimitIdentity(req), "nat-user-1");
      next();
    },
    systemProtectionMiddleware: (_req, _res, next) => next(),
    maintenanceGuard: (_req, _res, next) => next(),
  });
  app.get("/api/me", guards.authenticateToken, (_req, res) => res.json({ ok: true }));
  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/me`, { headers: { authorization: `Bearer ${oldToken}` } });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get(AUTH_SESSION_REFRESH_HEADER_NAME));
    assert.equal(verifier.mock.calls.filter((call) => call.arguments[0] === oldToken).length, 1);
    assert.equal(revocationChecks, 1);
    assert.deepEqual(revokedIds, ["nat-refresh-session"]);
    assert.deepEqual(calls, { snapshot: 1, touch: 1 });
  } finally {
    guards.stopTabVisibilityCacheSweep();
    await stopTestServer(server);
    await resetSessionRevocationStoreForTests();
  }
});
