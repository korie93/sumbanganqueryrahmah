import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { authV17Viewports, authV17FixtureIdentity, createAuthV17Fixture } from "../lib/auth-v17-browser-fixture.mjs";

function routeStub(url, method = "GET", body = null) {
  const result = {};
  return {
    result,
    request: () => ({ url: () => url, method: () => method, postDataJSON: () => body }),
    fulfill: async (value) => { result.response = value; },
    abort: async (reason = "aborted") => { result.abort = reason; },
    continue: async () => { result.continue = true; },
  };
}

test("CI and release readiness execute and retain the isolated V17 browser checks", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const release = readFileSync("scripts/release-readiness-local.mjs", "utf8");
  assert.match(ci, /run: npm run test:auth:v17/);
  assert.match(release, /runNpm\(\["run", "test:auth:v17"\], \{ env: releaseBuildEnv \}\)/);
  for (const file of [".github/workflows/ci.yml", ".github/workflows/release-verification.yml"]) {
    assert.match(
      readFileSync(file, "utf8"),
      /^([ ]+)artifacts\/password-public-build-browser\r?\n\1artifacts\/auth-v17-browser\r?$/m,
      `${file} must retain the V17 artifacts at the same YAML block indentation as its siblings.`,
    );
  }
});

test("V17 fixture only accepts isolated loopback origins", () => {
  for (const origin of ["https://sqr-system.com", "http://localhost:5000", "http://127.0.0.1", "http://127.0.0.1:5000/path", "https://127.0.0.1:5000"]) {
    assert.throws(() => createAuthV17Fixture(origin));
  }
  assert.doesNotThrow(() => createAuthV17Fixture("http://127.0.0.1:51234"));
});

test("V17 required viewport list includes all ten sizes, including office laptop", () => {
  assert.deepEqual(authV17Viewports.map(({ width, height }) => `${width}x${height}`), [
    "320x568", "360x800", "390x844", "430x932", "768x1024", "1024x768", "1280x720", "1366x768", "1440x900", "1920x1080",
  ]);
});

test("V17 fixture fails closed on off-origin, business APIs and static mutations", async () => {
  const fixture = createAuthV17Fixture("http://127.0.0.1:51234");
  for (const [url, method] of [["https://sqr-system.com/api/auth/login", "POST"], ["http://127.0.0.1:51234/api/collection", "POST"], ["http://127.0.0.1:51234/assets/file.js", "POST"]]) {
    const route = routeStub(url, method);
    await fixture.route(route);
    assert.equal(route.result.continue, undefined);
    assert.ok(route.result.abort || route.result.response?.status === 404);
  }
  assert.equal(fixture.state.unexpected.length, 3);
});

test("V17 login fixture validates payload and supplies explicit MFA/lock/CAPTCHA contracts", async () => {
  const origin = "http://127.0.0.1:51234";
  const fixture = createAuthV17Fixture(origin);
  const credentials = { username: authV17FixtureIdentity.username, password: authV17FixtureIdentity.password };
  const bad = routeStub(`${origin}/api/auth/login`, "POST", { username: "unexpected", password: "unexpected" });
  await assert.rejects(() => fixture.route(bad), /synthetic identifier/);
  for (const mode of ["invalid", "mfa", "locked", "limited", "disabled", "captcha"]) {
    fixture.state.login = mode;
    const route = routeStub(`${origin}/api/auth/login`, "POST", credentials);
    await fixture.route(route);
    if (mode === "mfa") {
      assert.equal(route.result.response.json.twoFactorRequired, true);
      assert.equal(route.result.response.json.challengeToken, "v17-ui-challenge");
      assert.equal(route.result.response.json.user, null);
    } else {
      assert.equal(route.result.response.json.ok, false);
      assert.ok(route.result.response.status >= 400);
    }
    if (["limited", "locked"].includes(mode)) assert.equal(route.result.response.headers["Retry-After"], "60");
    if (mode === "captcha") assert.equal(route.result.response.json.captcha_required, true);
    if (mode === "locked") assert.equal(route.result.response.status, 423);
    if (mode === "disabled") {
      assert.equal(route.result.response.status, 401);
      assert.equal(route.result.response.json.error.code, "INVALID_CREDENTIALS");
    }
  }
});

test("V17 reset fixture requires backend validation request and original token", async () => {
  const origin = "http://127.0.0.1:51234";
  const fixture = createAuthV17Fixture(origin);
  const route = routeStub(`${origin}/api/auth/validate-password-reset-token`, "POST", { token: authV17FixtureIdentity.token });
  await fixture.route(route);
  assert.equal(route.result.response.json.reset.username, authV17FixtureIdentity.username);
  assert.equal(fixture.state.counts.validate, 1);
  fixture.state.resetToken = "invalid";
  await fixture.route(route);
  assert.equal(route.result.response.status, 400);
  assert.equal(route.result.response.json.error.code, "INVALID_TOKEN");
  const wrongToken = routeStub(`${origin}/api/auth/validate-password-reset-token`, "POST", { token: "not-the-fixture" });
  await assert.rejects(() => fixture.route(wrongToken), /original synthetic link token/);
});
