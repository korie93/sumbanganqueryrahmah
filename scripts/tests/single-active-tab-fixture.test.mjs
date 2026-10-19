import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { WebSocket } from "ws";
import { tsImport } from "tsx/esm/api";
import {
  attachSingleActiveTabFixtureControl,
  parseSingleActiveTabFixtureArgs,
  singleTabFixturePassword,
  singleTabFixtureUser,
  startSingleActiveTabFixture,
} from "../lib/single-active-tab-fixture.mjs";

const syntheticHtml = "<!doctype html><title>Synthetic single-tab fixture</title>";

async function createFixture(t) {
  const parent = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(parent, "sqr-single-tab-fixture-test-"));
  let fixture;
  t.after(async () => {
    if (fixture) await fixture.close();
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("sqr-single-tab-fixture-test-"));
    await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  await writeFile(path.join(directory, "index.html"), syntheticHtml);
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "assets/synthetic.js"), "export const synthetic = true;");
  fixture = await startSingleActiveTabFixture({ publicDirectory: directory });
  return fixture;
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function controlFor(fixture) {
  const input = new PassThrough();
  const replies = [];
  const output = new Writable({ write(chunk, _encoding, next) {
    replies.push(JSON.parse(String(chunk)));
    next();
  } });
  const control = attachSingleActiveTabFixtureControl(fixture, input, output);
  return {
    replies,
    async send(message, raw = false) {
      const count = replies.length;
      input.write(`${raw ? message : JSON.stringify(message)}\n`);
      await waitFor(() => replies.length === count + 1, "Synthetic control must acknowledge exactly once");
      return replies.at(-1);
    },
    async close() {
      await fixture.close();
      control.close(); input.destroy(); output.destroy();
    },
  };
}

test("single-tab preview CLI requires opt-in serve and bounded explicit loopback port/control flags", () => {
  assert.deepEqual(parseSingleActiveTabFixtureArgs(["--serve"]), { controlStdin: false, port: 0 });
  assert.deepEqual(parseSingleActiveTabFixtureArgs(["--serve", "--control-stdin", "--port", "32123"]), { controlStdin: true, port: 32123 });
  for (const args of [[], ["--control-stdin"], ["--serve", "--host", "0.0.0.0"], ["--serve", "--port"],
    ["--serve", "--port", "-1"], ["--serve", "--port", "65536"], ["--serve", "--port", "1.5"],
    ["--serve", "--port", "5000\n"], ["--serve", "--port", "3000", "--port", "4000"],
    ["--serve", "--serve"], ["--serve", "--control-stdin", "--control-stdin"]]) {
    assert.throws(() => parseSingleActiveTabFixtureArgs(args));
  }
});

