import assert from "node:assert/strict";
import test from "node:test";
import { cleanupSmokeSession } from "../lib/ui-smoke-session-cleanup.mjs";

const baseUrl = "http://127.0.0.1:5000";
const csrf = "a".repeat(64);
const activeCookies = () => [
  { name: "sqr_auth", value: "synthetic-context-session", expires: -1 },
  { name: "sqr_csrf", value: csrf, expires: -1 },
];

function createHarness({ cookies = activeCookies(), status = 200, requestError } = {}) {
  const cookieUrls = [];
  const requests = [];
  return {
    cookieUrls,
    requests,
    context: {
      async cookies(url) { cookieUrls.push(url); return cookies; },
      request: {
        async fetch(url, options) {
          requests.push({ url, options });
          if (requestError) throw requestError;
          return {
            status: () => status,
            text() { throw new Error("Cleanup must not read or log response bodies."); },
          };
        },
      },
    },
  };
}

test("failed smoke cleanup logs out only the existing context session with CSRF and no redirects or retries", async () => {
  const harness = createHarness();
  assert.deepEqual(await cleanupSmokeSession({ context: harness.context, baseUrl, timeoutMs: 500 }), {
    status: "logged-out",
  });
  assert.deepEqual(harness.cookieUrls, [`${baseUrl}/api/activity/logout`]);
  assert.equal(harness.requests.length, 1);
  const { url, options } = harness.requests[0];
  assert.equal(url, `${baseUrl}/api/activity/logout`);
  assert.equal(options.method, "POST");
  assert.equal(options.headers["X-CSRF-Token"], csrf);
  assert.equal(options.headers.Origin, baseUrl);
  assert.equal(options.headers.Referer, `${baseUrl}/`);
  assert.equal(options.headers.Cookie, undefined);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.data, undefined);
  assert.equal(options.failOnStatusCode, false);
  assert.equal(options.maxRedirects, 0);
  assert.equal(options.maxRetries, 0);
  assert.ok(options.timeout > 0 && options.timeout <= 500);
});

test("cleanup skips contexts without a live auth cookie and never creates a replacement login", async () => {
  assert.deepEqual(await cleanupSmokeSession({ context: null, baseUrl }), { status: "skipped", reason: "no-context" });
  for (const cookies of [[], [{ name: "sqr_auth_hint", value: "1", expires: -1 }],
    [{ name: "sqr_auth", value: "", expires: -1 }],
    [{ name: "sqr_auth", value: "expired", expires: 1 }]]) {
    const harness = createHarness({ cookies });
    assert.deepEqual(await cleanupSmokeSession({ context: harness.context, baseUrl }), {
      status: "skipped", reason: "no-auth-cookie",
    });
    assert.equal(harness.requests.length, 0);
  }
  const unauthenticated = createHarness({ status: 401 });
  assert.deepEqual(await cleanupSmokeSession({ context: unauthenticated.context, baseUrl }), {
    status: "skipped", reason: "unauthenticated",
  });
  assert.equal(unauthenticated.requests.length, 1);
});

test("cleanup does not send an authenticated mutation without the existing valid CSRF cookie", async () => {
  for (const csrfCookie of [null, { name: "sqr_csrf", value: "invalid", expires: -1 },
    { name: "sqr_csrf", value: csrf, expires: 1 }]) {
    const harness = createHarness({ cookies: [activeCookies()[0], ...(csrfCookie ? [csrfCookie] : [])] });
    await assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl }), /existing CSRF cookie/);
    assert.equal(harness.requests.length, 0);
  }
});

test("cleanup accepts only an HTTP(S) origin and cannot send tokens through redirected or caller-selected paths", async () => {
  for (const invalidBase of ["ftp://127.0.0.1", "http://user:private@127.0.0.1:5000",
    `${baseUrl}/api/auth/login`, `${baseUrl}/?token=private`, `${baseUrl}/#private`, "//external.invalid"]) {
    const harness = createHarness();
    await assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl: invalidBase }),
      /requires an HTTP\(S\) origin without credentials/);
    assert.equal(harness.cookieUrls.length, 0);
    assert.equal(harness.requests.length, 0);
  }
  const redirected = createHarness({ status: 302 });
  await assert.rejects(cleanupSmokeSession({ context: redirected.context, baseUrl }), /HTTP 302/);
  assert.equal(redirected.requests.length, 1);
  assert.equal(redirected.requests[0].options.maxRedirects, 0);
});

