import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Isolated real-browser UI contract, deliberately not a real API/database E2E.
// No application server, .env loading, external requests or production accounts.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "scripts/fixtures/auth-feedback-ui.jsx").replaceAll("\\", "/");
const metadata = {
  username: "ui.fixture", email: null, fullName: "UI Fixture", role: "user",
  expiresAt: "2099-01-01T00:00:00.000Z",
};
const validPassword = "BrowserFixture1!";
const currentPassword = "BrowserCurrent1!";
const pageErrors = [];
const unexpectedRequests = [];
const counts = { activate: 0, reset: 0, change: 0, credentials: 0, login: 0, verify: 0, setup: 0, enable: 0 };
const fixtureUser = {
  id: "fixture-id", username: "ui.fixture", fullName: null, email: null, role: "admin", status: "active",
  mustChangePassword: false, passwordResetBySuperuser: false, isBanned: false,
  twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorConfiguredAt: null,
  activatedAt: "2026-01-01T00:00:00.000Z", passwordChangedAt: null, lastLoginAt: null,
};
let errorCode = null;
let loginError = "TWO_FACTOR_INVALID_CODE";
let setupError = "TWO_FACTOR_INVALID_CODE";
let passwordResponseGate = null;
let browser;
let page;
let origin;
const server = await createServer({
  configFile: false, envFile: false, envDir: false,
  root: path.join(rootDir, "client"),
  define: { __SQR_CLIENT_RELEASE_SHA__: JSON.stringify("") },
  resolve: { alias: { "@": path.join(rootDir, "client/src"), "@shared": path.join(rootDir, "shared") } },
  server: { host: "127.0.0.1", port: 0, strictPort: true, fs: { allow: [rootDir] } },
  logLevel: "error",
  plugins: [react(), {
    name: "isolated-auth-feedback-document",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (new URL(request.url, "http://fixture.invalid").pathname !== "/") return next();
        try {
          const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/${fixturePath}"></script></body></html>`);
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(html);
        } catch (error) { next(error); }
      });
    },
  }],
});

