import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const prefix = "/api/collection/report/billing-principal/saved-targets";
const agings = ["D3", "D4", "D5", "D6"];
const targetName = "Daily movement visual stress — long regional billing principal target with all four active aging buckets and exact money";
const sourceName = "Configured Saved Collection Source regional reconciliation and historical effective payment reporting ".repeat(3).slice(0, 300);
const sourceFilename = "Regional_collection_source_with_long_auditable_reporting_metadata_".repeat(6) + ".xlsx";
const decimal = (units, scale = 2) => {
  const value = (units < 0n ? -units : units).toString().padStart(scale + 1, "0");
  return `${units < 0n ? "-" : ""}${value.slice(0, -scale)}.${value.slice(-scale)}`;
};
const percent = (closed, target) => decimal(target ? (closed * 1_000_000n + target / 2n) / target : 0n, 4);
const cents = (value) => BigInt(value.replace(".", ""));
const moneyText = (value) => `RM${value.replace(/\B(?=(\d{3})+\.)/g, ",")}`;
const percentText = (value) => `${decimal((cents(value) + 50n) / 100n)}%`;

function buildStressFixture(date) {
  const amounts = [9_999_999_999_999_999n, 8_888_888_888_888_888n, 7_777_777_777_777_777n, 6_666_666_666_666_666n];
  const baselines = amounts.map((amount) => amount * 2n);
  const targets = baselines.map((amount, index) => (amount * BigInt(30 + index * 10) + 50n) / 100n);
  const sum = (values) => values.reduce((total, value) => total + value, 0n);
  const totalOsp = sum(baselines);
  const targetOsp = sum(targets);
  const closedOsp = sum(amounts);
  const movement = (active) => ({
    rows: agings.map((aging, index) => ({ aging, targetOsp: decimal(targets[index]),
      ospClosed: decimal(active ? amounts[index] : 0n), resultPercentage: percent(active ? amounts[index] : 0n, targets[index]),
      closedAccountCount: active ? 1 : 0 })),
    all: { aging: "ALL", targetOsp: decimal(targetOsp), ospClosed: decimal(active ? closedOsp : 0n),
      resultPercentage: percent(active ? closedOsp : 0n, targetOsp), closedAccountCount: active ? 4 : 0 },
  });
  const revision = (value) => ({ ...value, sourceSnapshots: value.sourceSnapshots.map((source) => ({ ...source, name: sourceName, filename: sourceFilename })) });
  const target = (value) => value.id ? { ...value, name: targetName, activeRevision: revision(value.activeRevision) } : value;
  const system = (asOf) => {
    const active = asOf >= date;
    return { rows: agings.map((aging, index) => ({ aging, totalOsp: decimal(baselines[index]),
      targetPercentage: decimal(BigInt(30 + index * 10) * 10_000n, 4), targetOsp: decimal(targets[index]),
      ospClosed: decimal(active ? amounts[index] : 0n), resultPercentage: percent(active ? amounts[index] : 0n, baselines[index]),
      balanceOsp: decimal(targets[index] - (active ? amounts[index] : 0n)), closedAccountCount: active ? 1 : 0 })),
    all: { aging: "ALL", totalOsp: decimal(totalOsp), targetPercentage: percent(targetOsp, totalOsp), targetOsp: decimal(targetOsp),
      ospClosed: decimal(active ? closedOsp : 0n), resultPercentage: percent(active ? closedOsp : 0n, totalOsp),
      balanceOsp: decimal(targetOsp - (active ? closedOsp : 0n)), closedAccountCount: active ? 4 : 0 } };
  };
  const overview = (value) => {
    const latest = system(value.latestComparison.system.asOf).all;
    return { ...value, target: target(value.target), revision: revision(value.revision), systemResult: system(value.asOf),
      latestComparison: { ...value.latestComparison,
        system: { ...value.latestComparison.system, totalOsp: latest.totalOsp, ospClosed: latest.ospClosed, resultPercentage: latest.resultPercentage },
        differencePercentagePoints: value.latestComparison.client
          ? decimal(cents(latest.resultPercentage) - cents(value.latestComparison.client.resultPercentage), 4) : null } };
  };
  const calendar = (days) => days.map((day) => {
    const active = day.date === date;
    const cumulative = day.date >= date ? closedOsp : 0n;
    return { ...day, totalOsp: decimal(totalOsp), targetOsp: decimal(targetOsp), dailyMovement: movement(active),
      systemOspClosedToday: decimal(active ? closedOsp : 0n), systemDailyAccounts: active ? 4 : 0,
      systemCumulativeOspClosed: decimal(cumulative), balanceOsp: decimal(targetOsp - cumulative),
      systemResultPercentage: percent(cumulative, totalOsp), systemPreviousResultPercentage: percent(day.date > date ? closedOsp : 0n, totalOsp),
      systemDailyMovementPercentagePoints: percent(active ? closedOsp : 0n, totalOsp), systemAchievementVsTargetPercentage: percent(cumulative, targetOsp) };
  });
  return { target, overview, calendar, active: movement(true) };
}

