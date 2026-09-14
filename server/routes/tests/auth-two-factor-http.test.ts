import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { createAuthGuards } from "../../auth/guards";
import { signSessionJwt } from "../../auth/session-jwt";
import {
  buildTwoFactorCredentialState,
  encryptTwoFactorSecret,
  generateCurrentTwoFactorCode,
  type TotpAlgorithm,
} from "../../auth/two-factor";
import { resetTwoFactorReplayCacheForTests } from "../../auth/two-factor-replay-cache";
import { createCsrfProtectionMiddleware } from "../../http/csrf";
import { createSensitiveApiResponseSanitizerMiddleware } from "../../http/response-sanitizer";
import { logger } from "../../lib/logger";
import {
  clearAdaptiveRateLimitCooldownsForTests,
  stopAdaptiveRateLimitCooldownSweep,
} from "../../middleware/rate-limit";
import type { PostgresStorage } from "../../storage-postgres";
import { registerAuthRoutes } from "../auth.routes";
import { createLoginStorageDouble } from "./auth-route-session-doubles";
import { createJsonTestApp, startTestServer, stopTestServer } from "./http-test-utils";

const PASSWORD = "StrongPass123!";
const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const noop: RequestHandler = (_req, _res, next) => next();

async function harness(t: test.TestContext, enabled = false) {
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  process.env.TWO_FACTOR_ENCRYPTION_KEY = "isolated-two-factor-http-test-key";
  resetTwoFactorReplayCacheForTests();
  clearAdaptiveRateLimitCooldownsForTests();
  t.mock.method(logger, "info", () => undefined);
  t.mock.method(logger, "warn", () => undefined);
  const fixture = await createLoginStorageDouble({ user: {
    id: "two-factor-http-user", username: "twofactor.http", role: "admin",
    twoFactorEnabled: enabled,
    twoFactorSecretEncrypted: enabled ? encryptTwoFactorSecret(TEST_SECRET, "sha256") : null,
    twoFactorConfiguredAt: enabled ? new Date() : null,
  } });
  const sessions: Array<Awaited<ReturnType<PostgresStorage["createActivity"]>>> = [];
  const storage = {
    ...fixture.storage,
    getRoleTabVisibility: async () => ({}),
    getActivityById: async (id: string) => sessions.find((entry) => entry.id === id),
    updateActivity: async (id: string, data: Record<string, unknown>) => {
      const activity = sessions.find((entry) => entry.id === id);
      if (activity) Object.assign(activity, data);
      return activity;
    },
    getActiveActivitiesByUsername: async () => sessions.filter((entry) => entry.isActive),
    deactivateUserActivities: async () => {
      for (const entry of sessions) { entry.isActive = false; entry.logoutTime = new Date(); }
    },
    createActivity: async (data: Parameters<PostgresStorage["createActivity"]>[0]) => {
      const activity = {
        ...data, id: `two-factor-http-session-${sessions.length + 1}`,
        isActive: true, logoutTime: null, loginTime: new Date(), lastActivityTime: new Date(),
      } as Awaited<ReturnType<PostgresStorage["createActivity"]>>;
      sessions.push(activity);
      return activity;
    },
    updateUserAccount: async (params: Parameters<PostgresStorage["updateUserAccount"]>[0]) => {
      const expected = params.expectedTwoFactorState;
      if (expected && (
        fixture.user.twoFactorEnabled !== expected.enabled
        || fixture.user.twoFactorSecretEncrypted !== expected.encryptedSecret
        || fixture.user.passwordHash !== expected.passwordHash
      )) return undefined;
      const { userId: _id, expectedTwoFactorState: _expected, ...changes } = params;
      Object.assign(fixture.user, changes);
      return fixture.user;
    },
  } as unknown as PostgresStorage;
  const app = createJsonTestApp();
  app.use(createCsrfProtectionMiddleware());
  app.use(createSensitiveApiResponseSanitizerMiddleware());
  const guards = createAuthGuards({ storage });
  registerAuthRoutes(app, {
    storage, authenticateToken: guards.authenticateToken, requireRole: guards.requireRole,
    connectedClients: new Map(),
    // This suite tests route/service/crypto/session composition. Separate real
    // limiter suites exercise account quotas, shared NAT and flood protection.
    rateLimiters: { login: noop, loginIp: noop, twoFactorLogin: noop,
      twoFactorManagement: noop, authenticatedAuth: noop },
  });
  const running = await startTestServer(app);
  t.after(async () => {
    guards.stopActivityUpdateCacheSweep();
    guards.stopTabVisibilityCacheSweep();
    stopAdaptiveRateLimitCooldownSweep();
    clearAdaptiveRateLimitCooldownsForTests();
    resetTwoFactorReplayCacheForTests();
    if (previousKey === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    else process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
    await stopTestServer(running.server);
  });
  function browser() {
    const cookies = new Map<string, string>();
    return {
      hasSession: () => Boolean(cookies.get("sqr_auth")),
      csrf: () => cookies.get("sqr_csrf"),
      request: async (path: string, body?: object, overrides: Record<string, string> = {}) => {
        const response = await fetch(`${running.baseUrl}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json", "User-Agent": "Isolated Auth Browser",
            ...(cookies.size ? { Cookie: Array.from(cookies, ([key, value]) => `${key}=${value}`).join("; ") } : {}),
            ...(cookies.get("sqr_csrf") ? { "X-CSRF-Token": cookies.get("sqr_csrf")! } : {}),
            ...overrides,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(";", 1)[0];
          const separator = pair.indexOf("=");
          const name = pair.slice(0, separator);
          const value = pair.slice(separator + 1);
          if (value) cookies.set(name, value);
          else cookies.delete(name);
        }
        return { response, payload: await response.json() };
      },
    };
  }
  return { ...fixture, browser, sessions };
}

test("HTTP enrollment and 2FA login preserve CSRF, private status and final session admission", async (t) => {
  const f = await harness(t);
  const settings = f.browser();
  const normalLogin = await settings.request("/api/auth/login", { username: f.user.username, password: PASSWORD });
  assert.equal(normalLogin.response.status, 200);
  assert.equal(settings.hasSession(), true);
  const cookie = normalLogin.response.headers.getSetCookie().find((value) => value.startsWith("sqr_auth="))!;
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("Path=/"));
  assert.match(cookie, /SameSite=(Lax|Strict)/);
  const beforeSetupCsrf = settings.csrf();
  const denied = await settings.request("/api/auth/two-factor/setup", { currentPassword: PASSWORD }, {
    "X-CSRF-Token": "", "Sec-Fetch-Site": "cross-site",
  });
  assert.equal(denied.response.status, 403);
  assert.equal(f.user.twoFactorSecretEncrypted, null);
  const started = await settings.request("/api/auth/two-factor/setup", { currentPassword: PASSWORD });
  assert.equal(started.response.status, 200);
  assert.notEqual(settings.csrf(), beforeSetupCsrf);
  assert.equal(f.user.twoFactorEnabled, false);
  const setup = started.payload.setup;
  const uri = new URL(setup.otpauthUrl);
  assert.equal(uri.protocol, "otpauth:");
  assert.equal(uri.hostname, "totp");
  assert.equal(uri.searchParams.get("secret") === setup.secret, true);
  assert.equal(uri.searchParams.get("algorithm"), setup.algorithm);
  assert.equal(uri.searchParams.get("digits"), "6");
  assert.equal(uri.searchParams.get("period"), "30");
  assert.ok(Date.parse(setup.expiresAt) > Date.now());
  const wrong = await settings.request("/api/auth/two-factor/enable", { code: "invalid" });
  assert.equal(wrong.response.status, 400);
  assert.equal(f.user.twoFactorEnabled, false);
  const algorithm = setup.algorithm.toLowerCase() as TotpAlgorithm;
  const enabled = await settings.request("/api/auth/two-factor/enable", {
    code: generateCurrentTwoFactorCode(setup.secret, algorithm),
  });
  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.payload.user.twoFactorEnabled, true);
  const status = await settings.request("/api/auth/two-factor");
  assert.equal(status.payload.twoFactor.enabled, true);
  const privateStatus = JSON.stringify(status.payload);
  assert.equal(privateStatus.includes(setup.secret), false);
  assert.equal(privateStatus.includes("otpauth://"), false);
  assert.equal(privateStatus.includes("twoFactorSecretEncrypted"), false);
  const repeatedSetup = await settings.request("/api/auth/two-factor/setup", { currentPassword: PASSWORD });
  assert.equal(repeatedSetup.response.status, 409);
  assert.equal(f.user.twoFactorEnabled, true);

  const login = f.browser();
  const firstStep = await login.request("/api/auth/login", { username: f.user.username, password: PASSWORD });
  assert.equal(firstStep.payload.twoFactorRequired, true);
  assert.equal(login.hasSession(), false);
  assert.equal(f.sessions.length, 1);
  const challengeToken = firstStep.payload.challengeToken;
  const bypass = await f.browser().request("/api/auth/me", undefined, { Authorization: `Bearer ${challengeToken}` });
  assert.equal(bypass.response.status, 401);
  const cookieBypass = await f.browser().request("/api/auth/me", undefined, { Cookie: `sqr_auth=${challengeToken}` });
  assert.equal(cookieBypass.response.status, 401);
  const invalid = await login.request("/api/auth/verify-two-factor-login", { challengeToken, code: "invalid" });
  assert.equal(invalid.response.status, 401);
  assert.equal(login.hasSession(), false);
  const completed = await login.request("/api/auth/verify-two-factor-login", {
    challengeToken, code: generateCurrentTwoFactorCode(setup.secret, algorithm),
  });
  assert.equal(completed.response.status, 200);
  assert.equal(login.hasSession(), true);
  assert.equal(f.sessions.length, 2);
  assert.equal((await login.request("/api/auth/me")).payload.user.id, f.user.id);
  const auditText = JSON.stringify(f.auditLogs);
  assert.equal(auditText.includes(setup.secret), false);
  assert.equal(auditText.includes(PASSWORD), false);
  assert.equal(auditText.includes(challengeToken), false);
});

test("HTTP challenges reject missing, expired, changed-account and replayed credentials", async (t) => {
  const f = await harness(t, true);
  const login = f.browser();
  const firstStep = await login.request("/api/auth/login", { username: f.user.username, password: PASSWORD });
  const challengeToken = firstStep.payload.challengeToken;
  const code = generateCurrentTwoFactorCode(TEST_SECRET, "sha256");
  const missing = await login.request("/api/auth/verify-two-factor-login", { userId: f.user.id, code });
  assert.equal(missing.response.status, 401);
  const expired = signSessionJwt({
    purpose: "two_factor_login", userId: f.user.id, username: f.user.username, role: f.user.role,
    browserName: "Isolated Auth Browser", credentialState: buildTwoFactorCredentialState({
      ...f.user, passwordHash: f.user.passwordHash!,
    }),
  }, { expiresIn: -1 });
  const expiredResult = await login.request("/api/auth/verify-two-factor-login", { challengeToken: expired, code });
  assert.equal(expiredResult.payload.error.code, "TWO_FACTOR_CHALLENGE_EXPIRED");
  const before = f.user.passwordHash;
  f.user.passwordHash = "credential-changed";
  const stale = await login.request("/api/auth/verify-two-factor-login", { challengeToken, code });
  assert.equal(stale.payload.error.code, "TWO_FACTOR_CHALLENGE_EXPIRED");
  f.user.passwordHash = before;
  assert.equal(f.sessions.length, 0);
  const completed = await login.request("/api/auth/verify-two-factor-login", {
    challengeToken, code, userId: "other-user", username: "other-account", role: "superuser",
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.payload.user.id, f.user.id);
  assert.equal(completed.payload.role, "admin");
  const replay = await login.request("/api/auth/verify-two-factor-login", { challengeToken, code });
  assert.equal(replay.payload.error.code, "TWO_FACTOR_CODE_REPLAYED");
  // A new valid timestep still cannot revive the already consumed challenge.
  const realNow = Date.now();
  const nextStep = t.mock.method(Date, "now", () => realNow + 30_000);
  const nextCode = generateCurrentTwoFactorCode(TEST_SECRET, "sha256");
  nextStep.mock.restore();
  const used = await login.request("/api/auth/verify-two-factor-login", { challengeToken, code: nextCode });
  assert.equal(used.payload.error.code, "TWO_FACTOR_CHALLENGE_EXPIRED");
  assert.equal(f.sessions.length, 1);
});

test("HTTP disable requires both proofs, clears private state, and permits fresh enrollment", async (t) => {
  const f = await harness(t, true);
  const settings = f.browser();
  const firstStep = await settings.request("/api/auth/login", { username: f.user.username, password: PASSWORD });
  const completed = await settings.request("/api/auth/verify-two-factor-login", {
    challengeToken: firstStep.payload.challengeToken,
    code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256"),
  });
  assert.equal(completed.response.status, 200);
  const wrongPassword = await settings.request("/api/auth/two-factor/disable", {
    currentPassword: "wrong", code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256"),
  });
  assert.equal(wrongPassword.payload.error.code, "INVALID_CURRENT_PASSWORD");
  const wrongCode = await settings.request("/api/auth/two-factor/disable", { currentPassword: PASSWORD, code: "invalid" });
  assert.equal(wrongCode.payload.error.code, "TWO_FACTOR_INVALID_CODE");
  assert.equal(f.user.twoFactorEnabled, true);
  const disabled = await settings.request("/api/auth/two-factor/disable", {
    currentPassword: PASSWORD, code: generateCurrentTwoFactorCode(TEST_SECRET, "sha256"),
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.payload.user.twoFactorConfiguredAt, null);
  assert.equal(f.user.twoFactorSecretEncrypted, null);
  assert.equal(f.user.twoFactorEnabled, false);
  const fresh = await settings.request("/api/auth/two-factor/setup", { currentPassword: PASSWORD });
  assert.equal(fresh.response.status, 200);
  assert.equal(fresh.payload.setup.secret === TEST_SECRET, false);
  const enabled = await settings.request("/api/auth/two-factor/enable", {
    code: generateCurrentTwoFactorCode(fresh.payload.setup.secret, fresh.payload.setup.algorithm.toLowerCase()),
  });
  assert.equal(enabled.response.status, 200);
  assert.equal(f.user.twoFactorEnabled, true);
});
