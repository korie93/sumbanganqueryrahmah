import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import bcrypt from "bcrypt";
import { chromium } from "playwright";
import { buildPostgresPoolConfig } from "./lib/postgres-preflight.mjs";
import { resolveManagedLoopbackBaseUrl } from "./lib/local-loopback-server.mjs";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import { waitForServer } from "./lib/server-readiness.mjs";
import { startManagedServerProcess, stopManagedServerProcess } from "./lib/managed-server-process.mjs";

// Requires an existing local build and local PostgreSQL CREATE DATABASE rights.
// No caller-supplied database is mutated. Credentials stay in memory, and the
// private server working directory also isolates uploads from the real app.
assert.equal(process.argv.slice(2).length, 0, "This isolated QA runner accepts no arguments.");
const stamp = `${Date.now()}_${randomBytes(3).toString("hex")}`;
const database = `sqr_account_delete_${stamp}`;
const databasePattern = /^sqr_account_delete_[0-9]+_[a-f0-9]{6}$/;
assert(databasePattern.test(database));
const artifactsDir = path.resolve("artifacts", `account-management-delete-${stamp}`);
await mkdir(artifactsDir, { recursive: true });
await cp(path.resolve("dist-local/public"), path.join(artifactsDir, "dist-local/public"), {
  recursive: true, errorOnExist: true, force: false,
});
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
const address = await resolveManagedLoopbackBaseUrl({
  host: "127.0.0.1", preferredPort: "5157", configuredBaseUrl: "http://127.0.0.1:5157",
});
const password = () => `Qa!${randomBytes(18).toString("hex")}`;
const fixtures = Object.fromEntries(["eligible", "history"].map((name) => [name, {
  id: randomUUID(), username: `qa.delete.${name}.${stamp}`, password: password(),
  activationId: randomUUID(), resetId: randomUUID(),
}]));
const historyId = randomUUID();
const env = {
  ...process.env,
  NODE_ENV: "development", HOST: "127.0.0.1", PORT: String(address.port),
  PUBLIC_APP_URL: address.baseUrl, CORS_ALLOWED_ORIGINS: address.baseUrl,
  DATABASE_URL: "", DATABASE_REPLICA_URL: "", PG_DATABASE: database,
  SEED_DEFAULT_USERS: "1", LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
  SEED_SUPERUSER_USERNAME: `qa.super.${stamp}`, SEED_SUPERUSER_PASSWORD: password(),
  SEED_ADMIN_USERNAME: `qa.admin.${stamp}`, SEED_ADMIN_PASSWORD: password(),
  SEED_USER_USERNAME: `qa.user.${stamp}`, SEED_USER_PASSWORD: password(),
  SESSION_SECRET: randomBytes(48).toString("hex"),
  SQR_AUDIT_HMAC_KEY: randomBytes(48).toString("hex"),
  TWO_FACTOR_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  COLLECTION_PII_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  SQR_RATE_LIMIT_STORE: "memory", SQR_MAX_WORKERS: "1", SQR_INITIAL_WORKERS: "1",
  SQR_REDIS_RATE_LIMIT_URL: "", SQR_QUEUE_REDIS_URL: "", REDIS_URL: "",
  SQR_WS_SHARED_BUS: "memory", SQR_REDIS_WS_URL: "",
  SMTP_SERVICE: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM: "",
  MAIL_DEV_OUTBOX_ENABLED: "1", MAIL_DEV_OUTBOX_DIR: path.join(artifactsDir, "mail-outbox"),
  COLLECTION_RECEIPT_QUARANTINE_DIR: path.join(artifactsDir, "receipt-quarantine"),
  OTEL_TRACING_ENABLED: "0", OTEL_EXPORTER_OTLP_ENDPOINT: "",
};
if (connection.connectionString) {
  const url = new URL(connection.connectionString);
  Object.assign(env, {
    PG_HOST: url.hostname, PG_PORT: url.port || "5432",
    PG_USER: decodeURIComponent(url.username), PG_PASSWORD: decodeURIComponent(url.password),
  });
}
const checks = [];
const pageErrors = [];
const contexts = [];
const log = createWriteStream(path.join(artifactsDir, "server.log"));
let created = false;
let server;
let fixturePool;
let browser;
let currentPage;
let phase = "database preparation";

function checked(description) {
  checks.push(description);
  console.log(`[account-delete-qa] pass: ${description}`);
}

