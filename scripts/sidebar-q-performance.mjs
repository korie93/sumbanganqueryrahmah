import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { startVisualBuiltServer } from "./test-visual-built.mjs";
import { installFixture, checkFixture } from "../tests/visual/helpers/save-collection-fixture.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const records = Array.from({ length: 200 }, (_, index) => ({
  id: `sidebar-q-perf-${index + 1}`, customerName: `Synthetic Customer ${index + 1}`,
  icNumber: "000012345678", customerPhone: "0123456789", accountNumber: `SYNTHETIC-${index + 1}`,
  cardNumber: "00009007199254740993", cardNumberLast4: "0993", batch: "P10", paymentDate: "2026-10-04",
  amount: "1250.00", receiptFile: null, receipts: [], archivedReceipts: [], receiptTotalAmount: "0.00",
  receiptValidationStatus: "unverified", receiptValidationMessage: null, receiptCount: 0, duplicateReceiptFlag: false,
  createdByLogin: "guidance.admin", collectionStaffNickname: "Guidance Synthetic Collector",
  createdAt: "2026-10-10T08:00:00.000Z", updatedAt: "2026-10-10T08:00:00.000Z",
  sourceImportId: "sidebar-q-source", sourceFilename: "Synthetic Collection.xlsx",
  totalDue: "1500.00", billingPrincipalOsp: "1000.00", cpStatus: "cp", agingBucket: "D3",
}));

export function parseSidebarQPerformanceArgs(args) {
  let durationMs = 60_000;
  let rates = [4, 6];
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    assert.ok(["--duration-ms", "--rates"].includes(name) && !seen.has(name), "Allowed arguments: --duration-ms <1000..60000> --rates <4|6|4,6>");
    seen.add(name);
    const value = args[++index];
    if (name === "--duration-ms") {
      assert.match(value ?? "", /^\d+$/);
      durationMs = Number(value);
      assert.ok(Number.isInteger(durationMs) && durationMs >= 1000 && durationMs <= 60_000);
    } else {
      assert.ok(["4", "6", "4,6"].includes(value));
      rates = value.split(",").map(Number);
    }
  }
  return { durationMs, rates };
}

function metricsMap(result) {
  return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
}

export function summarizeSidebarQTrace(trace) {
  const totals = {};
  for (const event of trace.traceEvents ?? []) {
    if (event.ph !== "X" || !Number.isFinite(event.dur)) continue;
    if (!["Layout", "Paint", "RasterTask", "UpdateLayerTree", "RecalculateStyles", "UpdateLayoutTree", "CompositeLayers", "RunTask"].includes(event.name)) continue;
    const entry = totals[event.name] ??= { count: 0, durationMs: 0, longestMs: 0 };
    entry.count++;
    entry.durationMs += event.dur / 1000;
    entry.longestMs = Math.max(entry.longestMs, event.dur / 1000);
  }
  return Object.fromEntries(Object.entries(totals).map(([name, entry]) => [name, {
    count: entry.count, durationMs: Number(entry.durationMs.toFixed(3)), longestMs: Number(entry.longestMs.toFixed(3)),
  }]));
}

async function takeTrace(session, durationMs, progress) {
  const complete = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
  await session.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing", transferMode: "ReturnAsStream" });
  for (let elapsed = 0; elapsed < durationMs;) {
    const chunk = Math.min(15_000, durationMs - elapsed);
    await sleep(chunk);
    elapsed += chunk;
    console.log(`${progress}: ${elapsed}/${durationMs} ms`);
  }
  await session.send("Tracing.end");
  const { stream } = await complete;
  assert.ok(stream, "Chromium must provide a trace stream");
  let data = "";
  try {
    for (;;) {
      const part = await session.send("IO.read", { handle: stream, size: 1024 * 1024 });
      data += part.base64Encoded ? Buffer.from(part.data, "base64").toString("utf8") : part.data;
      assert.ok(Buffer.byteLength(data) < 80 * 1024 * 1024, "Bounded performance trace exceeded 80 MiB");
      if (part.eof) break;
    }
  } finally { await session.send("IO.close", { handle: stream }); }
  return data;
}

