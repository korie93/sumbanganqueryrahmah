import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createAuthV17Fixture } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture } from "../../scripts/lib/browser-theme-fixture.mjs";

// Temporary audit module: call only inside the existing bounded runtime.
// The caller owns its static server. No CLI, workers, writes or downloads here.
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";
const metricNames = new Set(["JSHeapUsedSize", "JSHeapTotalSize", "Nodes", "Documents", "Frames",
  "TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"]);

function initializeProbe({ origin, unsupported, traceLayout }) {
  if (location.origin !== origin) return;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  const probe = { nativeAvailable: typeof document.startViewTransition === "function", transitions: [],
    transitionsDropped: 0, longTasks: [], longTasksDropped: 0, violations: [], rootChanges: [],
    longTasksSupported: PerformanceObserver.supportedEntryTypes.includes("longtask") };
  window.__sqrDirectAudit = probe;
  if (traceLayout) document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        const value = record.target.getAttribute(record.attributeName);
        if (record.oldValue === value || probe.rootChanges.length >= 32) continue;
        const entry = { at: performance.now(), node: record.target.nodeName, attribute: record.attributeName,
          old: record.oldValue?.slice(0, 256) ?? null, value: value?.slice(0, 256) ?? null };
        probe.rootChanges.push(entry);
        console.timeStamp(`sqr-audit ${entry.node} ${entry.attribute} ${entry.old} => ${entry.value}`);
      }
    });
    for (const element of [document.documentElement, document.body]) if (element) observer.observe(element,
      { attributes: true, attributeOldValue: true, attributeFilter: ["lang", "class", "data-theme", "style"] });
  }, { once: true });
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

