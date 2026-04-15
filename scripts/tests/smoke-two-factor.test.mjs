import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_SMOKE_ADMIN_TWO_FACTOR_SECRET,
  LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET,
  generateCurrentSmokeTwoFactorCode,
  performLoginWithOptionalTwoFactor,
  resolveSmokeTwoFactorSecret,
} from "../lib/smoke-two-factor.mjs";

test("resolveSmokeTwoFactorSecret prefers explicit secret", () => {
  assert.equal(
    resolveSmokeTwoFactorSecret({
      explicitSecret: "CUSTOMSECRET",
      role: "superuser",
    }),
    "CUSTOMSECRET",
  );
});

test("resolveSmokeTwoFactorSecret falls back to role defaults", () => {
  assert.equal(
    resolveSmokeTwoFactorSecret({
      explicitSecret: "",
      role: "superuser",
    }),
    LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET,
  );
  assert.equal(
    resolveSmokeTwoFactorSecret({
      explicitSecret: "",
      role: "admin",
    }),
    LOCAL_SMOKE_ADMIN_TWO_FACTOR_SECRET,
  );
  assert.equal(
    resolveSmokeTwoFactorSecret({
      explicitSecret: "",
      role: "user",
    }),
    null,
  );
});

test("generateCurrentSmokeTwoFactorCode returns a six-digit code", async () => {
  const code = await generateCurrentSmokeTwoFactorCode(LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET);
  assert.match(code, /^\d{6}$/);
});

test("performLoginWithOptionalTwoFactor returns the login response when no challenge is required", async () => {
  const requests = [];
  const loginResponse = {
    ok: true,
    status: 200,
    json: {
      ok: true,
      twoFactorRequired: false,
    },
  };

  const request = async (path, init, options) => {
    requests.push({ path, init, options });
    return loginResponse;
  };

  const result = await performLoginWithOptionalTwoFactor({
    request,
    username: "superuser",
    password: "Password123!",
    fingerprint: "test",
    pcName: "Unit Test",
    browser: "node-test",
    twoFactorSecret: "",
  });

  assert.equal(result.challengeUsed, false);
  assert.equal(result.loginResponse, loginResponse);
  assert.equal(result.finalResponse, loginResponse);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/api/login");
  assert.equal(requests[0].options?.allowFailure, true);
});

test("performLoginWithOptionalTwoFactor completes the challenge flow when login requires 2FA", async () => {
  const requests = [];
  const loginResponse = {
    ok: true,
    status: 200,
    json: {
      ok: true,
      twoFactorRequired: true,
      challengeToken: "challenge-token",
      role: "superuser",
    },
  };
  const verifyResponse = {
    ok: true,
    status: 200,
    json: {
      ok: true,
      user: { username: "superuser" },
    },
  };

  const request = async (path, init, options) => {
    requests.push({ path, init, options });
    if (path === "/api/login") {
      return loginResponse;
    }
    if (path === "/api/auth/verify-two-factor-login") {
      return verifyResponse;
    }
    throw new Error(`Unexpected request path: ${path}`);
  };

  const result = await performLoginWithOptionalTwoFactor({
    request,
    username: "superuser",
    password: "Password123!",
    fingerprint: "test",
    pcName: "Unit Test",
    browser: "node-test",
    twoFactorSecret: LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET,
  });

  assert.equal(result.challengeUsed, true);
  assert.equal(result.loginResponse, loginResponse);
  assert.equal(result.finalResponse, verifyResponse);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, "/api/auth/verify-two-factor-login");
  assert.equal(requests[1].options?.allowFailure, true);

  const verifyBody = JSON.parse(String(requests[1].init?.body || "{}"));
  assert.equal(verifyBody.challengeToken, "challenge-token");
  assert.match(String(verifyBody.code || ""), /^\d{6}$/);
});
