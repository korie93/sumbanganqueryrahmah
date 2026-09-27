import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, cp, lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { resolveRedesignBillingFixtureEnabled, resolveRedesignCaptureOptions, runFrontendRedesignBrowser } from "./frontend-redesign-browser.mjs";
import { prepareRedesignBillingFixture } from "./lib/frontend-redesign-billing-fixture.mjs";
import { resolveRedesignImportChecksEnabled, runRedesignImportBrowser } from "./frontend-redesign-import-browser.mjs";
import { resolveRedesignRoleChecksEnabled, runFrontendRedesignRoleBrowser } from "./frontend-redesign-role-browser.mjs";
import { resolveRedesignRealtimeChecksEnabled, runRedesignRealtimeBrowser } from "./frontend-redesign-realtime-browser.mjs";

// Only OS process support is inherited. Application credentials, dotenv files,
// uploads, receipts, and existing databases never enter this disposable fixture.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inheritedKeys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "HOME"];
const cleanEnv = Object.fromEntries(inheritedKeys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const pgBin = process.env.SQR_COLLECTION_CARD_TEST_PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin" : "");
const executable = (name) => pgBin ? path.join(pgBin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args, cwd, env = cleanEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", shell: false, windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Fixture command failed: ${path.basename(command)}`)));
  });
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const selected = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}

async function waitUntilReady(baseUrl, child, failedToStart) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    assert.ok(!failedToStart(), "Disposable app process or log could not initialize");
    assert.ok(child.exitCode === null && child.signalCode === null, "Disposable app exited before health readiness");
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3_000) });
      if (response.status === 200 && await response.json()) return;
    } catch { /* Only this freshly created loopback application is polled. */ }
    await pause(500);
  }
  throw new Error("Disposable app readiness timeout");
}

const exited = (child) => !child || child.exitCode !== null || child.signalCode !== null;
async function stopApp(child) {
  if (exited(child)) return true;
  try { if (child.connected) child.send("shutdown", () => {}); else child.kill("SIGTERM"); } catch { /* Exit can race. */ }
  const deadline = Date.now() + 35_000;
  while (!exited(child) && Date.now() < deadline) await pause(100);
  if (!exited(child)) {
    child.kill("SIGKILL");
    const forceDeadline = Date.now() + 5_000;
    while (!exited(child) && Date.now() < forceDeadline) await pause(100);
  }
  return exited(child);
}

