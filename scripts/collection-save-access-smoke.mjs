import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Run only against the disposable database/server prepared by the caller. These
// fixtures intentionally remain in that database for inspection before disposal.
const baseUrl = String(process.env.SMOKE_BASE_URL || "").replace(/\/$/, "");
const qaDatabase = String(process.env.COLLECTION_SAVE_ACCESS_QA_DATABASE || "");
assert(/^sqr_save_access_[a-z0-9_]+$/.test(qaDatabase), "A dedicated Collection save QA database is required.");
assert.equal(process.env.PG_DATABASE, qaDatabase, "PG_DATABASE must equal the explicitly named QA database.");
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname), "Smoke server must be loopback.");
const credentials = {
  superuser: [process.env.SMOKE_TEST_USERNAME, process.env.SMOKE_TEST_PASSWORD],
  admin: [process.env.COLLECTION_SAVE_ADMIN_USERNAME, process.env.COLLECTION_SAVE_ADMIN_PASSWORD],
  user: [process.env.COLLECTION_SAVE_USER_USERNAME, process.env.COLLECTION_SAVE_USER_PASSWORD],
};
for (const [role, [username, password]] of Object.entries(credentials)) {
  assert(username && password, `Missing isolated ${role} credentials.`);
}
const artifactsDir = path.resolve(process.env.SMOKE_ARTIFACTS_DIR || "artifacts/collection-save-access-smoke");
const stamp = `${Date.now()}${randomBytes(3).toString("hex")}`;
const nicknamePassword = `QaNickname!${randomBytes(12).toString("hex")}`;
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const receiptBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmioAAAAASUVORK5CYII=",
  "base64",
);
const checks = [];
const contexts = [];
const pageErrors = [];
const savedRecords = [];
const nicknameSessionResponses = [];
let browser;
let currentPage;
let phase = "startup";
const watchdog = setTimeout(() => {
  console.error(`[collection-save-access-smoke] timeout during ${phase}`);
  process.exit(124);
}, 6 * 60_000);

function checked(description) {
  checks.push(description);
  console.log(`[collection-save-access-smoke] pass: ${description}`);
}

async function api(context, method, apiPath, body, expectedStatus = 200) {
  const csrf = (await context.cookies(baseUrl)).find((cookie) => cookie.name === "sqr_csrf");
  const response = await context.request.fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf.value } : {}),
    },
    ...(body === undefined ? {} : { data: body }),
    timeout: 30_000,
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status(), expectedStatus,
    `${method} ${apiPath}: ${response.status()} ${payload.error?.code || ""} ${payload.message || ""}`);
  return payload;
}

async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => pageErrors.push({ role, message: error.message }));
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname !== "/api/collection/nickname-auth/session") return;
    const body = await response.json().catch(() => null);
    nicknameSessionResponses.push({ role, status: response.status(), verified: Boolean(body?.nickname),
      hasId: Boolean(body?.nickname?.id), hasName: Boolean(body?.nickname?.nickname),
      message: body?.message, code: body?.error?.code });
  });
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-username").fill(credentials[role][0]);
  await page.getByTestId("input-password").fill(credentials[role][1]);
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/auth/login");
  await page.getByTestId("button-login").click();
  assert.equal((await responsePromise).status(), 200, `${role} account login must succeed.`);
  await page.getByTestId("input-username").waitFor({ state: "hidden" });
  const me = await api(context, "GET", "/api/me");
  assert.equal(me.user?.role, role, `${role} login must have the actual server role.`);
  return { context, page };
}

async function nicknameDialog(page, nickname, setup = false) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#collection-nickname-input").fill(nickname);
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  if (setup) {
    await dialog.locator("#collection-nickname-setup-password").fill(nicknamePassword);
    await dialog.locator("#collection-nickname-setup-confirm-password").fill(nicknamePassword);
    await dialog.getByRole("button", { name: "Save Password", exact: true }).click();
  } else {
    await dialog.locator("#collection-nickname-login-password").fill(nicknamePassword);
    await dialog.getByRole("button", { name: "Login Nickname", exact: true }).click();
  }
  await dialog.waitFor({ state: "hidden" });
  await page.locator("#save-collection-customer-name").waitFor({ state: "visible" });
}

