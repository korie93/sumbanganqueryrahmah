import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Browser UI contract only: real React components/generated fallback files and
// synthetic health responses, not a substitute for the separate Nginx HTTP test.
// No app server, .env, database, real users or production requests are involved.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "scripts/fixtures/system-status-ui.jsx").replaceAll("\\", "/");
const artifactDir = path.join(rootDir, "artifacts/system-status-browser");
const widths = [320, 360, 390, 430, 768, 1024, 1440];
const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const externalRequests = [];
const unexpectedApiRequests = [];
const pageErrors = [];
const screenshots = [];
const checks = [];
const apiCounts = { health: 0, maintenance: 0 };
let scenario = "unavailable";
let releaseHealth = null;
let browser;
let page;
let context;
let origin;
let failureCount = 0;

const server = await createServer({
  configFile: false, envFile: false, envDir: false,
  root: path.join(rootDir, "client"),
  define: { __SQR_CLIENT_RELEASE_SHA__: JSON.stringify("") },
  resolve: { alias: { "@": path.join(rootDir, "client/src"), "@shared": path.join(rootDir, "shared") } },
  server: { host: "127.0.0.1", port: 0, strictPort: true, fs: { allow: [rootDir] } },
  logLevel: "error",
  plugins: [react(), {
    name: "isolated-system-status-documents",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, "http://fixture.invalid").pathname;
        const staticMatch = /^\/static\/(502|503|504|maintenance)$/.exec(pathname);
        const assetMatch = /^\/_sqr\/errors\/assets\/(status\.css|status\.js|sqr-logo\.svg)$/.exec(pathname);
        try {
          if (staticMatch) {
            // Deliberately simulated status; actual Nginx semantics are tested separately.
            response.statusCode = staticMatch[1] === "maintenance" ? 503 : Number(staticMatch[1]);
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(await readFile(path.join(rootDir, "deploy/errors", `${staticMatch[1]}.html`)));
            return;
          }
          if (assetMatch) {
            const type = assetMatch[1].endsWith(".css") ? "text/css" : assetMatch[1].endsWith(".js") ? "text/javascript" : "image/svg+xml";
            response.setHeader("Content-Type", type);
            response.end(await readFile(path.join(rootDir, "deploy/errors/assets", assetMatch[1])));
            return;
          }
          if (pathname !== "/") return next();
          const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SQR synthetic status verification</title></head><body><div id="root"></div><script type="module" src="/@fs/${fixturePath}"></script></body></html>`);
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(html);
        } catch (error) { next(error); }
      });
    },
  }],
});

async function routeRequests(route) {
  const url = new URL(route.request().url());
  if (url.origin !== origin) { externalRequests.push(url.origin + url.pathname); return route.abort(); }
  if (!url.pathname.startsWith("/api/")) return route.continue();
  assert.equal(route.request().method(), "GET", "Recovery must never repeat a write request.");
  if (url.pathname === "/api/health/live") {
    apiCounts.health++;
    const mode = scenario;
    if (mode === "delayed") await new Promise((resolve) => { releaseHealth = resolve; });
    if (mode === "unavailable") return route.fulfill({ status: 503, json: { ready: false } });
    if (mode === "malformed") return route.fulfill({ status: 200, contentType: "application/json", body: "not-json" });
    if (mode === "oversized") return route.fulfill({ status: 200, json: { ready: true, padding: "x".repeat(17_000) } });
    if (mode === "html") return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Not proof of service health</h1>" });
    if (mode === "not-ready") return route.fulfill({ status: 200, json: { ready: false } });
    return route.fulfill({ status: 200, json: { ready: true } }).catch(() => {});
  }
  if (url.pathname === "/api/maintenance-status") {
    apiCounts.maintenance++;
    if (scenario === "malformed-maintenance") return route.fulfill({ contentType: "application/json", body: "not-json" });
    if (scenario === "invalid-maintenance") return route.fulfill({ json: { maintenance: "false" } });
    if (scenario === "html-maintenance") return route.fulfill({ contentType: "text/html", body: "<h1>Not service status</h1>" });
    return route.fulfill({ json: {
      maintenance: scenario === "maintenance" || scenario === "eta", type: "hard",
      message: scenario === "eta" ? "Penyelenggaraan contoh untuk pengesahan paparan sahaja." : "",
      startTime: null, endTime: scenario === "eta" ? "2030-09-19T12:30:00Z" : null,
    } });
  }
  unexpectedApiRequests.push(url.pathname);
  return route.abort();
}

async function navigate(kind, state, width = 390, theme = "light", auth = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
  const query = new URLSearchParams({ state, theme, auth: String(auth) });
  const response = await page.goto(`${origin}${kind === "static" ? `/static/${state}` : "/"}?${query}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  assert.equal(response.status(), kind === "static" ? state === "maintenance" ? 503 : Number(state) : 200);
  await page.getByTestId("system-status-page").waitFor({ state: "visible" });
  await page.locator(".sqr-status__brand img").evaluate((image) => image.decode());
  assert.equal(await page.getByTestId("system-status-page").getAttribute("data-state"), state);
}

async function capture(name) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true, animations: "disabled" });
  screenshots.push(`${name}.png`);
}

