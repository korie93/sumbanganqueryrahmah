import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright";
import jsQR from "jsqr";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Only the disposable runner calls this module. No dotenv, external QR service,
// response mocks, server OTP helper, trace/HAR or retained enrollment material.
const require = createRequire(import.meta.url);

export function authenticatorCode(uri, nowMs = Date.now()) {
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "otpauth:");
  assert.equal(parsed.hostname, "totp");
  const algorithm = parsed.searchParams.get("algorithm");
  assert.ok(algorithm === "SHA256" || algorithm === "SHA1", "QR algorithm supported");
  assert.equal(parsed.searchParams.get("digits"), "6");
  assert.equal(parsed.searchParams.get("period"), "30");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const secret = parsed.searchParams.get("secret") || "";
  assert.ok(/^[A-Z2-7]+$/.test(secret), "QR secret is Base32");
  let bits = "";
  for (const character of secret) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30_000)));
  const digest = createHmac(algorithm.toLowerCase(), key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function decodeRenderedQr(page) {
  // Decode the actual viewport raster, not the source SVG or server payload.
  // The screenshot stays in memory and is never persisted as enrollment data.
  const qr = page.getByTestId("two-factor-qr").locator("svg");
  await qr.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }));
  const screenshot = await qr.screenshot();
  const pixels = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    // Normalize a small viewport raster for the independent detector without
    // re-rendering the SVG or changing the application. Preserve captured pixels.
    canvas.width = image.naturalWidth * 2; canvas.height = image.naturalHeight * 2;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height };
  }, screenshot.toString("base64"));
  const decoded = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
  if (!decoded) {
    console.log("[two-factor-browser] QR geometry diagnostic", await qr.evaluate((node) => ({
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      viewport: innerWidth, top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom,
      viewBox: node.getAttribute("viewBox"), fills: [...node.querySelectorAll("path")].map((item) => getComputedStyle(item).fill),
      opacity: getComputedStyle(node).opacity, visibility: getComputedStyle(node).visibility,
      overlays: [0.1, 0.5, 0.9].flatMap((x) => [0.1, 0.5, 0.9].map((y) => {
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
        return node.contains(hit) ? null : { tag: hit?.tagName, className: hit?.getAttribute("class") };
      })).filter(Boolean),
    })));
  }
  assert.ok(decoded?.data?.startsWith("otpauth://totp/"), "Rendered QR independently decodes to TOTP enrollment");
  return decoded.data;
}

