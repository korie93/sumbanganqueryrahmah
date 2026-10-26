import { expect, test, type Download, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture } from "./helpers/save-collection-fixture";

// Real production Viewer, synthetic HTTP and records only. The shared session
// fixture rejects unexpected API requests, off-origin traffic and WebSockets.
const importId = "viewer-single-flight-synthetic";
const importName = "Synthetic export dataset";
const rowCount = 237;
const isExportModule = (url: URL) => /^\/assets\/export-[\w-]+\.js$/.test(url.pathname);
const headers = ["Customer Name", "Reference", "Region"];
const rows = Array.from({ length: rowCount }, (_, index) => ({
  id: `export-row-${index + 1}`, importId,
  jsonDataJsonb: {
    "Customer Name": `Synthetic Customer ${String(index + 1).padStart(3, "0")}`,
    Reference: `SYNTHETIC-${index + 1}`, Region: index % 2 === 0 ? "North" : "South",
  },
}));
type ExportKind = "csv" | "excel" | "pdf";
type DataRead = { page: number; pageSize: number; cursor: string | null };
type ReadResult = "success" | "failure";
let testStartedAt = 0;
let activeTestTitle = "";
const fixtureDiagnostics = new WeakMap<Page, { unexpected: string[]; errors: string[] }>();

function checkpoint(phase: string, details: Record<string, unknown> = {}) {
  console.log(`VIEWER_EXPORT_CHECKPOINT=${JSON.stringify({
    test: activeTestTitle, phase, elapsedMs: Math.round(performance.now() - testStartedAt), ...details,
  })}`);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test.use({ serviceWorkers: "block", screenshot: "off", trace: "off", video: "off", acceptDownloads: true });
test.beforeEach(({}, info) => {
  testStartedAt = performance.now();
  activeTestTitle = info.title;
  checkpoint("test-start");
});
test.afterEach(({ page }, info) => {
  const fixture = fixtureDiagnostics.get(page);
  checkpoint("test-end", { status: info.status, unexpected: fixture?.unexpected, errors: fixture?.errors });
});

async function installFixture(page: Page, baseURL: string | undefined) {
  checkpoint("fixture-start");
  const fixture = await installSessionFixture(page, baseURL, { role: "superuser" });
  fixtureDiagnostics.set(page, fixture);
  const origin = new URL(baseURL!).origin;
  const exportReads: DataRead[] = [];
  const requests: Request[] = [];
  const downloads: Download[] = [];
  const holds = new Map<number, ReturnType<typeof deferred<ReadResult>>>();
  let armed = false;
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  page.on("download", (download) => { downloads.push(download); checkpoint("download", { count: downloads.length }); });
  page.on("pageerror", (error) => { checkpoint("page-error", { message: error.message }); });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === `/api/imports/${importId}/data`) {
      checkpoint("data-request-failed", { failure: request.failure() });
    }
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } });
  });
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { ok: true, sourceConfigs: [] } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: {
      imports: [{ id: importId, name: importName, filename: "synthetic-export.csv", rowCount,
        createdAt: "2026-10-10T08:00:00.000Z", createdBy: "guidance.superuser", isDeleted: false }],
      pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
        total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const request = route.request();
    const url = new URL(request.url());
    const currentPage = Number(url.searchParams.get("page"));
    const pageSize = Number(url.searchParams.get("pageSize"));
    const cursor = url.searchParams.get("cursor");
    expect([25, 100]).toContain(pageSize);
    expect(Number.isInteger(currentPage) && currentPage > 0).toBe(true);
    expect(url.searchParams.get("search") ?? "").toBe("");
    expect(JSON.parse(url.searchParams.get("columnFilters") ?? "[]")).toEqual([]);
    const offset = (currentPage - 1) * pageSize;
    expect(cursor).toBe(currentPage === 1 ? null : `export:${pageSize}:${offset}`);
    let result: ReadResult = "success";
    checkpoint("data-read", { page: currentPage, pageSize, cursor, armed });
    // Visible pagination uses 25 rows; exports retain the configured batch of
    // 100. Background view reads cannot accidentally consume an export gate.
    if (armed && pageSize === 100) {
      exportReads.push({ page: currentPage, pageSize, cursor });
      requests.push(request);
      checkpoint("export-read", { ordinal: exportReads.length, held: holds.has(exportReads.length) });
      result = await (holds.get(exportReads.length)?.promise ?? Promise.resolve("success" as const));
    }
    try {
      // A terminal status avoids the API client's separate transport retries.
      if (result === "failure") {
        await route.fulfill({ status: 422, json: {
          message: "Synthetic export page rejected", code: "SYNTHETIC_EXPORT_FAILURE",
        } });
        checkpoint("data-response", { page: currentPage, pageSize, status: 422 });
        return;
      }
      const pageRows = rows.slice(offset, offset + pageSize);
      const hasNextPage = offset + pageRows.length < rowCount;
      const nextCursor = hasNextPage ? `export:${pageSize}:${offset + pageRows.length}` : null;
      await route.fulfill({ json: {
        headers, rows: pageRows, total: rowCount, page: currentPage, pageSize, limit: pageSize, offset, nextCursor,
        pagination: { mode: "hybrid", page: currentPage, pageSize, limit: pageSize, offset, nextCursor,
          total: rowCount, totalPages: Math.ceil(rowCount / pageSize), hasNextPage, hasPreviousPage: currentPage > 1 },
      } });
      checkpoint("data-response", { page: currentPage, pageSize, status: 200 });
    } catch (error) {
      // Teardown can release a held response after the real fetch was aborted.
      if (!request.failure() && !page.isClosed()) throw error;
    }
  });
  checkpoint("fixture-ready");
  return {
    fixture, exportReads, requests, downloads,
    arm() { armed = true; },
    disarm() { armed = false; },
    holdRead(ordinal: number) {
      const gate = deferred<ReadResult>();
      holds.set(ordinal, gate);
      return (result: ReadResult = "success") => {
        checkpoint("release-read", { ordinal, result });
        gate.resolve(result);
      };
    },
    releaseAll() { for (const gate of holds.values()) gate.resolve("success"); },
  };
}