async function assertLayout(kind, state, width, theme) {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector("[data-testid=system-status-page]");
    const visible = [...main.querySelectorAll("h1,h2,p,button,a,footer,[data-status-code],.sqr-status__badge,.sqr-status__guidance")]
      .filter((element) => element.getClientRects().length > 0);
    const overflows = visible.filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({ tag: element.tagName, className: element.className, width: element.clientWidth, scroll: element.scrollWidth }));
    const controls = [...main.querySelectorAll("a,button")].filter((element) => element.getClientRects().length > 0).map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent, width: rect.width, height: rect.height, left: rect.left, right: rect.right };
    });
    const images = [...main.querySelectorAll("img")].map((image) => ({ loaded: image.complete && image.naturalWidth > 0, width: image.width, height: image.height }));
    return { overflows, controls, images, docWidth: document.documentElement.scrollWidth, width: innerWidth,
      h1Count: main.querySelectorAll("h1").length, mainCount: document.querySelectorAll("main").length,
      titleSize: parseFloat(getComputedStyle(main.querySelector("h1")).fontSize),
      frameWidth: main.querySelector(".sqr-status__frame").getBoundingClientRect().width,
      background: getComputedStyle(main).backgroundColor };
  });
  const label = `${kind} ${state} ${width}px ${theme}`;
  assert.deepEqual(geometry.overflows, [], `${label}: content must not clip horizontally.`);
  assert.ok(geometry.docWidth <= geometry.width + 1, `${label}: document overflows.`);
  assert.equal(geometry.h1Count, 1, `${label}: one clear h1.`);
  assert.equal(geometry.mainCount, 1, `${label}: one main landmark.`);
  assert.ok(geometry.titleSize >= 30, `${label}: readable heading size.`);
  assert.ok(geometry.frameWidth <= 1081, `${label}: constrained desktop content.`);
  for (const control of geometry.controls) {
    assert.ok(control.height >= 44 && control.width >= 44, `${label}: comfortable target ${control.text}.`);
    assert.ok(control.left >= -1 && control.right <= width + 1, `${label}: target clipped ${control.text}.`);
  }
  assert.ok(geometry.images.every((item) => item.loaded && item.width === 44 && item.height === 44), `${label}: intact local logo.`);
  assert.equal(geometry.background, theme === "dark" ? "rgb(14, 14, 14)" : "rgb(249, 250, 251)", `${label}: theme respected.`);
  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, /Did you forget|127\.0\.0\.1|PM2|nginx\/\d|node_modules|stack trace/i, `${label}: no internal diagnostics.`);
  await capture(`${kind}-${state}-${width}-${theme}`);
  if (width === 320 || width === 1440) {
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
    assert.deepEqual(results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target) })), [], `${label}: axe accessibility.`);
  }
  checks.push(label);
}

