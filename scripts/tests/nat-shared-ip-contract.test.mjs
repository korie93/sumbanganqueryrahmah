import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { APPLICATION_SHA, assertCiIsolation, nginxConfiguration, summarizeEdgeLog, startupDiagnosticMessages } from "../lib/nat-simulation-contract.mjs";

function isolatedEnv() {
  return { CI: "true", GITHUB_ACTIONS: "true", NAT_SIMULATION_ISOLATED: "1", PG_HOST: "127.0.0.1", PG_PORT: "5432", PG_USER: "postgres", PG_DATABASE: "sqr_nat_simulation", PG_PASSWORD: "ephemeral-postgres-password-at-least-32", NAT_SIMULATION_EXPECTED_SHA: APPLICATION_SHA, GITHUB_WORKSPACE: path.resolve("."), RUNNER_TEMP: path.resolve("artifacts"), RUNNER_ENVIRONMENT: "github-hosted" };
}

test("simulation refuses local, external or inherited service configuration before execution", () => {
  assert.doesNotThrow(() => assertCiIsolation(isolatedEnv()));
  for (const override of [{ CI: "false" }, { PG_HOST: "production.example.com" }, { PG_DATABASE: "sqr_db" }, { RUNNER_ENVIRONMENT: "self-hosted" }, { DATABASE_URL: "postgres://external/db" }, { REDIS_URL: "redis://external/0" }, { SQR_REDIS_RATE_LIMIT_URL: "redis://127.0.0.1:6379/0" }, { NODE_OPTIONS: "--import ./unexpected.mjs" }, { NAT_SIMULATION_EXPECTED_SHA: "a".repeat(40) }]) {
    assert.throws(() => assertCiIsolation({ ...isolatedEnv(), ...override }));
  }
});

test("Nginx uses actual shared source IP and separate deployed admission zones", () => {
  const config = nginxConfiguration();
  assert.match(config, /listen 127\.0\.0\.1:5443 ssl/);
  assert.match(config, /sqr_api_per_ip:10m rate=100r\/s/);
  assert.match(config, /sqr_api_per_ip burst=300 nodelay/);
  assert.match(config, /sqr_api_conn 240/);
  assert.match(config, /sqr_ws_conn 200/);
  assert.match(config, /sqr_auth_conn 40/);
  assert.match(config, /location = \/api\/login/);
  assert.match(config, /location = \/api\/auth\/login/);
  assert.match(config, /location = \/api\/telemetry\/web-vitals/);
  assert.match(config, /proxy_read_timeout 360s/);
  assert.match(config, /X-Forwarded-For \$remote_addr/);
  assert.doesNotMatch(config, /\$proxy_add_x_forwarded_for|\$http_authorization|\$http_cookie|\$request_uri/);
});

test("edge report distinguishes Nginx and upstream rejection and excludes WS lifetime from p95", () => {
  const line = { source: "127.0.0.1", method: "GET", path: "/api/search", status: 200, upstreamStatus: "200", seconds: 0.02 };
  const report = summarizeEdgeLog([
    line, { ...line, status: 429, upstreamStatus: "" },
    { ...line, status: 429, upstreamStatus: "429" },
    { ...line, status: 503, upstreamStatus: "503" },
    { ...line, path: "/ws", status: 101, upstreamStatus: "101", seconds: 300 },
  ].map(JSON.stringify).join("\n"));
  assert.equal(report.sourceIpCount, 1); assert.equal(report.allSourcesLoopback, true);
  assert.equal(report.edge429, 1); assert.equal(report.upstream429, 1); assert.equal(report.serverErrors, 1);
  assert.equal(report.routes.find((row) => row.route === "GET /ws").p95Ms, null);
  assert.equal(summarizeEdgeLog("").allSourcesLoopback, false);
});

test("manual workflow pins application and never publishes private fixtures or deploys", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/nat-shared-ip-simulation.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, new RegExp(`ref: ${APPLICATION_SHA}`));
  assert.match(workflow, /artifacts\/nat-shared-ip\/public\//);
  assert.doesNotMatch(workflow, /environment: production|secrets\.|\/private\/|release:package|deploy-release/);
});

test("browser reads the application's current session storage and uses system Chromium", () => {
  const browser = readFileSync(new URL("../nat-shared-ip-browser.mjs", import.meta.url), "utf8");
  assert.match(browser, /sessionStorage\.getItem\("activityId"\)/);
  assert.doesNotMatch(browser, /localStorage\.getItem\("activityId"\)/);
  assert.match(browser, /executablePath: process\.env\.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH/);
});

test("startup diagnosis extracts only safe error fields and redacts configured secrets", () => {
  const raw = JSON.stringify({ level: "error", msg: "startup failed", headers: { cookie: "do-not-copy" }, error: { code: "ECONNREFUSED", message: "password=hidden postgres://secret@remote/db known-ephemeral-value" } });
  const result = startupDiagnosticMessages(raw, ["known-ephemeral-value"]).join(" ");
  assert.match(result, /ECONNREFUSED/);
  assert.doesNotMatch(result, /hidden|secret@|known-ephemeral|do-not-copy/);
  assert.deepEqual(startupDiagnosticMessages('{"level":"info","msg":"private information"}'), []);
});

test("build-only release override is removed before strict application runtime validation", () => {
  const ci = readFileSync(new URL("../nat-shared-ip-ci.mjs", import.meta.url), "utf8");
  assert.match(ci, /SQR_RELEASE_SHA: APPLICATION_SHA/);
  const removal = ci.indexOf("delete env.SQR_RELEASE_SHA;");
  assert.ok(removal > ci.indexOf("summary.applicationManifest = manifest"));
  assert.ok(removal < ci.indexOf("applicationProcess = launch("));
});
