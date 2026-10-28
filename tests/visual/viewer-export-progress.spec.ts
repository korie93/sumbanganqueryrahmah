import { expect, test, type Download, type Page, type Request } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Production frontend only; all records, account state and API responses are
// fictional. Explicit gates distinguish requested pages from received rows.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", acceptDownloads: true,
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0 });

const importId = "viewer-export-progress-synthetic";
const importName = "Synthetic export progress dataset";
const headers = ["Customer Name", "Reference", "Region"];
const rows = Array.from({ length: 237 }, (_, index) => ({
  id: `progress-row-${index + 1}`, importId,
  jsonDataJsonb: { "Customer Name": `Synthetic Customer ${String(index + 1).padStart(3, "0")}`,
    Reference: `PROGRESS-${index + 1}`, Region: index % 2 === 0 ? "North" : "South" },
}));
type ExportKind = "csv" | "excel" | "pdf";
type Read = { page: number; pageSize: number; cursor: string | null };
const isExportModule = (url: URL) => /^\/assets\/export-[\w-]+\.js$/.test(url.pathname);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin;
  const exportReads: Read[] = [];
  const requests: Request[] = [];
  const downloads: Download[] = [];
  const readHolds = new Map<number, ReturnType<typeof deferred>>();
  const moduleGate = deferred();
  let armed = false;
  let moduleRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  page.on("download", (download) => downloads.push(download));
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } }));
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-progress.csv",
      rowCount: rows.length, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route((url) => url.origin === origin && isExportModule(url), async (route) => {
    moduleRequests++;
    await moduleGate.promise;
    if (!page.isClosed()) await route.continue();
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const request = route.request();
    const params = new URL(request.url()).searchParams;
    const read = { page: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 100),
      cursor: params.get("cursor") };
    const offset = (read.page - 1) * read.pageSize;
    expect([25, 100]).toContain(read.pageSize);
    expect(Number.isInteger(read.page) && read.page > 0).toBe(true);
    expect(["", "Synthetic"]).toContain(params.get("search") ?? "");
    expect(JSON.parse(params.get("columnFilters") ?? "[]")).toEqual([]);
    expect(read.cursor).toBe(read.page === 1 ? null : `progress:${read.pageSize}:${offset}`);
    if (armed && read.pageSize === 100) {
      exportReads.push(read);
      requests.push(request);
      await readHolds.get(exportReads.length)?.promise;
    }
    try {
      const pageRows = rows.slice(offset, offset + read.pageSize);
      const hasNextPage = offset + pageRows.length < rows.length;
      const nextCursor = hasNextPage ? `progress:${read.pageSize}:${offset + pageRows.length}` : null;
      await route.fulfill({ json: { headers, rows: pageRows, total: rows.length, page: read.page,
        pageSize: read.pageSize, limit: read.pageSize, offset, nextCursor,
        pagination: { mode: "hybrid", page: read.page, pageSize: read.pageSize, limit: read.pageSize,
          offset, nextCursor, total: rows.length, totalPages: Math.ceil(rows.length / read.pageSize),
          hasNextPage, hasPreviousPage: read.page > 1 } }, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      // Cancellation intentionally permits a response to arrive after abort.
      if (!request.failure() && !page.isClosed()) throw error;
    }
  });
  return { session, exportReads, requests, downloads,
    arm() { armed = true; },
    holdRead(ordinal: number) {
      const gate = deferred();
      readHolds.set(ordinal, gate);
      return gate.resolve;
    },
    moduleRequests: () => moduleRequests,
    releaseModule: moduleGate.resolve,
    releaseAll() { moduleGate.resolve(); for (const gate of readHolds.values()) gate.resolve(); },
  };
}

async function openViewer(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  const size = page.getByTestId("select-viewer-page-size");
  await expect(size).toBeEnabled();
  // Existing empty-filter debounce settles before the test changes pagination.
  await page.waitForTimeout(350);
  if (await size.inputValue() !== "25") await size.selectOption("25");
  await expect(page.getByRole("navigation", { name: "Dataset pagination", exact: true }))
    .toContainText("Showing 1-25 of 237 rows");
  await expect(size).toBeEnabled();
}

async function startExport(page: Page, kind: ExportKind, scope: "all" | "filtered" | "selected" = "all") {
  const more = page.getByTestId("button-viewer-more-actions");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  const trigger = page.getByTestId("button-export-menu");
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.getByTestId(`button-export-${kind}-${scope}`).click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
}

async function expectStatus(page: Page, text: string) {
  const status = page.getByTestId("viewer-export-status");
  await expect(status).toHaveText(text);
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).not.toContainText("%");
  await expect(page.getByTestId("button-cancel-viewer-export")).toBeEnabled();
}

