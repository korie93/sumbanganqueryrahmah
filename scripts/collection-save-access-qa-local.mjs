import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import bcrypt from "bcrypt";
import { buildPostgresPoolConfig } from "./lib/postgres-preflight.mjs";
import { resolveManagedLoopbackBaseUrl } from "./lib/local-loopback-server.mjs";
import { waitForServer } from "./lib/server-readiness.mjs";
import { startManagedServerProcess, stopManagedServerProcess } from "./lib/managed-server-process.mjs";

// End-to-end QA always creates its own database. No credentials are written to
// disk. Requires an existing local build and permission to create local DBs.
// --ui-smoke runs the complete CI browser suite in the same isolated environment.
// --osp-multi-source runs only the real Create Target multi-source regression.
// --visual-contract / --a11y-contract run the actual CI layout/accessibility gates.
assert(process.argv.slice(2).length <= 1 && process.argv.slice(2).every((arg) => ["--ui-smoke", "--osp-v3", "--osp-multi-source", "--visual-contract", "--a11y-contract"].includes(arg)), "Unknown Collection QA option.");
const multiSourceQa = process.argv.includes("--osp-multi-source");
const ospQa = process.argv.includes("--osp-v3") || multiSourceQa;
const visualQa = process.argv.includes("--visual-contract");
const a11yQa = process.argv.includes("--a11y-contract");
const smokeScript = ospQa ? "scripts/billing-osp-v3-smoke.mjs" : process.argv.includes("--ui-smoke")
  ? "scripts/ui-smoke.mjs" : visualQa ? "scripts/ui-visual-contract.mjs"
    : a11yQa ? "scripts/ui-accessibility-contract.mjs" : "scripts/collection-save-access-smoke.mjs";