async function prepareSource(context, label) {
  const values = {
    customerName: `QA Collection ${label} ${stamp}`,
    icNumber: "900101123456",
    customerPhone: "0123456789",
    accountNumber: `QA-${label}-${stamp}`,
    batch: "P10",
    paymentDate: today,
    amount: "12.34",
  };
  const source = await api(context, "POST", "/api/imports", {
    name: `QA Save Access ${label} ${stamp}`,
    filename: `qa-save-access-${label}-${stamp}.csv`,
    data: [{
      "Customer Name": values.customerName,
      "IC Number": values.icNumber,
      "Customer Phone Number": values.customerPhone,
      "Account No": values.accountNumber,
      "TOTAL DUE": "12.34",
      "Billing Principal (OSP)": "10.00",
      DC_STS: "6",
      "Calling Date": today,
    }],
  });
  assert(source.id, "Saved source import ID is required.");
  await api(context, "PUT", `/api/collection/source-configs/${source.id}`, {
    validFrom: "2000-01-01", validTo: "2099-12-31", enabled: true,
  });
  return { values, sourceId: source.id, receiptName: `qa-${label}-${stamp}.png` };
}

async function fillAndMatch(page, fixture) {
  for (const [field, value] of Object.entries({
    "customer-name": fixture.values.customerName,
    "customer-ic-number": fixture.values.icNumber,
    "customer-phone": fixture.values.customerPhone,
    "account-number": fixture.values.accountNumber,
    amount: fixture.values.amount,
  })) {
    await page.locator(`#save-collection-${field}`).fill(value);
  }
  await page.getByTestId("save-collection-payment-date").click();
  await page.locator('button[name="day"]:not(.day-outside):not([disabled])')
    .filter({ hasText: new RegExp(`^\\s*${now.getDate()}\\s*$`) }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: fixture.receiptName, mimeType: "image/png", buffer: receiptBuffer,
  });
  await page.getByText(fixture.receiptName, { exact: true }).first().waitFor();
  await page.getByPlaceholder("Receipt Amount (RM)").last().fill(fixture.values.amount);
  const matchPromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/collection/source-matches");
  await page.getByRole("button", { name: "Semak Auto-matching", exact: true }).click();
  const response = await matchPromise;
  assert.equal(response.status(), 200, "Matching must succeed.");
  const payload = await response.json();
  assert(payload.matches?.some((match) => match.sourceImportId === fixture.sourceId), "Matching must use the fixture Saved source.");
  await page.getByRole("button", { name: "Save Collection", exact: true }).waitFor();
}