async function api(page, route, body) {
  return page.evaluate(async ({ route, body }) => {
    const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sqr_csrf="))?.slice(9);
    const response = await fetch(route, { method: body === undefined ? "GET" : "POST", credentials: "include",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }, { route, body });
}

export async function runTwoFactorBrowser({ baseUrl, username, password, artifactsDir }) {
  assert.equal(new URL(baseUrl).hostname, "127.0.0.1", "Only isolated loopback fixtures allowed");
  const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  const failures = [];
  const externalRequests = [];
  await mkdir(artifactsDir, { recursive: true });
  const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  let page;
  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, serviceWorkers: "block" });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseUrl || ["data:", "blob:"].includes(url.protocol)) return route.continue();
      externalRequests.push(url.origin); return route.abort();
    });
    const result = await context.newPage();
    result.setDefaultTimeout(15_000);
    result.on("pageerror", () => failures.push("Browser runtime error"));
    return result;
  }
  async function passwordLogin(target) {
    await target.goto(`${baseUrl}/login`);
    await target.getByTestId("input-username").fill(username);
    await target.getByTestId("input-password").fill(password);
    const response = target.waitForResponse((item) => new URL(item.url()).pathname === "/api/auth/login" && item.request().method() === "POST");
    await target.getByTestId("input-password").press("Enter");
    const result = await response;
    assert.equal(result.status(), 200, "Real password login succeeds");
    return result.json();
  }
  async function settings(target) {
    await target.goto(`${baseUrl}/settings`);
    // Seeded category IDs are generated database IDs, not the display name.
    await target.getByRole("button", { name: /^Security(?:\s|$)/ }).first().click();
    await target.getByTestId("two-factor-settings").waitFor({ state: "visible" });
  }
  async function layout(state, target = page) {
    const selector = state === "login-challenge" ? ".login-card-form" : '[data-testid="two-factor-settings"]';
    const panel = target.locator(selector);
    for (const width of [320, 360, 390, 430, 768, 1280]) {
      await target.setViewportSize({ width, height: 960 });
      for (const theme of ["light", "dark"]) {
        await target.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
        // Theme transitions are visual, not state races: wait for their finish
        // before measuring contrast (do not disable or override app styling).
        await target.waitForTimeout(400);
        assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${state} has no page overflow at ${width}px`);
        assert.ok(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), `${state} panel fits at ${width}px`);
        const badLabels = await panel.locator("input").evaluateAll((inputs) => inputs.filter((input) => !input.labels?.length && !input.getAttribute("aria-label")).map((input) => input.id));
        assert.deepEqual(badLabels, []);
        // Playwright evaluation runs in the test execution context: no injected
        // script element/TrustedScript policy and no application CSP relaxation.
        if (!(await target.evaluate(() => Boolean(window.axe)))) await target.evaluate(axeSource);
        const violations = await target.evaluate(async (selector) => (await window.axe.run(selector, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        })).violations.map((item) => ({ id: item.id, impact: item.impact,
          targets: item.nodes.map((node) => node.target),
        })), selector);
        assert.deepEqual(violations, [], `${state} ${width}px ${theme}: accessibility`);
        if (state === "scan") {
          const box = await target.getByTestId("two-factor-qr").locator("svg").boundingBox();
          assert.ok(box.width >= 160, `QR needs a usable scanning size at ${width}px`);
          await decodeRenderedQr(target);
        }
        await panel.screenshot({ path: path.join(artifactsDir, `${state}-${width}-${theme}.png`),
          mask: [target.getByTestId("two-factor-qr"), panel.locator("input")] });
      }
    }
    if (["password", "invalid-code", "disable", "login-challenge"].includes(state)) {
      // Approximate the reduced visible area of an open mobile keyboard. This
      // is viewport/focus coverage, not a claim to drive a physical OS keyboard.
      for (const width of [320, 390]) {
        await target.setViewportSize({ width, height: 420 });
        await target.waitForTimeout(400);
        for (const input of await panel.locator("input:not([readonly]):not([disabled])").all()) {
          await input.evaluate((node) => {
            node.blur();
            node.focus();
            node.scrollIntoView({ block: "center", behavior: "instant" });
          });
          const reachable = await input.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return document.activeElement === node && box.top >= 0 && box.bottom <= innerHeight
              // PasswordInput intentionally overlays its visibility button on
              // the right. Hit-test the editable text area, not that control.
              && document.elementFromPoint(box.left + Math.min(32, box.width / 4), box.top + box.height / 2) === node;
          });
          if (!reachable) {
            await target.screenshot({ path: path.join(artifactsDir, `${state}-${width}-keyboard-failure.png`),
              mask: [target.getByTestId("two-factor-qr"), target.locator("input")] });
            console.log("[two-factor-browser] Focus geometry diagnostic", await input.evaluate((node) => {
              const box = node.getBoundingClientRect();
              const hit = document.elementFromPoint(box.left + Math.min(32, box.width / 4), box.top + box.height / 2);
              return { top: box.top, bottom: box.bottom, viewportHeight: innerHeight,
                focused: document.activeElement === node, overlayTag: hit?.tagName, overlayClass: hit?.getAttribute("class") };
            }));
          }
          assert.ok(reachable, `${state}: focused input stays reachable at ${width}x420 without sticky-control overlap`);
        }
      }
    }
    await target.setViewportSize({ width: 1280, height: 960 });
    console.log(`[two-factor-browser] PASS ${state}: six widths, light/dark, accessibility, redacted screenshots`);
  }
  async function startSetup(checkPasswordLayout = false) {
    const panel = page.getByTestId("two-factor-settings");
    const start = panel.getByRole("button", { name: /^(Aktifkan 2FA|Mulakan semula persediaan)$/ });
    await start.focus();
    await start.press("Enter");
    assert.ok(await panel.locator("#my-account-two-factor-password").evaluate((input) => document.activeElement === input), "Password step receives keyboard focus");
    if (checkPasswordLayout) await layout("password");
    await panel.locator("#my-account-two-factor-password").fill(password);
    const response = page.waitForResponse((item) => new URL(item.url()).pathname === "/api/auth/two-factor/setup" && item.request().method() === "POST");
    await panel.locator("#my-account-two-factor-password").press("Enter");
    const result = await response;
    assert.equal(result.status(), 200, "Actual setup API accepts current password");
    const body = await result.json();
    await page.getByTestId("two-factor-qr").waitFor({ state: "visible" });
    const uri = await decodeRenderedQr(page);
    assert.ok(uri === body.setup.otpauthUrl, "Rendered QR preserves the exact server-issued URI");
    assert.ok(new URL(uri).searchParams.get("secret") === body.setup.secret, "QR and manual secret match");
    assert.equal(body.user.twoFactorEnabled, false, "Setup alone does not enable protection");
    assert.equal(body.user.twoFactorPendingSetup, true);
    const stores = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    assert.ok(!stores.includes(body.setup.secret) && !stores.includes(uri), "Enrollment secrets are not persisted");
    return uri;
  }
  async function enable(uri) {
    const panel = page.getByTestId("two-factor-settings");
    await panel.getByRole("button", { name: "Saya sudah tambah akaun", exact: true }).click();
    assert.ok(await panel.locator("#my-account-two-factor-code").evaluate((input) => document.activeElement === input), "Code step receives keyboard focus");
    await panel.locator("#my-account-two-factor-code").fill(authenticatorCode(uri));
    const response = page.waitForResponse((item) => new URL(item.url()).pathname === "/api/auth/two-factor/enable" && item.request().method() === "POST");
    await panel.locator("#my-account-two-factor-code").press("Enter");
    assert.equal((await response).status(), 200, "Independent authenticator code activates actual backend");
    await page.locator('[data-two-factor-state="active"]').waitFor();
    assert.equal(await page.getByTestId("two-factor-qr").count(), 0, "Confirmed enrollment clears QR");
  }
  try {
    page = await newPage();
    const initial = await passwordLogin(page);
    assert.ok(!initial.twoFactorRequired, "Non-2FA login remains available");
    await settings(page);
    await layout("off");
    const firstUri = await startSetup(true);
    await layout("scan");
    const panel = page.getByTestId("two-factor-settings");
    await panel.getByRole("button", { name: "Tak dapat imbas kod QR? Papar kunci persediaan", exact: true }).click();
    assert.ok(await page.locator("#my-account-two-factor-secret").inputValue() === new URL(firstUri).searchParams.get("secret"));
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    await panel.getByRole("button", { name: "Salin kunci", exact: true }).click();
    assert.ok(await page.evaluate(() => navigator.clipboard.readText()) === new URL(firstUri).searchParams.get("secret"), "Manual key copy uses the exact current enrollment");
    await layout("manual");
    await panel.getByRole("button", { name: "Saya sudah tambah akaun", exact: true }).click();
    const currentCodes = [-1, 0, 1].map((step) => authenticatorCode(firstUri, Date.now() + step * 30_000));
    const wrong = ["000000", "111111", "222222", "333333"].find((code) => !currentCodes.includes(code));
    await panel.locator("#my-account-two-factor-code").fill(wrong);
    await panel.getByRole("button", { name: "Sahkan dan aktifkan 2FA", exact: true }).click();
    await panel.getByRole("alert").filter({ hasText: "Kod pengesah tidak betul" }).waitFor();
    assert.equal((await api(page, "/api/auth/two-factor")).body.twoFactor.enabled, false);
    await layout("invalid-code");
    await panel.getByRole("button", { name: "Kembali ke kod QR", exact: true }).click();
    await enable(firstUri);
    await layout("active");
    // Honour the existing single-superuser-session policy, just as a person
    // logs out before testing a fresh login. Never weaken it for the fixture.
    assert.equal((await api(page, "/api/activity/logout", {})).status, 200, "Initial enrollment session logs out");

    const loginPage = await newPage();
    const challenge = await passwordLogin(loginPage);
    assert.equal(challenge.twoFactorRequired, true);
    await loginPage.getByTestId("input-two-factor-code").waitFor();
    await layout("login-challenge", loginPage);
    assert.equal((await api(loginPage, "/api/auth/me")).status, 401, "Password challenge has no authenticated session");
    assert.ok(!(await loginPage.context().cookies()).some((cookie) => cookie.name === "sqr_auth"), "No session cookie before OTP");
    await loginPage.getByTestId("input-two-factor-code").fill(authenticatorCode(firstUri));
    const verified = loginPage.waitForResponse((item) => new URL(item.url()).pathname === "/api/auth/verify-two-factor-login");
    await loginPage.getByTestId("button-login").click();
    assert.equal((await verified).status(), 200, "First 2FA login creates a session");
    assert.equal((await api(loginPage, "/api/auth/me")).status, 200);
    const cookie = (await loginPage.context().cookies()).find((item) => item.name === "sqr_auth");
    assert.ok(cookie?.httpOnly, "Real session remains HttpOnly");
    await page.context().close(); page = loginPage;
    await settings(page);
    await page.getByRole("button", { name: "Nyahaktifkan 2FA", exact: true }).click();
    await layout("disable");
    await page.locator("#my-account-two-factor-password").fill(password);
    await page.locator("#my-account-two-factor-code").fill(authenticatorCode(firstUri));
    const disabled = page.waitForResponse((item) => new URL(item.url()).pathname === "/api/auth/two-factor/disable");
    await page.getByRole("button", { name: "Sahkan nyahaktifkan", exact: true }).click();
    assert.equal((await disabled).status(), 200);
    await page.locator('[data-two-factor-state="off"]').waitFor();
    const disabledStatus = await api(page, "/api/auth/two-factor");
    assert.deepEqual(disabledStatus.body.twoFactor, { enabled: false, pendingSetup: false, configuredAt: null });
    const secondUri = await startSetup();
    assert.ok(firstUri !== secondUri, "Re-enrollment rotates the secret");
    await enable(secondUri);
    assert.equal((await api(page, "/api/activity/logout", {})).status, 200, "Re-enrollment session logs out");
    const finalPage = await newPage();
    assert.equal((await passwordLogin(finalPage)).twoFactorRequired, true);
    await finalPage.getByTestId("input-two-factor-code").fill(authenticatorCode(secondUri));
    const finalVerified = finalPage.waitForResponse((item) => new URL(item.url()).pathname === "/api/auth/verify-two-factor-login");
    await finalPage.getByTestId("button-login").click();
    assert.equal((await finalVerified).status(), 200, "Re-enrolled authenticator supports fresh login");
    assert.deepEqual(failures, []);
    assert.deepEqual(externalRequests, [], "No external requests including QR exfiltration");
    console.log("[two-factor-browser] PASS actual built app + PostgreSQL setup, invalid OTP, independently decoded QR/code, login gate, disable and re-enable; no API mocks");
  } finally {
    await browser.close();
  }
}