async function visibleText(locator, text) {
  await locator.filter({ hasText: text }).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function go(view, token = "fixture-link") {
  await page.goto(`${origin}/?view=${view}&token=${token}`, { waitUntil: "networkidle" });
}

async function checkPasswordVisibility(fieldIds) {
  const before = { ...counts };
  const values = await Promise.all(fieldIds.map((id) => page.locator(`#${id}`).inputValue()));
  for (const id of fieldIds) {
    const input = page.locator(`#${id}`);
    const toggle = page.locator(`button[aria-controls="${id}"]`);
    assert.equal(await input.getAttribute("type"), "password", `${id} starts masked.`);
    assert.equal(await toggle.count(), 1, `${id} has its own visibility control.`);
    assert.equal(await toggle.getAttribute("type"), "button", "Visibility must never submit the form.");
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    const hiddenLabel = await toggle.getAttribute("aria-label");
    assert.match(hiddenLabel, /^Lihat .+/, "Toggle needs a field-specific accessible label.");
    await toggle.click();
    assert.equal(await input.getAttribute("type"), "text");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal(await toggle.getAttribute("aria-label"), hiddenLabel.replace(/^Lihat /, "Sembunyikan "));
    for (const otherId of fieldIds.filter((candidate) => candidate !== id)) {
      assert.equal(await page.locator(`#${otherId}`).getAttribute("type"), "password", "Revealing one password must not reveal another.");
    }
    await toggle.focus();
    await toggle.press("Enter");
    assert.equal(await input.getAttribute("type"), "password", "Enter can hide the password without submitting.");
    await toggle.press("Space");
    assert.equal(await input.getAttribute("type"), "text", "Space can reveal the password without submitting.");
    await toggle.click();
    assert.equal(await input.getAttribute("type"), "password");
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.equal(await toggle.getAttribute("aria-label"), hiddenLabel);
    assert.deepEqual(await Promise.all(fieldIds.map((fieldId) => page.locator(`#${fieldId}`).inputValue())), values, "Toggling must preserve every typed password.");
  }
  assert.deepEqual(counts, before, "Click/Enter/Space on visibility controls must not call any mutation API.");
}

async function submitPasswordAndCheckPending(submit, fieldIds) {
  let releaseResponse;
  passwordResponseGate = new Promise((resolve) => { releaseResponse = resolve; });
  try {
    await page.locator(`button[aria-controls="${fieldIds[0]}"]`).click();
    assert.equal(await page.locator(`#${fieldIds[0]}`).getAttribute("type"), "text");
    await submit.click();
    await page.waitForFunction((ids) => ids.every((id) => {
      const input = document.getElementById(id);
      return input?.disabled && input.type === "password";
    }), fieldIds);
    for (const id of fieldIds) {
      assert.equal(await page.locator(`button[aria-controls="${id}"]`).isDisabled(), true, "Pending password requests disable visibility controls and remask values.");
    }
  } finally {
    releaseResponse();
    passwordResponseGate = null;
  }
}

async function checkPasswordFeedback(view, prefix, confirmationPrefix, meterId, confirmationId) {
  errorCode = null;
  await go(view);
  const password = page.locator(`#${prefix}`);
  const confirmation = page.locator(`#${confirmationPrefix}`);
  const meter = page.locator(`#${meterId}`);
  const feedback = page.locator(`#${confirmationId}`);
  const submit = view === "collection" ? null : page.getByRole("button", { name: view === "activation" ? "Cipta Kata Laluan" : "Tetapkan Kata Laluan Baharu", exact: true });
  const before = { ...counts };
  if (submit) {
    await password.fill(validPassword);
    assert.equal(await confirmation.inputValue(), "", "Confirmation must not be populated from the new password.");
    await submit.click();
    await visibleText(feedback, "Sila sahkan kata laluan baharu.");
    assert.deepEqual(counts, before, "Blank confirmation must block submission.");
  }
  await password.fill("Ab12345!");
  await confirmation.fill("Ab12345!");
  await visibleText(meter, "sekurang-kurangnya 14 aksara");
  await visibleText(feedback, "Pengesahan kata laluan sepadan.");
  assert.equal((await meter.innerText()).includes("Kata laluan sah"), false);
  await password.fill("");
  await visibleText(feedback, "Pengesahan kata laluan tidak sepadan.");
  await password.fill("Ab12345!");
  if (submit) {
    await submit.click();
    assert.deepEqual(counts, before, "Invalid manual password must not submit.");
  }
  await password.fill(validPassword);
  await visibleText(meter, "Kata laluan sah");
  await visibleText(feedback, "Pengesahan kata laluan tidak sepadan.");
  assert.equal(await confirmation.getAttribute("aria-invalid"), "true");
  if (submit) {
    await submit.click();
    assert.deepEqual(counts, before, "Mismatched confirmation must block submission.");
    await password.focus();
    await password.press("Tab");
    assert.equal(await page.locator(`button[aria-controls="${prefix}"]`).evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press("Tab");
    assert.equal(await confirmation.evaluate((element) => document.activeElement === element), true);
  }
  await confirmation.fill(validPassword);
  await visibleText(feedback, "Pengesahan kata laluan sepadan.");
  assert.equal(await confirmation.getAttribute("aria-invalid"), null);
  assert.equal(await password.getAttribute("type"), "password");
  assert.equal((await feedback.innerText()).includes(validPassword), false);
  if (submit) {
    await checkPasswordVisibility([prefix, confirmationPrefix]);
    await submitPasswordAndCheckPending(submit, [prefix, confirmationPrefix]);
    await visibleText(page.locator("[role=status]"), view === "activation" ? "Kata laluan berjaya dicipta" : "Tetapan semula kata laluan berjaya");
    assert.equal(await password.count(), 0, "Successful form must clear/remove password inputs.");
    assert.equal(counts[view === "activation" ? "activate" : "reset"], before[view === "activation" ? "activate" : "reset"] + 1);
  }
  console.log(`[auth-feedback-browser] PASS ${view}: live validity, independent confirmation${view !== "collection" ? ", guarded submission and success" : ""}`);
}

async function checkCredentialPasswordFlow(view) {
  await go(view);
  const prefix = view === "change" ? "change-password" : "my-account";
  const ids = [`${prefix}-current-password`, `${prefix}-new-password`, `${prefix}-confirm-password`];
  const [current, password, confirmation] = ids.map((id) => page.locator(`#${id}`));
  const feedback = page.locator(`#${prefix}-confirm${view === "change" ? "" : "-password"}-error`);
  const submit = page.getByRole("button", { name: view === "change" ? "Kemas Kini Kata Laluan" : "Tukar kata laluan", exact: true });
  const before = { ...counts };
  await current.fill(currentPassword);
  await password.fill(validPassword);
  assert.equal(await confirmation.inputValue(), "", "New password requires independent confirmation.");
  await submit.click();
  await feedback.waitFor({ state: "visible" });
  assert.equal(await confirmation.getAttribute("aria-invalid"), "true");
  assert.deepEqual(counts, before, "Blank confirmation must not reach the password mutation API.");
  await confirmation.fill("DifferentFixture1!");
  await visibleText(feedback, "Pengesahan kata laluan tidak sepadan.");
  await submit.click();
  assert.deepEqual(counts, before, "Mismatched confirmation must not reach the password mutation API.");
  await confirmation.fill(validPassword);
  await visibleText(feedback, "Pengesahan kata laluan sepadan.");
  assert.equal(await confirmation.getAttribute("aria-invalid"), null);
  await checkPasswordVisibility(ids);
  await submitPasswordAndCheckPending(submit, ids);
  await visibleText(page.locator("[role=status]"), view === "change" ? "Kata laluan berjaya dikemas kini" : "Password changed successfully");
  const countKey = view === "change" ? "change" : "credentials";
  assert.equal(counts[countKey], before[countKey] + 1, "Matching confirmation submits exactly once.");
  for (const input of [current, password, confirmation]) {
    assert.equal(await input.inputValue(), "", "Successful password change clears sensitive input values.");
    assert.equal(await input.getAttribute("type"), "password");
  }
  console.log(`[auth-feedback-browser] PASS ${view}: independent visibility, keyboard toggles, mandatory matching confirmation, guarded API and cleared success`);
}

try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, serviceWorkers: "block" });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      unexpectedRequests.push(`${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const fulfill = (json, status = 200) => route.fulfill({ status, json });
    const failure = (code, status = 410) => fulfill({ ok: false, message: "Fixture rejection", error: { code, message: "Fixture rejection" } }, status);
    if (url.pathname.endsWith("/validate-activation-token")) return errorCode ? failure(errorCode) : fulfill({ ok: true, activation: metadata });
    if (url.pathname.endsWith("/validate-password-reset-token")) return errorCode ? failure(errorCode) : fulfill({ ok: true, reset: metadata });
    if (url.pathname.endsWith("/activate-account") || url.pathname.endsWith("/reset-password-with-token")) {
      const body = route.request().postDataJSON();
      assert.equal(body.newPassword, validPassword);
      assert.equal(body.confirmPassword, validPassword);
      assert.equal(body.token, "fixture-link");
      counts[url.pathname.endsWith("/activate-account") ? "activate" : "reset"]++;
      if (passwordResponseGate) await passwordResponseGate;
      return fulfill({ ok: true, user: null });
    }
    if (url.pathname === "/api/auth/change-password" || url.pathname === "/api/me/credentials") {
      assert.equal(route.request().method(), url.pathname === "/api/auth/change-password" ? "POST" : "PATCH");
      const body = route.request().postDataJSON();
      assert.equal(body.currentPassword, currentPassword);
      assert.equal(body.newPassword, validPassword);
      counts[url.pathname === "/api/auth/change-password" ? "change" : "credentials"]++;
      if (passwordResponseGate) await passwordResponseGate;
      return fulfill({ ok: true, user: fixtureUser, forceLogout: false });
    }
    if (url.pathname === "/api/auth/login") {
      counts.login++;
      return fulfill({ ok: true, twoFactorRequired: true, challengeToken: `fixture-challenge-${counts.login}`, username: "ui.fixture", role: "user", mustChangePassword: false, status: "active", user: null });
    }
    if (url.pathname === "/api/auth/verify-two-factor-login") {
      counts.verify++;
      assert.equal(route.request().postDataJSON().challengeToken, `fixture-challenge-${counts.login}`);
      return failure(loginError, 401);
    }
    if (url.pathname === "/api/auth/two-factor/setup") {
      counts.setup++;
      assert.equal(route.request().postDataJSON().currentPassword, validPassword);
      return fulfill({ ok: true, user: { ...fixtureUser, twoFactorPendingSetup: true }, setup: {
        accountName: "ui.fixture", issuer: "SQR", secret: "BROWSERFIXTUREONLY",
        otpauthUrl: "otpauth://totp/SQR:ui.fixture?secret=BROWSERFIXTUREONLY&issuer=SQR&algorithm=SHA256&digits=6&period=30",
        algorithm: "SHA256", digits: 6, period: 30, expiresAt: "2099-01-01T00:00:00.000Z",
      } });
    }
    if (url.pathname === "/api/auth/two-factor/enable") {
      counts.enable++;
      return setupError ? failure(setupError, 400) : fulfill({ ok: true, user: { ...fixtureUser, twoFactorEnabled: true } });
    }
    unexpectedRequests.push(url.pathname);
    return fulfill({ error: { code: "NOT_FOUND", message: "Unexpected mocked API" } }, 404);
  });

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 960 });
    await checkPasswordFeedback("reset", "reset-password-new-password", "reset-password-confirm-password", "reset-password-strength", "reset-password-confirm-error");
    await checkPasswordFeedback("activation", "activate-account-new-password", "activate-account-confirm-password", "activate-password-strength", "activate-password-confirm-error");
    await checkCredentialPasswordFlow("change");
    await checkCredentialPasswordFlow("settings");
    console.log(`[auth-feedback-browser] PASS all password visibility/confirmation workflows at ${width}px`);
  }
  await checkPasswordFeedback("collection", "collection-nickname-setup-password", "collection-nickname-setup-confirm-password", "collection-nickname-password-policy", "collection-nickname-password-confirmation");

  for (const [view, code, expected] of [
    ["reset", "INVALID_TOKEN", "tidak sah atau telah digunakan"],
    ["reset", "TOKEN_EXPIRED", "telah tamat tempoh"],
    ["reset", "TOKEN_USED", "telah digunakan"],
    ["activation", "TOKEN_EXPIRED", "telah tamat tempoh"],
    ["activation", "ACTIVATION_TOKEN_SUPERSEDED", "telah diganti"],
    ["activation", "ACCOUNT_ALREADY_ACTIVATED", "sudah diaktifkan"],
  ]) {
    errorCode = code;
    await go(view);
    await visibleText(page.locator("[role=alert]"), expected);
    assert.equal(await page.locator("input[type=password]").count(), 0);
  }
  console.log("[auth-feedback-browser] PASS invalid/expired/used/superseded/already-activated link feedback");

  await go("login");
  await page.getByTestId("input-username").fill("ui.fixture");
  await page.getByTestId("input-password").fill(validPassword);
  await page.getByTestId("button-login").click();
  await page.getByTestId("input-two-factor-code").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.body.dataset.authenticated), undefined);
  await page.getByTestId("input-two-factor-code").fill("123456");
  await page.getByTestId("button-login").click();
  await visibleText(page.locator("[role=alert]"), "Kod pengesah tidak betul atau telah digunakan");
  assert.equal(await page.getByTestId("input-two-factor-code").count(), 1);
  assert.equal(await page.evaluate(() => document.body.dataset.authenticated), undefined);
  loginError = "TWO_FACTOR_CHALLENGE_EXPIRED";
  await page.getByTestId("input-two-factor-code").fill("654321");
  await page.getByTestId("button-login").click();
  await visibleText(page.locator("[role=alert]"), "Sila log masuk semula");
  await page.getByTestId("input-password").waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("input-two-factor-code").count(), 0);
  await page.getByTestId("button-login").click();
  await page.getByTestId("input-two-factor-code").waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("input-two-factor-code").inputValue(), "");
  assert.equal(counts.login, 2);
  assert.equal(counts.verify, 2);
  console.log("[auth-feedback-browser] PASS login challenge, invalid OTP, expiry and clean restart; no UI authentication on failure");

  await go("setup");
  await page.locator("#my-account-two-factor-password").fill(validPassword);
  await page.getByRole("button", { name: "Mulakan persediaan 2FA", exact: true }).click();
  await visibleText(page.locator("[role=status]"), "algoritma SHA256, 6 digit");
  await page.locator("#my-account-two-factor-code").fill("123456");
  await page.getByRole("button", { name: "Sahkan dan aktifkan 2FA", exact: true }).click();
  await visibleText(page.locator("[role=alert]"), "Kod pengesah tidak betul atau telah digunakan");
  assert.equal(await page.getByRole("button", { name: "Nyahaktifkan 2FA", exact: true }).count(), 0);
  setupError = "TWO_FACTOR_SETUP_EXPIRED";
  await page.locator("#my-account-two-factor-code").fill("654321");
  await page.getByRole("button", { name: "Sahkan dan aktifkan 2FA", exact: true }).click();
  await visibleText(page.locator("[role=alert]"), "Mulakan persediaan 2FA semula");
  assert.equal(await page.locator("#my-account-two-factor-secret").count(), 0, "Expired setup must clear secret.");
  assert.equal(await page.locator("#my-account-two-factor-uri").count(), 0, "Expired setup must clear URI.");
  await page.getByRole("button", { name: "Mulakan persediaan 2FA", exact: true }).click();
  await page.locator("#my-account-two-factor-secret").waitFor({ state: "visible" });
  setupError = null;
  await page.locator("#my-account-two-factor-code").fill("345678");
  await page.getByRole("button", { name: "Sahkan dan aktifkan 2FA", exact: true }).click();
  await visibleText(page.locator("#fixture-notice"), "Authenticator-based sign-in is now active");
  assert.equal(await page.locator("#my-account-two-factor-secret").count(), 0);
  assert.equal(await page.locator("#my-account-two-factor-password").inputValue(), "");
  assert.equal(counts.setup, 2);
  assert.equal(counts.enable, 3);
  console.log("[auth-feedback-browser] PASS actual 2FA settings hook: URI settings, invalid OTP, expired setup secret clearing, restart and confirmed enable");

  const artifacts = path.join(rootDir, "artifacts/auth-feedback-browser");
  await mkdir(artifacts, { recursive: true });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 960 });
    for (const view of ["reset", "activation", "change", "settings", "collection", "login", "setup"]) {
      errorCode = null;
      await go(view);
      await page.locator("input").first().waitFor({ state: "visible" });
      const missingLabels = await page.locator("input").evaluateAll((elements) => elements.filter((element) => !element.labels?.length && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby")).map((element) => element.id));
      assert.deepEqual(missingLabels, [], `${view} inputs need accessible labels.`);
      const invalidDescriptions = await page.locator("[aria-describedby]").evaluateAll((elements) => elements.flatMap((element) => element.getAttribute("aria-describedby").split(/\s+/).filter((id) => id && !document.getElementById(id))));
      assert.deepEqual(invalidDescriptions, [], `${view} description references must exist.`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view} has horizontal overflow at ${width}px.`);
      await page.screenshot({ path: path.join(artifacts, `${view}-${width}.png`), fullPage: true });
    }
  }
  console.log("[auth-feedback-browser] PASS 390px/1280px input labels, description references and no horizontal overflow; local screenshots saved");
  assert.deepEqual(unexpectedRequests, [], "No unexpected or external network access.");
  assert.deepEqual(pageErrors, [], "No browser runtime errors.");
  console.log("[auth-feedback-browser] PASS all isolated UI contracts (mocked HTTP, not backend E2E)");
} catch (error) {
  if (page) {
    const artifacts = path.join(rootDir, "artifacts/auth-feedback-browser");
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