async function installRecords(page, origin) {
  const fixture = await installFixture(page, origin, { role: "admin" });
  await page.route("**/api/collection/{list,source-configs,teams,purge-summary}*", async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, origin);
    assert.equal(route.request().method(), "GET");
    const respond = (json) => route.fulfill({ json, headers: { "Cache-Control": "no-store" } });
    if (url.pathname === "/api/collection/source-configs") return respond({ ok: true, sourceConfigs: [] });
    if (url.pathname === "/api/collection/teams") return respond({ ok: true, teams: [] });
    if (url.pathname === "/api/collection/purge-summary") return respond({ ok: true, retentionMonths: 6, cutoffDate: "2026-04-10", eligibleRecords: 0, totalAmount: 0 });
    assert.equal(url.pathname, "/api/collection/list");
    const matching = records.filter((record) => record.customerName.toLowerCase().includes((url.searchParams.get("search") ?? "").toLowerCase()));
    const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? 50) || 50));
    const pageNumber = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const offset = (pageNumber - 1) * limit;
    return respond({ ok: true, records: matching.slice(offset, offset + limit), total: matching.length, totalAmount: matching.length * 1250,
      page: pageNumber, pageSize: limit, limit, offset, nextCursor: null,
      pagination: { mode: "hybrid", page: pageNumber, pageSize: limit, limit, offset, total: matching.length,
        totalPages: Math.max(1, Math.ceil(matching.length / limit)), nextCursor: null, hasNextPage: offset + limit < matching.length, hasPreviousPage: offset > 0 } });
  });
  return fixture;
}

async function recordState(page) {
  return page.locator(".sidebar-q-artwork").evaluate((element) => ({
    motion: element.getAttribute("data-motion"), visible: document.visibilityState,
    animations: element.getAnimations({ subtree: true }).map((animation) => ({
      state: animation.playState, name: animation.animationName, duration: animation.effect.getTiming().duration,
    })),
  }));
}

async function measureIdle(browser, origin, outputDirectory, cpuRate, durationMs, mode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US", timezoneId: "Asia/Kuala_Lumpur" });
  const page = await context.newPage();
  const fixture = await installRecords(page, origin);
  await page.emulateMedia({ reducedMotion: mode === "static" ? "reduce" : "no-preference" });
  const session = await context.newCDPSession(page);
  try {
    await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    await session.send("Performance.enable");
    await page.goto(`${origin}/collection/records`);
    await page.getByTestId("collection-records-page").waitFor({ state: "visible" });
    await page.locator(".collection-records-table-scroll").waitFor({ state: "visible" });
    const toggle = page.getByTestId("button-toggle-sidebar");
    if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
    await page.getByLabel("Search", { exact: true }).focus();
    await page.mouse.move(600, 300);
    await page.locator(".sidebar-q-artwork").waitFor({ state: "visible" });
    await sleep(1200);
    const beforeState = await recordState(page);
    assert.equal(beforeState.visible, "visible");
    assert.ok(mode === "static" ? beforeState.animations.every((animation) => animation.state !== "running") : beforeState.animations.some((animation) => animation.state === "running"), `Expected ${mode} Q state, got ${JSON.stringify(beforeState)}`);
    await session.send("HeapProfiler.collectGarbage");
    const before = metricsMap(await session.send("Performance.getMetrics"));
    const traceBytes = await takeTrace(session, durationMs, `CPU ${cpuRate}x ${mode} idle`);
    const after = metricsMap(await session.send("Performance.getMetrics"));
    const afterGcBefore = after.JSHeapUsedSize;
    await session.send("HeapProfiler.collectGarbage");
    const afterGc = metricsMap(await session.send("Performance.getMetrics"));
    const filename = `cpu-${cpuRate}x-${mode}`;
    await writeFile(path.join(outputDirectory, `${filename}-trace.json`), traceBytes);
    const delta = Object.fromEntries(["LayoutCount", "RecalcStyleCount", "LayoutDuration", "RecalcStyleDuration", "ScriptDuration", "TaskDuration"].map((key) => [key, Number(((after[key] ?? 0) - (before[key] ?? 0)).toFixed(6))]));
    const wallSeconds = durationMs / 1000;
    const result = { cpuRate, mode, durationMs, beforeState, afterState: await recordState(page), delta,
      rendererMainThreadBusyPercent: Number((delta.TaskDuration / wallSeconds * 100).toFixed(3)),
      heap: { before: before.JSHeapUsedSize, after: afterGcBefore, afterGc: afterGc.JSHeapUsedSize, retainedDeltaBytes: afterGc.JSHeapUsedSize - before.JSHeapUsedSize },
      dom: { beforeNodes: before.Nodes, afterNodes: afterGc.Nodes, beforeListeners: before.JSEventListeners, afterListeners: afterGc.JSEventListeners },
      trace: summarizeSidebarQTrace(JSON.parse(traceBytes)) };
    await page.screenshot({ path: path.join(outputDirectory, `${filename}.png`) });
    await checkFixture(page, fixture);
    return result;
  } finally { await session.detach(); await context.close(); }
}

