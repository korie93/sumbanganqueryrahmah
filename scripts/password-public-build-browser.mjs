import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import { startPasswordPublicBuildServer } from "./lib/password-public-build-server.mjs";

// Actual production entry point and emitted CSS, not the component fixture's
// broader authenticated stylesheet. Synthetic API only; no database or .env.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "artifacts/password-public-build-browser");
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const widths = [320, 360, 390, 430, 768, 1280];
const token = "public-build-fixture";
const validPassword = "BrowserFixture1!";
const metadata = { username: "ui.fixture", fullName: "UI Fixture", email: null, role: "user", expiresAt: "2099-01-01T00:00:00.000Z" };
const routes = [
  { name: "reset", path: "/reset-password", prefix: "reset-password", meter: "reset-password-strength", feedback: "reset-password-confirm-error", mutation: "/api/auth/reset-password-with-token", validation: "/api/auth/validate-password-reset-token", metadataKey: "reset", success: "Tetapan semula kata laluan berjaya" },
  { name: "activation", path: "/activate-account", prefix: "activate-account", meter: "activate-password-strength", feedback: "activate-password-confirm-error", mutation: "/api/auth/activate-account", validation: "/api/auth/validate-activation-token", metadataKey: "activation", success: "Kata laluan berjaya dicipta" },
];
const diagnostics = { matrix: [], failures: [], pageErrors: [], unexpectedRequests: [] };
let browser;
let activePage;
let server;
let deadline;

function rgb(color) {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `Expected resolved RGB color, received ${color}`);
  return channels;
}

function assertStateColor(color, state, label) {
  const [red, green, blue] = rgb(color);
  if (state === "success") assert.ok(green > red && green > blue, `${label}: success must be visibly green (${color}).`);
  if (state === "error") assert.ok(red > green * 1.2 && red > blue * 1.15, `${label}: error must be visibly red (${color}).`);
}

async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1), false, `${label}: horizontal overflow.`);
}

async function screenshot(page, label) {
  // Full-page captures taken while scrolled can paint an offscreen fixed skip
  // link into the document image. Capture from the top without changing focus.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: path.join(artifacts, `${label}.png`), fullPage: true, animations: "disabled" });
}

async function checkAccessibility(page, label) {
  const accessibility = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(({ target }) => target) }));
  });
  assert.deepEqual(accessibility, [], `${label}: actual-built public page accessibility violations.`);
}

async function checkRenderedControls(page, spec, label) {
  for (const suffix of ["new-password", "confirm-password"]) {
    const id = `${spec.prefix}-${suffix}`;
    const field = page.locator(`#${id}`);
    const toggle = page.locator(`button[aria-controls="${id}"]`);
    assert.equal(await field.getAttribute("type"), "password");
    assert.equal(await field.getAttribute("autocomplete"), "new-password");
    assert.equal(await toggle.getAttribute("type"), "button");
    assert.match(await toggle.getAttribute("aria-label"), /^Lihat .+/);
    const geometry = await toggle.evaluate((element) => {
      const input = document.getElementById(element.getAttribute("aria-controls"));
      const svg = element.querySelector("svg");
      const rect = (node) => {
        const { x, y, width, height, right, bottom } = node.getBoundingClientRect();
        return { x, y, width, height, right, bottom };
      };
      return { input: rect(input), toggle: rect(element), icon: rect(svg), position: getComputedStyle(element).position, iconDisplay: getComputedStyle(svg).display, iconVisibility: getComputedStyle(svg).visibility, paddingRight: parseFloat(getComputedStyle(input).paddingRight) };
    });
    assert.ok(geometry.icon.width >= 16 && geometry.icon.height >= 16 && geometry.icon.width <= 32, `${label}: eye SVG must have visible dimensions, not shrink to zero.`);
    assert.notEqual(geometry.iconDisplay, "none");
    assert.notEqual(geometry.iconVisibility, "hidden");
    assert.equal(geometry.position, "absolute", `${label}: visibility control belongs inside the input wrapper.`);
    assert.ok(geometry.toggle.width >= 44 && geometry.toggle.height >= 44, `${label}: visibility tap target must be at least 44px.`);
    assert.ok(geometry.toggle.x >= geometry.input.x && geometry.toggle.right <= geometry.input.right + 1 && geometry.toggle.y >= geometry.input.y - 1 && geometry.toggle.bottom <= geometry.input.bottom + 1, `${label}: visibility control must fit inside the password field.`);
    assert.ok(geometry.paddingRight >= geometry.toggle.width, `${label}: text needs reserved space before the visibility button.`);
    assert.equal(await page.locator(`label[for="${id}"]`).count(), 1);
  }
  const hiddenLabels = page.locator(`#${spec.meter} .sr-only`);
  assert.equal(await hiddenLabels.count(), 5);
  for (const hidden of await hiddenLabels.all()) {
    assert.equal(await hidden.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.position === "absolute" && bounds.width <= 1 && bounds.height <= 1 && (style.clip !== "auto" || style.clipPath !== "none") && style.overflow === "hidden";
    }), true, `${label}: screen-reader text must actually be visually hidden by public CSS.`);
  }
  await noOverflow(page, label);
}

