import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";
import { startVisualBuiltServer } from "./test-visual-built.mjs";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import { authV17Viewports, authV17FixtureIdentity, createAuthV17Fixture } from "./lib/auth-v17-browser-fixture.mjs";

// Actual emitted React/Vite application and CSS; HTTP responses are explicit
// synthetic TEST FIXTURES. No real authentication, email, server, .env or DB.
// No external base URL is accepted: every request is confined to loopback.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(root, "artifacts/auth-v17-browser");
const args = process.argv.slice(2);
assert.ok(args.every((arg) => ["--reference", "--reference-only"].includes(arg)), "Only --reference and --reference-only are supported.");
const checks = [];
const failures = [];
const screenshots = [];
const pass = (value) => { checks.push(value); console.log(`[auth-v17-browser] PASS ${value}`); };
let activePage;
let browser;
let server;
let phase = "startup";
const axe = await fs.readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
await fs.mkdir(artifacts, { recursive: true });

async function capture(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow.`);
  // Never capture entered passwords or codes, even though these are fixtures.
  const sensitive = page.locator('input[type="password"], input[autocomplete="one-time-code"], input[autocomplete="new-password"], input[name="password"]');
  const masks = [];
  for (const field of await sensitive.all()) if (await field.inputValue()) masks.push(field);
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(artifacts, filename), fullPage: true, animations: "disabled", caret: "hide", mask: masks });
  screenshots.push(filename);
}

async function accessibility(page, label) {
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
  })).violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(({ target }) => target) })));
  if (violations.length) {
    failures.push({ phase, accessibility: label, violations });
    console.error(`[auth-v17-browser] A11Y ${label}: ${JSON.stringify(violations)}`);
  }
}

async function captureReference() {
  // The original supplied prototype is rendered for comparison ONLY. We never
  // submit its demo forms and never copy its simulated authentication logic.
  const referenceRoot = path.join(root, "artifacts/auth-v17-reference/reference");
  const files = new Map([
    ["/", ["SQR_ENTERPRISE_AUTH_UI_V17_FIXED.html", "text/html"]],
    ["/assets/sqr-illustration.webp", ["assets/sqr-illustration.webp", "image/webp"]],
    ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
    ["/assets/apple-touch-icon.png", ["assets/apple-touch-icon.png", "image/png"]],
  ]);
  for (const [file] of files.values()) await fs.access(path.join(referenceRoot, file));
  const referenceServer = createServer(async (request, response) => {
    const file = files.get(new URL(request.url, "http://fixture.invalid").pathname);
    if (request.method !== "GET" || !file) return void response.writeHead(404).end();
    try { response.writeHead(200, { "Content-Type": file[1] }).end(await fs.readFile(path.join(referenceRoot, file[0]))); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { referenceServer.once("error", reject); referenceServer.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${referenceServer.address().port}`;
  const context = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" });
  try {
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin && route.request().method() === "GET" ? route.continue() : route.abort());
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    await page.goto(origin);
    for (const locale of ["ms", "en"]) {
      await page.getByRole("button", { name: locale === "en" ? "English" : "Bahasa Melayu", exact: true }).click();
      for (const viewport of authV17Viewports) {
        await page.setViewportSize(viewport);
        await capture(page, `reference-login-${locale}-${viewport.width}x${viewport.height}`);
      }
    }
    pass("supplied reference rendered at all 10 viewports in BM/EN without submitting demo forms");
  } finally {
    await context.close();
    await new Promise((resolve) => { referenceServer.close(resolve); referenceServer.closeAllConnections(); });
  }
}

