import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "../../../shared/error-codes";
import type { AuthRouteContext } from "../auth/auth-route-shared";
import { createAuthJsonRoute } from "../auth/auth-route-response-utils";
import { registerAuthLoginRoutes } from "../auth/auth-login-routes";
import {
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

const noopRateLimiter = (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next();

function createTwoFactorSigningFailureContext(app: ReturnType<typeof createJsonTestApp>): AuthRouteContext {
  return {
    app,
    authAccountService: {
      login: async () => ({
        kind: "two_factor_required",
        user: {
          id: "user-2fa-sign-failure",
          username: "admin.2fa",
          role: "admin",
          mustChangePassword: false,
          status: "active",
        },
      }),
    },
    buildDeliveryPayload: (payload: Record<string, unknown>) => payload,
    buildManagedUserPayload: (user: Record<string, unknown>) => user,
    buildOkPayload: <T extends Record<string, unknown>>(payload: T) => ({ ok: true, ...payload }),
    buildUserPayload: (user: Record<string, unknown> | null) => user,
    closeActivitySockets: () => undefined,
    jsonRoute: createAuthJsonRoute,
    parseBrowserName: () => "Test Browser",
    rateLimiters: {
      accountAdminMutation: noopRateLimiter,
      activationEmail: noopRateLimiter,
      login: noopRateLimiter,
      loginIp: noopRateLimiter,
      passwordMutation: noopRateLimiter,
      passwordRecovery: noopRateLimiter,
      sessionRefresh: noopRateLimiter,
      superuserMutation: noopRateLimiter,
      twoFactorLogin: noopRateLimiter,
      twoFactorMutation: noopRateLimiter,
    },
    requireRole: () => noopRateLimiter,
    signSessionToken: () => ({
      expiresAt: new Date("2026-06-03T00:00:00.000Z"),
      token: "unused",
    }),
    signTwoFactorChallengeToken: () => {
      throw new Error("synthetic signer failure with stack details");
    },
    storage: {},
    verifyTwoFactorChallengeToken: () => ({
      browserName: "Test Browser",
      purpose: "two_factor_login",
      role: "admin",
      userId: "user-2fa-sign-failure",
      username: "admin.2fa",
    }),
  } as unknown as AuthRouteContext;
}

test("POST /api/auth/login returns a safe response when 2FA challenge signing fails", async () => {
  const app = createJsonTestApp();
  registerAuthLoginRoutes(createTwoFactorSigningFailureContext(app));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        browser: "Unit Test Browser",
        fingerprint: "fingerprint-2fa-sign-failure",
        password: "StrongPass123!",
        username: "admin.2fa",
      }),
    });
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 503);
    assert.equal(payload.ok, false);
    assert.equal(payload.message, "Authentication temporarily unavailable.");
    assert.equal(payload.error.code, ERROR_CODES.SERVICE_UNAVAILABLE);
    assert.equal(serialized.includes("synthetic signer failure"), false);
    assert.equal(serialized.includes("stack"), false);
  } finally {
    await stopTestServer(server);
  }
});
