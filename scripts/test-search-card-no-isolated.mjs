import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import pg from "pg";

// Disposable, loopback-only cluster: never loads dotenv or application DB credentials.
const pgBin = process.env.SQR_SEARCH_CARD_TEST_PG_BIN
  || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin" : "");
const executable = (name) => pgBin
  ? path.join(pgBin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const inheritedKeys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "HOME"];
const cleanEnv = Object.fromEntries(inheritedKeys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const tempParent = await realpath(os.tmpdir());
function run(command, args, env = cleanEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Fixture command failed: ${path.basename(command)} (${code ?? signal})`)));
  });
}
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const selected = probe.address().port;
    probe.close((error) => error ? reject(error) : resolve(selected));
  });
});
const fixtureRoot = await mkdtemp(path.join(tempParent, "sqr-search-card-"));
const dataDir = path.join(fixtureRoot, "data");
const unixSocketOption = process.platform === "win32" ? ""
  : ` -k '${fixtureRoot.replaceAll("'", "'\\''")}'`;
let started = false;
let startAttempted = false;
let failed = false;
try {
  await run(executable("initdb"), ["-D", dataDir, "-U", "sqr_fixture", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  startAttempted = true;
  await run(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(fixtureRoot, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -c max_connections=12${unixSocketOption}`, "-w", "start"]);
  started = true;
  const admin = new pg.Client({ host: "127.0.0.1", port, user: "sqr_fixture", database: "postgres", connectionTimeoutMillis: 3_000 });
  try {
    await admin.connect();
    await admin.query("CREATE DATABASE sqr_search_card_test");
  } finally { await admin.end(); }
  await run(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=45000", "server/repositories/tests/search-card-number-postgres.integration.test.ts"], {
    ...cleanEnv,
    NODE_ENV: "test", HOST: "127.0.0.1", PUBLIC_APP_URL: "http://127.0.0.1:5000",
    SESSION_SECRET: "isolated-card-display-fixture-session-only-48chars",
    COLLECTION_PII_ENCRYPTION_KEY: "isolated-card-display-fixture-pii-only-48chars",
    PG_HOST: "127.0.0.1", PG_PORT: String(port), PG_USER: "sqr_fixture", PG_PASSWORD: "", PG_DATABASE: "sqr_search_card_test",
    SQR_SEARCH_CARD_ISOLATED_CLUSTER: "1",
  });
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : "Isolated General Search Card verification failed.");
} finally {
  // Ambiguous startup/stop failures retain the directory, never remove a live cluster.
  let stopped = !startAttempted;
  if (started) {
    try { await run(executable("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]); stopped = true; }
    catch { failed = true; console.error("Fixture stop failed; retaining its temporary directory for inspection."); }
  }
  if (stopped) {
    const fixtureInfo = await lstat(fixtureRoot);
    assert.equal(fixtureInfo.isSymbolicLink(), false);
    assert.equal(fixtureInfo.isDirectory(), true);
    const resolved = await realpath(fixtureRoot);
    assert.equal(resolved, path.resolve(fixtureRoot));
    assert.equal(path.dirname(resolved), tempParent);
    assert.match(path.basename(resolved), /^sqr-search-card-[a-zA-Z0-9]+$/);
    await rm(resolved, { recursive: true });
    console.log("Disposable General Search Card PostgreSQL fixture removed; no application data was used.");
  } else {
    console.error(`Disposable fixture retained at ${fixtureRoot}; no application paths were touched.`);
  }
}
process.exitCode = failed ? 1 : 0;
