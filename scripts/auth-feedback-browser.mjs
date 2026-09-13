import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Isolated real-browser UI contract, deliberately not a real API/database E2E.
// No application server, .env loading, external requests or production accounts.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "scripts/fixtures/auth-feedback-ui.jsx").replaceAll("\\", "/");
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const metadata = {
  username: "ui.fixture", email: null, fullName: "UI Fixture", role: "user",
  expiresAt: "2099-01-01T00:00:00.000Z",
};
const validPassword = "BrowserFixture1!";
const currentPassword = "BrowserCurrent1!";
const pageErrors = [];
const reactWarnings = [];
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
let validationResponseGate = null;
let passwordRejection = null;
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
          const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SQR isolated password UI verification</title></head><body><div id="root"></div><script type="module" src="/@fs/${fixturePath}"></script></body></html>`);
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

async function go(view, token = "fixture-link", theme = "light") {
  await page.goto(`${origin}/?${new URLSearchParams({ view, token, theme })}`, { waitUntil: "networkidle" });
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
    await input.focus();
    await input.evaluate((element) => element.setSelectionRange(2, 6, "forward"));
    await toggle.click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    assert.equal(await input.getAttribute("type"), "text");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal(await toggle.getAttribute("aria-label"), hiddenLabel.replace(/^Lihat /, "Sembunyikan "));
    assert.equal(await input.evaluate((element) => document.activeElement === element), true, "Pointer toggle preserves input focus.");
    assert.deepEqual(await input.evaluate((element) => [element.selectionStart, element.selectionEnd]), [2, 6], `${id}: pointer toggle preserves the selected password range.`);
    for (const otherId of fieldIds.filter((candidate) => candidate !== id)) {
      assert.equal(await page.locator(`#${otherId}`).getAttribute("type"), "password", "Revealing one password must not reveal another.");
    }
    await toggle.focus();
    await toggle.press("Enter");
    assert.equal(await input.getAttribute("type"), "password", "Enter can hide the password without submitting.");
    assert.equal(await toggle.evaluate((element) => document.activeElement === element), true, "Keyboard toggling preserves button focus and tab order.");
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
  const before = { ...counts };
  const values = await Promise.all(fieldIds.map((id) => page.locator(`#${id}`).inputValue()));
  // The accessible name changes to loading copy; retain this same button while pending.
  const submitButton = await submit.elementHandle();
  assert.ok(submitButton);
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
    assert.equal(await submitButton.isDisabled(), true, "Pending requests disable the submit button.");
    assert.deepEqual(await Promise.all(fieldIds.map((id) => page.locator(`#${id}`).inputValue())), values, "Pending requests must not prematurely clear passwords.");
    const mutationsAfterSubmit = { ...counts };
    assert.equal(Object.values(mutationsAfterSubmit).reduce((sum, count) => sum + count, 0), Object.values(before).reduce((sum, count) => sum + count, 0) + 1);
    await submitButton.evaluate((element) => {
      element.form?.requestSubmit();
      element.form?.requestSubmit();
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(counts, mutationsAfterSubmit, "Repeated submit events cannot duplicate a pending mutation.");
  } finally {
    releaseResponse();
    passwordResponseGate = null;
    await submitButton.dispose();
  }
}

async function checkLiveRequirements(view, password, meter, submit) {
  const before = { ...counts };
  const requirements = meter.locator("[data-password-requirement]");
  assert.deepEqual(await requirements.evaluateAll((elements) => elements.map((element) => element.dataset.passwordRequirement)), ["length", "lowercase", "uppercase", "number", "symbol"], "Checklist must expose every actual policy requirement in a stable order.");
  assert.match(await requirements.first().innerText(), /14.*256/, "Both backend length limits must be visible.");
  const initialHeight = (await meter.boundingBox()).height;
  for (const candidate of ["", "a", "A", "1", "!", `Ab1!${"a".repeat(9)}`, `Ab1!${"a".repeat(10)}`, `Ab1!${"a".repeat(252)}`, `Ab1!${"a".repeat(253)}`, "PalmRiver7!Aa", "PalmRiverMountain7"]) {
    await password.fill(candidate);
    const expected = [candidate.length >= 14 && candidate.length <= 256, /[a-z]/.test(candidate), /[A-Z]/.test(candidate), /\d/.test(candidate), /[^A-Za-z0-9]/.test(candidate)];
    assert.deepEqual(await requirements.evaluateAll((elements) => elements.map((element) => element.dataset.satisfied === "true")), expected, "Every requirement changes live, including the exact 14/256 boundaries.");
    assert.equal((await meter.innerText()).includes("Kata laluan sah"), expected.every(Boolean), "Strength must never override a failed mandatory requirement.");
    assert.equal(await requirements.locator("svg").count(), 5, "Requirement states use icons as well as text/color.");
    const height = (await meter.boundingBox()).height;
    assert.ok(Math.abs(height - initialHeight) <= 1,
      `${view} ${page.viewportSize().width}px: checklist height changed from ${initialHeight}px to ${height}px at ${candidate.length} characters. Checklist and meter reserve stable space as rules change.`);
  }
  await password.fill("PalmRiver7!Aa");
  await visibleText(meter, "Sangat Kuat");
  assert.equal((await meter.innerText()).includes("Kata laluan sah"), false, "A heuristically very strong 12-character password still fails the actual 14-character policy.");
  assert.equal(await meter.getAttribute("aria-live"), null, "Do not announce the entire changing requirements list on every keystroke.");
  const help = page.locator(`#${view === "reset" ? "reset-password" : "activate-password"}-submit-help`);
  await help.waitFor({ state: "visible" });
  assert.ok((await help.innerText()).trim().length > 0, "Submission readiness always has a visible explanation.");
  assert.ok((await submit.getAttribute("aria-describedby"))?.split(/\s+/).includes(await help.getAttribute("id")), "CTA is associated with its readiness explanation.");
  assert.deepEqual(counts, before, "Live checklist evaluation must not make requests.");
  await password.fill("");
}