const stamp = `${Date.now()}_${randomBytes(3).toString("hex")}`;
const database = `sqr_save_access_${stamp}`;
assert(/^sqr_save_access_[0-9]+_[a-f0-9]{6}$/.test(database));
const artifactsDir = path.resolve("artifacts", `collection-save-access-${stamp}`);
await mkdir(artifactsDir, { recursive: true });
// A private working directory isolates uploads as well as the QA database.
await cp(path.resolve("dist-local/public"), path.join(artifactsDir, "dist-local/public"), { recursive: true, errorOnExist: true, force: false });
const connection = buildPostgresPoolConfig(process.env);
if (connection.connectionString) {
  const url = new URL(connection.connectionString);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "QA PostgreSQL must be local.");
  url.pathname = "/postgres";
  connection.connectionString = url.toString();
} else {
  assert(["localhost", "127.0.0.1", "::1"].includes(connection.host), "QA PostgreSQL must be local.");
  connection.database = "postgres";
}
const admin = new pg.Pool(connection);
const preferredPort = ospQa ? "5127" : visualQa ? "5137" : a11yQa ? "5147" : "5117";
const serverAddress = await resolveManagedLoopbackBaseUrl({ host: "127.0.0.1", preferredPort, configuredBaseUrl: `http://127.0.0.1:${preferredPort}` });
const password = () => `Qa!${randomBytes(18).toString("hex")}`;
const env = { ...process.env,
  NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(serverAddress.port),
  PUBLIC_APP_URL: serverAddress.baseUrl, CORS_ALLOWED_ORIGINS: serverAddress.baseUrl,
  DATABASE_URL: "", PG_DATABASE: database, COLLECTION_SAVE_ACCESS_QA_DATABASE: database,
  SEED_DEFAULT_USERS: "1", LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
  SEED_SUPERUSER_USERNAME: `qa.super.${stamp}`, SEED_SUPERUSER_PASSWORD: password(),
  SEED_ADMIN_USERNAME: `qa.admin.${stamp}`, SEED_ADMIN_PASSWORD: password(),
  SEED_USER_USERNAME: `qa.user.${stamp}`, SEED_USER_PASSWORD: password(),
  COLLECTION_OSP_MANAGER_USERNAME: `qa.manager.${stamp}`, COLLECTION_OSP_MANAGER_PASSWORD: password(),
  COLLECTION_OSP_OTHER_ADMIN_USERNAME: `qa.other.admin.${stamp}`, COLLECTION_OSP_OTHER_ADMIN_PASSWORD: password(),
  SESSION_SECRET: randomBytes(48).toString("hex"),
  SQR_AUDIT_HMAC_KEY: randomBytes(48).toString("hex"),
  TWO_FACTOR_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  COLLECTION_PII_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  SQR_RATE_LIMIT_STORE: "memory", SQR_MAX_WORKERS: "1", SQR_INITIAL_WORKERS: "1",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: process.execPath,
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: JSON.stringify(["-e", "process.exit(0)", "{file}"]),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
  SMOKE_BASE_URL: serverAddress.baseUrl, SMOKE_ARTIFACTS_DIR: artifactsDir,
  COLLECTION_OSP_MULTI_SOURCE_ONLY: multiSourceQa ? "1" : "0",
  VISUAL_BASE_URL: serverAddress.baseUrl, VISUAL_ARTIFACTS_DIR: path.join(artifactsDir, "visual-layout"),
  A11Y_BASE_URL: serverAddress.baseUrl,
};
// Preserve local connection credentials even if they came from DATABASE_URL.
if (connection.connectionString) {
  const url = new URL(connection.connectionString);
  Object.assign(env, { PG_HOST: url.hostname, PG_PORT: url.port || "5432", PG_USER: decodeURIComponent(url.username), PG_PASSWORD: decodeURIComponent(url.password) });
}
Object.assign(env, {
  SMOKE_TEST_USERNAME: env.SEED_SUPERUSER_USERNAME, SMOKE_TEST_PASSWORD: env.SEED_SUPERUSER_PASSWORD,
  VISUAL_TEST_USERNAME: env.SEED_SUPERUSER_USERNAME, VISUAL_TEST_PASSWORD: env.SEED_SUPERUSER_PASSWORD,
  A11Y_TEST_USERNAME: env.SEED_SUPERUSER_USERNAME, A11Y_TEST_PASSWORD: env.SEED_SUPERUSER_PASSWORD,
  COLLECTION_SAVE_ADMIN_USERNAME: env.SEED_ADMIN_USERNAME, COLLECTION_SAVE_ADMIN_PASSWORD: env.SEED_ADMIN_PASSWORD,
  COLLECTION_SAVE_USER_USERNAME: env.SEED_USER_USERNAME, COLLECTION_SAVE_USER_PASSWORD: env.SEED_USER_PASSWORD,
});
let server;
let created = false;
const log = createWriteStream(path.join(artifactsDir, "server.log"));
try {
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  assert.equal(exists.rowCount, 0);
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  console.log(`Collection QA database: ${database}; artifacts: ${artifactsDir}`);
  const serverEnv = { ...env };
  for (const key of Object.keys(serverEnv)) {
    if (key.startsWith("COLLECTION_SAVE_") || key.startsWith("COLLECTION_OSP_")) delete serverEnv[key];
  }
  if (process.argv.includes("--ui-smoke") || ospQa || visualQa || a11yQa) {
    // Match CI schema preparation, including migrated Collection search history.
    const migrationCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/db-migrate.mjs"], { env: serverEnv, stdio: "inherit", windowsHide: true });
      child.once("error", reject);
      child.once("exit", (exitCode) => resolve(exitCode ?? 1));
    });
    assert.equal(migrationCode, 0, "Disposable QA database migrations must succeed.");
  }
  server = startManagedServerProcess(process.execPath, [path.resolve("dist-local/server/index-local.js")], { env: serverEnv, cwd: artifactsDir });
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  await waitForServer(`${serverAddress.baseUrl}/api/health`, { serverProcess: server, timeoutMs: 120_000, logPath: path.join(artifactsDir, "server.log") });
  if (ospQa) {
    const fixturePool = new pg.Pool(buildPostgresPoolConfig(env));
    try {
      assert.equal((await fixturePool.query("SELECT current_database() AS name")).rows[0].name, database);
      for (const [role, prefix] of [["manager", "COLLECTION_OSP_MANAGER"], ["admin", "COLLECTION_OSP_OTHER_ADMIN"]]) {
        await fixturePool.query(`INSERT INTO public.users
          (id, username, full_name, role, password_hash, status, is_banned, must_change_password, activated_at)
          VALUES ($1, $2, $3, $4, $5, 'active', false, false, now())`,
        [`qa-${role}-${prefix}-${stamp}`, env[`${prefix}_USERNAME`], role === "admin" ? ("QA assigned administrator " + "long full name ".repeat(8)).slice(0, 120) : `QA ${role}`, role, await bcrypt.hash(env[`${prefix}_PASSWORD`], 12)]);
      }
    } finally { await fixturePool.end(); }
  }
  const runSmoke = (overrides = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript], { env: { ...env, ...overrides }, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  let code = await runSmoke();
  if (ospQa && !multiSourceQa && code === 0) {
    await stopManagedServerProcess(server);
    server = startManagedServerProcess(process.execPath, [path.resolve("dist-local/server/index-local.js")], { env: serverEnv, cwd: artifactsDir });
    server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
    await waitForServer(`${serverAddress.baseUrl}/api/health`, { serverProcess: server, timeoutMs: 120_000, logPath: path.join(artifactsDir, "server.log") });
    code = await runSmoke({ COLLECTION_OSP_RESTART_CHECK: "1" });
  }
  process.exitCode = code;
  await writeFile(path.join(artifactsDir, "qa-result.json"), JSON.stringify({ script: smokeScript, exitCode: code, completedAt: new Date().toISOString() }, null, 2));
} catch (error) {
  console.error(`Collection QA failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) await stopManagedServerProcess(server);
  log.end();
  if (created) {
    // Exact database generated above, confirmed absent before creation; never a
    // caller-provided name or the development/production database.
    assert(/^sqr_save_access_[0-9]+_[a-f0-9]{6}$/.test(database));
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid() AND backend_type = 'client backend' AND usename = current_user", [database]);
    await admin.query(`DROP DATABASE "${database}"`);
    console.log(`Removed disposable QA database ${database}. Artifacts retained.`);
  }
  await admin.end();
}
