import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const drillScript = fileURLToPath(new URL("../disaster-recovery-drill.mjs", import.meta.url));
const monitorScript = fileURLToPath(new URL("../monitor-stale-conflicts.mjs", import.meta.url));
const fixtureUsername = "drill-monitor-fixture-account";
const fixturePassword = "drill-monitor-fixture-password-only";
const monitorPaths = ["/api/analytics/summary", "/internal/system-health", "/internal/alerts"];

function writeJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    connection: "close",
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function createFixture(t, { failSummary = false, unavailableInternal = false } = {}) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, "sqr-drill-monitor-"));
  t.after(async () => {
    const resolvedDirectory = path.resolve(directory);
    assert.equal(path.dirname(resolvedDirectory), temporaryRoot);
    assert.ok(path.basename(resolvedDirectory).startsWith("sqr-drill-monitor-"));
    await rm(resolvedDirectory, { recursive: true, force: true });
  });

  const outputFile = path.join(directory, "artifacts", "monitor.json");
  const backupId = "drill-monitor-fixture-backup";
  const backupData = { schemaVersion: 1, collections: [] };
  const checksum = crypto.createHash("sha256").update(JSON.stringify(backupData)).digest("hex");
  const state = { logins: 0, deleted: 0, logouts: 0, events: [], violations: [] };
  let authenticated = false;
  let authCookie = "";
  let csrfCookie = "";

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const method = request.method;
      state.events.push(`${method} ${url.pathname}`);
      if (method === "POST" && url.pathname === "/api/auth/login") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const credentials = JSON.parse(body);
        assert.equal(credentials.username, fixtureUsername);
        assert.equal(credentials.password, fixturePassword);
        state.logins += 1;
        if (state.logins > 5) {
          writeJson(response, 429, { message: "Fixture same-account quota exhausted" }, { "retry-after": "900" });
          return;
        }
        authCookie = `fixture-auth-cookie-${state.logins}`;
        csrfCookie = `fixture-csrf-cookie-${state.logins}`;
        authenticated = true;
        writeJson(response, 200, { user: { role: "superuser" } }, {
          "set-cookie": [
            `sqr_auth=${authCookie}; Path=/; HttpOnly; SameSite=Lax`,
            `sqr_csrf=${csrfCookie}; Path=/; SameSite=Lax`,
          ],
        });
        return;
      }

      assert.equal(authenticated, true, "Drill requests must occur before logout");
      assert.equal(request.headers.cookie, `sqr_auth=${authCookie}; sqr_csrf=${csrfCookie}`);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        assert.equal(request.headers["x-csrf-token"], csrfCookie);
      }

      if (method === "GET" && url.pathname === "/api/backups") {
        assert.equal(url.searchParams.get("page"), "1");
        assert.equal(url.searchParams.get("pageSize"), "5");
        writeJson(response, 200, { backups: [] });
      } else if (method === "POST" && url.pathname === "/api/backups") {
        let body = "";
        for await (const chunk of request) body += chunk;
        assert.match(JSON.parse(body).name, /^DR-Drill-\d+$/);
        writeJson(response, 200, { id: backupId });
      } else if (method === "GET" && url.pathname === `/api/backups/${backupId}`) {
        writeJson(response, 200, { metadata: { payloadChecksumSha256: checksum } });
      } else if (method === "GET" && url.pathname === `/api/backups/${backupId}/export`) {
        writeJson(response, 200, { backupData, integrity: { checksumSha256: checksum } });
      } else if (method === "DELETE" && url.pathname === `/api/backups/${backupId}`) {
        state.deleted += 1;
        writeJson(response, 200, { success: true });
      } else if (method === "GET" && url.pathname === "/api/analytics/summary") {
        writeJson(response, failSummary ? 500 : 200, failSummary ? { message: "Fixture summary unavailable" } : {
          collectionRecordVersionConflicts24h: 22,
          loginFailures24h: 26,
          backupActions24h: 8,
          activeSessions: 3,
          password: fixturePassword,
          sessionToken: authCookie,
          csrfToken: csrfCookie,
        });
      } else if (method === "GET" && url.pathname === "/internal/system-health") {
        writeJson(response, unavailableInternal ? 403 : 200, { status429Count: 32, errorRate: 0.06, activeAlertCount: 2 });
      } else if (method === "GET" && url.pathname === "/internal/alerts") {
        writeJson(response, unavailableInternal ? 403 : 200, { alerts: [{ severity: "CRITICAL" }, { severity: "warning" }] });
      } else if (method === "POST" && url.pathname === "/api/activity/logout") {
        state.logouts += 1;
        authenticated = false;
        writeJson(response, 200, { success: true });
      } else {
        throw new Error(`Unexpected fixture route: ${method} ${url.pathname}`);
      }
    } catch (error) {
      state.violations.push(error.message);
      writeJson(response, 400, { message: "Fixture request contract failed" });
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Earlier release stages already consumed four logins for this same account.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: fixtureUsername, password: fixturePassword }),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }

  return { directory, outputFile, baseUrl, state, backupId };
}