async function checkWrappedStrengthLayout(view) {
  await page.setViewportSize({ width: 360, height: 960 });
  await go(view);
  // Different OS fallback fonts can wrap a strength label in the 6rem column.
  // Exercise that condition on every runner, not only where it occurs by default.
  await page.addStyleTag({ content: "[data-password-strength-label] { font-family: monospace; letter-spacing: 0.08em; }" });
  const prefix = view === "reset" ? "reset-password" : "activate-account";
  const meterId = view === "reset" ? "reset-password-strength" : "activate-password-strength";
  const submit = page.getByRole("button", { name: view === "reset" ? "Tetapkan Kata Laluan Baharu" : "Cipta Kata Laluan", exact: true });
  const meter = page.locator(`#${meterId}`);
  const label = meter.locator("[data-password-strength-label]");
  assert.ok(await label.evaluate((element) => element.getBoundingClientRect().height > parseFloat(getComputedStyle(element).lineHeight)),
    "Regression fixture must exercise a strength label that wraps to two lines.");
  await checkLiveRequirements(view, page.locator(`#${prefix}-new-password`), meter, submit);
  console.log(`[auth-feedback-browser] PASS ${view}: stable checklist with wrapping fallback-font strength labels at 360px`);
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
    assert.equal((await feedback.innerText()).trim(), "", "Empty confirmation has no alarming error before interaction.");
    assert.equal(await confirmation.getAttribute("aria-invalid"), null);
    await checkLiveRequirements(view, password, meter, submit);
    await password.fill(validPassword);
    assert.equal(await confirmation.inputValue(), "", "Confirmation must not be populated from the new password.");
    await submit.click();
    await visibleText(feedback, "Sila sahkan kata laluan baharu.");
    assert.deepEqual(counts, before, "Blank confirmation must block submission.");
  }
  await password.fill("Ab12345!");
  await confirmation.fill("Ab12345!");
  await visibleText(meter, submit ? "14" : "sekurang-kurangnya 14 aksara");
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
    await password.fill(`${validPassword}x`);
    await visibleText(feedback, "Pengesahan kata laluan tidak sepadan.");
    assert.equal(await confirmation.getAttribute("aria-invalid"), "true", "Editing the original password must immediately invalidate stale matching confirmation.");
    await password.fill(validPassword);
    await visibleText(feedback, "Pengesahan kata laluan sepadan.");
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