async function api(context, method, apiPath, expectedStatus = 200) {
  const csrf = (await context.cookies(address.baseUrl)).find((cookie) => cookie.name === "sqr_csrf");
  const response = await context.request.fetch(`${address.baseUrl}${apiPath}`, {
    method,
    headers: { Accept: "application/json", ...(csrf ? { "X-CSRF-Token": csrf.value } : {}) },
    timeout: 30_000,
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status(), expectedStatus,
    `${method} ${apiPath}: ${response.status()} ${payload.error?.code || ""} ${payload.message || ""}`);
  return payload;
}

async function login(username, loginPassword, role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => pageErrors.push({ role, message: error.message }));
  await page.goto(`${address.baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-username").fill(username);
  await page.getByTestId("input-password").fill(loginPassword);
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/auth/login");
  await page.getByTestId("button-login").click();
  assert.equal((await responsePromise).status(), 200, `${role} fixture login must succeed.`);
  await page.getByTestId("input-username").waitFor({ state: "hidden" });
  const me = await api(context, "GET", "/api/me");
  assert.equal(me.user?.role, role);
  return { context, page };
}

function responseAt(page, method, apiPath) {
  return page.waitForResponse((response) =>
    response.request().method() === method && new URL(response.url()).pathname === apiPath);
}

async function selectAccount(page, fixture) {
  // Both fixtures fit on the first page. Exercise the real row action without
  // coupling the deletion regression to the separate account-search workflow.
  const row = page.getByRole("row").filter({ hasText: fixture.username });
  await row.waitFor({ state: "visible" });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete Managed Account" });
  await dialog.waitFor({ state: "visible" });
  assert((await dialog.innerText()).includes(fixture.username));
  return { row, dialog };
}

async function prepareFixtures() {
  fixturePool = new pg.Pool(buildPostgresPoolConfig(env));
  assert.equal((await fixturePool.query("SELECT current_database() AS name")).rows[0].name, database);
  for (const fixture of Object.values(fixtures)) {
    await fixturePool.query(`INSERT INTO public.users
      (id, username, full_name, role, password_hash, status, is_banned, must_change_password, activated_at)
      VALUES ($1, $2, $3, 'user', $4, 'active', false, false, now())`,
    [fixture.id, fixture.username, "Account deletion QA fixture", await bcrypt.hash(fixture.password, 12)]);
    await fixturePool.query(`INSERT INTO public.account_activation_tokens
      (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')`,
    [fixture.activationId, fixture.id, randomBytes(32).toString("hex")]);
    await fixturePool.query(`INSERT INTO public.password_reset_requests
      (id, user_id, requested_by_user, reset_type) VALUES ($1, $2, $3, 'manual')`,
    [fixture.resetId, fixture.id, fixture.username]);
  }
  await fixturePool.query(`INSERT INTO public.collection_records
    (id, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username)
    VALUES ($1, 'P10', current_date, 1.00, $2, 'Account Delete QA', 'Account Delete QA')`,
  [historyId, fixtures.history.username]);
}