// Attribution only: a 2MiB in-memory trace for one synthetic navigation. Never
// retain the raw trace, and never compare traced timings with untraced budgets.
async function summarizeLayoutTrace(session, complete, mainFrame) {
  const finished = await complete;
  assert.equal(finished.dataLossOccurred ?? false, false, "Layout trace buffer overflowed");
  assert.ok(finished.stream, "Expected a bounded trace stream");
  let encoded = "", bytes = 0;
  try {
    for (let read = 0; read < 64; read++) {
      const chunk = await session.send("IO.read", { handle: finished.stream, size: 65_536 });
      const data = chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString("utf8") : chunk.data;
      bytes += Buffer.byteLength(data);
      assert.ok(bytes <= 2_097_152, "Layout trace exceeds its 2MiB bound");
      encoded += data;
      if (chunk.eof) break;
      assert.ok(read < 63, "Layout trace stream did not finish");
    }
  } finally { await session.send("IO.close", { handle: finished.stream }); }
  const events = JSON.parse(encoded).traceEvents;
  assert.ok(Array.isArray(events) && events.length < 40_000);
  const counts = new Map(), invalidations = new Map(), layouts = [], calls = [], markers = [], selectors = new Map();
  for (const event of events) {
    const name = String(event.name ?? ""), data = event.args?.beginData ?? event.args?.data ?? {};
    if (name === "TimeStamp" && String(data.message ?? "").startsWith("sqr-audit ") && markers.length < 32)
      markers.push({ at: event.ts, message: data.message });
    if (name === "SelectorStats") for (const timing of event.args?.selector_stats?.selector_timings ?? []) {
      const selector = String(timing.selector ?? "").slice(0, 512);
      const key = `${timing.style_sheet_id ?? "unknown"}:${selector}`;
      assert.ok(selectors.size < 5000 || selectors.has(key), "Selector aggregate exceeds its bound");
      const aggregate = selectors.get(key) ?? { selector, stylesheet: timing.style_sheet_id ?? null,
        elapsedUs: 0, attempts: 0, matches: 0, fastRejects: 0 };
      aggregate.elapsedUs += Number(timing["elapsed (us)"] ?? 0);
      aggregate.attempts += Number(timing.match_attempts ?? 0);
      aggregate.matches += Number(timing.match_count ?? 0);
      aggregate.fastRejects += Number(timing.fast_reject_count ?? 0); selectors.set(key, aggregate);
    }
    if (event.ph === "X" && ["Layout", "UpdateLayoutTree", "RecalculateStyles", "Paint", "FunctionCall", "EvaluateScript"].includes(name)) {
      const duration = Number(event.dur ?? 0) / 1000;
      const key = `${name}:${data.frame === mainFrame ? "main" : data.frame ? "other-frame" : "unspecified"}`;
      const aggregate = counts.get(key) ?? { count: 0, totalMs: 0, maxMs: 0, threadCpuSamples: 0, threadCpuMs: 0 };
      aggregate.count++; aggregate.totalMs += duration; aggregate.maxMs = Math.max(aggregate.maxMs, duration); counts.set(key, aggregate);
      if (Number.isFinite(event.tdur)) { aggregate.threadCpuSamples++; aggregate.threadCpuMs += event.tdur / 1000; }
      if (["Layout", "UpdateLayoutTree", "RecalculateStyles"].includes(name)) layouts.push({ name, start: event.ts,
        end: event.ts + (event.dur ?? 0), duration, threadCpuMs: Number.isFinite(event.tdur) ? event.tdur / 1000 : null,
        frame: data.frame ?? null,
        dirtyObjects: data.dirtyObjects ?? null, totalObjects: data.totalObjects ?? null,
        elementCount: data.elementCount ?? null, partialLayout: data.partialLayout ?? null,
        roots: (event.args?.endData?.layoutRoots ?? []).slice(0, 4).map(root => ({ node: root.nodeId ?? null })),
        stack: (data.stackTrace ?? []).slice(0, 4).map(frame => ({ function: frame.functionName ?? "", url: frame.url ?? "",
          line: frame.lineNumber ?? null, column: frame.columnNumber ?? null })) });
      if (name === "FunctionCall") calls.push({ start: event.ts, end: event.ts + (event.dur ?? 0),
        function: data.functionName ?? "", url: data.url ?? "", line: data.lineNumber ?? null, column: data.columnNumber ?? null });
    }
    if (/InvalidationTracking$/.test(name)) {
      const key = `${name}:${String(data.reason ?? data.cause?.reason ?? "unknown").slice(0, 160)}`;
      if (invalidations.size < 32 || invalidations.has(key)) invalidations.set(key, (invalidations.get(key) ?? 0) + 1);
    }
  }
  const longest = layouts.sort((a, b) => b.duration - a.duration).slice(0, 10).map(layout => {
    const enclosing = calls.filter(call => call.start <= layout.start && call.end >= layout.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    return { ...layout, main: layout.frame === mainFrame, enclosing: enclosing ?? null };
  });
  assert.ok(markers.some(marker => marker.message === "sqr-audit end"), "Trace does not cover the complete step");
  return { scope: "One traced unsupported Login-to-Home step; attribution with trace overhead, not acceptance timing",
    bytes, events: events.length, mainFrame, counts: Object.fromEntries(counts), invalidations: Object.fromEntries(invalidations), markers, longest,
    selectorCount: selectors.size, slowSelectors: [...selectors.values()].sort((a, b) => b.elapsedUs - a.elapsedUs).slice(0, 15),
    authSnapshotSelectors: [...selectors.values()].filter(entry => /::view-transition-(?:group|old|new)\(auth-form\)/.test(entry.selector)).slice(0, 6) };
}

/** Returns a JSON-serializable object whose encoded size is strictly below 64KiB. */
export async function runDirectAudit({ origin, executablePath, args = [], cpuRate = 1, performanceMode = "high", traceLayout = false, selectorStats = false }) {
  const url = new URL(origin);
  assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin, origin); assert.ok(url.port && !url.username && !url.password);
  assert.ok(typeof executablePath === "string" && executablePath.startsWith("/"));
  assert.ok(Array.isArray(args) && args.length <= 32 && args.every(value => typeof value === "string" && value.length <= 1024));
  assert.ok([[1, "high"], [4, "auto"], [6, "low"]].some(([cpu, mode]) => cpu === cpuRate && mode === performanceMode),
    "Only the three documented synthetic audit profiles are supported");
  assert.equal(typeof traceLayout, "boolean");
  assert.equal(typeof selectorStats, "boolean"); assert.ok(!selectorStats || traceLayout);
  assert.ok(!traceLayout || (cpuRate === 1 && performanceMode === "high"), "Trace only the fixed attribution profile");
  const browser = await chromium.launch({ executablePath, args, headless: true, timeout: 30_000 });
  const result = { diagnostic: "direct-single-node", cpuRate, performanceMode, modes: [] };
  try {
    for (const mode of traceLayout ? ["unsupported"] : ["native", "unsupported"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark",
        reducedMotion: "no-preference", serviceWorkers: "block", acceptDownloads: false });
      try {
        const fixture = createAuthV17Fixture(origin), errors = [], pending = new Set();
        const recordError = error => { if (errors.length < 32) errors.push(String(error?.message ?? error).slice(0, 256)); };
        await context.addInitScript(initializeBrowserThemeFixture, { origin, mode: "preserve-choice", theme: "dark", performanceMode });
        await context.addInitScript(initializeProbe, { origin, unsupported: mode === "unsupported", traceLayout });
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
          let traceComplete = null, mainFrame = null;
          if (traceLayout && path === "/") {
            mainFrame = (await session.send("Page.getFrameTree")).frameTree.frame.id;
            traceComplete = new Promise(resolve => session.once("Tracing.tracingComplete", resolve));
            await session.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: {
              recordMode: "recordUntilFull", traceBufferSizeInKb: 2048, enableSampling: false, enableSystrace: false,
              includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline.invalidationTracking",
                ...(selectorStats ? ["disabled-by-default-blink.debug"] : [])] } });
          }
          try { await link.press("Enter"); await settle(page, path); }
          finally { if (traceComplete) {
            await page.evaluate(() => console.timeStamp("sqr-audit end"));
            await session.send("Tracing.end");
          } }
          const after = await snapshot(page), metricsAfter = await metrics();
          const layoutTrace = traceComplete ? await summarizeLayoutTrace(session, traceComplete, mainFrame) : null;
          assert.equal(after.href, `${origin}${path}`); assert.equal(after.history, initial.history); assert.equal(after.marker, null);
          if (path !== "/") assert.equal(after.focus, "auth-v17-title");
          assert.equal(await page.locator(path === "/" ? ".sqr-landing-next" : ".auth-v17").getAttribute("data-theme"), "dark");
          const metadata = await page.evaluate(() => ({ language: document.documentElement.lang,
            robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
            schemaConnected: Boolean(document.getElementById("sqr-application-schema")?.isConnected),
            landingLanguage: document.querySelector(".sqr-landing-next")?.getAttribute("lang") ?? null }));
          assert.equal(metadata.language, path === "/" ? "en" : "ms");
          assert.equal(metadata.robots, path === "/" ? "index,follow,max-image-preview:large" : "noindex,nofollow,noarchive");
          assert.equal(metadata.schemaConnected, path === "/");
          assert.equal(metadata.landingLanguage, path === "/" ? "en" : null);
          steps.push({ kind, path, before, after, wall: after.now - before.now, metricsBefore, metricsAfter,
            metadata, ...(layoutTrace ? { layoutTrace } : {}) });
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