async function main() {
  assert.ok(process.argv.slice(2).every((arg) => arg === "--final"), "Unknown fixture argument");
  const captureOptions = resolveRedesignCaptureOptions(process.env, process.argv.includes("--final"));
  const billingFixtureEnabled = resolveRedesignBillingFixtureEnabled(process.env);
  const roleChecksEnabled = resolveRedesignRoleChecksEnabled(process.env);
  const importChecksEnabled = resolveRedesignImportChecksEnabled(process.env);
  const realtimeChecksEnabled = resolveRedesignRealtimeChecksEnabled(process.env);
  const smokeFlag = process.env.SQR_REDESIGN_SMOKE_ONLY;
  assert.ok(smokeFlag === undefined || smokeFlag === "" || smokeFlag === "0" || smokeFlag === "1", "SQR_REDESIGN_SMOKE_ONLY accepts only 0 or 1");
  const smokeOnly = smokeFlag === "1";
  const visualFlag = process.env.SQR_REDESIGN_VISUAL_ONLY;
  assert.ok(visualFlag === undefined || visualFlag === "" || visualFlag === "0" || visualFlag === "1", "SQR_REDESIGN_VISUAL_ONLY accepts only 0 or 1");
  const visualOnly = visualFlag === "1";
  assert.ok(!visualOnly || (!smokeOnly && !importChecksEnabled && !roleChecksEnabled && !realtimeChecksEnabled && !billingFixtureEnabled), "Visual contracts run in their own fresh fixture");
  assert.ok(!smokeOnly || (!importChecksEnabled && !roleChecksEnabled && !billingFixtureEnabled), "Smoke runs in its own fresh fixture");
  assert.ok(!importChecksEnabled || (!roleChecksEnabled && !billingFixtureEnabled), "Import checks run separately from role and Billing fixtures");
  assert.ok(!roleChecksEnabled || billingFixtureEnabled, "Role checks require SQR_REDESIGN_BILLING_FIXTURE=1 for guarded synthetic provenance");
  assert.ok(!realtimeChecksEnabled || (!smokeOnly && !importChecksEnabled && !roleChecksEnabled && !billingFixtureEnabled), "Realtime checks run in their own fresh fixture");
  const builtServer = path.join(repoRoot, "dist-local/server/index-local.js");
  const builtPublic = path.join(repoRoot, "dist-local/public");
  await access(builtServer);
  await access(path.join(builtPublic, "index.html"));
  const tempParent = await realpath(os.tmpdir());
  // Reuse the reviewed Collection seed, which checks this exact disposable identity.
  const fixtureRoot = await mkdtemp(path.join(tempParent, "sqr-collection-card-no-"));
  const dataDir = path.join(fixtureRoot, "postgres");
  const appDir = path.join(fixtureRoot, "app");
  const artifactParent = path.join(repoRoot, "artifacts/frontend-redesign");
  await mkdir(artifactParent, { recursive: true });
  const artifactsDir = await mkdtemp(path.join(artifactParent, process.argv.includes("--final") ? "final-" : "baseline-"));
  console.log(`Frontend redesign artifacts: ${artifactsDir}`);
  let postgresStarted = false;
  let postgresStartAttempted = false;
  let child;
  let serverLog;
  let failed = false;
  try {
    await mkdir(appDir);
    await cp(builtPublic, path.join(appDir, "dist-local/public"), { recursive: true, errorOnExist: true, force: false });
    await cp(path.join(repoRoot, "drizzle"), path.join(appDir, "drizzle"), { recursive: true, errorOnExist: true, force: false });
    const databasePort = await freeLoopbackPort();
    const appPort = await freeLoopbackPort();
    assert.notEqual(databasePort, appPort);
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const username = `collectioncardfixture${randomBytes(6).toString("hex")}`;
    const password = `Fixture9!${randomBytes(24).toString("base64url")}`;
    const databasePassword = randomBytes(24).toString("base64url");
    await run(executable("initdb"), ["-D", dataDir, "-U", "sqr_fixture", "-A", "trust", "--encoding=UTF8", "--no-locale"], fixtureRoot);
    const socketOption = process.platform === "win32" ? "" : ` -k '${fixtureRoot.replaceAll("'", "'\\''")}'`;
    postgresStartAttempted = true;
    await run(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(fixtureRoot, "postgres.log"), "-o", `-h 127.0.0.1 -p ${databasePort} -c max_connections=64${socketOption}`, "-w", "start"], fixtureRoot);
    postgresStarted = true;
    const admin = new pg.Client({ host: "127.0.0.1", port: databasePort, user: "sqr_fixture", password: databasePassword, database: "postgres", ssl: false, connectionTimeoutMillis: 3_000 });
    try {
      await admin.connect();
      const state = await admin.query("SHOW data_directory");
      assert.equal(await realpath(state.rows[0].data_directory), await realpath(dataDir));
      await admin.query("CREATE DATABASE sqr_collection_card_test");
    } finally { await admin.end(); }
    const env = {
      ...cleanEnv,
      NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(appPort), PUBLIC_APP_URL: baseUrl, CORS_ALLOWED_ORIGINS: baseUrl,
      PG_HOST: "127.0.0.1", PG_PORT: String(databasePort), PG_USER: "sqr_fixture", PG_PASSWORD: databasePassword, PG_DATABASE: "sqr_collection_card_test", DATABASE_SSL: "0",
      SQR_AUDIT_HMAC_KEY: randomBytes(48).toString("base64url"), SESSION_SECRET: randomBytes(48).toString("base64url"), TWO_FACTOR_ENCRYPTION_KEY: randomBytes(48).toString("base64url"), COLLECTION_PII_ENCRYPTION_KEY: randomBytes(48).toString("base64url"),
      SEED_DEFAULT_USERS: "1", SEED_SUPERUSER_USERNAME: username, SEED_SUPERUSER_PASSWORD: password, SEED_SUPERUSER_FULL_NAME: "Synthetic Design Reviewer",
      SEED_ADMIN_USERNAME: `designadmin${randomBytes(6).toString("hex")}`, SEED_ADMIN_PASSWORD: `Fixture9!${randomBytes(24).toString("base64url")}`,
      SEED_USER_USERNAME: `designuser${randomBytes(6).toString("hex")}`, SEED_USER_PASSWORD: `Fixture9!${randomBytes(24).toString("base64url")}`,
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0", SQR_DB_BOOTSTRAP_MODE: "runtime", SQR_MAX_WORKERS: "1", SQR_INITIAL_WORKERS: "1", SQR_PREALLOCATE_MB: "0", AI_PRECOMPUTE_ON_START: "0", AUTH_COOKIE_SECURE: "0",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1", COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: process.execPath,
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: JSON.stringify(["-e", "process.exit(0)", "{file}"]), COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
    };
    await run(process.execPath, [path.join(repoRoot, "scripts/db-migrate.mjs")], appDir, env);
    let spawnFailure;
    serverLog = createWriteStream(path.join(artifactsDir, "server.log"), { flags: "wx" });
    serverLog.once("error", (error) => { spawnFailure = error; });
    child = spawn(process.execPath, [builtServer], { cwd: appDir, env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.once("error", (error) => { spawnFailure = error; });
    child.stdout.pipe(serverLog, { end: false });
    child.stderr.pipe(serverLog, { end: false });
    await waitUntilReady(baseUrl, child, () => Boolean(spawnFailure));
    await run(process.execPath, ["--import", pathToFileURL(path.join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href,
      path.join(repoRoot, "scripts/fixtures/collection-card-no-seed.ts")], appDir,
    { ...env, SQR_COLLECTION_CARD_ISOLATED_CLUSTER: "1", SQR_COLLECTION_CARD_DATA_DIR: dataDir, COLLECTION_CARD_EXPECT_MISSING: "1" });
    await run(process.execPath, [path.join(repoRoot, "scripts/fixtures/frontend-redesign-seed.mjs")], appDir,
      { ...env, SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: dataDir });
    console.log("Fresh PostgreSQL, real built app, and 59 synthetic Collection records ready.");
    // The optional supplement receives only this fresh cluster's narrow identity.
    // Its private environment never enters browser options, logs or the manifest.
    const prepareBillingFixture = billingFixtureEnabled ? (page) => prepareRedesignBillingFixture({ page, baseUrl, env: {
      SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: dataDir,
      PG_HOST: env.PG_HOST, PG_PORT: env.PG_PORT, PG_USER: env.PG_USER, PG_PASSWORD: env.PG_PASSWORD, PG_DATABASE: env.PG_DATABASE,
      SEED_SUPERUSER_USERNAME: username, SEED_ADMIN_USERNAME: env.SEED_ADMIN_USERNAME,
      PUBLIC_APP_URL: baseUrl, HOST: env.HOST, PORT: env.PORT,
    } }) : undefined;
    if (roleChecksEnabled) {
      // Role mode owns a fresh fixture and does not run the ordinary capture
      // suite first: the provenance check requires an empty target table.
      await runFrontendRedesignRoleBrowser({ baseUrl, artifactsDir, prepareBillingFixture,
        widths: captureOptions.widths, themes: captureOptions.themes,
        accounts: {
          superuser: { username, password },
          admin: { username: env.SEED_ADMIN_USERNAME, password: env.SEED_ADMIN_PASSWORD },
          user: { username: env.SEED_USER_USERNAME, password: env.SEED_USER_PASSWORD },
        },
      });
    } else if (importChecksEnabled) {
      await runRedesignImportBrowser({ baseUrl, username, password, artifactsDir, env: {
        SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: dataDir,
        PG_HOST: env.PG_HOST, PG_PORT: env.PG_PORT, PG_USER: env.PG_USER, PG_PASSWORD: env.PG_PASSWORD, PG_DATABASE: env.PG_DATABASE,
        SEED_SUPERUSER_USERNAME: username, PUBLIC_APP_URL: baseUrl, HOST: env.HOST, PORT: env.PORT,
      } });
    } else if (realtimeChecksEnabled) {
      await runRedesignRealtimeBrowser({ baseUrl, artifactsDir,
        accounts: {
          superuser: { username, password },
          user: { username: env.SEED_USER_USERNAME, password: env.SEED_USER_PASSWORD },
        },
        env: {
          SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: dataDir,
          PG_HOST: env.PG_HOST, PG_PORT: env.PG_PORT, PG_USER: env.PG_USER, PG_PASSWORD: env.PG_PASSWORD, PG_DATABASE: env.PG_DATABASE,
          SEED_SUPERUSER_USERNAME: username, SEED_USER_USERNAME: env.SEED_USER_USERNAME,
          PUBLIC_APP_URL: baseUrl, HOST: env.HOST, PORT: env.PORT,
        },
      });
    } else if (smokeOnly) {
      // Use the existing regression suite unchanged against this owned app.
      // No persisted trace/HTML may retain session material; receipt fixtures
      // stay inside appDir and are removed only after the owned server stops.
      await run(process.execPath, [path.join(repoRoot, "scripts/ui-smoke.mjs")], appDir, {
        ...cleanEnv, SMOKE_BASE_URL: baseUrl, SMOKE_TEST_USERNAME: username,
        SMOKE_TEST_PASSWORD: password, SMOKE_TOTAL_TIMEOUT_MS: "480000", SMOKE_CLEANUP_TIMEOUT_MS: "15000",
      });
    } else if (visualOnly) {
      // Execute the exact test:e2e:visual entrypoint, with all CI assertions.
      // Its shared auth helper imports dotenv/config; an absent fixture-local
      // path plus a fail-closed database endpoint prevents reading repo secrets
      // or falling back to an existing local database if 2FA is unexpected.
      const disabledDotenvPath = path.join(appDir, "no-visual-dotenv.env");
      await assert.rejects(access(disabledDotenvPath), { code: "ENOENT" });
      await run(process.execPath, [path.join(repoRoot, "scripts/ui-visual-contract.mjs")], appDir, {
        ...cleanEnv, NODE_ENV: "test", DOTENV_CONFIG_PATH: disabledDotenvPath,
        VISUAL_BASE_URL: baseUrl, VISUAL_TEST_USERNAME: username, VISUAL_TEST_PASSWORD: password,
        VISUAL_ARTIFACTS_DIR: path.join(artifactsDir, "ci-visual"),
        PG_HOST: "127.0.0.1", PG_PORT: "1", PG_USER: "sqr_visual_no_database_access", PG_DATABASE: "sqr_visual_no_database_access",
      });
      console.log("Existing test:e2e:visual entrypoint passed every public, authenticated, Dashboard and operational stress contract.");
    } else {
      await runFrontendRedesignBrowser({ baseUrl, username, password, artifactsDir, final: process.argv.includes("--final"), options: captureOptions, prepareBillingFixture });
    }
    console.log(`Frontend redesign real-app capture complete: ${artifactsDir}`);
  } catch (error) {
    failed = true;
    console.error(error?.code === "ERR_ASSERTION" ? error.message : "Frontend redesign fixture failed. Inspect sanitized phase markers and artifacts; raw errors are suppressed.");
  } finally {
    const appStopped = await stopApp(child);
    if (!appStopped) failed = true;
    if (serverLog && !serverLog.destroyed) await new Promise((resolve) => serverLog.end(resolve));
    let databaseStopped = !postgresStartAttempted;
    if (postgresStarted && appStopped) {
      try { await run(executable("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], fixtureRoot); databaseStopped = true; } catch { failed = true; }
    }
    if (appStopped && databaseStopped) {
      try {
        const info = await lstat(fixtureRoot);
        assert.equal(info.isSymbolicLink(), false);
        assert.equal(info.isDirectory(), true);
        const resolved = await realpath(fixtureRoot);
        assert.equal(resolved, path.resolve(fixtureRoot));
        assert.equal(path.dirname(resolved), tempParent);
        assert.match(path.basename(resolved), /^sqr-collection-card-no-[a-zA-Z0-9]+$/);
        await rm(resolved, { recursive: true, maxRetries: 5, retryDelay: 200 });
        console.log("Stopped fixture processes and removed their temporary app/database.");
      } catch { failed = true; console.error(`Stopped fixture retained for cleanup: ${fixtureRoot}`); }
    } else { failed = true; console.error(`Fixture shutdown unconfirmed; retained: ${fixtureRoot}`); }
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch(() => { console.error("Frontend redesign fixture initialization failed."); process.exitCode = 1; });