test("single-tab fixture serves only loopback built documents/assets with synthetic hints and no secret/mutation fallback", async (t) => {
  const fixture = await createFixture(t);
  assert.equal(new URL(fixture.origin).hostname, "127.0.0.1");
  assert.equal(new URL(fixture.origin).protocol, "http:");
  assert.ok(new URL(fixture.origin).port);
  for (const route of ["/general-search", "/collection/records", "/saved", "/viewer", "/import", "/monitor?section=activity"]) {
    const response = await fetch(fixture.origin + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie"), /sqr_auth_hint=1/);
    assert.equal(await response.text(), syntheticHtml);
  }
  const asset = await fetch(`${fixture.origin}/assets/synthetic.js`);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.equal(await asset.text(), "export const synthetic = true;");
  for (const route of ["/.env", "/.git/config", "/assets/%2e%2e%5c.env", "/source.map", "/missing.js", "/%00"]) {
    assert.equal((await fetch(fixture.origin + route)).status, 404);
  }
  assert.equal((await fetch(`${fixture.origin}/general-search`, { method: "POST", body: "{}" })).status, 405);
  for (const route of ["/api/fixture-control", "/api/not-allowlisted", "/api/collection/destructive-action"]) {
    const response = await fetch(fixture.origin + route, { method: "POST", body: "{}" });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(fixture.state.unexpected.length, 3);
});

test("synthetic me/login/heartbeat/import/activity payloads satisfy the actual shared API schemas", async (t) => {
  const fixture = await createFixture(t);
  const contracts = await tsImport("../../shared/api-contracts.ts", import.meta.url);
  const cases = [
    ["GET", "/api/me", contracts.authUserResponseSchema],
    ["GET", "/api/imports", contracts.importsListResponseSchema],
    ["GET", "/api/imports/single-tab-synthetic-import/data", contracts.importDataPageResponseSchema],
    ["GET", "/api/activity/page", contracts.activityPageResponseSchema],
    ["GET", "/api/activity/retention", contracts.activityRetentionResponseSchema],
    ["POST", "/api/activity/heartbeat", contracts.activityHeartbeatResponseSchema],
    ["GET", "/api/analytics/summary", contracts.analyticsSummarySchema],
    ["GET", "/api/analytics/login-trends", contracts.analyticsLoginTrendsSchema],
    ["GET", "/api/analytics/top-users", contracts.analyticsTopUsersSchema],
    ["GET", "/api/analytics/recent-login-activity", contracts.analyticsRecentLoginActivityListSchema],
    ["GET", "/api/analytics/peak-hours", contracts.analyticsPeakHoursSchema],
    ["GET", "/api/analytics/role-distribution", contracts.analyticsRoleDistributionSchema],
    ["GET", "/api/analytics/recent-login-activity-page", contracts.analyticsRecentLoginActivityPageSchema],
  ];
  for (const [method, route, schema] of cases) {
    const response = await fetch(fixture.origin + route, { method });
    assert.equal(response.status, 200, route);
    const payload = await response.json();
    assert.equal(schema.safeParse(payload).success, true, `${route}: ${JSON.stringify(schema.safeParse(payload).error?.issues)}`);
  }
  const login = await fetch(`${fixture.origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: singleTabFixtureUser.username, password: singleTabFixturePassword }) });
  assert.equal(login.status, 200);
  assert.equal(contracts.authLoginSuccessResponseSchema.safeParse(await login.json()).success, true);
  assert.ok(Array.isArray(await (await fetch(`${fixture.origin}/api/search/columns`)).json()));
  const search = await (await fetch(`${fixture.origin}/api/search/global?q=Synthetic`)).json();
  assert.equal(contracts.searchGlobalResponseSchema.safeParse(search).success, true);
  assert.equal(search.rows[0]._collectionStatus.state, "not_recorded");
  assert.deepEqual(fixture.state.unexpected, []);
});

test("held identity validation remains pending, releases explicitly, and reset restores a fresh synthetic account", async (t) => {
  const fixture = await createFixture(t);
  const release = fixture.holdMe();
  let settled = false;
  const pending = fetch(`${fixture.origin}/api/me`, { signal: AbortSignal.timeout(10_000) }).then((response) => { settled = true; return response; });
  await waitFor(() => fixture.state.requests.includes("GET /api/me"), "Held identity request must reach loopback fixture");
  assert.equal(settled, false);
  assert.throws(() => fixture.holdMe());
  release();
  assert.equal((await (await pending).json()).user.id, singleTabFixtureUser.id);
  fixture.state.user.id = "synthetic-changed";
  fixture.state.authenticated = false;
  fixture.state.meSequence = [{ status: 401, body: { ok: false } }];
  fixture.reset();
  assert.deepEqual(fixture.state.user, singleTabFixtureUser);
  assert.equal(fixture.state.authenticated, true);
  assert.deepEqual(fixture.state.meSequence, []);
  assert.deepEqual(fixture.state.requests, []);
  assert.equal(fixture.state.meGate, null);
});

test("stdin controls allow bounded account/identity changes and reject invalid or unsupported commands without state changes", async (t) => {
  const fixture = await createFixture(t);
  const control = controlFor(fixture);
  try {
    assert.equal((await control.send({ command: "holdMe" })).ok, true);
    assert.equal((await control.send({ command: "report" })).state.identityHeld, true);
    assert.equal((await control.send({ command: "releaseMe" })).ok, true);
    assert.equal((await control.send({ command: "setUser", user: { id: "synthetic-b", username: "single.tab.b", role: "admin" } })).ok, true);
    assert.equal((await control.send({ command: "setAuthenticated", value: false })).ok, true);
    const before = JSON.stringify(fixture.state.user);
    for (const message of [{ command: "deleteProductionData" }, { command: "setAuthenticated", value: "yes" },
      { command: "setUser", user: { id: "" } }, { command: "setUser", user: { role: "root" } },
      { command: "setUser", user: { password: "never-accepted" } }, { command: "setUser", user: { id: "x".repeat(201) } },
      { command: "setMeSequence", responses: Array.from({ length: 11 }, () => ({ status: 200 })) },
      { command: "setMeSequence", responses: [{ status: 302 }] }, { command: "broadcast", type: "unknown" }]) {
      const reply = await control.send(message);
      assert.equal(reply.ok, false);
      assert.equal(reply.error, "Invalid synthetic fixture control request");
    }
    for (const raw of ["{broken", "[]", "null", "x".repeat(16_385)]) assert.equal((await control.send(raw, true)).ok, false);
    assert.equal(JSON.stringify(fixture.state.user), before);
    assert.equal(fixture.state.authenticated, false);
    const report = await control.send({ command: "report" });
    assert.equal(report.type, "single-tab-fixture-control");
    assert.equal(report.state.user.id, "synthetic-b");
    assert.equal(report.state.user.role, "admin");
    assert.equal(report.state.authenticated, false);
    assert.equal((await control.send({ command: "reset" })).ok, true);
    assert.deepEqual(fixture.state.user, singleTabFixtureUser);
    assert.equal(fixture.state.authenticated, true);
  } finally { await control.close(); }
});

test("queued stdin identities provide deterministic backend account switches and revocation before normal state resumes", async (t) => {
  const fixture = await createFixture(t);
  const control = controlFor(fixture);
  try {
    const response = await control.send({ command: "setMeSequence", responses: [
      { status: 200, user: { id: "synthetic-account-a" } }, { status: 200, user: { id: "synthetic-account-b", role: "user" } }, { status: 401 },
    ] });
    assert.equal(response.ok, true);
    const first = await (await fetch(`${fixture.origin}/api/me`)).json();
    const second = await (await fetch(`${fixture.origin}/api/me`)).json();
    const revoked = await fetch(`${fixture.origin}/api/me`);
    assert.equal(first.user.id, "synthetic-account-a");
    assert.equal(second.user.id, "synthetic-account-b");
    assert.equal(second.user.role, "user");
    assert.equal(revoked.status, 401);
    assert.equal((await revoked.json()).error.code, "TOKEN_REQUIRED");
    assert.equal((await (await fetch(`${fixture.origin}/api/me`)).json()).user.id, singleTabFixtureUser.id);
    const report = await control.send({ command: "report" });
    assert.equal(report.state.queuedIdentities, 0);
    assert.equal(report.state.counts["GET /api/me"], 4);
    assert.deepEqual(report.state.unexpected, []);
  } finally { await control.close(); }
});

test("synthetic lifecycle WebSocket messages use the real client protocol and revoke only fixture authentication", async (t) => {
  const fixture = await createFixture(t);
  for (const type of ["kicked", "idle_timeout", "banned", "logout"]) {
    fixture.reset();
    const socket = new WebSocket(`${fixture.origin.replace("http:", "ws:")}/ws`);
    try {
      await once(socket, "open");
      const message = once(socket, "message");
      fixture.broadcast(type);
      const [data] = await message;
      assert.deepEqual(JSON.parse(String(data)), { type, reason: "Synthetic session lifecycle verification" });
      assert.equal(fixture.state.authenticated, false);
      assert.equal(fixture.state.websocketConnections, 1);
      assert.equal((await fetch(`${fixture.origin}/api/me`)).status, 401);
    } finally { socket.terminate(); }
  }
});

test("fixture and persistent browser suite never import dotenv/database/production auth or expose HTTP control endpoints", async () => {
  const fixture = await readFile(new URL("../lib/single-active-tab-fixture.mjs", import.meta.url), "utf8");
  const browser = await readFile(new URL("../single-active-tab-browser.mjs", import.meta.url), "utf8");
  for (const source of [fixture, browser]) {
    assert.doesNotMatch(source, /(?:import|from)\s+["'](?:dotenv|pg|postgres|\.\.\/server|\.\.\/\.\.\/server)/);
    assert.doesNotMatch(source, /dotenv\.config|readFile\([^)]*["']\.env|DATABASE_URL|PG_PASSWORD|process\.env\./);
  }
  assert.match(fixture, /server\.listen\(port, "127\.0\.0\.1"/);
  assert.match(fixture, /if \(options\.controlStdin\)|options\.controlStdin \?/);
  assert.doesNotMatch(fixture, /url\.pathname === ["']\/api\/.*control/);
  assert.match(fixture, /state\.unexpected\.push\(endpoint\)/);
  assert.match(browser, /Protected UI must never mount transiently/);
  assert.match(browser, /Blocked tab must not fetch Collection\/Search\/Viewer\/Import\/Activity\/runtime data/);
  assert.match(browser, /Blocked tab must not subscribe to protected WebSocket traffic/);
});
