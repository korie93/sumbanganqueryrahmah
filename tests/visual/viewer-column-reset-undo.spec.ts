import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Production Viewer, fictional rows, and the shared fail-closed loopback fixture.
// Reset/Undo are local column actions; legitimate search/page reads are explicit.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const importId = "viewer-column-reset-undo-synthetic";
const importName = "Synthetic column reset dataset";
const otherId = "viewer-column-reset-undo-other";
const otherName = "Synthetic alternate column dataset";
const pinnedHeader = "Customer Name";
const headers = ["Account No", "Amount", pinnedHeader, "Reference", "Notes",
  ...Array.from({ length: 38 }, (_, index) => `Extra Field ${String(index + 1).padStart(2, "0")}`)];
const otherHeaders = ["Case ID", "Status", ...Array.from({ length: 41 }, (_, index) => `Alternate Field ${index + 1}`)];
const preferenceKey = "sqr.viewer.columns.v1";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function installFixture(page: Page, baseURL: string | undefined,
  { theme = "light", rowCount = 12, configuredSize = 100, secondFile = false }:
  { theme?: "light" | "dark"; rowCount?: number; configuredSize?: number; secondFile?: boolean } = {}) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin;
  const datasets = [
    { id: importId, name: importName, fields: headers },
    ...(secondFile ? [{ id: otherId, name: otherName, fields: otherHeaders }] : []),
  ];
  const dataReads: Array<{ id: string; page: number; search: string }> = [];
  const apiGets: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.origin === origin && url.pathname.startsWith("/api/")) {
      apiGets.push(`${url.pathname}${url.search}`);
    }
  });
  await page.addInitScript(({ files, key }) => {
    localStorage.setItem("perf_mode", "high");
    localStorage.setItem(key, JSON.stringify({ datasets: files.map(({ id, fields }) =>
      ({ datasetId: id, order: fields, visible: fields, updatedAt: 1 })) }));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  }, { files: datasets, key: preferenceKey });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } }));
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.context().route(`${origin}/api/app-config`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: configuredSize, wsIdleMinutes: 10,
    } }));
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: {
      imports: datasets.map(({ id, name }) => ({ id, name, filename: `${id}.csv`, rowCount,
        createdAt: now, createdBy: "guidance.superuser", isDeleted: false })),
      pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
        total: datasets.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    } });
  });
  for (const dataset of datasets) {
    const rows = Array.from({ length: rowCount }, (_, index) => ({
      id: `${dataset.id}-row-${index + 1}`, importId: dataset.id,
      jsonDataJsonb: Object.fromEntries(dataset.fields.map((field) => [field,
        field === pinnedHeader ? `Synthetic Customer ${String(index + 1).padStart(3, "0")}`
          : `Synthetic ${field} value ${index + 1}`,
      ])),
    }));
    await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${dataset.id}/data`, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const url = new URL(route.request().url());
      const pageSize = Number(url.searchParams.get("pageSize") ?? 100);
      const currentPage = Number(url.searchParams.get("page") ?? 1);
      const search = url.searchParams.get("search") ?? "";
      const offset = (currentPage - 1) * pageSize;
      expect([12, 25, 100]).toContain(pageSize);
      expect([1, 2]).toContain(currentPage);
      expect(["", "Synthetic"]).toContain(search);
      expect(JSON.parse(url.searchParams.get("columnFilters") ?? "[]")).toEqual([]);
      expect(url.searchParams.get("cursor")).toBe(currentPage === 1 ? null : `reset-undo:${pageSize}:${offset}`);
      dataReads.push({ id: dataset.id, page: currentPage, search });
      const pageRows = rows.slice(offset, offset + pageSize);
      const hasNextPage = offset + pageRows.length < rows.length;
      const nextCursor = hasNextPage ? `reset-undo:${pageSize}:${offset + pageRows.length}` : null;
      return route.fulfill({ json: { headers: dataset.fields, rows: pageRows, total: rows.length,
        page: currentPage, pageSize, limit: pageSize, offset, nextCursor,
        pagination: { page: currentPage, pageSize, limit: pageSize, mode: "hybrid", offset, nextCursor,
          total: rows.length, totalPages: Math.ceil(rows.length / pageSize), hasNextPage, hasPreviousPage: currentPage > 1 } },
      headers: { "Cache-Control": "no-store" } });
    });
  }
  return { session, dataReads, apiGets, rowCount, configuredSize, fileCount: datasets.length };
}

const readCounts = (fixture: Awaited<ReturnType<typeof installFixture>>) =>
  ({ data: fixture.dataReads.length, api: fixture.apiGets.length });

const searchColumns = (page: Page) => page.getByTestId("input-viewer-column-search");
const results = (page: Page) => page.getByTestId("viewer-column-search-results");
const notice = (page: Page) => page.getByTestId("viewer-column-reset-notice");
const undo = (page: Page) => page.getByTestId("button-undo-viewer-column-reset");
const reset = (page: Page) => page.getByTestId("button-reset-columns");
const checkbox = (page: Page, header: string) => page.getByTestId(`checkbox-column-${header}`);
const pin = (page: Page, header = pinnedHeader) => results(page).getByRole("button", { name: `Pin ${header}`, exact: true });
const viewport = (page: Page) => page.getByRole("region", { name: "Viewer data columns", exact: true });
const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });

async function openViewer(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText(`${fixture.fileCount} ${fixture.fileCount === 1 ? "file" : "files"}`);
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await expect(page.locator(".viewer-page-context")).toHaveText(`${fixture.rowCount} rekod · 43 lajur`);
  await expect(page.getByTestId("select-viewer-page-size")).toHaveValue(
    (page.viewportSize()?.width ?? 1440) < 768 ? "25" : String(fixture.configuredSize));
  // Settle the existing initial empty-filter debounce before measuring local actions.
  await page.waitForTimeout(350);
}

async function openColumns(page: Page) {
  await page.getByTestId("button-column-selector").focus();
  await page.keyboard.press("Enter");
  await expect(searchColumns(page)).toBeVisible();
  await expect(results(page).getByRole("checkbox")).toHaveCount(43);
}

async function closeColumns(page: Page) {
  await page.keyboard.press("Escape");
  await expect(searchColumns(page)).toBeHidden();
  await expect(page.getByTestId("button-column-selector")).toBeFocused();
}

async function expectNotice(page: Page) {
  await expect(notice(page)).toBeVisible();
  const status = notice(page).getByRole("status");
  await expect(status).toHaveText("Column layout reset.");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(undo(page)).toHaveText("Undo");
  await expect(undo(page)).toHaveAccessibleName("Undo column reset");
  const popup = page.getByRole("dialog", { name: "Select Columns", exact: true });
  await expect(popup.getByTestId("viewer-column-reset-notice")).toHaveCount(1);
}

async function columnOrder(page: Page) {
  return results(page).locator("[data-viewer-column-name]").allTextContents();
}

async function desktopOrder(page: Page) {
  return viewport(page).locator("[data-viewer-column]").evaluateAll((elements) => {
    const first = elements[0]?.parentElement;
    return elements.filter((element) => element.parentElement === first)
      .map((element) => element.getAttribute("data-viewer-column"));
  });
}

async function readPreference(page: Page, datasetId = importId) {
  return page.evaluate(({ key, id }) => {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as
      { datasets: Array<{ datasetId: string; order: string[]; visible: string[] }> } | null;
    const entry = stored?.datasets.find((dataset) => dataset.datasetId === id);
    return entry ? { order: entry.order, visible: entry.visible } : null;
  }, { key: preferenceKey, id: datasetId });
}

async function expectDefaultLayout(page: Page) {
  await expect.poll(() => columnOrder(page)).toEqual(headers);
  await expect(results(page).locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(43);
  await expect(results(page).locator('[data-viewer-pin-control][aria-pressed="true"]')).toHaveCount(0);
}

async function expectNoLocalReads(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, reads: ReturnType<typeof readCounts>) {
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Local column actions must not fetch dataset rows").toHaveLength(reads.data);
  expect(fixture.apiGets, "Local column actions must not add API GET requests").toHaveLength(reads.api);
}

async function finishFixture(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, reads: ReturnType<typeof readCounts>) {
  await expectNoLocalReads(page, fixture, reads);
  await checkFixture(page, fixture.session);
}

test("Viewer column reset undo: desktop keyboard restores order visibility and pin once after closing and reopening Columns", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page, fixture);
  const reads = readCounts(fixture);
  await openColumns(page);
  await checkbox(page, "Notes").uncheck();
  await page.getByRole("button", { name: "Move Reference up", exact: true }).click();
  await pin(page).click();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "true");
  const order = ["Account No", "Amount", "Reference", pinnedHeader, ...headers.slice(4)];
  const visible = order.filter((header) => header !== "Notes");
  await expect.poll(() => readPreference(page)).toEqual({ order, visible });
  const resetStatus = page.getByTestId("viewer-column-reset-status");
  await expect(resetStatus).toHaveCount(1);
  await expect(resetStatus).toHaveText("");
  await resetStatus.evaluate((element) => element.setAttribute("data-test-node", "persistent-reset-status"));
  await reset(page).focus();
  await page.keyboard.press("Enter");
  await expectNotice(page);
  await expect(resetStatus).toHaveAttribute("data-test-node", "persistent-reset-status");
  await expect(resetStatus).toHaveText("Column layout reset.");
  await expectDefaultLayout(page);
  await expect.poll(() => readPreference(page)).toEqual({ order: headers, visible: headers });
  await undo(page).focus();
  await page.keyboard.press("Enter");
  await expect(resetStatus).toHaveAttribute("data-test-node", "persistent-reset-status");
  await expect(resetStatus).toHaveText("");
  await expect(notice(page)).toHaveCount(0);
  await expect.poll(() => readPreference(page)).toEqual({ order, visible });
  // A separate pending reset also survives the popup's normal unmount/reopen.
  await reset(page).focus();
  await page.keyboard.press("Enter");
  await expectNotice(page);
  await closeColumns(page);
  await expect(notice(page)).toBeHidden();
  await expect.poll(() => desktopOrder(page)).toEqual(headers);
  await openColumns(page);
  await expectNotice(page);
  await undo(page).focus();
  await page.keyboard.press("Enter");
  await expect(notice(page)).toHaveCount(0);
  await expect(undo(page)).toHaveCount(0);
  await expect.poll(() => columnOrder(page)).toEqual(order);
  await expect(checkbox(page, "Notes")).not.toBeChecked();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => readPreference(page)).toEqual({ order, visible });
  await closeColumns(page);
  await expect.poll(() => desktopOrder(page)).toEqual([pinnedHeader, ...visible.filter((header) => header !== pinnedHeader)]);
  await expect(viewport(page).locator('[data-viewer-pinned="true"]').first()).toHaveAttribute("data-viewer-column", pinnedHeader);
  await openColumns(page);
  await expect(notice(page)).toHaveCount(0);
  await expect(undo(page)).toHaveCount(0);
  await closeColumns(page);
  await finishFixture(page, fixture, reads);
});

test("Viewer column reset undo: repeated and no-op actions retain the snapshot while effective column changes consume it", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { rowCount: 24, configuredSize: 12 });
  await openViewer(page, fixture);
  const initialReads = readCounts(fixture);
  await openColumns(page);
  await reset(page).click();
  await expect(notice(page)).toHaveCount(0);
  await checkbox(page, "Notes").uncheck();
  await reset(page).click();
  await reset(page).click();
  await page.getByTestId("button-select-all-columns").click();
  await expect(page.getByRole("button", { name: "Move Account No up", exact: true })).toBeDisabled();
  await expectNotice(page);
  await closeColumns(page);
  await expectNoLocalReads(page, fixture, initialReads);
  // Search/page requests may load rows, but their unchanged headers must retain Undo.
  await page.getByTestId("input-search-viewer").fill("Synthetic");
  await expect.poll(() => fixture.dataReads[fixture.dataReads.length - 1]?.search).toBe("Synthetic");
  await expect(pagination(page)).toContainText("Showing 1-12 of 24 rows");
  await page.getByTestId("button-viewer-next-page").click();
  await expect(pagination(page)).toContainText("Showing 13-24 of 24 rows");
  const reads = readCounts(fixture);
  await page.getByTestId("viewer-density-compact").click();
  const row = page.getByRole("checkbox", { name: "Select row 13", exact: true });
  await row.check();
  await openColumns(page);
  await expectNotice(page);
  await searchColumns(page).fill("Notes");
  await expect(results(page).getByRole("checkbox")).toHaveCount(1);
  await reset(page).click();
  await expect(searchColumns(page)).toHaveValue("Notes");
  await expectNotice(page);
  await undo(page).click();
  await expect(checkbox(page, "Notes")).not.toBeChecked();
  await expect(notice(page)).toHaveCount(0);
  await closeColumns(page);
  await expect(row).toBeChecked();
  await expect(page.getByTestId("input-search-viewer")).toHaveValue("Synthetic");
  await expect(page.getByTestId("viewer-density-compact")).toHaveAttribute("data-state", "on");
  await expect(pagination(page)).toContainText("Showing 13-24 of 24 rows");
  await openColumns(page);
  await reset(page).click();
  await expectNotice(page);
  await checkbox(page, "Notes").uncheck();
  await expect(notice(page)).toHaveCount(0);
  await reset(page).click();
  await expectNotice(page);
  await page.getByRole("button", { name: "Move Reference up", exact: true }).click();
  await expect(notice(page)).toHaveCount(0);
  await reset(page).click();
  await expectNotice(page);
  await page.getByTestId("button-deselect-columns").click();
  await expect(notice(page)).toHaveCount(0);
  await reset(page).click();
  await expectNotice(page);
  await pin(page).click();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "true");
  await expect(notice(page)).toHaveCount(0);
  await closeColumns(page);
  await expect(row).toBeChecked();
  await expect(page.getByTestId("input-search-viewer")).toHaveValue("Synthetic");
  await finishFixture(page, fixture, reads);
});

test("Viewer column reset undo: mobile320 dark sheet keeps the English notice accessible and keyboard Undo within bounds", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, { theme: "dark" });
  await openViewer(page, fixture);
  const reads = readCounts(fixture);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await openColumns(page);
  const dialog = page.getByRole("dialog", { name: "Select Columns", exact: true });
  await expect(results(page).locator("[data-viewer-pin-control]")).toHaveCount(0);
  await checkbox(page, "Notes").uncheck();
  await page.getByRole("button", { name: "Move Reference up", exact: true }).click();
  await reset(page).focus();
  await page.keyboard.press("Enter");
  await expectNotice(page);
  await expectDefaultLayout(page);
  await closeColumns(page);
  await openColumns(page);
  await expectNotice(page);
  const bounds = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const notice = element.querySelector('[data-testid="viewer-column-reset-notice"]')!.getBoundingClientRect();
    const undo = element.querySelector('[data-testid="button-undo-viewer-column-reset"]')!.getBoundingClientRect();
    return { x: rect.x, right: rect.right, bottom: rect.bottom, top: rect.top,
      scroll: element.scrollWidth, width: element.clientWidth,
      noticeX: notice.x, noticeRight: notice.right, undoX: undo.x, undoRight: undo.right,
      undoTop: undo.top, undoBottom: undo.bottom, undoWidth: undo.width, undoHeight: undo.height };
  });
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(321);
  expect(bounds.top).toBeGreaterThanOrEqual(-1);
  expect(bounds.bottom).toBeLessThanOrEqual(741);
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.noticeX).toBeGreaterThanOrEqual(bounds.x);
  expect(bounds.noticeRight).toBeLessThanOrEqual(bounds.right);
  expect(bounds.undoX).toBeGreaterThanOrEqual(bounds.x);
  expect(bounds.undoRight).toBeLessThanOrEqual(bounds.right);
  expect(bounds.undoTop).toBeGreaterThanOrEqual(bounds.top);
  expect(bounds.undoBottom).toBeLessThanOrEqual(bounds.bottom);
  expect(bounds.undoWidth).toBeGreaterThanOrEqual(44);
  expect(bounds.undoHeight).toBeGreaterThanOrEqual(44);
  await page.evaluate(axeSource);
  const violations = await dialog.evaluate(async (element) => {
    const axe = (window as unknown as Window & { axe: { run: (root: Element, options: { resultTypes: string[] }) =>
      Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    const result = await axe.run(element, { resultTypes: ["violations"] });
    return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, impact }) => ({ id, impact }));
  });
  expect(violations, "The mobile Columns sheet must have no serious/critical accessibility violations").toEqual([]);
  // Reset precedes the notice in keyboard order; Tab must reach its internal action.
  await reset(page).focus();
  await page.keyboard.press("Tab");
  await expect(undo(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(notice(page)).toHaveCount(0);
  await expect(checkbox(page, "Notes")).not.toBeChecked();
  await expect.poll(() => columnOrder(page)).toEqual(["Account No", "Amount", "Reference", pinnedHeader, ...headers.slice(4)]);
  await closeColumns(page);
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(12);
  await expect(page.locator(".viewer-mobile-card").first().locator("dt")).toHaveText(["Account No", "Amount", "Reference"]);
  await openColumns(page);
  await expect(notice(page)).toHaveCount(0);
  await expect(checkbox(page, "Notes")).not.toBeChecked();
  await closeColumns(page);
  await finishFixture(page, fixture, reads);
});

test("Viewer column reset undo: leaving Viewer and opening another file cannot revive a stale snapshot", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { secondFile: true });
  await openViewer(page, fixture);
  await openColumns(page);
  await checkbox(page, "Notes").uncheck();
  await pin(page).click();
  await reset(page).click();
  await expectNotice(page);
  await closeColumns(page);
  await page.getByTestId("button-back").click();
  await expect(page.getByTestId(`button-view-${importId}`)).toBeVisible();
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await openColumns(page);
  await expect(notice(page)).toHaveCount(0);
  await expectDefaultLayout(page);
  await checkbox(page, "Reference").uncheck();
  await reset(page).click();
  await expectNotice(page);
  await closeColumns(page);
  await page.getByTestId("button-back").click();
  await page.getByTestId(`button-view-${otherId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(otherName);
  await openColumns(page);
  await expect(notice(page)).toHaveCount(0);
  await expect.poll(() => columnOrder(page)).toEqual(otherHeaders);
  await expect(results(page).locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(43);
  await reset(page).click();
  await expect(notice(page)).toHaveCount(0);
  await checkbox(page, "Status").uncheck();
  await reset(page).click();
  await expectNotice(page);
  await closeColumns(page);
  await page.getByTestId("button-back").click();
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await page.waitForTimeout(350);
  const reads = readCounts(fixture);
  await openColumns(page);
  await expect(notice(page)).toHaveCount(0);
  await expectDefaultLayout(page);
  await reset(page).click();
  await expect(notice(page)).toHaveCount(0);
  await closeColumns(page);
  await finishFixture(page, fixture, reads);
});