// Render-only stress: the real API must authorize each GET before its cloned
// response is enlarged. Nothing is persisted; private data and all identity,
// target-version and source-validity fields remain those of the current actor.
export async function runBillingOspDailyRenderQa({ actor, targetId, revisionPath, date, openReport, artifactDir, checked }) {
  const database = process.env.COLLECTION_SAVE_ACCESS_QA_DATABASE || "";
  assert(/^sqr_save_access_[0-9]+_[a-f0-9]{6}$/.test(database));
  assert.equal(process.env.PG_DATABASE, database);
  const page = actor.page;
  const origin = new URL(page.url()).origin;
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname));
  const fixture = buildStressFixture(date);
  const paths = new Set([prefix, `${prefix}/${targetId}`, `${revisionPath}/overview`, `${revisionPath}/calendar`, `${revisionPath}/export`]);
  const matches = (url) => url.origin === origin && paths.has(url.pathname);
  const errors = [];
  const artifacts = [];
  const accessibility = [];
  const originalViewport = page.viewportSize();
  const originalDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const pendingRoutes = new Set();
  const respond = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || (url.pathname.endsWith("/export") && url.searchParams.get("format") !== "json")) return route.fallback();
    const response = await route.fetch();
    if (response.status() !== 200) { errors.push(`${url.pathname}: ${response.status()}`); return route.fulfill({ response }); }
    let body;
    try {
      const original = await response.json();
      body = structuredClone(original);
      if (url.pathname === prefix) body.targets = body.targets.map((item) => item.id === targetId ? fixture.target(item) : item);
      else if (url.pathname === `${prefix}/${targetId}`) {
        assert.equal(body.viewerUserId, actor.user.id);
        body.target = fixture.target(body.target);
      } else if (url.pathname.endsWith("/overview")) Object.assign(body, fixture.overview(body));
      else if (url.pathname.endsWith("/calendar")) body.days = fixture.calendar(body.days);
      else {
        assert.equal(body.generatedByUserId, actor.user.id);
        body.overview = fixture.overview(body.overview);
        body.calendar = fixture.calendar(body.calendar);
        assert.deepEqual(body.drilldown, []);
      }
      if (original.overview) assert.deepEqual(body.overview.clientResult, original.overview.clientResult);
      if (original.clientResult) assert.deepEqual(body.clientResult, original.clientResult);
    } catch (error) { errors.push(error.message); return route.fulfill({ response }); }
    return route.fulfill({ response, json: body });
  };
  const handler = (route) => {
    const pending = respond(route).catch((error) => errors.push(`${route.request().url()}: ${error.message}`));
    pendingRoutes.add(pending);
    void pending.then(() => pendingRoutes.delete(pending));
    return pending;
  };
  await page.route(matches, handler);
  try {
    await openReport(actor, targetId);
    await page.getByRole("heading", { name: targetName, exact: true }).waitFor();
    const region = page.getByRole("region", { name: "System calendar daily movement", exact: true });
    const activeDay = page.getByTestId(`billing-calendar-day-${date}`);
    const metadata = page.getByTestId("billing-principal-page").locator(":scope > section").first();
    await activeDay.waitFor();
    // Execute the installed auditor through the automation runtime, not a DOM
    // script sink: production Trusted Types/CSP protections stay enabled.
    await page.evaluate(await readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"));
    assert.equal(cents(fixture.active.all.ospClosed), fixture.active.rows.reduce((sum, row) => sum + cents(row.ospClosed), 0n));
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.classList.toggle("dark", value === "dark"), theme);
      for (const width of [1440, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 960 });
        const overflow = await region.evaluate((element) => [...element.querySelectorAll("button, button span")]
          .filter((item) => item.clientWidth > 0 && item.scrollWidth > item.clientWidth + 1).map((item) => item.textContent));
        assert.deepEqual(overflow, [], `Stress daily text fits at ${theme}/${width}px`);
        assert.deepEqual(await metadata.locator("p").evaluateAll((elements) => elements
          .filter((item) => item.clientWidth > 0 && item.scrollWidth > item.clientWidth + 1).map((item) => item.textContent)), [], "Long source metadata does not clip");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Stress metadata and calendar fit at ${width}px`);
        const content = await activeDay.innerText();
        for (const row of [...fixture.active.rows, fixture.active.all]) {
          for (const value of [row.aging === "ALL" ? "TOTAL" : row.aging, moneyText(row.ospClosed), percentText(row.resultPercentage)]) assert(content.includes(value), value);
        }
        for (const [label, element] of [["metadata", metadata], ["active-day", activeDay]]) {
          const filename = `daily-stress-${label}-${theme}-${width}.png`;
          await element.screenshot({ path: path.join(artifactDir, filename) });
          artifacts.push(filename);
        }
        if (width === 390) {
          const violations = await page.evaluate(async () => {
            const result = await window.axe.run(document.querySelector('[aria-label="System calendar daily movement"]'), { resultTypes: ["violations"] });
            return result.violations.filter((item) => ["serious", "critical"].includes(item.impact))
              .map((item) => ({ id: item.id, impact: item.impact, targets: item.nodes.flatMap((node) => node.target) }));
          });
          accessibility.push({ theme, width, violations });
          assert.deepEqual(violations, [], `Stress calendar has no serious/critical accessibility violations in ${theme}`);
        }
      }
    }
    // Observe the actual canvas report renderer, including cell bounds in the
    // eleven-column daily report. Only scalar evidence is retained, not canvases.
    await page.evaluate(() => {
      const prototype = CanvasRenderingContext2D.prototype;
      const fillText = prototype.fillText;
      const strokeRect = prototype.strokeRect;
      const states = new WeakMap();
      const evidence = { dailyPages: 0, textCalls: 0, violations: [] };
      prototype.strokeRect = function (x, y, width, height) {
        const state = states.get(this);
        if (state) state.row = { x, y, width, height };
        return strokeRect.call(this, x, y, width, height);
      };
      prototype.fillText = function (value, x, y, ...args) {
        const text = String(value);
        if (text.startsWith("System Calendar - Daily Aging Movement")) { states.set(this, { row: null }); evidence.dailyPages += 1; }
        const state = states.get(this);
        const measured = this.measureText(text);
        const width = measured.width;
        const left = this.textAlign === "right" ? x - width : this.textAlign === "center" ? x - width / 2 : x;
        const transform = this.getTransform();
        const right = left + width;
        evidence.textCalls += 1;
        const record = (reason) => { if (evidence.violations.length < 20) evidence.violations.push({ reason, text, x, y, width }); };
        if (left < 0 || right * transform.a > this.canvas.width + 1 || (y + measured.actualBoundingBoxDescent) * transform.d > this.canvas.height + 1) record("canvas bounds");
        const row = state?.row;
        if (row && y >= row.y && y <= row.y + row.height) {
          const columnWidth = row.width / 11;
          const column = Math.min(10, Math.max(0, Math.floor((x - row.x) / columnWidth)));
          if (left < row.x + column * columnWidth - 1 || right > row.x + (column + 1) * columnWidth + 1
            || y - measured.actualBoundingBoxAscent < row.y - 1 || y + measured.actualBoundingBoxDescent > row.y + row.height + 1) record("daily cell bounds");
        }
        return fillText.call(this, value, x, y, ...args);
      };
      window.__ospDailyRenderQa = { evidence, restore: () => { prototype.fillText = fillText; prototype.strokeRect = strokeRect; } };
    });
    // Earlier owner checks used three of the four allowed exports per minute.
    // Start this additional render cycle in a fresh production window; do not
    // bypass the export guard or treat an expected 429 as a renderer timeout.
    console.log("[billing-osp-v3] waiting for the export rate window before daily render stress downloads");
    for (const delay of [30_000, 31_000]) await new Promise((resolve) => setTimeout(resolve, delay));
    // Export from a mobile viewport to verify report layout is independent of it.
    for (const format of ["PNG", "PDF"]) {
      const downloads = [];
      const consume = (download) => downloads.push((async () => {
        const stream = await download.createReadStream();
        assert(stream);
        const chunks = []; let size = 0;
        for await (const chunk of stream) { size += chunk.length; assert(size <= 32 * 1024 * 1024); chunks.push(chunk); }
        const bytes = Buffer.concat(chunks);
        assert(size > 8);
        assert(format === "PNG" ? bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) : bytes.subarray(0, 4).toString() === "%PDF");
        const filename = `daily-stress-${path.basename(download.suggestedFilename())}`;
        await writeFile(path.join(artifactDir, filename), bytes);
        artifacts.push(filename);
        await download.delete();
      })().catch((error) => errors.push(error.message)));
      page.on("download", consume);
      try {
        const button = page.getByRole("button", { name: `Export Billing Principal report as ${format}` });
        const responsePromise = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === `${revisionPath}/export` && url.searchParams.get("format") === "json";
        });
        await button.click();
        assert.equal((await responsePromise).status(), 200, `${format} stress export remains authorized`);
        const deadline = Date.now() + 60_000;
        while (!downloads.length || !(await button.isEnabled())) {
          assert(Date.now() < deadline, `${format} stress export completed within its time bound`);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await Promise.all(downloads);
        assert(downloads.length <= 16 && (format !== "PDF" || downloads.length === 1));
      } finally { page.off("download", consume); }
    }
    const evidence = await page.evaluate(() => window.__ospDailyRenderQa.evidence);
    assert(evidence.dailyPages >= 2 && evidence.textCalls < 20_000);
    assert.deepEqual(evidence.violations, [], "Stress report text stays inside canvas and daily cells");
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifactDir, "daily-stress-evidence.json"), JSON.stringify({
      purpose: "Authorized disposable render-only response stress; private client data and reporting validity unchanged; no data writes",
      date, dailyMovement: fixture.active, artifacts, evidence, accessibility,
    }, null, 2));
    checked("render stress: four active aging buckets, exact large money, long metadata, desktop/mobile360–430 light/dark, and bounded PNG/PDF text layouts");
  } finally {
    await page.evaluate(() => { window.__ospDailyRenderQa?.restore(); delete window.__ospDailyRenderQa; }).catch(() => undefined);
    // Unregistering the final handler disables interception and resumes pending
    // browser requests. Finish their fulfill calls before removing this handler.
    while (pendingRoutes.size) await Promise.all([...pendingRoutes]);
    await page.unroute(matches, handler);
    if (originalViewport) await page.setViewportSize(originalViewport);
    await openReport(actor, targetId);
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), originalDark);
    assert.deepEqual(errors, [], "Render-stress routes completed and cleaned up without errors");
  }
}
