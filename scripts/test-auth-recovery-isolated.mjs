import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import pg from "pg";

// Creates a brand-new PostgreSQL cluster. Never reads dotenv or application DB
// credentials, never connects to an existing server, and binds loopback only.
const pgBin = process.env.SQR_AUTH_TEST_PG_BIN
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
const fixtureRoot = await mkdtemp(path.join(tempParent, "sqr-auth-recovery-"));
const dataDir = path.join(fixtureRoot, "data");
// pg_ctl passes its -o value through a shell on Unix. Quote even a generated
// path because the operating system's temporary parent can contain spaces.
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
    await admin.query("CREATE DATABASE sqr_auth_recovery_test");
  } finally { await admin.end(); }
  await run(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "server/repositories/tests/auth-recovery-postgres.integration.test.ts"], {
    ...cleanEnv,
    NODE_ENV: "test", HOST: "127.0.0.1", PUBLIC_APP_URL: "http://127.0.0.1:5000",
    PG_HOST: "127.0.0.1", PG_PORT: String(port), PG_USER: "sqr_fixture", PG_PASSWORD: "", PG_DATABASE: "sqr_auth_recovery_test",
    SQR_AUTH_ISOLATED_CLUSTER: "1",
  });
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : "Isolated authentication verification failed.");
} finally {
  // A failed pg_ctl startup can be ambiguous. Retain its directory rather
  // than deleting files beneath a server that might still be starting.
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
    assert.match(path.basename(resolved), /^sqr-auth-recovery-[a-zA-Z0-9]+$/);
    await rm(resolved, { recursive: true });
    console.log("Disposable authentication PostgreSQL fixture removed; no application data was used.");
  } else {
    console.error(`Disposable fixture retained at ${fixtureRoot}; no application paths were touched.`);
  }
}
process.exitCode = failed ? 1 : 0;
