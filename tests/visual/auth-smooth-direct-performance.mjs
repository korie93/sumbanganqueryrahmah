import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createAuthV17Fixture } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture } from "../../scripts/lib/browser-theme-fixture.mjs";

// Temporary audit module: call only inside the existing bounded runtime.
// The caller owns its static server. No CLI, workers, writes or downloads here.
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";
const metricNames = new Set(["JSHeapUsedSize", "JSHeapTotalSize", "Nodes", "Documents", "Frames",
  "TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"]);

function initializeProbe({ origin, unsupported }) {
  if (location.origin !== origin) return;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  const probe = { nativeAvailable: typeof document.startViewTransition === "function", transitions: [],
    transitionsDropped: 0, longTasks: [], longTasksDropped: 0, violations: [],
    longTasksSupported: PerformanceObserver.supportedEntryTypes.includes("longtask") };
  window.__sqrDirectAudit = probe;
  const violation = message => { if (probe.violations.length < 16) probe.violations.push(String(message).slice(0, 256)); };
  document.addEventListener("securitypolicyviolation", event => violation(`CSP ${event.violatedDirective}`));
  window.addEventListener("unhandledrejection", event => violation(`Unhandled ${String(event.reason)}`));
  if (probe.longTasksSupported) {
    const consume = entries => { for (const entry of entries) {
      if (probe.longTasks.length < 128) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
      else probe.longTasksDropped++;
    } };
    const observer = new PerformanceObserver(list => consume(list.getEntries()));
    observer.observe({ type: "longtask", buffered: true });
    probe.flush = () => consume(observer.takeRecords());
  }
  const start = document.startViewTransition?.bind(document);
  if (unsupported) Object.defineProperty(document, "startViewTransition", { configurable: true, value: undefined });
  else if (start) Object.defineProperty(document, "startViewTransition", { configurable: true, value: update => {
    const record = { kind: document.documentElement.dataset.vt ?? null, start: performance.now() };
    if (probe.transitions.length < 8) probe.transitions.push(record); else probe.transitionsDropped++;
    const transition = start(() => { record.update = performance.now(); return update(); });
    void transition.ready.then(() => { record.ready = performance.now(); }, () => { record.readyRejected = true; });
    void transition.finished.then(() => { record.finish = performance.now(); }, () => { record.finishedRejected = true; });
    return transition;
  } });
}

async function settle(page, path) {
  await page.waitForFunction(expected => {
    if (location.pathname !== expected || document.documentElement.dataset.vt) return false;
    if (expected === "/") return Boolean(document.querySelector(".sqr-landing-next"));
    const image = document.querySelector('.auth-brand-artwork img[data-active="true"]');
    return Boolean(document.querySelector("#auth-v17-title") && image?.complete && image.naturalWidth
      && getComputedStyle(image).opacity === "1");
  }, path, { timeout: 30_000, polling: "raf" });
  await page.evaluate(async () => {
    const image = document.querySelector('.auth-brand-artwork img[data-active="true"]');
    if (image) await image.decode();
    if (document.querySelector(".sqr-landing-next")) {
      const visible = [...document.querySelectorAll(".sqr-landing-next img")].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      });
      await Promise.all(visible.map(element => element.decode()));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const probe = window.__sqrDirectAudit; probe.flush?.();
    return { now: performance.now(), href: location.href, history: history.length,
      focus: document.activeElement?.id ?? null, marker: document.documentElement.dataset.vt ?? null,
      nativeCount: probe.transitions.length, longTaskCount: probe.longTasks.length };
  });
}