async function expectCsv(download: Download, expected: typeof rows) {
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream!) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    expect(bytes).toBeLessThan(1024 * 1024);
    chunks.push(buffer);
  }
  expect(Buffer.concat(chunks).toString("utf8").trim().split(/\r?\n/)).toEqual([
    '"Customer Name","Reference","Region"',
    ...expected.map(({ jsonDataJsonb: data }) => `"${data["Customer Name"]}","${data.Reference}","${data.Region}"`),
  ]);
  await download.delete();
}

test("Viewer export progress: received pages advance counts before CSV preparation and the full download", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  const releaseFirst = fixture.holdRead(1), releaseSecond = fixture.holdRead(2), releaseThird = fixture.holdRead(3);
  try {
    await openViewer(page);
    fixture.arm();
    await startExport(page, "csv");
    await expect.poll(() => fixture.exportReads.length).toBe(1);
    await expectStatus(page, "Mengambil rekod: 0 daripada 237");
    releaseFirst();
    await expect.poll(() => fixture.exportReads.length).toBe(2);
    await expectStatus(page, "Mengambil rekod: 100 daripada 237");
    releaseSecond();
    await expect.poll(() => fixture.exportReads.length).toBe(3);
    await expectStatus(page, "Mengambil rekod: 200 daripada 237");
    releaseThird();
    await expect.poll(fixture.moduleRequests).toBeGreaterThan(0);
    await expectStatus(page, "Menyediakan fail CSV…");
    expect(fixture.downloads).toHaveLength(0);
    await expect(page.getByTestId("select-viewer-page-size")).toBeDisabled();
    const downloaded = page.waitForEvent("download");
    fixture.releaseModule();
    await expectCsv(await downloaded, rows);
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    await expect(page.getByTestId("select-viewer-page-size")).toBeEnabled();
    expect(fixture.exportReads).toEqual([
      { page: 1, pageSize: 100, cursor: null },
      { page: 2, pageSize: 100, cursor: "progress:100:100" },
      { page: 3, pageSize: 100, cursor: "progress:100:200" },
    ]);
    expect(fixture.downloads).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.releaseAll(); }
});

test("Viewer export progress: cancelled page and PDF preparation cannot overwrite replacement CSV progress", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  const releaseOldSecond = fixture.holdRead(2), releasePdfFirst = fixture.holdRead(3), releaseCsvFirst = fixture.holdRead(6);
  try {
    await openViewer(page);
    fixture.arm();
    await startExport(page, "csv");
    await expect.poll(() => fixture.exportReads.length).toBe(2);
    await expectStatus(page, "Mengambil rekod: 100 daripada 237");
    await page.getByTestId("button-cancel-viewer-export").click();
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    await expect.poll(() => fixture.requests[1]!.failure()).not.toBeNull();
    await startExport(page, "pdf");
    await expect.poll(() => fixture.exportReads.length).toBe(3);
    await expectStatus(page, "Mengambil rekod: 0 daripada 237");
    releaseOldSecond();
    await page.waitForTimeout(350);
    await expectStatus(page, "Mengambil rekod: 0 daripada 237");
    expect(fixture.downloads).toHaveLength(0);
    releasePdfFirst();
    await expect.poll(fixture.moduleRequests).toBeGreaterThan(0);
    await expectStatus(page, "Menyediakan fail PDF…");
    await page.getByTestId("button-cancel-viewer-export").click();
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    await startExport(page, "csv");
    await expect.poll(() => fixture.exportReads.length).toBe(6);
    await expectStatus(page, "Mengambil rekod: 0 daripada 237");
    const loaded = page.waitForResponse((response) => isExportModule(new URL(response.url())));
    fixture.releaseModule();
    await (await loaded).finished();
    // The obsolete PDF continuation/finalizer must not clear current progress.
    await page.waitForTimeout(350);
    await expectStatus(page, "Mengambil rekod: 0 daripada 237");
    expect(fixture.downloads).toHaveLength(0);
    const downloaded = page.waitForEvent("download");
    releaseCsvFirst();
    await expectCsv(await downloaded, rows);
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    expect(fixture.exportReads.map((read) => read.page)).toEqual([1, 2, 1, 2, 3, 1, 2, 3]);
    expect(fixture.downloads).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.releaseAll(); }
});