async function checkPasswordRejections(view) {
  errorCode = null;
  const prefix = view === "reset" ? "reset-password" : "activate-account";
  const errorPrefix = view === "reset" ? "reset-password" : "activate-password";
  for (const [code, expected] of [
    ["PASSWORD_TOO_SHORT", "14"],
    ["PASSWORD_TOO_LONG", "256"],
    ["PASSWORD_MISSING_LETTER", "huruf"],
    ["PASSWORD_MISSING_LOWERCASE", "huruf kecil"],
    ["PASSWORD_MISSING_UPPERCASE", "huruf besar"],
    ["PASSWORD_MISSING_NUMBER", "nombor"],
    ["PASSWORD_MISSING_SYMBOL", "simbol"],
  ]) {
    await go(view);
    passwordRejection = code;
    const password = page.locator(`#${prefix}-new-password`);
    const confirmation = page.locator(`#${prefix}-confirm-password`);
    await password.fill(validPassword);
    await confirmation.fill(validPassword);
    await confirmation.press("Enter");
    await visibleText(page.locator(`#${errorPrefix}-new-error`), expected);
    assert.equal(await password.getAttribute("aria-invalid"), "true", "Known backend policy rejection must be associated with the password field.");
    assert.equal(await password.inputValue(), validPassword, "Backend rejection must preserve the password for correction.");
    assert.equal(await confirmation.inputValue(), validPassword);
    assert.equal(await password.getAttribute("type"), "password");
    assert.equal((await page.locator("body").innerText()).includes("Fixture rejection"), false, "Known errors must use safe actionable local copy.");
    await password.fill(`${validPassword}x`);
    assert.equal(await page.locator(`#${errorPrefix}-new-error`).count(), 0, "Editing clears a stale backend field error.");
  }
  await go(view);
  passwordRejection = "PASSWORD_CONFIRMATION_MISMATCH";
  const password = page.locator(`#${prefix}-new-password`);
  const confirmation = page.locator(`#${prefix}-confirm-password`);
  await password.fill(validPassword);
  await confirmation.fill(validPassword);
  await confirmation.press("Enter");
  await visibleText(page.locator(`#${errorPrefix}-confirm-error`), "Pengesahan kata laluan tidak sepadan.");
  assert.equal(await confirmation.getAttribute("aria-invalid"), "true", "A backend confirmation error cannot be hidden by a locally matching value.");
  assert.equal((await page.locator(`#${errorPrefix}-confirm-error`).innerText()).includes("Pengesahan kata laluan sepadan."), false);
  assert.equal(await confirmation.inputValue(), validPassword);
  passwordRejection = null;
  console.log(`[auth-feedback-browser] PASS ${view}: policy and confirmation backend rejections map to fields; native Enter submit and retained masked values`);
}

async function checkTokenLoading(view) {
  let releaseValidation;
  validationResponseGate = new Promise((resolve) => { releaseValidation = resolve; });
  try {
    await page.goto(`${origin}/?view=${view}&token=fixture-link`, { waitUntil: "domcontentloaded" });
    await visibleText(page.locator("[role=status]"), "Sedang mengesahkan");
    assert.equal(await page.locator("input[type=password]").count(), 0, "No password form is exposed before the server validates the token.");
  } finally {
    releaseValidation();
    validationResponseGate = null;
  }
  await page.locator('input[autocomplete="new-password"]').first().waitFor({ state: "visible" });
  await visibleText(page.locator("dl"), metadata.username);
  await visibleText(page.locator("dl"), "Tamat tempoh");
  assert.equal((await page.locator("body").innerText()).includes("fixture-link"), false, "Token internals must not be displayed in account metadata.");
}