async function checkChecklist(page, spec, candidate, expectedLevel, { neutral = false } = {}) {
  const field = page.locator(`#${spec.prefix}-new-password`);
  const meter = page.locator(`#${spec.meter}`);
  if (!neutral) await field.fill(candidate);
  const expected = [candidate.length >= 14 && candidate.length <= 256, /[a-z]/.test(candidate), /[A-Z]/.test(candidate), /\d/.test(candidate), /[^A-Za-z0-9]/.test(candidate)];
  const requirements = meter.locator("[data-password-requirement]");
  assert.deepEqual(await requirements.evaluateAll((elements) => elements.map((element) => element.dataset.passwordRequirement)), ["length", "lowercase", "uppercase", "number", "symbol"]);
  assert.deepEqual(await requirements.evaluateAll((elements) => elements.map((element) => element.dataset.satisfied === "true")), expected);
  assert.deepEqual(await requirements.evaluateAll((elements) => elements.map((element) => element.dataset.state)), expected.map((satisfied) => neutral ? "neutral" : satisfied ? "success" : "error"));
  assert.match(await meter.innerText(), new RegExp(`${expected.filter(Boolean).length}/5 dipenuhi`));
  for (const item of await requirements.all()) {
    const state = await item.getAttribute("data-state");
    assertStateColor(await item.evaluate((element) => getComputedStyle(element).color), state, "Checklist");
    assert.equal(await item.locator("svg").count(), 1, "Every requirement needs its own icon as well as color/text.");
    const bounds = await item.locator("svg").boundingBox();
    assert.ok(bounds.width >= 14 && bounds.height >= 14, "Requirement icons must really render at readable size.");
  }
  const strength = meter.locator("[data-password-strength-level]");
  assert.equal(await strength.getAttribute("data-password-strength-level"), String(expectedLevel));
  const segments = meter.locator("[data-password-strength-segment]");
  assert.equal(await segments.count(), 5, "Strength must have five real rendered segments.");
  const colors = [];
  for (let index = 0; index < 5; index++) {
    const segment = segments.nth(index);
    const bounds = await segment.boundingBox();
    assert.ok(bounds.width >= 12 && bounds.height >= 4, "Strength segments must have non-zero computed width and height.");
    const filled = expectedLevel !== "none" && index <= expectedLevel;
    assert.equal(await segment.getAttribute("data-filled"), String(filled));
    if (filled) colors.push(await segment.evaluate((element) => getComputedStyle(element).backgroundColor));
  }
  if (colors.length) {
    assert.equal(new Set(colors).size, 1, "Filled segments use the current strength color consistently.");
    if (expectedLevel <= 1) assertStateColor(colors[0], "error", "Weak meter");
    if (expectedLevel === 2) {
      const [red, green, blue] = rgb(colors[0]);
      assert.ok(red > green && green > blue * 1.3, "Fair meter must be visibly amber.");
    }
    if (expectedLevel >= 3) assertStateColor(colors[0], "success", "Strong meter");
  }
  assert.equal((await meter.innerText()).includes("Kata laluan sah"), expected.every(Boolean), "Strength can never override backend policy acceptance.");
  return colors[0] ?? null;
}

async function checkFieldState(field, state) {
  assert.equal(await field.getAttribute("data-validation-state"), state);
  assert.equal(await field.getAttribute("aria-invalid"), state === "error" ? "true" : null);
  // The real public input transitions border-color over 160ms. Assert the
  // rendered destination without racing the first animation frame.
  await expect(async () => {
    assertStateColor(await field.evaluate((element) => getComputedStyle(element).borderTopColor), state, "Password input border");
  }).toPass({ timeout: 2_000, intervals: [25, 50, 100] });
}

async function checkVisibility(page, spec) {
  for (const suffix of ["new-password", "confirm-password"]) {
    const field = page.locator(`#${spec.prefix}-${suffix}`);
    const other = page.locator(`#${spec.prefix}-${suffix === "new-password" ? "confirm-password" : "new-password"}`);
    const toggle = page.locator(`button[aria-controls="${spec.prefix}-${suffix}"]`);
    await field.focus();
    await field.evaluate((element) => element.setSelectionRange(2, 6, "forward"));
    await toggle.click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    assert.equal(await field.getAttribute("type"), "text");
    assert.equal(await other.getAttribute("type"), "password", "Each field toggles independently.");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal(await field.evaluate((element) => document.activeElement === element), true);
    assert.deepEqual(await field.evaluate((element) => [element.selectionStart, element.selectionEnd]), [2, 6]);
    await toggle.focus();
    await toggle.press("Enter");
    assert.equal(await field.getAttribute("type"), "password");
    assert.equal(await toggle.evaluate((element) => document.activeElement === element), true);
    await toggle.press("Space");
    assert.equal(await field.getAttribute("type"), "text");
    await toggle.click();
    assert.equal(await field.inputValue(), validPassword);
    assert.equal(await field.getAttribute("type"), "password");
  }
}