/** Returns a JSON-serializable object whose encoded size is strictly below 64KiB. */
export async function runDirectAudit({ origin, executablePath, args = [], cpuRate = 1, performanceMode = "high" }) {
  const url = new URL(origin);
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin, origin); assert.ok(url.port && !url.username && !url.password);
  assert.ok(typeof executablePath === "string" && executablePath.startsWith("/"));
  assert.ok(Array.isArray(args) && args.length <= 32 && args.every(value => typeof value === "string" && value.length <= 1024));
  assert.ok([[1, "high"], [4, "auto"], [6, "low"]].some(([cpu, mode]) => cpu === cpuRate && mode === performanceMode),
    "Only the three documented synthetic audit profiles are supported");
  const browser = await chromium.launch({ executablePath, args, headless: true, timeout: 30_000 });
  const result = { diagnostic: "direct-single-node", cpuRate, performanceMode, modes: [] };
  try {
    for (const mode of ["native", "unsupported"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark",
        reducedMotion: "no-preference", serviceWorkers: "block", acceptDownloads: false });
      try {
        const fixture = createAuthV17Fixture(origin), errors = [], pending = new Set();
        const recordError = error => { if (errors.length < 32) errors.push(String(error?.message ?? error).slice(0, 256)); };
        await context.addInitScript(initializeBrowserThemeFixture, { origin, mode: "preserve-choice", theme: "dark", performanceMode });
        await context.addInitScript(initializeProbe, { origin, unsupported: mode === "unsupported" });
        await context.routeWebSocket("**/*", socket => { recordError("Unexpected public WebSocket"); socket.close(); });
        const handle = async route => {
          const request = route.request(), target = new URL(request.url());
          if (target.origin !== origin) { recordError(`Off-origin ${target.origin}`); return route.abort(); }
          if (target.pathname === "/api/maintenance-status" && request.method() === "GET")
            return route.fulfill({ json: { maintenance: false } });
          if (["/api/telemetry/web-vitals", "/api/telemetry/client-errors"].includes(target.pathname) && request.method() === "POST")
            return route.fulfill({ json: { ok: true } });
          if (request.isNavigationRequest() && request.resourceType() === "document") {
            assert.equal(request.method(), "GET");
            const response = await route.fetch({ maxRedirects: 0, timeout: 20_000 });
            if (response.status() !== 200) {
              recordError(`Unexpected document HTTP ${response.status()}`);
              await response.dispose();
              return route.abort();
            }
            const headers = response.headers();
            headers["content-security-policy"] = [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", ");
            return route.fulfill({ response, headers });
          }
          return fixture.route(route);
        };
        await context.route("**/*", route => {
          const work = handle(route).catch(async error => { recordError(error); await route.abort().catch(() => undefined); })
            .finally(() => pending.delete(work));
          pending.add(work); return work;
        });
        const page = await context.newPage(); page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(30_000);
        page.on("pageerror", recordError);
        page.on("console", message => {
          if (message.type() !== "error") return;
          const target = new URL(message.location().url || origin, origin);
          if (target.origin === origin && target.pathname === "/api/me" && /status of 401/.test(message.text())) return;
          recordError(message.text());
        });
        const session = await context.newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate }); await session.send("Performance.enable");
        const metrics = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics
          .filter(entry => metricNames.has(entry.name)).map(entry => [entry.name, entry.value]));
        await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "English", exact: true }).click();
        await page.locator(".auth-brand-artwork img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
        await page.evaluate(() => document.fonts.ready.then(() => undefined)); await settle(page, "/login");
        const environment = await page.evaluate(() => ({ mode: localStorage.getItem("perf_mode"),
          lowSpec: document.documentElement.classList.contains("low-spec"), cores: navigator.hardwareConcurrency,
          deviceMemory: navigator.deviceMemory ?? null, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
          nativeAvailable: window.__sqrDirectAudit.nativeAvailable, longTasksSupported: window.__sqrDirectAudit.longTasksSupported }));
        // The shared fixture selects auto by removing the override, matching
        // the application's real default rather than writing an artificial value.
        assert.equal(environment.mode, performanceMode === "auto" ? null : performanceMode);
        assert.equal(environment.reduced, false);
        if (performanceMode !== "auto") assert.equal(environment.lowSpec, performanceMode === "low");
        assert.equal(environment.nativeAvailable, true); assert.equal(environment.longTasksSupported, true);
        const initial = await snapshot(page), nodeMemoryBefore = process.memoryUsage(), steps = [];
        for (const [kind, path, selector] of [
          ["auth", "/forgot-password", '.login-secondary-link[href="/forgot-password"]'],
          ["auth", "/login", '.auth-v17-persistent-actions a[href="/login"]'],
          ["page", "/", '.auth-v17-topline a[href="/"]'],
          ["page", "/login", '.sqr-landing-next a[href="/login"]'],
        ]) {
          const link = page.locator(selector).first(); await link.focus();
          const metricsBefore = await metrics(), before = await snapshot(page);
          await link.press("Enter"); await settle(page, path);
          const after = await snapshot(page), metricsAfter = await metrics();
          assert.equal(after.href, `${origin}${path}`); assert.equal(after.history, initial.history); assert.equal(after.marker, null);
          if (path !== "/") assert.equal(after.focus, "auth-v17-title");
          assert.equal(await page.locator(path === "/" ? ".sqr-landing-next" : ".auth-v17").getAttribute("data-theme"), "dark");
          steps.push({ kind, path, before, after, wall: after.now - before.now, metricsBefore, metricsAfter });
        }
        while (pending.size) await Promise.all(pending);
        const probe = await page.evaluate(() => { const data = window.__sqrDirectAudit; data.flush?.();
          return { ...data, flush: undefined }; });
        assert.deepEqual(errors, []); assert.deepEqual(probe.violations, []); assert.deepEqual(fixture.state.unexpected, []);
        assert.deepEqual(fixture.state.counts, { login: 0, verify: 0, forgot: 0, reset: 0, validate: 0 });
        assert.equal(probe.transitionsDropped, 0);
        assert.deepEqual(probe.transitions.map(entry => entry.kind), mode === "native" ? ["auth", "auth", "page", "page"] : []);
        for (const entry of probe.transitions) {
          assert.ok(Number.isFinite(entry.update) && Number.isFinite(entry.ready) && Number.isFinite(entry.finish));
          assert.ok(!entry.readyRejected && !entry.finishedRejected);
        }
        for (const step of steps) {
          const overlapping = probe.longTasks.filter(entry => entry.start < step.after.now && entry.start + entry.duration > step.before.now);
          step.longTaskCount = overlapping.length; step.maxLongTask = Math.max(0, ...overlapping.map(entry => entry.duration));
          step.native = probe.transitions.slice(step.before.nativeCount, step.after.nativeCount).map(entry => ({ ...entry, wall: entry.finish - entry.start }));
        }
        result.modes.push({ mode, environment, initial, steps, probe, nodeMemoryBefore, nodeMemoryAfter: process.memoryUsage(),
          longTaskAcceptance: steps.some(step => step.maxLongTask > 50) ? "FAIL" : probe.longTasksDropped ? "INCOMPLETE" : "PASS",
          nativeWallAcceptance: mode !== "native" ? "NOT_APPLICABLE" : steps.some(step => step.native.some(entry => entry.wall > (step.kind === "auth" ? 400 : 260))) ? "FAIL" : "PASS" });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 65536, "Direct diagnostic JSON exceeds 64KiB");
  return result;
}
