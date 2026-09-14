import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, cp, lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// No dotenv import, inherited application credentials, existing database, or
// existing upload directory. The built app runs in a disposable working tree.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inheritedKeys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "HOME"];
const cleanEnv = Object.fromEntries(inheritedKeys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const pgBin = process.env.SQR_AUTH_TEST_PG_BIN
  || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin" : "");
const executable = (name) => pgBin
  ? path.join(pgBin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: cleanEnv, stdio: "inherit", shell: false, windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Fixture command failed: ${path.basename(command)} (${code ?? signal})`)));
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
    if (failedToStart()) throw new Error("Disposable 2FA server process or its log could not initialize.");
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Disposable 2FA app exited before health readiness. Inspect its sanitized server log.");
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3_000) });
      const payload = await response.json();
      if (response.status === 200 && payload) return;
    } catch { /* Bound startup polling to this freshly created loopback app. */ }
    await pause(500);
  }
  throw new Error("Disposable 2FA app did not become healthy within 120 seconds.");
}

function exited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

async function stopApp(child) {
  if (exited(child)) return true;
  // The real application has an IPC shutdown handler on Windows and Unix.
  // Target only this spawned child; never kill by a process-name wildcard.
  try { if (child.connected) child.send("shutdown", () => {}); else child.kill("SIGTERM"); } catch { /* Exit may race shutdown. */ }
  const deadline = Date.now() + 35_000;
  while (!exited(child) && Date.now() < deadline) await pause(100);
  if (!exited(child)) {
    child.kill("SIGKILL");
    const forceDeadline = Date.now() + 5_000;
    while (!exited(child) && Date.now() < forceDeadline) await pause(100);
  }
  return exited(child);
}

async function removeDisposableFixture(fixtureRoot, tempParent) {
  const info = await lstat(fixtureRoot);
  assert.equal(info.isSymbolicLink(), false);
  assert.equal(info.isDirectory(), true);
  const resolved = await realpath(fixtureRoot);
  assert.equal(resolved, path.resolve(fixtureRoot));
  assert.equal(path.dirname(resolved), tempParent);
  assert.match(path.basename(resolved), /^sqr-two-factor-[a-zA-Z0-9]+$/);
  await rm(resolved, { recursive: true, maxRetries: 5, retryDelay: 200 });
}

async function main() {
  const builtServer = path.join(repoRoot, "dist-local", "server", "index-local.js");
  const builtPublic = path.join(repoRoot, "dist-local", "public");
  await access(builtServer);
  await access(path.join(builtPublic, "index.html"));
  // Import the browser module only after validating the build, before creating
  // processes. Its browser entry receives synthetic credentials only in memory.
  const { runTwoFactorBrowser } = await import("./two-factor-browser.mjs");
  const tempParent = await realpath(os.tmpdir());
  const fixtureRoot = await mkdtemp(path.join(tempParent, "sqr-two-factor-"));
  const dataDir = path.join(fixtureRoot, "postgres");
  const appDir = path.join(fixtureRoot, "app");
  const artifactParent = path.join(repoRoot, "artifacts", "two-factor");
  await mkdir(artifactParent, { recursive: true });
  const artifactsDir = await mkdtemp(path.join(artifactParent, "run-"));
  let postgresStarted = false;
  let postgresStartAttempted = false;
  let child;
  let serverLog;
  let failed = false;
  try {
    await mkdir(appDir);
    await cp(builtPublic, path.join(appDir, "dist-local", "public"), { recursive: true, errorOnExist: true, force: false });
    // Runtime bootstrap uses bundled schema code; migration files remain local
    // to the disposable app for any migration verification performed at startup.
    await cp(path.join(repoRoot, "drizzle"), path.join(appDir, "drizzle"), { recursive: true, errorOnExist: true, force: false });
    const databasePort = await freeLoopbackPort();
    const appPort = await freeLoopbackPort();
    assert.notEqual(databasePort, appPort);
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const username = `twofactorfixture${randomBytes(6).toString("hex")}`;
    const password = `Fixture9!${randomBytes(24).toString("base64url")}`;
    const fixtureDatabasePassword = randomBytes(24).toString("base64url");
    await run(executable("initdb"), ["-D", dataDir, "-U", "sqr_fixture", "-A", "trust", "--encoding=UTF8", "--no-locale"], fixtureRoot);
    const unixSocketOption = process.platform === "win32" ? "" : ` -k '${fixtureRoot.replaceAll("'", "'\\''")}'`;
    postgresStartAttempted = true;
    await run(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(fixtureRoot, "postgres.log"), "-o", `-h 127.0.0.1 -p ${databasePort} -c max_connections=64${unixSocketOption}`, "-w", "start"], fixtureRoot);
    postgresStarted = true;
    const admin = new pg.Client({ host: "127.0.0.1", port: databasePort, user: "sqr_fixture", password: fixtureDatabasePassword, database: "postgres", ssl: false, application_name: "sqr-two-factor-disposable", connectionTimeoutMillis: 3_000 });
    try {
      await admin.connect();
      const state = await admin.query("SHOW data_directory");
      assert.equal(await realpath(state.rows[0].data_directory), await realpath(dataDir));
      await admin.query("CREATE DATABASE sqr_two_factor_test");
    } finally { await admin.end(); }
    const env = {
      ...cleanEnv,
      NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(appPort), PUBLIC_APP_URL: baseUrl, CORS_ALLOWED_ORIGINS: baseUrl,
      PG_HOST: "127.0.0.1", PG_PORT: String(databasePort), PG_USER: "sqr_fixture", PG_PASSWORD: fixtureDatabasePassword, PG_DATABASE: "sqr_two_factor_test", DATABASE_SSL: "0",
      SESSION_SECRET: randomBytes(48).toString("base64url"), TWO_FACTOR_ENCRYPTION_KEY: randomBytes(48).toString("base64url"), COLLECTION_PII_ENCRYPTION_KEY: randomBytes(48).toString("base64url"),
      SEED_DEFAULT_USERS: "1", SEED_SUPERUSER_USERNAME: username, SEED_SUPERUSER_PASSWORD: password, SEED_SUPERUSER_FULL_NAME: "Disposable 2FA Test",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0", SQR_DB_BOOTSTRAP_MODE: "runtime", SQR_MAX_WORKERS: "1", SQR_INITIAL_WORKERS: "1", SQR_PREALLOCATE_MB: "0", AI_PRECOMPUTE_ON_START: "0", AUTH_COOKIE_SECURE: "0",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1", COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: process.execPath,
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: JSON.stringify(["-e", "process.exit(0)", "{file}"]), COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
    };
    let spawnFailure;
    serverLog = createWriteStream(path.join(artifactsDir, "server.log"), { flags: "wx" });
    serverLog.once("error", (error) => { spawnFailure = error; });
    child = spawn(process.execPath, [builtServer], { cwd: appDir, env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.once("error", (error) => { spawnFailure = error; });
    child.stdout.pipe(serverLog, { end: false });
    child.stderr.pipe(serverLog, { end: false });
    await waitUntilReady(baseUrl, child, () => Boolean(spawnFailure));
    if (spawnFailure) throw new Error("Disposable 2FA server process could not start.");
    console.log("Disposable built app and PostgreSQL ready; real 2FA browser verification starting.");
    await runTwoFactorBrowser({ baseUrl, username, password, artifactsDir });
    console.log(`2FA verification passed. Synthetic screenshots and sanitized server log: ${artifactsDir}`);
  } catch (error) {
    failed = true;
    // Browser tests must not print their entered credentials, secret or OTP.
    console.error(error?.code === "ERR_ASSERTION" ? error.message : "Isolated 2FA verification failed; inspect the last safe phase marker and redacted artifacts. Raw browser errors are suppressed because they can include entered secrets.");
    console.error(`2FA verification artifacts: ${artifactsDir}`);
  } finally {
    const appStopped = await stopApp(child);
    if (!appStopped) failed = true;
    if (serverLog && !serverLog.destroyed) await new Promise((resolve) => serverLog.end(resolve));
    let databaseStopped = !postgresStartAttempted;
    if (postgresStarted && appStopped) {
      try { await run(executable("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], fixtureRoot); databaseStopped = true; }
      catch { failed = true; }
    }
    if (appStopped && databaseStopped) {
      try {
        await removeDisposableFixture(fixtureRoot, tempParent);
        console.log("Disposable 2FA app/database removed. Existing application uploads, receipts and data were not used.");
      } catch {
        failed = true;
        console.error(`Fixture processes stopped, but temporary cleanup could not complete: ${fixtureRoot}. No application paths were touched.`);
      }
    } else {
      failed = true;
      console.error(`Fixture shutdown could not be confirmed; retaining ${fixtureRoot}. No application paths were removed.`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch(() => {
  console.error("Isolated 2FA verification could not initialize. Build the app and check the browser module and local PostgreSQL binaries.");
  process.exitCode = 1;
});