async function measureInteractions(browser, origin, cpuRate) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const fixture = await installRecords(page, origin);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const session = await context.newCDPSession(page);
  try {
    await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    await page.goto(`${origin}/collection/records`);
    await page.locator(".collection-records-table-scroll").waitFor({ state: "visible" });
    const toggle = page.getByTestId("button-toggle-sidebar");
    const times = [];
    for (let index = 0; index < 20; index++) {
      const expanded = await toggle.getAttribute("aria-expanded") === "true";
      const start = performance.now();
      await toggle.click();
      await page.waitForFunction((value) => document.querySelector('[data-testid="button-toggle-sidebar"]')?.getAttribute("aria-expanded") === value, String(!expanded));
      times.push(performance.now() - start);
    }
    if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
    const search = page.getByLabel("Search", { exact: true });
    await search.focus(); await page.mouse.move(600, 300);
    const scrollStart = performance.now();
    const table = page.locator(".collection-records-table-scroll");
    const box = await table.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + Math.min(100, box.width / 2), box.y + Math.min(100, box.height / 2));
    await page.mouse.wheel(600, 600);
    await page.waitForFunction(() => {
      const element = document.querySelector(".collection-records-table-scroll");
      return window.scrollY > 0 || (element && (element.scrollLeft > 0 || element.scrollTop > 0));
    });
    const scrollResponseMs = performance.now() - scrollStart;
    const searchStart = performance.now();
    await search.fill("Synthetic Customer 199");
    await page.getByRole("cell", { name: "Synthetic Customer 199", exact: true }).waitFor({ state: "visible" });
    const searchResultMs = performance.now() - searchStart;
    await search.fill("");
    await page.getByRole("cell", { name: "Synthetic Customer 1", exact: true }).waitFor({ state: "visible" });
    await checkFixture(page, fixture);
    return { cpuRate, toggles: 20, toggleRoundTripMs: times.map((value) => Number(value.toFixed(2))),
      medianToggleRoundTripMs: Number([...times].sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(2)),
      longestToggleRoundTripMs: Number(Math.max(...times).toFixed(2)), scrollResponseMs: Number(scrollResponseMs.toFixed(2)),
      searchResultMs: Number(searchResultMs.toFixed(2)),
      note: "Automation round trips include Playwright actionability, IPC, rendering and the existing Search debounce; not pure input latency." };
  } finally { await session.detach(); await context.close(); }
}

export async function runSidebarQPerformance(args = process.argv.slice(2)) {
  const options = parseSidebarQPerformanceArgs(args);
  const outputDirectory = path.join(repoRoot, "artifacts/sidebar-q/performance");
  await mkdir(outputDirectory, { recursive: true });
  const server = await startVisualBuiltServer(path.join(repoRoot, "dist-local/public"));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME_PATH } : {}) });
    const report = { generatedAt: new Date().toISOString(), origin: server.origin, options,
      caveats: ["Synthetic loopback-only static production frontend, no database, dotenv or real accounts.",
        "Chromium CPU throttling is not a weak-GPU or physical low-spec-device benchmark.",
        "Trace durations may overlap; renderer TaskDuration is the main-thread busy-time indicator.",
        "No per-frame test JavaScript sampler is installed; raster/compositor activity is observed in CDP trace."],
      idle: [], interactions: [] };
    for (const rate of options.rates) {
      for (const mode of ["static", "motion"]) report.idle.push(await measureIdle(browser, server.origin, outputDirectory, rate, options.durationMs, mode));
      report.interactions.push(await measureInteractions(browser, server.origin, rate));
    }
    await writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally { await browser?.close(); await server.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runSidebarQPerformance().catch((error) => { console.error(error); process.exitCode = 1; });
}
