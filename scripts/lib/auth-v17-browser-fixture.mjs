import assert from "node:assert/strict";

// TEST FIXTURES ONLY. This module is never imported by client/server production
// code. It replaces the HTTP boundary for a loopback static production build;
// it cannot authenticate real users, send recovery mail, or access a database.
export const authV17Viewports = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 },
  { width: 1280, height: 720 }, { width: 1366, height: 768 },
  { width: 1440, height: 900 }, { width: 1920, height: 1080 },
];
export const authV17FixtureIdentity = Object.freeze({
  username: "v17.ui.fixture", password: "BrowserFixture1!", token: "v17-reset-ui-fixture",
});

export function createAuthV17Fixture(origin) {
  const parsed = new URL(origin);
  assert.equal(parsed.protocol, "http:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.origin, origin);
  assert.ok(parsed.port);
  const state = {
    login: "invalid", verify: "TWO_FACTOR_INVALID_CODE", resetToken: "valid", forgot: "success",
    loginGate: null, forgotGate: null, resetGate: null,
    counts: { login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 }, unexpected: [],
  };
  const error = (route, code, status, message, extra = {}, headers = {}) => route.fulfill({
    status, headers, json: { ok: false, message, error: { code, message }, ...extra },
  });
  async function route(requestRoute) {
    const request = requestRoute.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      state.unexpected.push(`Off-origin ${url.origin}${url.pathname}`);
      return requestRoute.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (["GET", "HEAD"].includes(request.method())) return requestRoute.continue();
      state.unexpected.push(`Unexpected static method ${request.method()}`);
      return requestRoute.abort();
    }
    if (url.pathname === "/api/health" && request.method() === "GET") {
      return requestRoute.fulfill({ json: { status: "ok", ready: true } });
    }
    if (url.pathname === "/api/me" && request.method() === "GET") {
      return error(requestRoute, "TOKEN_REQUIRED", 401, "Authentication required.");
    }
    const supported = ["login", "verify-two-factor-login", "request-password-reset", "validate-password-reset-token", "reset-password-with-token"];
    if (request.method() !== "POST" || !supported.some((name) => url.pathname === `/api/auth/${name}`)) {
      state.unexpected.push(`${request.method()} ${url.pathname}`);
      return error(requestRoute, "NOT_FOUND", 404, "Unexpected isolated fixture API.");
    }
    const body = request.postDataJSON();
    if (url.pathname === "/api/auth/login") {
      state.counts.login++;
      assert.equal(body.username === authV17FixtureIdentity.username && body.password === authV17FixtureIdentity.password, true, "Login must submit the synthetic identifier and password unchanged.");
      if (state.loginGate) await state.loginGate;
      if (state.login === "network") return requestRoute.abort("failed");
      if (state.login === "server") return requestRoute.fulfill({ status: 503, contentType: "text/html", body: "<!doctype html><html><body>Unavailable</body></html>" });
      if (state.login === "mfa") return requestRoute.fulfill({ json: {
        ok: true, twoFactorRequired: true, challengeToken: "v17-ui-challenge",
        username: authV17FixtureIdentity.username, role: "user", mustChangePassword: false, status: "active", user: null,
      } });
      if (state.login === "locked") return error(requestRoute, "ACCOUNT_LOCKED", 423, "Account temporarily locked.", { locked: true, retryAfterMs: 60_000 }, { "Retry-After": "60" });
      if (state.login === "limited") return error(requestRoute, "RATE_LIMITED", 429, "Too many attempts.", {}, { "Retry-After": "60" });
      // Real inactive accounts get the same generic response as bad credentials.
      if (state.login === "disabled") return error(requestRoute, "INVALID_CREDENTIALS", 401, "Invalid credentials");
      if (state.login === "captcha") return error(requestRoute, "CAPTCHA_REQUIRED", 403, "Complete the security check.", { captcha_required: true, captcha_challenge: "2 + 3 = ?" });
      return error(requestRoute, "INVALID_CREDENTIALS", 401, "Invalid username or password.");
    }
    if (url.pathname === "/api/auth/verify-two-factor-login") {
      state.counts.verify++;
      assert.equal(body.challengeToken === "v17-ui-challenge" && /^\d{6}$/.test(body.code), true, "The real MFA API must receive the synthetic challenge and a complete numeric code.");
      return error(requestRoute, state.verify, 401, "Verification was not accepted.");
    }
    if (url.pathname === "/api/auth/request-password-reset") {
      state.counts.forgot++;
      assert.equal(body.identifier, authV17FixtureIdentity.username);
      if (state.forgotGate) await state.forgotGate;
      if (state.forgot === "limited") return error(requestRoute, "RATE_LIMITED", 429, "Too many requests.", { retryAfterMs: 60_000 }, { "Retry-After": "60" });
      return requestRoute.fulfill({ json: { ok: true, message: "If the account exists, its administrator will review the request." } });
    }
    assert.equal(body.token === authV17FixtureIdentity.token, true, "Reset API must receive the original synthetic link token.");
    if (url.pathname === "/api/auth/validate-password-reset-token") {
      state.counts.validate++;
      if (state.resetToken !== "valid") return error(requestRoute, "INVALID_TOKEN", 400, "Pautan tetapan semula tidak sah atau telah tamat tempoh.");
      return requestRoute.fulfill({ json: { ok: true, reset: {
        username: authV17FixtureIdentity.username, fullName: "UI Fixture", email: null, role: "user", expiresAt: "2099-01-01T00:00:00.000Z",
      } } });
    }
    state.counts.reset++;
    assert.equal(body.newPassword === authV17FixtureIdentity.password && body.confirmPassword === authV17FixtureIdentity.password, true, "Reset must send matching synthetic credentials.");
    if (state.resetGate) await state.resetGate;
    return requestRoute.fulfill({ json: { ok: true, user: null } });
  }
  return { state, route };
}
