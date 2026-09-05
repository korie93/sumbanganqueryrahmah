import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cp, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import { buildPostgresPoolConfig } from "./lib/postgres-preflight.mjs";
import { resolveManagedLoopbackBaseUrl } from "./lib/local-loopback-server.mjs";
import { waitForServer } from "./lib/server-readiness.mjs";
import { startManagedServerProcess, stopManagedServerProcess } from "./lib/managed-server-process.mjs";

// End-to-end QA always creates its own database. No credentials are written to
// disk. Requires an existing local build and permission to create local DBs.
// --ui-smoke runs the complete CI browser suite in the same isolated environment.
assert(process.argv.slice(2).every((arg) => arg === "--ui-smoke"), "Unknown Collection QA option.");
const smokeScript = process.argv.includes("--ui-smoke")
  ? "scripts/ui-smoke.mjs" : "scripts/collection-save-access-smoke.mjs";
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
const serverAddress = await resolveManagedLoopbackBaseUrl({ host: "127.0.0.1", preferredPort: "5117", configuredBaseUrl: "http://127.0.0.1:5117" });
const password = () => `Qa!${randomBytes(18).toString("hex")}`;
const env = { ...process.env,
  NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(serverAddress.port),
  PUBLIC_APP_URL: serverAddress.baseUrl, CORS_ALLOWED_ORIGINS: serverAddress.baseUrl,
  DATABASE_URL: "", PG_DATABASE: database, COLLECTION_SAVE_ACCESS_QA_DATABASE: database,
  SEED_DEFAULT_USERS: "1", LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
  SEED_SUPERUSER_USERNAME: `qa.super.${stamp}`, SEED_SUPERUSER_PASSWORD: password(),
  SEED_ADMIN_USERNAME: `qa.admin.${stamp}`, SEED_ADMIN_PASSWORD: password(),
  SEED_USER_USERNAME: `qa.user.${stamp}`, SEED_USER_PASSWORD: password(),
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
};
// Preserve local connection credentials even if they came from DATABASE_URL.
if (connection.connectionString) {
  const url = new URL(connection.connectionString);
  Object.assign(env, { PG_HOST: url.hostname, PG_PORT: url.port || "5432", PG_USER: decodeURIComponent(url.username), PG_PASSWORD: decodeURIComponent(url.password) });
}
Object.assign(env, {
  SMOKE_TEST_USERNAME: env.SEED_SUPERUSER_USERNAME, SMOKE_TEST_PASSWORD: env.SEED_SUPERUSER_PASSWORD,
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
    if (key.startsWith("COLLECTION_SAVE_")) delete serverEnv[key];
  }
  if (process.argv.includes("--ui-smoke")) {
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
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript], { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  process.exitCode = code;
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
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [database]);
    await admin.query(`DROP DATABASE "${database}"`);
    console.log(`Removed disposable QA database ${database}. Artifacts retained.`);
  }
  await admin.end();
}