test("Viewer export progress: mobile320 selected Excel preparation fits and cancellation preserves a selected CSV retry", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  try {
    await openViewer(page);
    for (const number of [1, 2]) await page.getByRole("checkbox", { name: `Select row ${number}`, exact: true }).check();
    fixture.arm();
    await startExport(page, "excel", "selected");
    await expect.poll(fixture.moduleRequests).toBeGreaterThan(0);
    await expectStatus(page, "Menyediakan fail Excel…");
    const status = page.getByTestId("viewer-export-status");
    await expect(status).not.toContainText("Mengambil");
    expect(fixture.exportReads).toEqual([]);
    const layout = await status.evaluate((element) => {
      const panel = element.parentElement!;
      const rect = panel.getBoundingClientRect();
      const cancel = panel.querySelector("button")!.getBoundingClientRect();
      return { x: rect.x, right: rect.right, width: rect.width, scroll: panel.scrollWidth, client: panel.clientWidth,
        cancelX: cancel.x, cancelRight: cancel.right, cancelHeight: cancel.height };
    });
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(321);
    expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
    expect(layout.cancelX).toBeGreaterThanOrEqual(layout.x);
    expect(layout.cancelRight).toBeLessThanOrEqual(layout.right + 1);
    expect(layout.cancelHeight).toBeGreaterThanOrEqual(32);
    const cancel = page.getByTestId("button-cancel-viewer-export");
    await cancel.focus();
    await page.keyboard.press("Enter");
    await expect(status).toBeHidden();
    const loaded = page.waitForResponse((response) => isExportModule(new URL(response.url())));
    fixture.releaseModule();
    await (await loaded).finished();
    await page.waitForTimeout(350);
    expect(fixture.downloads).toHaveLength(0);
    const downloaded = page.waitForEvent("download");
    await startExport(page, "csv", "selected");
    await expectCsv(await downloaded, rows.slice(0, 2));
    await expect(status).toBeHidden();
    expect(fixture.exportReads).toEqual([]);
    expect(fixture.downloads).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.releaseAll(); }
});

test("Viewer export progress: current-page CSV prepares without fetching or reporting unloaded records", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  try {
    await openViewer(page);
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/imports/${importId}/data` && url.searchParams.get("search") === "Synthetic";
    });
    await page.getByTestId("input-search-viewer").fill("Synthetic");
    await (await filtered).finished();
    await expect(page.getByTestId("select-viewer-page-size")).toBeEnabled();
    fixture.arm();
    await startExport(page, "csv", "filtered");
    await expect.poll(fixture.moduleRequests).toBeGreaterThan(0);
    await expectStatus(page, "Menyediakan fail CSV…");
    await expect(page.getByTestId("viewer-export-status")).not.toContainText("Mengambil");
    expect(fixture.exportReads).toEqual([]);
    const downloaded = page.waitForEvent("download");
    fixture.releaseModule();
    await expectCsv(await downloaded, rows.slice(0, 25));
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    expect(fixture.exportReads).toEqual([]);
    expect(fixture.downloads).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.releaseAll(); }
});

test("Viewer export progress: changing the query cancels stale counts and a fresh export starts at zero", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  const releaseOldSecond = fixture.holdRead(2), releaseFreshFirst = fixture.holdRead(3);
  try {
    await openViewer(page);
    fixture.arm();
    await startExport(page, "csv");
    await expect.poll(() => fixture.exportReads.length).toBe(2);
    await expectStatus(page, "Mengambil rekod: 100 daripada 237");
    const searched = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/imports/${importId}/data` && url.searchParams.get("search") === "Synthetic"
        && url.searchParams.get("pageSize") === "25";
    });
    await page.getByTestId("input-search-viewer").fill("Synthetic");
    await (await searched).finished();
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    await expect(page.getByTestId("select-viewer-page-size")).toBeEnabled();
    await expect.poll(() => fixture.requests[1]!.failure()).not.toBeNull();
    releaseOldSecond();
    await page.waitForTimeout(350);
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    expect(fixture.downloads).toHaveLength(0);
    expect(fixture.moduleRequests()).toBe(0);
    await startExport(page, "csv");
    await expect.poll(() => fixture.exportReads.length).toBe(3);
    await expectStatus(page, "Mengambil rekod: 0 daripada 237");
    releaseFreshFirst();
    await expect.poll(fixture.moduleRequests).toBeGreaterThan(0);
    await expectStatus(page, "Menyediakan fail CSV…");
    const downloaded = page.waitForEvent("download");
    fixture.releaseModule();
    await expectCsv(await downloaded, rows);
    await expect(page.getByTestId("viewer-export-status")).toBeHidden();
    expect(fixture.exportReads.map((read) => read.page)).toEqual([1, 2, 1, 2, 3]);
    expect(fixture.downloads).toHaveLength(1);
    await checkFixture(page, fixture.session);
  } finally { fixture.releaseAll(); }
});