test("cleanup reports non-success responses and transport failures without exposing response bodies or error details", async () => {
  for (const status of [400, 403, 409, 500, 503]) {
    const harness = createHarness({ status });
    await assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl }), new RegExp(`HTTP ${status}`));
    assert.equal(harness.requests.length, 1);
  }
  const harness = createHarness({ requestError: new Error("private-cookie-token-response-body") });
  await assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl }), {
    message: "Smoke session cleanup request failed.",
  });
});

test("cleanup bounds a hanging request and supplies the remaining total deadline to Playwright", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  context.mock.method(Date, "now", () => 1_700_000_000_000);
  const harness = createHarness();
  harness.context.request.fetch = async (url, options) => {
    harness.requests.push({ url, options });
    return new Promise(() => {});
  };
  const rejected = assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl, timeoutMs: 20 }), /timed out/);
  await Promise.resolve();
  assert.equal(harness.requests.length, 1);
  assert.ok(harness.requests[0].options.timeout > 0 && harness.requests[0].options.timeout <= 20);
  context.mock.timers.tick(20);
  await rejected;
});

test("a cookie read resolving after timeout cannot trigger logout even before the wall-clock deadline", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  context.mock.method(Date, "now", () => 1_700_000_000_000);
  const harness = createHarness();
  let resolveCookies;
  harness.context.cookies = () => new Promise((resolve) => { resolveCookies = resolve; });
  const rejected = assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl, timeoutMs: 20 }), /timed out/);
  context.mock.timers.tick(20);
  await rejected;
  resolveCookies(activeCookies());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.requests.length, 0);
});

test("cookie reads past the deadline cannot log out while the timeout callback is still pending", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 1_700_000_000_000;
  context.mock.method(Date, "now", () => now);
  const harness = createHarness();
  let resolveCookies;
  harness.context.cookies = () => new Promise((resolve) => { resolveCookies = resolve; });
  const rejected = assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl, timeoutMs: 20 }), /timed out/);
  now += 20;
  resolveCookies(activeCookies());
  await rejected;
  assert.equal(harness.requests.length, 0);
});

test("an asynchronous cookie read within the deadline retains the remaining request budget", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 1_700_000_000_000;
  context.mock.method(Date, "now", () => now);
  const harness = createHarness();
  let resolveCookies;
  harness.context.cookies = () => new Promise((resolve) => { resolveCookies = resolve; });
  const cleanup = cleanupSmokeSession({ context: harness.context, baseUrl, timeoutMs: 20 });
  now += 7;
  resolveCookies(activeCookies());
  assert.deepEqual(await cleanup, { status: "logged-out" });
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].options.timeout, 13);
  context.mock.timers.tick(20);
  assert.equal(harness.requests.length, 1);
});

test("a successful response arriving after timeout cannot resume the closed cleanup lifecycle", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  context.mock.method(Date, "now", () => 1_700_000_000_000);
  const harness = createHarness();
  let resolveResponse;
  let statusReads = 0;
  harness.context.request.fetch = (url, options) => {
    harness.requests.push({ url, options });
    return new Promise((resolve) => { resolveResponse = resolve; });
  };
  const rejected = assert.rejects(cleanupSmokeSession({ context: harness.context, baseUrl, timeoutMs: 20 }), /timed out/);
  await Promise.resolve();
  assert.equal(harness.requests.length, 1);
  context.mock.timers.tick(20);
  await rejected;
  resolveResponse({ status() { statusReads += 1; return 200; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(statusReads, 0);
  assert.equal(harness.requests.length, 1);
});