async function checkPublicPasswordLayout(view, width, theme, artifacts) {
  await page.setViewportSize({ width, height: 960 });
  await go(view, "fixture-link", theme);
  const prefix = view === "reset" ? "reset-password" : "activate-account";
  const password = page.locator(`#${prefix}-new-password`);
  const confirmation = page.locator(`#${prefix}-confirm-password`);
  await password.fill("PalmRiverMountain7");
  await confirmation.fill("DifferentFixture1!");
  const missingLabels = await page.locator("input").evaluateAll((elements) => elements.filter((element) => !element.labels?.length).map((element) => element.id));
  assert.deepEqual(missingLabels, [], `${view} needs permanent associated labels at ${width}px.`);
  for (const input of [password, confirmation]) {
    assert.equal(await input.getAttribute("autocomplete"), "new-password");
    const inputId = await input.getAttribute("id");
    const toggle = page.locator(`button[aria-controls="${inputId}"]`);
    const inputBox = await input.boundingBox();
    const toggleBox = await toggle.boundingBox();
    assert.ok(toggleBox.width >= 44 && toggleBox.height >= 44, "Public password controls need comfortable touch targets.");
    assert.ok(toggleBox.x >= inputBox.x && toggleBox.x + toggleBox.width <= inputBox.x + inputBox.width + 1, "Eye control remains aligned within its own field.");
    assert.ok(await input.evaluate((element) => parseFloat(getComputedStyle(element).paddingRight)) >= toggleBox.width, "Input text must not overlap the visibility control.");
  }
  const invalidDescriptions = await page.locator("[aria-describedby]").evaluateAll((elements) => elements.flatMap((element) => element.getAttribute("aria-describedby").split(/\s+/).filter((id) => id && !document.getElementById(id))));
  assert.deepEqual(invalidDescriptions, [], `${view} description references must exist.`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${view} ${theme} has horizontal overflow at ${width}px.`);
  await page.addScriptTag({ content: axeSource });
  const accessibility = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }));
  });
  assert.deepEqual(accessibility, [], `${view} ${theme} must pass WCAG A/AA automated checks including contrast at ${width}px.`);
  assert.equal(await page.evaluate((secrets) => [localStorage, sessionStorage].some((storage) => Object.values(storage).some((value) => secrets.some((secret) => value.includes(secret)))) , [validPassword, currentPassword, "PalmRiverMountain7", "DifferentFixture1!"]), false, "Password entries must never persist in browser storage.");
  await page.screenshot({ path: path.join(artifacts, `${view}-${width}-${theme}-requirements.png`), fullPage: true });
  if (width === 320 || width === 1280) {
    await password.fill(validPassword);
    await confirmation.fill(validPassword);
    await page.screenshot({ path: path.join(artifacts, `${view}-${width}-${theme}-matching.png`), fullPage: true });
  }
  if (width === 390) {
    // A reduced viewport approximates space taken by a mobile keyboard; this is
    // not a claim to run the real Android/iOS software keyboard.
    await page.setViewportSize({ width, height: 420 });
    await confirmation.focus();
    await confirmation.scrollIntoViewIfNeeded();
    const box = await confirmation.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 420, "Confirmation remains reachable in a keyboard-sized viewport.");
    assert.equal(await confirmation.evaluate((element) => document.activeElement === element), true);
    await page.screenshot({ path: path.join(artifacts, `${view}-${width}-${theme}-short-viewport.png`) });
  }
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
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()) && /Warning:|React|controlled.*uncontrolled|uncontrolled.*controlled/i.test(message.text())) reactWarnings.push(message.text());
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      unexpectedRequests.push(`${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const fulfill = (json, status = 200) => route.fulfill({ status, json });
    const failure = (code, status = 410) => fulfill({ ok: false, message: "Fixture rejection", error: { code, message: "Fixture rejection" } }, status);
    if (url.pathname.endsWith("/validate-activation-token") || url.pathname.endsWith("/validate-password-reset-token")) {
      if (validationResponseGate) await validationResponseGate;
      return errorCode ? failure(errorCode) : fulfill({ ok: true, [url.pathname.endsWith("/validate-activation-token") ? "activation" : "reset"]: metadata });
    }
    if (url.pathname.endsWith("/activate-account") || url.pathname.endsWith("/reset-password-with-token")) {
      const body = route.request().postDataJSON();
      assert.equal(body.newPassword, validPassword);
      assert.equal(body.confirmPassword, validPassword);
      assert.equal(body.token, "fixture-link");
      counts[url.pathname.endsWith("/activate-account") ? "activate" : "reset"]++;
      if (passwordResponseGate) await passwordResponseGate;
      if (passwordRejection) return failure(passwordRejection, 400);
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

  for (const view of ["reset", "activation"]) await checkWrappedStrengthLayout(view);

  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 960 });
    await checkPasswordFeedback("reset", "reset-password-new-password", "reset-password-confirm-password", "reset-password-strength", "reset-password-confirm-error");
    await checkPasswordFeedback("activation", "activate-account-new-password", "activate-account-confirm-password", "activate-password-strength", "activate-password-confirm-error");
    if (width === 390 || width === 1280) {
      await checkCredentialPasswordFlow("change");
      await checkCredentialPasswordFlow("settings");
    }
    console.log(`[auth-feedback-browser] PASS all password visibility/confirmation workflows at ${width}px`);
  }
  await checkPasswordFeedback("collection", "collection-nickname-setup-password", "collection-nickname-setup-confirm-password", "collection-nickname-password-policy", "collection-nickname-password-confirmation");

  for (const view of ["reset", "activation"]) {
    await checkPasswordRejections(view);
    await checkTokenLoading(view);
  }

  for (const [view, code, expected] of [
    ["reset", "INVALID_TOKEN", "tidak sah atau telah digunakan"],
    ["reset", "TOKEN_EXPIRED", "telah tamat tempoh"],
    ["reset", "TOKEN_USED", "telah digunakan"],
    ["activation", "TOKEN_EXPIRED", "telah tamat tempoh"],
    ["activation", "INVALID_TOKEN", "tidak sah"],
    ["activation", "TOKEN_USED", "sudah diaktifkan"],
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
  errorCode = null;
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    for (const theme of ["light", "dark"]) {
      for (const view of ["reset", "activation"]) await checkPublicPasswordLayout(view, width, theme, artifacts);
    }
    console.log(`[auth-feedback-browser] PASS ${width}px reset/activation light/dark: labels, autocomplete, touch targets, no overlap/overflow, WCAG A/AA including contrast`);
  }
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
  assert.deepEqual(reactWarnings, [], "No React warnings.");
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