async function runDrill(fixture, { enableMonitor = true, standaloneMonitor = false } = {}) {
  const child = spawn(process.execPath, [standaloneMonitor ? monitorScript : drillScript], {
    cwd: fixture.directory,
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: path.join(fixture.directory, "no-local-env-file"),
      DOTENV_CONFIG_QUIET: "true",
      DRILL_BASE_URL: fixture.baseUrl,
      DRILL_SUPERUSER_USERNAME: fixtureUsername,
      DRILL_SUPERUSER_PASSWORD: fixturePassword,
      DRILL_RUN_RESTORE: "0",
      DRILL_KEEP_BACKUP: "0",
      DRILL_TIMEOUT_MS: "2000",
      DRILL_MONITOR_OUTPUT_FILE: enableMonitor ? fixture.outputFile : "",
      MONITOR_BASE_URL: fixture.baseUrl,
      MONITOR_SUPERUSER_USERNAME: fixtureUsername,
      MONITOR_SUPERUSER_PASSWORD: fixturePassword,
      MONITOR_OUTPUT_FILE: standaloneMonitor ? fixture.outputFile : "",
      MONITOR_TIMEOUT_MS: "2000",
      MONITOR_LOOP: "0",
      SMOKE_BASE_URL: fixture.baseUrl,
      SMOKE_TEST_USERNAME: fixtureUsername,
      SMOKE_TEST_PASSWORD: fixturePassword,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const watchdog = setTimeout(() => child.kill(), 15_000);
  try {
    const [exitCode, signal] = await once(child, "close");
    return { exitCode, signal, stdout, stderr };
  } finally {
    clearTimeout(watchdog);
  }
}

function assertCleanup(fixture) {
  assert.deepEqual(fixture.state.violations, []);
  assert.equal(fixture.state.logins, 5, "Drill and monitor together must use only one new login");
  assert.equal(fixture.state.deleted, 1, "The temporary drill backup must be deleted");
  assert.equal(fixture.state.logouts, 1, "The shared session must be logged out once");
  assert.deepEqual(fixture.state.events.slice(-2), [
    `DELETE /api/backups/${fixture.backupId}`,
    "POST /api/activity/logout",
  ]);
}

test("DR drill captures monitoring with its fifth same-account login and no persisted credentials", async (t) => {
  const fixture = await createFixture(t);
  const result = await runDrill(fixture);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.signal, null);
  assertCleanup(fixture);
  for (const route of monitorPaths) {
    assert.equal(fixture.state.events.filter((event) => event === `GET ${route}`).length, 1);
  }

  const artifact = await readFile(fixture.outputFile, "utf8");
  const snapshot = JSON.parse(artifact);
  assert.equal(snapshot.baseUrl, fixture.baseUrl);
  assert.ok(Number.isFinite(Date.parse(snapshot.timestamp)));
  assert.deepEqual(snapshot.summary, {
    collectionRecordVersionConflicts24h: 22,
    loginFailures24h: 26,
    backupActions24h: 8,
    activeSessions: 3,
  });
  assert.deepEqual(snapshot.system, { status429Count: 32, errorRate: 0.06, activeAlertCount: 2 });
  assert.deepEqual(snapshot.alerts, { critical: 1, warning: 1 });
  assert.equal(snapshot.status.staleConflicts24h, 22);
  assert.equal(snapshot.status.status429Count5s, 32);
  assert.deepEqual(snapshot.status.warnings, [
    "stale_conflicts_high",
    "login_failures_high",
    "rate_limit_pressure_high",
    "error_rate_high",
    "runtime_alerts_critical",
    "runtime_alerts_warning",
  ]);
  for (const secret of [fixtureUsername, fixturePassword, "fixture-auth-cookie-5", "fixture-csrf-cookie-5"]) {
    assert.equal(artifact.includes(secret), false, "Monitor artifact must not persist auth credentials");
    assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false, "CLI must not print auth credentials");
  }
});

test("DR drill fails a required monitor snapshot but still deletes its backup and logs out", async (t) => {
  const fixture = await createFixture(t, { failSummary: true });
  const result = await runDrill(fixture);
  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /GET \/api\/analytics\/summary failed with 500/);
  assertCleanup(fixture);
  await assert.rejects(readFile(fixture.outputFile, "utf8"), { code: "ENOENT" });
});

test("DR drill without an optional monitor output retains its existing request flow", async (t) => {
  const fixture = await createFixture(t);
  const result = await runDrill(fixture, { enableMonitor: false });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.signal, null);
  assertCleanup(fixture);
  for (const route of monitorPaths) {
    assert.equal(fixture.state.events.includes(`GET ${route}`), false);
  }
  await assert.rejects(readFile(fixture.outputFile, "utf8"), { code: "ENOENT" });
});

test("standalone monitor retains its own login, snapshot and logout without running a backup drill", async (t) => {
  const fixture = await createFixture(t);
  const result = await runDrill(fixture, { standaloneMonitor: true });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.deepEqual(fixture.state.violations, []);
  assert.equal(fixture.state.logins, 5);
  assert.equal(fixture.state.logouts, 1);
  assert.equal(fixture.state.deleted, 0);
  assert.equal(fixture.state.events.some((event) => event.includes("/api/backups")), false);
  assert.equal(fixture.state.events.at(-1), "POST /api/activity/logout");
  const snapshot = JSON.parse(await readFile(fixture.outputFile, "utf8"));
  assert.equal(snapshot.status.status429Count5s, 32);
  for (const route of monitorPaths) {
    assert.equal(fixture.state.events.filter((event) => event === `GET ${route}`).length, 1);
  }
});

test("shared monitor preserves unavailable-role diagnostics for optional internal endpoints", async (t) => {
  const fixture = await createFixture(t, { unavailableInternal: true });
  const result = await runDrill(fixture);
  assert.equal(result.exitCode, 0, result.stderr);
  assertCleanup(fixture);
  const snapshot = JSON.parse(await readFile(fixture.outputFile, "utf8"));
  assert.equal(snapshot.summary.collectionRecordVersionConflicts24h, 22);
  assert.equal(snapshot.system.status429Count, null);
  assert.equal(snapshot.alerts.critical, null);
  assert.match(snapshot.system.note, /unavailable for current role\/tab access/);
  assert.match(snapshot.alerts.note, /unavailable for current role\/tab access/);
  assert.deepEqual(snapshot.status.warnings, ["stale_conflicts_high", "login_failures_high"]);
});