async function openViewer(page: Page) {
  checkpoint("navigation-start");
  const configured = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/app-config");
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  expect((await configured).status()).toBe(200);
  checkpoint("app-config-ready");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page).toHaveURL(/\/viewer(?:[?#]|$)/);
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  const size = page.getByTestId("select-viewer-page-size");
  const pagination = page.getByRole("navigation", { name: "Dataset pagination", exact: true });
  await expect(pagination).toContainText("Showing 1-100 of 237 rows");
  checkpoint("initial-view-ready");
  // Allow the mount's existing 300ms empty-filter debounce to finish before
  // choosing the test's visible page size. Real timers continue running.
  await page.waitForTimeout(350);
  await expect(size).toBeEnabled();
  const resized = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/imports/${importId}/data` && url.searchParams.get("pageSize") === "25";
  });
  await size.selectOption("25");
  const resizedResponse = await resized;
  expect(resizedResponse.status()).toBe(200);
  await resizedResponse.finished();
  checkpoint("resized-response-ready");
  await expect(size).toHaveValue("25");
  await expect(pagination).toContainText("Showing 1-25 of 237 rows");
  await expect(size).toBeEnabled();
  checkpoint("viewer-ready");
}

async function startExport(page: Page, kind: ExportKind) {
  checkpoint("export-start", { kind });
  const more = page.getByTestId("button-viewer-more-actions");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  const trigger = page.getByTestId("button-export-menu");
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  checkpoint("more-menu-ready", { kind });
  // Clicking the desktop subtrigger opens it directly, without racing the
  // parent menu's deferred focus restoration after an earlier export.
  await trigger.click();
  const action = page.getByTestId(`button-export-${kind}-all`);
  await expect(action).toBeVisible();
  checkpoint("export-submenu-ready", { kind });
  await action.click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  checkpoint("export-selected", { kind });
}

async function expectBusy(page: Page) {
  checkpoint("busy-check-start");
  const status = page.getByTestId("viewer-export-status");
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toContainText("Sedang menyediakan fail");
  checkpoint("busy-visible");
  await expect(page.getByTestId("button-cancel-viewer-export")).toBeEnabled();
  await expect(page.getByTestId("select-viewer-page-size")).toBeDisabled();
  await page.getByTestId("button-viewer-more-actions").click();
  const trigger = page.getByTestId("button-export-menu");
  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  // Duplicate CSV and cross-format attempts share this disabled entry point.
  // Keyboard activation cannot reopen it or start another paged read.
  await trigger.press("ArrowRight");
  await trigger.press("Enter");
  for (const kind of ["csv", "excel", "pdf"]) {
    await expect(page.getByTestId(`button-export-${kind}-all`)).toBeHidden();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-viewer-more-actions")).toHaveAttribute("aria-expanded", "false");
  checkpoint("busy-controls-checked");
}

async function expectIdle(page: Page) {
  checkpoint("idle-check-start");
  await expect(page.getByTestId("viewer-export-status")).toBeHidden();
  checkpoint("idle-visible");
}

async function verifyFixture(page: Page, fixture: Awaited<ReturnType<typeof installSessionFixture>>) {
  checkpoint("fixture-check", { unexpected: fixture.unexpected, errors: fixture.errors });
  await checkFixture(page, fixture);
}

const fullSequence: DataRead[] = [
  { page: 1, pageSize: 100, cursor: null },
  { page: 2, pageSize: 100, cursor: "export:100:100" },
  { page: 3, pageSize: 100, cursor: "export:100:200" },
];

async function expectCsv(download: Download) {
  checkpoint("csv-stream-start");
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const records = Buffer.concat(chunks).toString("utf8").trim().split(/\r?\n/);
  checkpoint("csv-stream-ready", { records: records.length });
  // One aggregate assertion verifies every cell, record count and row order.
  // Avoid hundreds of redundant Playwright assertion bookkeeping operations.
  const expectedRecords = [
    '"Customer Name","Reference","Region"',
    ...Array.from({ length: rowCount }, (_, index) =>
      `"Synthetic Customer ${String(index + 1).padStart(3, "0")}","SYNTHETIC-${index + 1}","${index % 2 === 0 ? "North" : "South"}"`),
  ];
  expect(records).toEqual(expectedRecords);
  checkpoint("csv-content-checked");
  await download.delete();
  checkpoint("csv-download-deleted");
}

test("Viewer CSV: duplicate and cross-format attempts share one full paged export", async ({ page, baseURL }) => {
  const state = await installFixture(page, baseURL);
  const release = state.holdRead(1);
  try {
    await openViewer(page);
    state.arm();
    await startExport(page, "csv");
    await expect.poll(() => state.exportReads.length).toBe(1);
    await expectBusy(page);
    await page.waitForTimeout(350);
    expect(state.exportReads).toEqual(fullSequence.slice(0, 1));
    const downloaded = page.waitForEvent("download");
    release();
    await expectCsv(await downloaded);
    await expectIdle(page);
    await expect(page.getByTestId("select-viewer-page-size")).toBeEnabled();
    expect(state.exportReads).toEqual(fullSequence);
    expect(state.downloads).toHaveLength(1);
    await verifyFixture(page, state.fixture);
  } finally { state.releaseAll(); }
});

for (const kind of ["csv", "excel", "pdf"] as const) {
  test(`Viewer ${kind}: accessible busy state, cancellation without a late download, and retry`, async ({ page, baseURL }) => {
    const state = await installFixture(page, baseURL);
    const release = state.holdRead(1);
    try {
      await openViewer(page);
      state.arm();
      await startExport(page, kind);
      await expect.poll(() => state.exportReads.length).toBe(1);
      await expectBusy(page);
      await page.getByTestId("button-cancel-viewer-export").click();
      await expectIdle(page);
      await expect(page.getByTestId("select-viewer-page-size")).toBeEnabled();
      await expect.poll(() => state.requests[0]!.failure()).not.toBeNull();
      release();
      await page.waitForTimeout(350);
      expect(state.downloads).toHaveLength(0);
      expect(state.exportReads).toEqual(fullSequence.slice(0, 1));
      const downloaded = page.waitForEvent("download");
      await startExport(page, "csv");
      await expectCsv(await downloaded);
      await expectIdle(page);
      expect(state.exportReads).toEqual([fullSequence[0], ...fullSequence]);
      expect(state.downloads).toHaveLength(1);
      await verifyFixture(page, state.fixture);
    } finally { state.releaseAll(); }
  });
}

test("Viewer CSV: a failed later page releases busy state and retries from page one", async ({ page, baseURL }) => {
  const state = await installFixture(page, baseURL);
  const release = state.holdRead(2);
  try {
    await openViewer(page);
    state.arm();
    await startExport(page, "csv");
    await expect.poll(() => state.exportReads.length).toBe(2);
    await expectBusy(page);
    release("failure");
    await expect(page.getByText("CSV Export Failed", { exact: true })).toBeVisible();
    await expectIdle(page);
    expect(state.downloads).toHaveLength(0);
    const downloaded = page.waitForEvent("download");
    await startExport(page, "csv");
    await expectCsv(await downloaded);
    await expectIdle(page);
    expect(state.exportReads).toEqual([...fullSequence.slice(0, 2), ...fullSequence]);
    expect(state.downloads).toHaveLength(1);
    await verifyFixture(page, state.fixture);
  } finally { state.releaseAll(); }
});

test("Viewer CSV: a cancelled lazy import cannot download or unlock a replacement export", async ({ page, baseURL }) => {
  const state = await installFixture(page, baseURL);
  const moduleGate = deferred<void>();
  let moduleRequests = 0;
  await page.context().route((url) => url.origin === new URL(baseURL!).origin
    && isExportModule(url), async (route) => {
    moduleRequests++;
    await moduleGate.promise;
    await route.continue();
  });
  const releaseReplacement = state.holdRead(4);
  try {
    await openViewer(page);
    state.arm();
    await startExport(page, "csv");
    await expect.poll(() => moduleRequests).toBeGreaterThan(0);
    expect(state.exportReads).toEqual(fullSequence);
    await expectBusy(page);
    await page.getByTestId("button-cancel-viewer-export").click();
    await expectIdle(page);
    await startExport(page, "csv");
    await expect.poll(() => state.exportReads.length).toBe(4);
    const moduleLoaded = page.waitForResponse((response) => isExportModule(new URL(response.url())));
    moduleGate.resolve();
    await (await moduleLoaded).finished();
    // The cancelled continuation and finally run while the new read is held.
    // Neither may write a file or clear the replacement operation's lock.
    await page.waitForTimeout(500);
    expect(state.downloads).toHaveLength(0);
    await expectBusy(page);
    expect(state.exportReads).toEqual([...fullSequence, fullSequence[0]]);
    const downloaded = page.waitForEvent("download");
    releaseReplacement();
    await expectCsv(await downloaded);
    await expectIdle(page);
    expect(state.exportReads).toEqual([...fullSequence, ...fullSequence]);
    expect(state.downloads).toHaveLength(1);
    await verifyFixture(page, state.fixture);
  } finally {
    moduleGate.resolve();
    state.releaseAll();
  }
});

test("Viewer CSV: leaving the Viewer aborts a pending export and allows a fresh export after returning", async ({ page, baseURL }) => {
  const state = await installFixture(page, baseURL);
  const release = state.holdRead(1);
  try {
    await openViewer(page);
    state.arm();
    await startExport(page, "csv");
    await expect.poll(() => state.exportReads.length).toBe(1);
    await page.getByTestId("button-back").click();
    await expect(page).toHaveURL(/\/saved(?:[?#]|$)/);
    await expect.poll(() => state.requests[0]!.failure()).not.toBeNull();
    release();
    await page.waitForTimeout(350);
    expect(state.downloads).toHaveLength(0);
    expect(state.exportReads).toEqual(fullSequence.slice(0, 1));
    state.disarm();
    await openViewer(page);
    state.arm();
    const downloaded = page.waitForEvent("download");
    await startExport(page, "csv");
    await expectCsv(await downloaded);
    await expectIdle(page);
    expect(state.exportReads).toEqual([fullSequence[0], ...fullSequence]);
    expect(state.downloads).toHaveLength(1);
    await verifyFixture(page, state.fixture);
  } finally { state.releaseAll(); }
});
