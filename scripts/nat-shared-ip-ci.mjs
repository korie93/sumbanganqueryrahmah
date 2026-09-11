import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { APPLICATION_SHA, BASE_URL, assertCiIsolation, nginxConfiguration, summarizeEdgeLog } from "./lib/nat-simulation-contract.mjs";

// Deliberately no dotenv. This runner is not a configurable production load tool.
assertCiIsolation(process.env);
assert.equal(process.platform, "linux");
assert.equal(process.versions.node.split(".")[0], "24");
const workspace = await realpath(process.env.GITHUB_WORKSPACE);
assert.equal(await realpath(process.cwd()), workspace);
const application = path.join(workspace, "app-under-test");
assert.equal(await realpath(application), application, "Application checkout must not be a symlink");
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: application, encoding: "utf8" }).trim(), APPLICATION_SHA);
assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: application, encoding: "utf8" }).trim(), "", "Pinned checkout must be clean");
for (const name of await readdir(application)) {
  assert.ok(!(name === ".env" || (name.startsWith(".env.") && name !== ".env.example")), "No inherited application dotenv files permitted");
}
for (const name of ["uploads", "var", ".runtime"]) {
  const location = path.join(application, name);
  if (existsSync(location)) assert.ok(!(await lstat(location)).isSymbolicLink(), "Runtime storage cannot point outside isolated checkout");
}
const output = path.join(workspace, "artifacts", "nat-shared-ip");
assert.ok(!existsSync(output), "Refusing to mix evidence from an earlier simulation");
await mkdir(path.join(output, "public"), { recursive: true, mode: 0o700 });
await mkdir(path.join(output, "private"), { mode: 0o700 });
const runtime = await mkdtemp(path.join(await realpath(process.env.RUNNER_TEMP), "sqr-nat-"));
const env = {};
// Never forward GitHub credentials, cloud credentials, local .env or database overrides.
for (const name of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "CI", "GITHUB_ACTIONS", "GITHUB_WORKSPACE", "RUNNER_ENVIRONMENT", "RUNNER_TEMP"]) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  NODE_ENV: "development", HOST: "127.0.0.1", PORT: "5000", PUBLIC_APP_URL: BASE_URL,
  CORS_ALLOWED_ORIGINS: BASE_URL, TRUSTED_PROXIES: "127.0.0.1/32",
  PG_HOST: "127.0.0.1", PG_PORT: "5432", PG_USER: "postgres",
  PG_PASSWORD: process.env.PG_PASSWORD, PG_DATABASE: "sqr_nat_simulation", PG_MAX_CONNECTIONS: "10",
  SQR_MAX_WORKERS: "1", SQR_RATE_LIMIT_STORE: "redis", SQR_REDIS_RATE_LIMIT_URL: "redis://127.0.0.1:6379/0",
  SQR_RELEASE_SHA: APPLICATION_SHA,
  SEED_DEFAULT_USERS: "1", SEED_SUPERUSER_USERNAME: "natsimulationbootstrap",
  SEED_SUPERUSER_FULL_NAME: "Synthetic NAT Bootstrap",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1", COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: "node",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: '["-e","process.exit(0)","{file}"]',
  COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1", COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS: "5000",
  NAT_SIMULATION_ISOLATED: "1", NAT_SIMULATION_EXPECTED_SHA: APPLICATION_SHA,
  NAT_SIMULATION_USERS: "30", NAT_SIMULATION_BASE_URL: BASE_URL, NAT_SIMULATION_APP_DIR: application,
  NAT_SIMULATION_FIXTURE_FILE: path.join(output, "private", "fixture.json"),
  NAT_SIMULATION_ARTIFACTS_DIR: path.join(output, "public"),
});
for (const key of ["SESSION_SECRET", "SQR_AUDIT_HMAC_KEY", "COLLECTION_PII_ENCRYPTION_KEY", "SEED_SUPERUSER_PASSWORD", "NAT_SIMULATION_PASSWORD"]) {
  env[key] = `Nat-CI!9-${randomBytes(24).toString("hex")}`;
  console.log(`::add-mask::${env[key]}`);
}
env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
assert.ok(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "System Chromium is required");