async function save(page, expectedStatus = 200) {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/collection");
  await page.getByRole("button", { name: "Save Collection", exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json();
  assert.equal(response.status(), expectedStatus, `Save returned ${response.status()}: ${payload.error?.code || ""} ${payload.message || ""}`);
  return payload;
}

function assertSaved(payload, fixture, role, nickname) {
  assert(payload.record?.id, "Save must return a record ID.");
  assert.equal(payload.record.collectionStaffNickname, nickname);
  assert.equal(payload.record.createdByLogin, credentials[role][0]);
  assert.equal(payload.record.sourceImportId, fixture.sourceId);
  assert(payload.record.sourceDataRowId, "Save must link the exact Saved row.");
  assert.equal(payload.record.amount, "12.34");
  assert.equal(payload.record.receiptCount, 1, "Save must retain one actual uploaded receipt.");
  savedRecords.push({ role, id: payload.record.id, nickname, sourceId: fixture.sourceId });
}

try {
  await mkdir(artifactsDir, { recursive: true });
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  phase = "superuser login and fixture creation";
  const superuser = await login("superuser");
  const nicknames = {};
  for (const role of ["admin", "user", "other"]) {
    const response = await api(superuser.context, "POST", "/api/collection/nicknames", {
      nickname: `QA ${role} ${stamp}`, roleScope: role === "other" ? "both" : role,
    });
    nicknames[role] = response.nickname;
  }
  const fixtures = {};
  for (const label of ["admin", "user", "superuser"]) {
    fixtures[label] = await prepareSource(superuser.context, label);
  }

  for (const role of ["admin", "user"]) {
    phase = `${role} nickname verification, matching and save`;
    const actor = await login(role);
    await actor.page.goto(`${baseUrl}/collection/save`, { waitUntil: "domcontentloaded" });
    await nicknameDialog(actor.page, nicknames[role].nickname, true);
    const session = await api(actor.context, "GET", "/api/collection/nickname-auth/session");
    assert.equal(session.nickname?.nickname, nicknames[role].nickname);
    await actor.page.reload({ waitUntil: "domcontentloaded" });
    await actor.page.locator("#save-collection-customer-name").waitFor();
    assert.equal(await actor.page.locator("#collection-nickname-input").count(), 0);
    checked(`${role}: verified backend nickname restores after reload`);
    await fillAndMatch(actor.page, fixtures[role]);

    const forged = await api(actor.context, "POST", "/api/collection", {
      ...fixtures[role].values, collectionStaffNickname: nicknames.other.nickname,
    }, 403);
    assert.match(forged.error?.code || "", /NICKNAME/);
    checked(`${role}: forged alternate nickname is rejected by backend`);

    if (role === "admin") {
      phase = "admin revocation and retry preserving receipt";
      await api(superuser.context, "PATCH", `/api/collection/nicknames/${nicknames.admin.id}`, { isActive: false });
      await api(superuser.context, "PATCH", `/api/collection/nicknames/${nicknames.admin.id}`, { isActive: true });
      const rejected = await save(actor.page, 403);
      assert.match(rejected.error?.code || "", /NICKNAME/);
      // The access failure opens the reauthentication dialog automatically.
      await actor.page.locator("#collection-nickname-input").waitFor();
      await nicknameDialog(actor.page, nicknames.admin.nickname);
      assert.equal(await actor.page.locator("#save-collection-customer-name").inputValue(), fixtures.admin.values.customerName);
      assert.equal(await actor.page.locator("#save-collection-account-number").inputValue(), fixtures.admin.values.accountNumber);
      assert.equal(await actor.page.getByPlaceholder("Receipt Amount (RM)").last().inputValue(), "12.34");
      await actor.page.getByText(fixtures.admin.receiptName, { exact: true }).first().waitFor();
      checked("admin: revoked verification rejects save and reauthentication preserves form and receipt");
    }
    assertSaved(await save(actor.page), fixtures[role], role, nicknames[role].nickname);
    checked(`${role}: actual UI matching and multipart Collection save succeed with one receipt`);

    phase = `${role} stale browser marker on new login`;
    const fresh = await login(role);
    await fresh.page.evaluate(({ nickname, username, roleName }) => {
      sessionStorage.setItem("collection_staff_nickname", nickname);
      sessionStorage.setItem("collection_staff_nickname_auth", JSON.stringify({
        nickname, username, role: roleName, verifiedAt: Date.now(),
      }));
    }, { nickname: nicknames[role].nickname, username: credentials[role][0], roleName: role });
    await fresh.page.goto(`${baseUrl}/collection/save`, { waitUntil: "domcontentloaded" });
    await fresh.page.locator("#collection-nickname-input").waitFor();
    assert.equal(await fresh.page.locator("#save-collection-customer-name").count(), 0);
    await nicknameDialog(fresh.page, nicknames[role].nickname);
    checked(`${role}: stale browser verification cannot authorize a new login, real nickname login recovers`);
    await fresh.context.close();
    await actor.context.close();
  }

  phase = "superuser explicit nickname selection and save";
  currentPage = superuser.page;
  await superuser.page.goto(`${baseUrl}/collection/save`, { waitUntil: "domcontentloaded" });
  const picker = superuser.page.locator("#save-collection-superuser-nickname");
  await picker.waitFor();
  assert.equal(await superuser.page.locator("#save-collection-customer-name").count(), 0);
  await picker.click();
  await superuser.page.getByRole("button", { name: nicknames.admin.nickname, exact: true }).click();
  await superuser.page.locator("#save-collection-customer-name").fill("Discarded other nickname draft");
  await picker.click();
  await superuser.page.getByRole("button", { name: nicknames.user.nickname, exact: true }).click();
  assert.equal(await superuser.page.locator("#save-collection-customer-name").inputValue(), "");
  await fillAndMatch(superuser.page, fixtures.superuser);
  assertSaved(await save(superuser.page), fixtures.superuser, "superuser", nicknames.user.nickname);
  checked("superuser: explicit active nickname selection, draft isolation and actual receipt save succeed");
  assert.deepEqual(pageErrors, [], "Browser must have no uncaught runtime errors.");
  checked("all role flows have no uncaught browser runtime errors");
  await writeFile(path.join(artifactsDir, "result.json"), JSON.stringify({
    ok: true, qaDatabase, checks, savedRecords,
  }, null, 2));
} catch (error) {
  await currentPage?.screenshot({ path: path.join(artifactsDir, "failure.png"), fullPage: true }).catch(() => {});
  await writeFile(path.join(artifactsDir, "result.json"), JSON.stringify({
    ok: false, phase, checks, savedRecords, message: error.message, pageErrors, nicknameSessionResponses,
  }, null, 2)).catch(() => {});
  console.error(`[collection-save-access-smoke] failed during ${phase}: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
}