async function runCase(spec, width, theme) {
  const label = `${spec.name}-${width}-${theme}`;
  const context = await browser.newContext({ viewport: { width, height: 960 }, colorScheme: theme, reducedMotion: "reduce", serviceWorkers: "block" });
  let releaseMutation;
  const mutationGate = new Promise((resolve) => { releaseMutation = resolve; });
  let mutations = 0;
  const cssRequests = [];
  try {
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(8_000);
    page.on("pageerror", (error) => diagnostics.pageErrors.push({ label, message: error.message }));
    page.on("request", (request) => { if (request.resourceType() === "stylesheet") cssRequests.push(new URL(request.url()).pathname); });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== server.origin) {
        diagnostics.unexpectedRequests.push({ label, path: `${url.origin}${url.pathname}` });
        return route.abort();
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === spec.validation) {
        assert.equal(route.request().postDataJSON().token, token);
        return route.fulfill({ json: { ok: true, [spec.metadataKey]: metadata } });
      }
      if (url.pathname === spec.mutation) {
        mutations++;
        const body = route.request().postDataJSON();
        assert.equal(body.token === token && body.newPassword === validPassword && body.confirmPassword === validPassword, true, "Mutation must use the unchanged synthetic token and matching credentials.");
        if (spec.name === "activation") assert.equal(body.username, metadata.username);
        await mutationGate;
        return route.fulfill({ json: { ok: true, user: null } });
      }
      diagnostics.unexpectedRequests.push({ label, path: url.pathname });
      return route.fulfill({ status: 404, json: { ok: false, message: "Unexpected synthetic API request" } });
    });
    await page.goto(`${server.origin}${spec.path}?token=${token}`, { waitUntil: "networkidle" });
    const field = page.locator(`#${spec.prefix}-new-password`);
    const confirmation = page.locator(`#${spec.prefix}-confirm-password`);
    const submit = page.locator("form button[type=submit]");
    const feedback = page.locator(`#${spec.feedback}`);
    await field.waitFor({ state: "visible" });
    // Public reset deep links do not own the app theme selector. Exercise the
    // existing light/dark class contract after the DOM exists, without injecting
    // any stylesheet or borrowing the authenticated application entry.
    await page.evaluate((selectedTheme) => {
      document.documentElement.classList.toggle("dark", selectedTheme === "dark");
    }, theme);
    await screenshot(page, `${label}-neutral`);
    await checkRenderedControls(page, spec, label);
    await checkChecklist(page, spec, "", "none", { neutral: true });
    await checkFieldState(field, "neutral");
    await checkFieldState(confirmation, "neutral");
    assert.equal((await feedback.innerText()).trim(), "");
    await page.addScriptTag({ content: axeSource });
    await checkAccessibility(page, `${label} neutral`);

    const colors = [];
    const initialChecklistHeight = (await page.locator(`#${spec.meter}`).boundingBox()).height;
    for (const [candidate, level] of [["a", 0], ["aB", 1], ["aB7", 2], ["PalmRiver7!", 3], ["PalmRiver7!Aa", 4]]) {
      colors.push(await checkChecklist(page, spec, candidate, level));
      const currentHeight = (await page.locator(`#${spec.meter}`).boundingBox()).height;
      assert.ok(Math.abs(currentHeight - initialChecklistHeight) <= 1, `${label}: checklist height must remain stable while requirements and strength change.`);
      if (width === 320 || width === 1280) await screenshot(page, `${label}-strength-${level}`);
    }
    assert.ok(new Set(colors).size >= 3, "Weak, fair and strong meter categories must have distinguishable state colors in actual public CSS.");
    await checkFieldState(field, "error");
    await confirmation.fill("PalmRiver7!Aa");
    await submit.click();
    assert.equal(mutations, 0, "Heuristically strong but too-short password must never reach the API.");
    await screenshot(page, `${label}-invalid`);
    await checkAccessibility(page, `${label} invalid`);

    // Mixed results must update each row independently, not paint all rules
    // from a single form-level validity flag (also covered by unit tests).
    for (const candidate of ["abcdefghijklmno", "Abcdefghijklmn1", "Abcdefghijklmn1!"]) {
      await field.fill(candidate);
      const expectedCount = candidate === "abcdefghijklmno" ? 2 : candidate.endsWith("!") ? 5 : 4;
      assert.equal(await page.locator(`#${spec.meter} [data-password-requirement][data-state="success"]`).count(), expectedCount);
      assert.equal(await page.locator(`#${spec.meter} [data-password-requirement][data-state="error"]`).count(), 5 - expectedCount);
      assert.equal(await page.locator(`#${spec.meter} [data-password-requirement-count]`).innerText(), `${expectedCount}/5 dipenuhi`);
      if (expectedCount === 2) await screenshot(page, `${label}-partial`);
    }

    await checkChecklist(page, spec, "", "none");
    await checkFieldState(field, "error");
    await checkChecklist(page, spec, validPassword, 4);
    await checkFieldState(field, "success");
    await checkFieldState(confirmation, "error");
    assert.match(await feedback.innerText(), /tidak sepadan/);
    assertStateColor(await feedback.evaluate((element) => getComputedStyle(element).color), "error", "Confirmation mismatch");
    await submit.click();
    assert.equal(mutations, 0, "Mismatch must never reach the API.");
    await confirmation.fill(validPassword);
    await checkFieldState(confirmation, "success");
    assert.match(await feedback.innerText(), /kata laluan sepadan/);
    assertStateColor(await feedback.evaluate((element) => getComputedStyle(element).color), "success", "Confirmation match");
    assert.equal(await feedback.getAttribute("aria-live"), "polite");
    await checkVisibility(page, spec);
    assert.equal(mutations, 0, "Visibility controls must never submit.");
    await noOverflow(page, label);
    await screenshot(page, `${label}-valid`);

    await checkAccessibility(page, `${label} valid`);
    if (width <= 430) {
      await page.setViewportSize({ width, height: 500 });
      await confirmation.focus();
      await confirmation.scrollIntoViewIfNeeded();
      await noOverflow(page, `${label} short viewport`);
      await screenshot(page, `${label}-short-viewport`);
    }

    await page.locator(`button[aria-controls="${spec.prefix}-new-password"]`).click();
    const buttonHandle = await submit.elementHandle();
    await submit.click();
    await page.waitForFunction((prefix) => ["new-password", "confirm-password"].every((suffix) => {
      const input = document.getElementById(`${prefix}-${suffix}`);
      return input.disabled && input.type === "password";
    }), spec.prefix);
    await expect.poll(() => mutations, { timeout: 8_000 }).toBe(1);
    await buttonHandle.evaluate((button) => { button.form.requestSubmit(); button.form.requestSubmit(); });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(mutations, 1, "Duplicate pending submits must not duplicate requests.");
    assert.equal(await buttonHandle.isDisabled(), true);
    assert.equal(await page.locator("button[aria-controls]:disabled").count(), 2);
    releaseMutation();
    await page.getByRole("status").filter({ hasText: spec.success }).waitFor();
    assert.equal(await field.count(), 0, "Success removes password values from the DOM.");
    assert.ok(cssRequests.some((url) => url.endsWith(".css")), "Must load real emitted CSS.");
    assert.deepEqual(cssRequests.filter((url) => /AuthenticatedApp(?:Entry|Shell)/i.test(url)), [], "Public routes must not depend on authenticated stylesheet chunks.");
    diagnostics.matrix.push({ label, cssRequests, mutations, accessibilityViolations: 0 });
    console.log(`[password-public-build] PASS ${label}: real CSS, controls, states, policy gating, accessibility, submit lifecycle`);
  } catch (error) {
    diagnostics.failures.push({ label, message: error.message });
    if (activePage && !activePage.isClosed()) await screenshot(activePage, `${label}-failure`).catch(() => {});
    throw error;
  } finally {
    releaseMutation();
    await context.close();
    activePage = null;
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  server = await startPasswordPublicBuildServer(path.join(root, "dist-local/public"));
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  // Hard bounded runner: close the browser to interrupt stalled Playwright work,
  // then allow normal finally cleanup and a non-zero result. CI also caps at 5m.
  deadline = setTimeout(() => {
    diagnostics.failures.push({ message: "Public built browser verification exceeded 240 seconds." });
    void browser.close();
  }, 240_000);
  for (const spec of routes) for (const width of widths) for (const theme of ["light", "dark"]) await runCase(spec, width, theme);
  assert.deepEqual(diagnostics.pageErrors, [], "Built app emitted unexpected browser errors.");
  assert.deepEqual(diagnostics.unexpectedRequests, [], "All requests must remain isolated and explicitly mocked.");
  assert.deepEqual(diagnostics.failures, []);
  console.log(`[password-public-build] PASS ${diagnostics.matrix.length} actual-built public route/viewport/theme cases. Artifacts: ${path.relative(root, artifacts)}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await browser?.close();
  await server?.close();
  await writeFile(path.join(artifacts, "summary.json"), `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
}