const children = new Set();
function launch(command, args, { cwd = workspace, name, timeoutMs = 0, privateLog = false } = {}) {
  const log = privateLog ? createWriteStream(path.join(output, "private", `${name}.log`), { flags: "wx", mode: 0o600 }) : null;
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", log ? "pipe" : "inherit", log ? "pipe" : "inherit"] });
  if (log) { child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false }); }
  children.add(child);
  const completed = new Promise((resolve, reject) => {
    const timer = timeoutMs ? setTimeout(() => { try { process.kill(-child.pid, "SIGTERM"); } catch {} }, timeoutMs) : null;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimeout(timer); children.delete(child); log?.end();
      resolve({ code, signal });
    });
  });
  // Background processes are observed through exitCode/readiness and stopped in finally.
  return { child, completed };
}
async function command(commandName, args, options = {}) {
  const result = await launch(commandName, args, { timeoutMs: 600_000, ...options }).completed;
  assert.equal(result.code, 0, `${options.name || commandName} failed (${result.code ?? result.signal})`);
}
async function stop(child) {
  if (!children.has(child)) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  for (let n = 0; n < 30 && children.has(child); n++) await delay(100);
  if (children.has(child)) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
}
async function waitReady(url, processHandle) {
  for (let n = 0; n < 90; n++) {
    assert.ok(children.has(processHandle.child), "Service exited before readiness; private diagnostic log retained in runner");
    try {
      const body = execFileSync("curl", ["--silent", "--fail", "--max-time", "3", "--cacert", path.join(runtime, "server.crt"), url], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const health = JSON.parse(body);
      if (health.ready === true || health.status === "ok") return;
    } catch {}
    await delay(1000);
  }
  throw new Error("Isolated service readiness timed out");
}

const summary = {
  schemaVersion: 1, isolationMarker: "sqr-nat-simulation", expectedSha: APPLICATION_SHA,
  harnessSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(), success: false,
  topology: { accounts: 30, roles: { user: 10, admin: 10, manager: 10 }, nginx: "HTTPS loopback / one actual source IP", applicationWorkers: 1, databasePoolMax: 10, rateStore: "dedicated Redis 7", database: "dedicated PostgreSQL 17", uploads: "disposable pinned checkout" },
  limitations: ["Synthetic shared-IP acceptance, not a claim about 30 physical office staff or production hardware capacity.", "Fresh small synthetic database, not the production data volume/query distribution.", "Built deployed source SHA, not the identical promoted production binary artifact.", "Development loopback runtime with secure HTTPS cookies; CI PostgreSQL/Redis loopback transports are not production TLS.", "Deterministic clean receipt scanner shim tests integration, not malware detection.", "Login starts are paced; mixed work has bounded concurrency, with all 30 sessions/WebSockets retained."],
  resourceSamples: [],
};
let sampler;
let sampling = false;
let samplingPromise = Promise.resolve();
let observer;
let applicationProcess;
let nginxProcess;
try {
  console.log("[nat-ci] Building the exact deployed source in the isolated checkout");
  await command("npm", ["run", "build"], { cwd: application, name: "build" });
  const manifest = JSON.parse(await readFile(path.join(application, "dist-local", "release-manifest.json"), "utf8"));
  assert.equal(manifest.commitSha, APPLICATION_SHA); assert.equal(manifest.sourceDirty, false);
  summary.applicationManifest = manifest;
  await command("npm", ["run", "db:migrate"], { cwd: application, name: "migrations", privateLog: true });
  await command("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", path.join(runtime, "server.key"), "-out", path.join(runtime, "server.crt")], { name: "certificate", privateLog: true });
  const configuration = nginxConfiguration();
  await writeFile(path.join(runtime, "nginx.conf"), configuration, { flag: "wx", mode: 0o600 });
  await writeFile(path.join(output, "public", "nginx.conf"), configuration, { flag: "wx", mode: 0o600 });
  await command("nginx", ["-t", "-p", `${runtime}/`, "-c", "nginx.conf"], { name: "nginx-config", privateLog: true });
  applicationProcess = launch(process.execPath, ["dist-local/server/cluster-local.js"], { cwd: application, name: "application", privateLog: true });
  await waitReady("http://127.0.0.1:5000/api/health/ready", applicationProcess);
  nginxProcess = launch("nginx", ["-p", `${runtime}/`, "-c", "nginx.conf"], { name: "nginx", privateLog: true });
  await waitReady(`${BASE_URL}/api/health/ready`, nginxProcess);
  console.log("[nat-ci] Seeding isolated synthetic accounts/source/Billing targets");
  await command(process.execPath, ["scripts/nat-shared-ip-fixture.mjs"], { name: "fixture" });
  observer = new pg.Pool({ host: "127.0.0.1", port: 5432, user: "postgres", password: env.PG_PASSWORD, database: "sqr_nat_simulation", max: 1, statement_timeout: 2000, connectionTimeoutMillis: 3000, application_name: "sqr-nat-observer" });
  async function sample() {
    if (sampling) return;
    sampling = true;
    try {
      const db = await observer.query("SELECT count(*)::int AS connections, count(*) FILTER (WHERE state = 'active' AND pid <> pg_backend_pid())::int AS active, count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waits FROM pg_stat_activity WHERE datname = current_database()");
      const processes = execFileSync("ps", ["-eo", "pid=,ppid=,pcpu=,rss=,comm="], { encoding: "utf8" }).trim().split("\n").map((line) => line.trim().split(/\s+/));
      const parents = new Set([applicationProcess.child.pid]);
      for (let depth = 0; depth < 5; depth++) for (const row of processes) if (parents.has(Number(row[1]))) parents.add(Number(row[0]));
      const app = processes.filter((row) => parents.has(Number(row[0])));
      summary.resourceSamples.push({ at: new Date().toISOString(), db: db.rows[0], appRssKiB: app.reduce((sum, row) => sum + Number(row[3]), 0), appCpuLifetimePercent: app.reduce((sum, row) => sum + Number(row[2]), 0), appProcesses: app.length });
    } catch { summary.resourceSampleErrors = (summary.resourceSampleErrors || 0) + 1; }
    finally { sampling = false; }
  }
  await sample();
  sampler = setInterval(() => { samplingPromise = sample(); }, 5000);
  console.log("[nat-ci] Running 30 normal browser sessions through Nginx");
  await command(process.execPath, [path.join(workspace, "scripts/nat-shared-ip-browser.mjs")], { cwd: application, name: "browser", timeoutMs: 930_000 });
  await sample();
  assert.ok(children.has(applicationProcess.child) && children.has(nginxProcess.child), "Application/Nginx exited during simulation");
  await waitReady(`${BASE_URL}/api/health/ready`, nginxProcess);
  summary.functionalRunPassed = true;
} catch (error) {
  // Do not publish raw app logs, response bodies or exception objects containing credentials.
  summary.failure = String(error.message).replaceAll(env.PG_PASSWORD, "[redacted]");
  console.error(`[nat-ci] ${summary.failure}`);
  process.exitCode = 1;
} finally {
  clearInterval(sampler);
  await samplingPromise;
  if (observer) await observer.end();
  for (const child of [...children]) await stop(child);
  await delay(300); // Flush final WebSocket access-log entries after browser shutdown.
  if (existsSync(path.join(runtime, "nginx-access.jsonl"))) {
    summary.edge = summarizeEdgeLog(await readFile(path.join(runtime, "nginx-access.jsonl"), "utf8"));
  }
  summary.success = summary.functionalRunPassed === true && summary.edge?.allSourcesLoopback === true
    && summary.edge.edge429 === 0 && summary.edge.upstream429 === 0 && summary.edge.serverErrors === 0
    && summary.resourceSamples.length > 0 && !summary.resourceSampleErrors;
  if (!summary.success) process.exitCode = 1;
  summary.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "public", "fullstack-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(`[nat-ci] success=${summary.success}; requests=${summary.edge?.requests || 0}; edge429=${summary.edge?.edge429 ?? "unavailable"}; upstream429=${summary.edge?.upstream429 ?? "unavailable"}`);
  // No recursive deletion: GitHub destroys this isolated VM and its service containers.
}