async function verifyBrowserDelete() {
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  phase = "fixture sessions";
  const eligible = await login(fixtures.eligible.username, fixtures.eligible.password, "user");
  await eligible.page.close();
  const history = await login(fixtures.history.username, fixtures.history.password, "user");
  await history.page.close();
  const superuser = await login(env.SEED_SUPERUSER_USERNAME, env.SEED_SUPERUSER_PASSWORD, "superuser");
  const page = superuser.page;
  currentPage = page;
  const missingCsrf = await superuser.context.request.delete(`${address.baseUrl}/api/admin/users/${fixtures.history.id}`);
  assert.equal(missingCsrf.status(), 403, "Authenticated cookie deletion without CSRF proof must remain denied.");
  checked("superuser cookie deletion without CSRF proof remains denied");
  await api(eligible.context, "GET", "/api/me");
  await api(history.context, "GET", "/api/me");
  await api(eligible.context, "DELETE", `/api/admin/users/${fixtures.history.id}`, 403);
  checked("ordinary user remains denied by the real delete endpoint");

  phase = "Account Management success refresh";
  await page.goto(`${address.baseUrl}/settings?section=account-management`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Managed Account", exact: true }).click();
  const pendingBefore = await api(superuser.context, "GET", "/api/admin/password-reset-requests");
  assert(pendingBefore.requests.some((request) => request.id === fixtures.eligible.resetId),
    "The target pending reset must be listed before deletion.");
  const selected = await selectAccount(page, fixtures.eligible);
  await page.screenshot({ path: path.join(artifactsDir, "eligible-confirmation.png"), fullPage: true });
  const deleteResponsePromise = responseAt(page, "DELETE", `/api/admin/users/${fixtures.eligible.id}`);
  const usersRefreshPromise = responseAt(page, "GET", "/api/admin/users");
  const pendingRefreshPromise = responseAt(page, "GET", "/api/admin/password-reset-requests");
  await selected.dialog.getByRole("button", { name: "Delete User", exact: true }).click();
  const deletion = await deleteResponsePromise;
  assert.equal(deletion.status(), 200, "Eligible browser deletion must succeed, not return HTTP 500.");
  const payload = await deletion.json();
  assert.equal(payload.deleted, true);
  assert.equal(payload.user?.id, fixtures.eligible.id);
  const usersRefresh = await usersRefreshPromise;
  const pendingRefresh = await pendingRefreshPromise;
  assert.equal(usersRefresh.status(), 200);
  assert.equal(pendingRefresh.status(), 200);
  assert(!(await usersRefresh.json()).users.some((user) => user.id === fixtures.eligible.id));
  assert(!(await pendingRefresh.json()).requests.some((request) => request.id === fixtures.eligible.resetId));
  await selected.row.waitFor({ state: "hidden" });
  await selected.dialog.waitFor({ state: "hidden" });
  await page.getByText("Account Deleted", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(artifactsDir, "eligible-deleted-refreshed.png"), fullPage: true });
  checked("real confirmation DELETE returns 200, dialog closes, success toast appears, row and pending reset refresh away");
  assert.equal((await fixturePool.query("SELECT id FROM users WHERE id = $1", [fixtures.eligible.id])).rowCount, 0);
  for (const table of ["account_activation_tokens", "password_reset_requests", "user_activity"]) {
    assert.equal((await fixturePool.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [fixtures.eligible.id])).rowCount, 0);
  }
  assert.equal((await fixturePool.query(
    "SELECT id FROM audit_logs WHERE action = 'ACCOUNT_DELETED' AND target_user = $1 AND performed_by = $2",
    [fixtures.eligible.id, env.SEED_SUPERUSER_USERNAME],
  )).rowCount, 1);
  await api(eligible.context, "GET", "/api/me", 401);
  checked("successful deletion removes only target auth data, retains the deletion audit, and invalidates existing cookies");

  phase = "Account Management historical conflict";
  const blocked = await selectAccount(page, fixtures.history);
  const blockedResponsePromise = responseAt(page, "DELETE", `/api/admin/users/${fixtures.history.id}`);
  await blocked.dialog.getByRole("button", { name: "Delete User", exact: true }).click();
  const blockedResponse = await blockedResponsePromise;
  assert.equal(blockedResponse.status(), 409, "Historical dependency must return a controlled conflict, not HTTP 500.");
  const conflict = await blockedResponse.json();
  assert(conflict.message && !/constraint|foreign key|23503|DELETE FROM|stack/i.test(conflict.message),
    "The client must receive a safe, meaningful conflict message without database internals.");
  // Settings uses the API error code as its toast title when one is present.
  await page.getByText(conflict.error.code, { exact: true }).first().waitFor();
  await page.getByText(conflict.message, { exact: false }).first().waitFor();
  await blocked.row.waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(artifactsDir, "history-conflict-preserved.png"), fullPage: true });
  assert.equal((await fixturePool.query("SELECT id FROM users WHERE id = $1", [fixtures.history.id])).rowCount, 1);
  assert.equal((await fixturePool.query("SELECT id FROM collection_records WHERE id = $1", [historyId])).rowCount, 1);
  for (const table of ["account_activation_tokens", "password_reset_requests"]) {
    assert.equal((await fixturePool.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [fixtures.history.id])).rowCount, 1);
  }
  assert.equal((await fixturePool.query(
    "SELECT id FROM audit_logs WHERE action = 'ACCOUNT_DELETED' AND target_user = $1", [fixtures.history.id],
  )).rowCount, 0);
  await api(history.context, "GET", "/api/me");
  checked("409 renders the safe API message, keeps the row/history/tokens/session, and does not create a success audit");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Managed Account", exact: true }).click();
  await page.getByRole("row").filter({ hasText: fixtures.history.username }).waitFor({ state: "visible" });
  assert.equal(await page.getByRole("row").filter({ hasText: fixtures.eligible.username }).count(), 0);
  checked("full page reload also keeps the deleted user absent");
  assert.deepEqual(pageErrors, [], "No unhandled browser runtime errors are allowed.");
}

try {
  assert.equal((await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database])).rowCount, 0);
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  console.log(`[account-delete-qa] database: ${database}; artifacts: ${artifactsDir}`);
  const migrationCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/db-migrate.mjs"], { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  assert.equal(migrationCode, 0, "Disposable database migrations must succeed.");
  server = startManagedServerProcess(process.execPath, [path.resolve("dist-local/server/index-local.js")], {
    env, cwd: artifactsDir,
  });
  server.stdout.pipe(log, { end: false });
  server.stderr.pipe(log, { end: false });
  await waitForServer(`${address.baseUrl}/api/health`, {
    serverProcess: server, timeoutMs: 120_000, logPath: path.join(artifactsDir, "server.log"),
  });
  await prepareFixtures();
  await verifyBrowserDelete();
  await writeFile(path.join(artifactsDir, "qa-result.json"), JSON.stringify({
    result: "PASS", checks, pageErrors, completedAt: new Date().toISOString(),
  }, null, 2));
} catch (error) {
  console.error(`[account-delete-qa] failed during ${phase}: ${error.message}`);
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: path.join(artifactsDir, "failure.png"), fullPage: true }).catch(() => {});
  }
  await writeFile(path.join(artifactsDir, "qa-result.json"), JSON.stringify({
    result: "FAIL", phase, message: error.message, checks, pageErrors, completedAt: new Date().toISOString(),
  }, null, 2));
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.close();
  if (fixturePool) await fixturePool.end();
  if (server) await stopManagedServerProcess(server);
  log.end();
  if (created) {
    assert(databasePattern.test(database));
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid() AND backend_type = 'client backend' AND usename = current_user", [database]);
    await admin.query(`DROP DATABASE "${database}"`);
    console.log(`[account-delete-qa] removed disposable database ${database}; artifacts retained.`);
  }
  await admin.end();
}