async function focusAndMotion(kind, state) {
  await navigate(kind, state, 390, "dark");
  await page.keyboard.press("Tab");
  const action = page.locator("[data-status-primary]");
  assert.equal(await action.evaluate((element) => element === document.activeElement), true, `${kind}: primary action keyboard reachable.`);
  const outline = await action.evaluate((element) => ({ width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle }));
  assert.ok(parseFloat(outline.width) >= 2 && outline.style !== "none", `${kind}: keyboard focus visible.`);
  await capture(`${kind}-${state}-keyboard-focus`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await action.evaluate((element) => getComputedStyle(element).transitionDuration), "0s", `${kind}: reduced motion disables transitions.`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

async function assertRetry(kind) {
  scenario = "delayed";
  await navigate(kind, "502");
  const initial = { ...apiCounts };
  const action = page.locator("[data-status-primary]");
  await action.click();
  await page.getByText("Menyemak sambungan…", { exact: true }).first().waitFor();
  // Dispatch clicks even when native button is disabled to verify the in-flight
  // guard shared by the React hook and the static anchor enhancement.
  await action.evaluate((element) => { for (let i = 0; i < 6; i++) element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
  assert.equal(apiCounts.health, initial.health + 1, `${kind}: no overlapping retry storm.`);
  assert.equal(apiCounts.maintenance, initial.maintenance);
  assert.equal(await action.getAttribute("aria-busy"), "true");
  assert.ok(releaseHealth, `${kind}: controlled health request is in flight.`);
  releaseHealth(); releaseHealth = null;
  await page.locator('[data-state="restored"]').waitFor();
  assert.equal(apiCounts.maintenance, initial.maintenance + 1);
  assert.equal(await action.getAttribute("href"), "/", `${kind}: recovery uses safe root GET.`);
  assert.equal(await action.innerText(), "Sambung ke SQR");
  assert.ok(page.url().includes(kind === "static" ? "/static/502" : "state=502"), `${kind}: no automatic redirect.`);
  await capture(`${kind}-restored-390-light`);

  for (const mode of ["unavailable", "malformed", "html", "not-ready", "oversized"]) {
    scenario = mode;
    await navigate(kind, "502");
    const before = { ...apiCounts };
    await page.locator("[data-status-primary]").click();
    await page.locator("[data-status-feedback]").filter({ hasText: /belum dapat disahkan/ }).waitFor();
    assert.equal(await page.getByTestId("system-status-page").getAttribute("data-state"), "502");
    assert.equal(apiCounts.health, before.health + 1);
    assert.equal(apiCounts.maintenance, before.maintenance, `${kind}: invalid health cannot trigger recovery.`);
    await page.locator("[data-status-primary]").click();
    await page.getByText("Tunggu sebentar sebelum menyemak semula.", { exact: true }).waitFor();
    assert.equal(apiCounts.health, before.health + 1, `${kind}: cooldown throttles fast repeat.`);
  }
  for (const mode of ["malformed-maintenance", "invalid-maintenance", "html-maintenance"]) {
    scenario = mode;
    await navigate(kind, "502");
    const before = { ...apiCounts };
    await page.locator("[data-status-primary]").click();
    await page.locator("[data-status-feedback]").filter({ hasText: /belum dapat disahkan/ }).waitFor();
    assert.equal(await page.getByTestId("system-status-page").getAttribute("data-state"), "502", `${kind}: invalid maintenance must not claim restored.`);
    assert.equal(apiCounts.health, before.health + 1);
    assert.equal(apiCounts.maintenance, before.maintenance + 1);
  }
  scenario = "maintenance";
  await navigate(kind, "503");
  await page.locator("[data-status-primary]").click();
  await page.locator('[data-state="maintenance"]').waitFor();
  assert.ok((await page.locator("[data-status-feedback]").innerText()).includes("Penyelenggaraan masih aktif"));
  await capture(`${kind}-maintenance-detected-390-light`);

  scenario = "ready";
  await navigate(kind, "504");
  const beforeOffline = { ...apiCounts };
  await context.setOffline(true);
  await page.locator('[data-state="offline"]').waitFor();
  await page.locator("[data-status-primary]").click();
  assert.deepEqual(apiCounts, beforeOffline, `${kind}: offline retry makes no server request.`);
  await capture(`${kind}-offline-390-light`);
  await context.setOffline(false);
  await page.getByText("Rangkaian dikesan. Tekan Cuba Semula untuk mengesahkan perkhidmatan.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("system-status-page").getAttribute("data-state"), "offline", `${kind}: navigator online is not server health.`);
  assert.deepEqual(apiCounts, beforeOffline, `${kind}: no automatic polling on online.`);
  await page.waitForTimeout(3_100);
  await page.locator("[data-status-primary]").click();
  await page.locator('[data-state="restored"]').waitFor();

  scenario = "delayed";
  await navigate(kind, "502");
  await page.locator("[data-status-primary]").click();
  await page.locator('[data-status-primary][aria-busy="true"]').waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByText("Semakan dijeda. Cuba semula apabila anda bersedia.", { exact: true }).waitFor();
  releaseHealth?.(); releaseHealth = null;
  assert.equal(await page.getByTestId("system-status-page").getAttribute("data-state"), "502", `${kind}: stale aborted health cannot restore the view.`);
  assert.equal(await page.locator("[data-status-primary]").getAttribute("aria-busy"), "false", `${kind}: hidden abort clears busy state.`);

  scenario = "delayed";
  await navigate(kind, "502");
  const beforeUnmount = { ...apiCounts };
  await page.locator("[data-status-primary]").click();
  await page.waitForFunction(() => window.__statusFixtureHealthSignals?.length === 1);
  await page.evaluate((documentKind) => {
    if (documentKind === "react") window.__statusFixtureUnmount();
    else window.dispatchEvent(new PageTransitionEvent("pagehide"));
  }, kind);
  await page.waitForFunction(() => window.__statusFixtureHealthSignals[0].aborted === true);
  releaseHealth?.(); releaseHealth = null;
  await page.waitForTimeout(100);
  assert.equal(apiCounts.maintenance, beforeUnmount.maintenance, `${kind}: unmount/pagehide abort cannot start a follow-up health request.`);
  if (kind === "react") assert.equal(await page.getByTestId("system-status-page").count(), 0, "Real React root is unmounted.");

  scenario = "delayed";
  await navigate(kind, "502");
  await page.locator("[data-status-primary]").click();
  await page.waitForFunction(() => window.__statusFixtureHealthSignals?.length === 1);
  await page.clock.fastForward(8_100);
  await page.locator("[data-status-feedback]").filter({ hasText: /belum dapat disahkan/ }).waitFor();
  assert.equal(await page.evaluate(() => window.__statusFixtureHealthSignals[0].aborted), true, `${kind}: timeout aborts underlying request.`);
  assert.equal(await page.locator("[data-status-primary]").getAttribute("aria-busy"), "false", `${kind}: timeout clears busy state.`);
  assert.equal(await page.getByTestId("system-status-page").getAttribute("data-state"), "502");
  releaseHealth?.(); releaseHealth = null;
  const beforeIdle = { ...apiCounts };
  await page.clock.fastForward(60_000);
  assert.deepEqual(apiCounts, beforeIdle, `${kind}: one minute of idle time never starts automatic polling.`);
  checks.push(`${kind}: manual recovery, single flight, cooldown, malformed/oversized/non-JSON/not-ready, invalid maintenance, offline/online, hidden cancellation, ${kind === "react" ? "React unmount" : "pagehide"} cancellation, 8-second timeout, no idle polling`);
}

async function assertMaintenanceIntegration() {
  for (const fixture of ["public-maintenance", "shell-maintenance"]) {
    scenario = "ready";
    await page.goto(`${origin}/?state=maintenance&theme=light&fixture=${fixture}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('[data-fixture-current-page="maintenance"]').waitFor();
    await page.getByTestId("system-status-page").waitFor();
    const urlBefore = page.url();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("maintenance-updated", { detail: { maintenance: false, type: "hard" } })));
    await page.clock.fastForward(60_000);
    assert.equal(await page.locator("[data-fixture-current-page]").getAttribute("data-fixture-current-page"), "maintenance", `${fixture}: a maintenance=false event is not an implicit recovery/navigation.`);
    assert.equal(page.url(), urlBefore, `${fixture}: recovery preserves the current location until user confirmation.`);
    await page.locator("[data-status-primary]").click();
    await page.locator('[data-state="restored"]').waitFor();
    assert.equal(await page.locator("[data-fixture-current-page]").getAttribute("data-fixture-current-page"), "maintenance", `${fixture}: healthy response offers manual continuation instead of autoexit.`);
    assert.equal(await page.locator("[data-status-primary]").getAttribute("href"), "/");
    assert.equal(page.url(), urlBefore);
    if (fixture === "public-maintenance") assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("user")).username), "synthetic-browser-status-only", "503 bootstrap preserves stored session metadata.");
    await capture(`${fixture}-manual-recovery`);
    checks.push(`${fixture}: real app state hook does not autoexit maintenance after an event, timer interval, or successful manual recovery`);
  }
  await page.evaluate(() => sessionStorage.clear());
}

try {
  await mkdir(artifactDir, { recursive: true });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__statusFixtureHealthSignals = [];
    window.fetch = (input, options) => {
      if (String(input).endsWith("/api/health/live") && options?.signal) window.__statusFixtureHealthSignals.push(options.signal);
      return nativeFetch(input, options);
    };
  });
  page = await context.newPage();
  await page.clock.install();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("**/*", routeRequests);

  for (const width of widths) {
    for (const theme of ["light", "dark"]) {
      for (const [kind, state] of [["react", "404"], ["react", "maintenance"], ["react", "offline"], ["react", "restored"],
        ["static", "502"], ["static", "503"], ["static", "504"], ["static", "maintenance"]]) {
        scenario = "maintenance";
        await navigate(kind, state, width, theme);
        await assertLayout(kind, state, width, theme);
      }
      await navigate("react", "404", width, theme, true);
      await assertLayout("react-authenticated", "404", width, theme);
      scenario = "ready";
      await navigate("static", "502", width, theme);
      await context.setOffline(true);
      await page.locator('[data-state="offline"]').waitFor();
      await assertLayout("static", "offline", width, theme);
      await context.setOffline(false);
      await page.locator("[data-status-primary]").click();
      await page.locator('[data-state="restored"]').waitFor();
      await assertLayout("static", "restored", width, theme);
      console.log(`[system-status-browser] PASS ${width}px ${theme}: React + static layouts, overflow, landmarks, logo, touch targets${width === 320 || width === 1440 ? ", axe accessibility" : ""}`);
    }
  }
  await focusAndMotion("react", "404");
  await focusAndMotion("static", "502");
  for (const authenticated of [false, true]) {
    await navigate("react", "404", 390, "light", authenticated);
    await page.getByRole("button", { name: authenticated ? "Kembali ke Dashboard" : "Kembali ke Log Masuk", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__statusFixtureActions), [authenticated ? "home" : "login"]);
    assert.equal(await page.getByRole("button", { name: "Kembali ke Dashboard", exact: true }).count(), authenticated ? 1 : 0);
  }
  scenario = "eta";
  await navigate("react", "maintenance", 320, "dark");
  await page.getByText(/Anggaran tamat:/).waitFor();
  await assertLayout("react", "maintenance-with-real-eta", 320, "dark");
  for (const kind of ["react", "static"]) await assertRetry(kind);
  await assertMaintenanceIntegration();

  const noJs = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light", viewport: { width: 320, height: 900 } });
  await noJs.route("**/*", routeRequests);
  const noJsPage = await noJs.newPage();
  const noJsResponse = await noJsPage.goto(`${origin}/static/503`);
  assert.equal(noJsResponse.status(), 503);
  assert.equal(await noJsPage.locator("h1").innerText(), "SQR Belum Tersedia");
  assert.equal(await noJsPage.getByRole("link", { name: "Cuba Semula" }).getAttribute("href"), "/");
  assert.equal(await noJsPage.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
  await noJsPage.screenshot({ path: path.join(artifactDir, "static-503-no-js-320-light.png"), fullPage: true });
  screenshots.push("static-503-no-js-320-light.png");
  await noJs.close();
  checks.push("Static fallback: readable and safe root recovery link without JavaScript");
  assert.deepEqual(externalRequests, [], "No external assets/network dependencies.");
  assert.deepEqual(unexpectedApiRequests, [], "No dashboard, login or business endpoint is polled.");
  assert.deepEqual(pageErrors, [], "No uncaught browser errors.");
  console.log(`[system-status-browser] PASS ${checks.length} checks; ${screenshots.length} screenshots; synthetic HTTP only, not production/Nginx validation.`);
} catch (error) {
  failureCount++;
  await page?.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  releaseHealth?.();
  await writeFile(path.join(artifactDir, "results.json"), JSON.stringify({ scope: "Isolated browser rendering: actual components and generated static pages; synthetic health HTTP. Separate Nginx test required.", passed: failureCount === 0, checks, screenshots, apiCounts, externalRequests, unexpectedApiRequests, pageErrors }, null, 2));
  await browser?.close();
  await server.close();
}