async function verifyLoginResourceHints() {
  // A cold, isolated context proves the artwork is discovered from the built
  // resource hints, not from a cached stylesheet or an already-mounted login.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const fixture = createAuthV17Fixture(server.origin);
  const requests = [];
  const finished = new Set();
  const errors = [];
  const heldRequests = [];
  let releaseLogin;
  const loginGate = new Promise((resolve) => { releaseLogin = resolve; });
  const loginScriptPattern = /^\/assets\/Login-[A-Za-z0-9_-]+\.js$/;
  const privateAssetPattern = /^\/assets\/(?:AuthenticatedAppEntry|AuthenticatedAppShell|AppQueryProvider|Home|Import|Saved|Viewer|GeneralSearch|CollectionReport|BillingPrincipalReportPage|Settings|SystemMonitorLayout|Activity|Analysis|AI|BackupRestore|query|charts|pdf|excel|capture)-/;
  await context.route("**/*", (route) => {
    if (!loginScriptPattern.test(new URL(route.request().url()).pathname)) return fixture.route(route);
    const held = loginGate.then(() => fixture.route(route));
    heldRequests.push(held);
    return held;
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("requestfinished", (request) => finished.add(new URL(request.url()).pathname));
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    // Do not wait for load: the intentionally held Login chunk must not execute
    // until its image and stylesheet preloads have already completed.
    await page.goto(`${server.origin}/login`, { waitUntil: "commit" });
    await expect(page.locator('meta[name="sqr-login-image"]')).toHaveCount(1);
    const hints = await page.locator('meta[name="sqr-login-script"], meta[name="sqr-login-style"], meta[name="sqr-login-image"]').evaluateAll((elements) => elements.map((element) => ({ name: element.getAttribute("name"), href: element.getAttribute("content") })));
    const scripts = hints.filter((hint) => hint.name === "sqr-login-script");
    const styles = hints.filter((hint) => hint.name === "sqr-login-style");
    const image = hints.find((hint) => hint.name === "sqr-login-image");
    assert.equal(scripts.filter((hint) => loginScriptPattern.test(hint.href)).length, 1, "The emitted Login module is hinted exactly once.");
    assert.ok(styles.length > 0, "Login's emitted stylesheet closure is hinted.");
    assert.match(image.href, /^\/assets\/sqr-illustration-[A-Za-z0-9_-]+\.webp$/);
    assert.equal(new Set(hints.map((hint) => hint.href)).size, hints.length, "Login resource hints are deduplicated.");
    assert.ok(hints.every((hint) => !privateAssetPattern.test(hint.href)), "Hints include only public Login dependencies, not authenticated or heavy feature chunks.");
    assert.equal(scripts.filter((hint) => /^\/assets\/public-auth-runtime-/.test(hint.href)).length, 1, "Login helpers stay in a lazy, route-hinted chunk, not the shared HTML entry.");
    assert.ok(scripts.length <= 12, "Login's shared helpers/icons must not regress into a long queue of tiny requests.");

    await expect.poll(() => heldRequests.length).toBe(1);
    await expect.poll(() => hints.every((hint) => requests.includes(hint.href))).toBe(true);
    await expect.poll(() => [image, ...styles].every((hint) => finished.has(hint.href))).toBe(true);
    await expect(page.locator(".auth-v17")).toHaveCount(0);
    await expect(page.getByTestId("input-username")).toHaveCount(0);
    for (const hint of hints) {
      // Vite may already add its real stylesheet while the Login module is
      // held. That is distinct from our inert preload, not a duplicate hint.
      const relation = hint.name === "sqr-login-script" ? "modulepreload" : "preload";
      const link = page.locator(`head link[rel="${relation}"][href="${hint.href}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("fetchpriority", "high");
      await expect(link).toHaveAttribute("rel", relation);
      if (hint.name === "sqr-login-image") {
        await expect(link).toHaveAttribute("as", "image");
        assert.equal(await link.getAttribute("crossorigin"), null, "CSS background preload must keep no-CORS mode.");
      } else {
        await expect(link).toHaveAttribute("crossorigin", "anonymous");
        if (hint.name === "sqr-login-style") await expect(link).toHaveAttribute("as", "style");
      }
    }

    releaseLogin();
    await expect(page.getByTestId("input-username")).toBeVisible();
    await page.waitForLoadState("load");
    const background = await page.locator(".auth-v17-art").evaluate((element) => getComputedStyle(element, "::before").backgroundImage);
    assert.ok(background.includes(image.href), "The early image is the exact background used by the mounted V17 login.");
    assert.equal(requests.filter((href) => href === image.href).length, 1, "Mounting Login reuses the image preload without a duplicate CORS fetch.");
    assert.deepEqual(requests.filter((href) => privateAssetPattern.test(href)), [], "Anonymous login does not fetch authenticated shells or heavy private features.");
    assert.deepEqual(fixture.state.unexpected, [], "Resource hints stay within the isolated public API boundary.");
    assert.deepEqual(errors, [], "Preloading must not introduce module or runtime errors.");
    pass("cold login preloads exact artwork, scripts and styles before lazy mount, without duplicate image fetch or private chunks");
  } finally {
    releaseLogin();
    await Promise.allSettled(heldRequests);
    await context.close();
  }
}

try {
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  if (args.includes("--reference") || args.includes("--reference-only")) await captureReference();
  if (args.includes("--reference-only")) {
    await fs.writeFile(path.join(artifacts, "reference-report.json"), JSON.stringify({ status: "PASS", boundary: "supplied visual reference only, no demo form submitted", viewports: authV17Viewports, screenshots }, null, 2));
  } else {
  server = await startVisualBuiltServer(path.join(root, "dist-local/public"));
  phase = "cold login resource hints";
  await verifyLoginResourceHints();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const fixture = createAuthV17Fixture(server.origin);
  await context.route("**/*", fixture.route);
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.addInitScript(() => { localStorage.setItem("theme", "light"); });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => failures.push({ phase, message: error.message }));
  page.on("response", (response) => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith("/api/")) failures.push({ phase, asset: new URL(response.url()).pathname, status: response.status() });
  });
  const login = async () => {
    await page.goto(`${server.origin}/login`);
    await expect(page.getByTestId("input-username")).toBeVisible();
    await expect(page.locator(".auth-v17")).toBeVisible();
  };
  const fillLogin = async () => {
    await page.getByTestId("input-username").fill(authV17FixtureIdentity.username);
    await page.getByTestId("input-password").fill(authV17FixtureIdentity.password);
  };
  const switchLanguage = async (locale) => {
    await page.getByRole("button", { name: locale === "en" ? "English" : "Bahasa Melayu", exact: true }).click();
    await expect(page.locator(".auth-v17")).toHaveAttribute("lang", locale);
  };
  const startMfa = async () => {
    fixture.state.login = "mfa";
    await login(); await fillLogin(); await page.getByTestId("button-login").click();
    await expect(page.getByTestId("input-two-factor-code")).toBeVisible();
  };

  phase = "responsive login";
  await login();
  for (const locale of ["ms", "en"]) {
    // Establish the saved preference before mounting, preserving the initial
    // neutral form instead of blurring its auto-focused empty username.
    await page.evaluate((selectedLocale) => localStorage.setItem("sqr.auth.locale", selectedLocale), locale);
    await login();
    await expect(page.locator(".auth-v17")).toHaveAttribute("lang", locale);
    for (const viewport of authV17Viewports) {
      await page.setViewportSize(viewport);
      const label = `login-${locale}-${viewport.width}x${viewport.height}`;
      await capture(page, label);
      const button = await page.getByTestId("button-login").boundingBox();
      assert.ok(button && button.height >= 44, `${label}: usable sign-in touch target.`);
      if (viewport.width === 1366) assert.ok(button.y + button.height <= viewport.height, "Priority office viewport: sign-in is visible without scrolling.");
      await expect(page.getByTestId("input-password")).toHaveAttribute("autocomplete", "current-password");
      await expect(page.getByTestId("input-username")).toHaveAttribute("autocomplete", "username");
      pass(label);
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await accessibility(page, "login desktop");
  assert.equal(await page.getByRole("checkbox").count(), 0, "Unsupported trusted-device persistence is not advertised.");
  assert.equal(await page.getByText(/recovery code|kod pemulihan/i).count(), 0, "Unsupported recovery-code authentication is not advertised.");

  phase = "login fields and language preservation";
  const beforeEmpty = fixture.state.counts.login;
  await page.getByTestId("button-login").click();
  await expect(page.getByTestId("input-username")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("input-password")).toHaveAttribute("aria-invalid", "true");
  assert.equal(fixture.state.counts.login, beforeEmpty);
  await fillLogin();
  await switchLanguage("ms"); await switchLanguage("en");
  assert.equal(await page.getByTestId("input-username").inputValue() === authV17FixtureIdentity.username, true);
  assert.equal(await page.getByTestId("input-password").inputValue() === authV17FixtureIdentity.password, true);
  const toggle = page.locator('button[aria-controls="login-password"]');
  await toggle.click(); await expect(page.getByTestId("input-password")).toHaveAttribute("type", "text");
  await toggle.click(); await expect(page.getByTestId("input-password")).toHaveAttribute("type", "password");
  await page.getByTestId("input-password").evaluate((element) => element.dispatchEvent(new KeyboardEvent("keydown", { key: "A", bubbles: true, modifierCapsLock: true })));
  await expect(page.getByText(/Caps Lock/i).first()).toBeVisible();
  await page.getByTestId("input-password").evaluate((element) => element.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true, modifierCapsLock: false })));
  pass("required fields, password-manager attributes, visibility, Caps Lock and locale switch preserve values");
  await context.setOffline(true);
  await expect(page.locator(".auth-v17-offline")).toBeVisible();
  assert.equal(await page.getByTestId("input-password").inputValue() === authV17FixtureIdentity.password, true);
  await capture(page, "login-offline-preserves-values");
  await context.setOffline(false);
  await expect(page.locator(".auth-v17-offline")).toHaveCount(0);
  pass("browser offline/online events preserve entered values without creating an authenticated session");

  phase = "pending and invalid login";
  let releaseLogin;
  fixture.state.loginGate = new Promise((resolve) => { releaseLogin = resolve; });
  const beforePending = fixture.state.counts.login;
  try {
    await page.getByTestId("input-password").press("Enter");
    await expect.poll(() => fixture.state.counts.login).toBe(beforePending + 1);
    await expect(page.getByTestId("button-login")).toBeDisabled();
    await page.locator("form").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(fixture.state.counts.login, beforePending + 1, "Repeated submits cannot duplicate pending requests.");
    await capture(page, "login-pending");
  } finally { releaseLogin(); fixture.state.loginGate = null; }
  await expect(page.locator("[role=alert]").filter({ hasText: /invalid|incorrect|tidak sah|tidak betul/i }).first()).toBeVisible();
  await capture(page, "login-invalid");
  pass("keyboard submit, real API payload boundary, duplicate prevention and invalid credentials");

  for (const outcome of ["limited", "locked", "disabled", "captcha", "network", "server"]) {
    phase = `login ${outcome}`; fixture.state.login = outcome;
    await login(); await fillLogin(); await page.getByTestId("button-login").click();
    await expect(page.locator("[role=alert]").first()).toBeVisible();
    if (["limited", "locked"].includes(outcome)) await expect(page.locator(".auth-v17")).toContainText(/60|59|58/);
    if (outcome === "locked") await expect(page.getByTestId("button-login")).toBeDisabled();
    if (outcome === "captcha") {
      await expect(page.getByTestId("input-captcha-response")).toBeVisible();
      await expect(page.locator("#login-captcha-help")).toContainText("2 + 3 = ?");
      const beforeCaptcha = fixture.state.counts.login;
      await page.getByTestId("button-login").click();
      await expect(page.getByTestId("input-captcha-response")).toHaveAttribute("aria-invalid", "true");
      assert.equal(fixture.state.counts.login, beforeCaptcha);
    }
    assert.equal(await page.evaluate(() => sessionStorage.getItem("user")), null, `${outcome}: no authenticated session is created.`);
    await capture(page, `login-${outcome}`);
    pass(`${outcome} is driven by the API fixture response, without authentication bypass`);
  }

  phase = "session-expired notice";
  await page.evaluate(() => sessionStorage.setItem("auth_notice", JSON.stringify({ message: "Session expired. Please sign in again." })));
  await login();
  await expect(page.locator("[role=status]").filter({ hasText: /session expired|sesi.*tamat/i }).first()).toBeVisible();
  assert.equal(await page.evaluate(() => sessionStorage.getItem("auth_notice")), null);
  await capture(page, "login-session-expired");
  pass("existing one-time session-expired notice is displayed and consumed");

  phase = "MFA paste and native navigation";
  await startMfa();
  const otp = page.getByTestId("input-two-factor-code");
  await expect(otp).toHaveAttribute("inputmode", "numeric");
  await expect(otp).toHaveAttribute("autocomplete", "one-time-code");
  await expect(page.locator(".auth-v17-otp__slot")).toHaveCount(6);
  await expect(page.getByTestId("button-login")).toBeDisabled();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("123456"));
  await otp.focus(); await page.keyboard.press("Control+V");
  await expect(otp).toHaveValue("123456");
  await otp.press("ArrowLeft");
  assert.equal(await otp.evaluate((element) => element.selectionStart), 5);
  await otp.press("Backspace"); await expect(otp).toHaveValue("12346");
  await otp.press("End"); await otp.press("Backspace"); await expect(otp).toHaveValue("1234");
  await otp.fill("123456"); await switchLanguage("ms"); await switchLanguage("en");
  await expect(otp).toHaveValue("123456");
  await expect(page.getByTestId("button-login")).toBeEnabled();
  // Empty the synthetic value for layout evidence so the six native-backed
  // decorative slots remain inspectable rather than hidden by the safety mask.
  await otp.fill("");
  for (const viewport of authV17Viewports) {
    await page.setViewportSize(viewport);
    await capture(page, `mfa-${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await accessibility(page, "MFA mobile");
  await otp.fill("123456");
  await page.getByTestId("button-login").click();
  await expect(page.locator("[role=alert]").first()).toBeVisible();
  await expect(otp).toBeVisible();
  await capture(page, "mfa-invalid");
  fixture.state.verify = "TWO_FACTOR_CHALLENGE_EXPIRED";
  await otp.fill("654321"); await page.getByTestId("button-login").click();
  await expect(page.getByTestId("input-password")).toBeVisible();
  await expect(otp).toHaveCount(0);
  await capture(page, "mfa-expired");
  pass("MFA uses real challenge contract, paste/arrows/backspace, all viewports, invalid and expired challenge states");

  phase = "forgot password";
  await page.goto(`${server.origin}/forgot-password`);
  await expect(page.locator("#forgot-password-identifier")).toBeVisible();
  await switchLanguage("en");
  await page.locator("#forgot-password-identifier").fill(authV17FixtureIdentity.username);
  await switchLanguage("ms");
  await expect(page.locator("#forgot-password-identifier")).toHaveValue(authV17FixtureIdentity.username);
  await capture(page, "forgot-ready-mobile"); await accessibility(page, "forgot mobile");
  let releaseForgot;
  fixture.state.forgotGate = new Promise((resolve) => { releaseForgot = resolve; });
  try {
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("#forgot-password-identifier")).toBeDisabled();
    await capture(page, "forgot-pending");
  } finally { releaseForgot(); fixture.state.forgotGate = null; }
  await expect(page.locator(".public-auth-status-card--success")).toBeVisible();
  await capture(page, "forgot-generic-success");
  fixture.state.forgot = "limited";
  await page.goto(`${server.origin}/forgot-password`);
  await page.locator("#forgot-password-identifier").fill(authV17FixtureIdentity.username);
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator("[role=alert]").first()).toBeVisible();
  await capture(page, "forgot-rate-limited");
  pass("forgot password retains identifier, sends request and shows generic success/server rate limiting");

  phase = "reset token and password";
  const resetUrl = `${server.origin}/reset-password?token=${authV17FixtureIdentity.token}`;
  await page.goto(resetUrl);
  const newPassword = page.locator("#reset-password-new-password");
  const confirmation = page.locator("#reset-password-confirm-password");
  await expect(newPassword).toBeVisible();
  await capture(page, "reset-ready-mobile"); await accessibility(page, "reset mobile");
  await newPassword.fill(authV17FixtureIdentity.password);
  await confirmation.fill("FixtureMismatch1!");
  const beforeReset = fixture.state.counts.reset;
  await page.locator('form button[type="submit"]').click();
  await expect(confirmation).toHaveAttribute("aria-invalid", "true");
  assert.equal(fixture.state.counts.reset, beforeReset);
  await confirmation.fill(authV17FixtureIdentity.password);
  await switchLanguage("en");
  assert.equal(await newPassword.inputValue() === authV17FixtureIdentity.password, true);
  assert.equal(await confirmation.inputValue() === authV17FixtureIdentity.password, true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await capture(page, "reset-ready-desktop");
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator(".public-auth-status-card--success")).toBeVisible();
  await capture(page, "reset-success");
  assert.equal(fixture.state.counts.reset, beforeReset + 1);
  fixture.state.resetToken = "invalid";
  await page.goto(resetUrl);
  await expect(page.locator("[role=alert]").first()).toBeVisible();
  await expect(newPassword).toHaveCount(0);
  await capture(page, "reset-invalid-or-expired");
  pass("reset token is validated at API boundary; mismatch rejected, values preserved across language, reset success/invalid rendered");
  await page.goto(`${server.origin}/reset-password`);
  await expect(page.locator("[role=alert]").first()).toBeVisible();
  await expect(newPassword).toHaveCount(0);
  pass("missing reset token cannot open the password mutation form");

  phase = "strict CSP and Trusted Types";
  const strictPage = await context.newPage();
  const cspViolations = [];
  strictPage.on("pageerror", (error) => failures.push({ phase, message: error.message }));
  await strictPage.exposeFunction("recordAuthV17CspViolation", (value) => cspViolations.push(value));
  await strictPage.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => {
    window.recordAuthV17CspViolation(`${event.effectiveDirective}: ${event.blockedURI}`);
  }));
  await strictPage.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    return route.fulfill({ response, headers: { ...response.headers(),
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'",
    } });
  });
  await strictPage.goto(`${server.origin}/login`);
  await expect(strictPage.getByTestId("input-username")).toBeVisible();
  await strictPage.getByRole("button", { name: "English", exact: true }).click();
  await expect(strictPage.locator(".auth-v17")).toHaveAttribute("lang", "en");
  await strictPage.goto(`${server.origin}/forgot-password`);
  await expect(strictPage.locator("#forgot-password-identifier")).toBeVisible();
  fixture.state.resetToken = "valid";
  await strictPage.goto(resetUrl);
  await expect(strictPage.locator("#reset-password-new-password")).toBeVisible();
  assert.deepEqual(cspViolations, [], "Auth pages do not need inline script/style or a Trusted Types relaxation.");
  await strictPage.close();
  pass("login, language controls, recovery and reset work under strict script/style CSP and Trusted Types");

  assert.deepEqual(fixture.state.unexpected, [], "All requests remain within the explicitly isolated API contract.");
  assert.deepEqual(failures, [], "No uncaught page errors or failed assets.");
  await fs.writeFile(path.join(artifacts, "report.json"), JSON.stringify({ status: "PASS", boundary: "static loopback production build with synthetic HTTP fixtures; not live backend E2E", viewports: authV17Viewports, checks, screenshots, counts: fixture.state.counts, failures }, null, 2));
  console.log(`AUTH_V17_BUILT_PASS (${checks.length} checks)`);
  await context.close();
  }
} catch (error) {
  if (activePage) await capture(activePage, "failure").catch(() => {});
  await fs.writeFile(path.join(artifacts, "failure-report.json"), JSON.stringify({ status: "FAIL", phase, checks, screenshots, message: error.message, failures }, null, 2));
  console.error(`[auth-v17-browser] FAIL ${phase}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
