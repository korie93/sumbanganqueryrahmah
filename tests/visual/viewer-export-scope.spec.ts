import { expect, test, type Download, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual production Viewer with fictional records and strict loopback API
// fixtures. Downloaded CSV content is checked for each existing export scope.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
test.describe.configure({ retries: 0 });

const importId = "viewer-export-scope-synthetic";
const importName = "Synthetic export scope dataset";
const headers = ["Customer Name", "Reference", "Region"];
const scopeHint = "Paparan halaman ini hanya mengeksport rekod yang sedang ditunjukkan.";
const rows = Array.from({ length: 1200 }, (_, index) => ({
  id: `scope-row-${index + 1}`, importId,
  jsonDataJsonb: {
    "Customer Name": `Synthetic Export Customer ${String(index + 1).padStart(4, "0")}`,
    Reference: `SCOPE-${index + 1}`, Region: index % 2 === 0 ? "North" : "South",
  },
}));
type Filter = { column: string; operator: string; value: string };
type Read = { page: number; pageSize: number; cursor: string | null; search: string; filters: Filter[] };

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin;
  const reads: Read[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } }));
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-export-scope.csv",
      rowCount: rows.length, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const query: Read = { page: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 100),
      cursor: params.get("cursor"), search: params.get("search") ?? "",
      filters: JSON.parse(params.get("columnFilters") ?? "[]") as Filter[] };
    const matches = rows.filter((row) => {
      const values: Record<string, string> = row.jsonDataJsonb;
      if (query.search && !Object.values(values).some((value) => value.toLowerCase().includes(query.search.toLowerCase()))) return false;
      return query.filters.every(({ column, operator, value }) => {
        const actual = (values[column] ?? "").toLowerCase(), wanted = value.toLowerCase();
        if (operator === "equals") return actual === wanted;
        if (operator === "startsWith") return actual.startsWith(wanted);
        if (operator === "endsWith") return actual.endsWith(wanted);
        if (operator === "notEquals") return actual !== wanted;
        return actual.includes(wanted);
      });
    });
    const offset = (query.page - 1) * query.pageSize;
    expect(query.cursor).toBe(query.page === 1 ? null : `scope:${query.pageSize}:${offset}`);
    const pageRows = matches.slice(offset, offset + query.pageSize);
    const hasNextPage = offset + pageRows.length < matches.length;
    const nextCursor = hasNextPage ? `scope:${query.pageSize}:${offset + pageRows.length}` : null;
    reads.push(query);
    return route.fulfill({ json: { headers, rows: pageRows, total: matches.length, page: query.page,
      pageSize: query.pageSize, limit: query.pageSize, offset, nextCursor,
      pagination: { mode: "hybrid", page: query.page, pageSize: query.pageSize, limit: query.pageSize, offset,
        nextCursor, total: matches.length, totalPages: Math.max(1, Math.ceil(matches.length / query.pageSize)),
        hasNextPage, hasPreviousPage: query.page > 1 } }, headers: { "Cache-Control": "no-store" } });
  });
  return { session, reads };
}

async function openViewer(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  const size = page.getByTestId("select-viewer-page-size");
  await expect(size).toBeEnabled();
  if (await size.inputValue() !== "25") await size.selectOption("25");
  await expect(page.getByRole("navigation", { name: "Dataset pagination", exact: true }))
    .toContainText("Showing 1-25 of 1200 rows");
}

async function openExport(page: Page, keyboard = false) {
  const more = page.getByTestId("button-viewer-more-actions");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  if (keyboard) { await more.focus(); await page.keyboard.press("Enter"); }
  else await more.click();
  const trigger = page.getByTestId("button-export-menu");
  await expect(trigger).toBeEnabled();
  if (keyboard) { await trigger.focus(); await page.keyboard.press("ArrowRight"); }
  else await trigger.click();
  await expect(page.getByTestId("button-export-csv-all")).toBeVisible();
}

async function closeDesktopExport(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-viewer-more-actions")).toHaveAttribute("aria-expanded", "false");
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
  const records = Buffer.concat(chunks).toString("utf8").trim().split(/\r?\n/);
  expect(records).toEqual(['"Customer Name","Reference","Region"', ...expected.map((row) => {
    const data = row.jsonDataJsonb;
    return `"${data["Customer Name"]}","${data.Reference}","${data.Region}"`;
  })]);
  await download.delete();
}

async function exportCsv(page: Page, scope: "all" | "filtered" | "selected", expected: typeof rows, keyboard = false) {
  await openExport(page, keyboard);
  const downloaded = page.waitForEvent("download");
  const action = page.getByTestId(`button-export-csv-${scope}`);
  if (keyboard) { await action.focus(); await page.keyboard.press("Enter"); }
  else await action.click();
  await expectCsv(await downloaded, expected);
  await expect(page.getByTestId("viewer-export-status")).toBeHidden();
}

test("Viewer export scope: desktop labels distinguish all results current page and selection and CSV contents match each scope", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  await openExport(page, true);
  await expect(page.getByTestId("button-export-csv-all")).toHaveText("Semua data — 1,200 rekod");
  await expect(page.getByTestId("button-export-csv-filtered")).toHaveCount(0);
  await expect(page.getByTestId("button-export-csv-selected")).toHaveCount(0);
  await closeDesktopExport(page);
  await page.getByTestId("button-toggle-filters").click();
  await page.getByTestId("button-add-filter").click();
  await page.getByTestId("select-filter-column-0").click();
  await page.getByRole("option", { name: "Region", exact: true }).click();
  await page.getByTestId("input-filter-value-0").fill("North");
  await page.getByTestId("input-search-viewer").fill("Synthetic Export");
  await expect(page.getByRole("navigation", { name: "Dataset pagination", exact: true }))
    .toContainText("Showing 1-25 of 600 rows");
  for (const number of [1, 2, 3]) await page.getByRole("checkbox", { name: `Select row ${number}`, exact: true }).check();
  await openExport(page, true);
  for (const kind of ["csv", "pdf", "excel"]) {
    await expect(page.getByTestId(`button-export-${kind}-all`)).toHaveText("Semua keputusan carian — 600 rekod");
    await expect(page.getByTestId(`button-export-${kind}-filtered`)).toHaveText("Paparan halaman ini — 25 rekod");
    await expect(page.getByTestId(`button-export-${kind}-selected`)).toHaveText("Rekod dipilih — 3 rekod");
  }
  await expect(page.getByText(scopeHint, { exact: true })).toBeVisible();
  await closeDesktopExport(page);
  const matching = rows.filter((row) => row.jsonDataJsonb.Region === "North");
  const beforeAll = fixture.reads.length;
  await exportCsv(page, "all", matching, true);
  expect(fixture.reads.slice(beforeAll).map(({ page: number, pageSize, cursor, search, filters }) => ({
    page: number, pageSize, cursor, search, filters: filters.map(({ column, operator, value }) => ({ column, operator, value })),
  }))).toEqual(Array.from({ length: 6 }, (_, index) => ({ page: index + 1, pageSize: 100,
    cursor: index === 0 ? null : `scope:100:${index * 100}`, search: "Synthetic Export",
    filters: [{ column: "Region", operator: "contains", value: "North" }] })));
  const beforePage = fixture.reads.length;
  await exportCsv(page, "filtered", matching.slice(0, 25));
  await exportCsv(page, "selected", matching.slice(0, 3));
  expect(fixture.reads).toHaveLength(beforePage);
  await checkFixture(page, fixture.session);
});

test("Viewer export scope: mobile320 scope labels fit and selected CSV keeps focus and content", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page);
  await page.getByTestId("input-search-viewer").fill("Synthetic Export");
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(25);
  await expect.poll(() => fixture.reads[fixture.reads.length - 1].search).toBe("Synthetic Export");
  for (const number of [1, 2]) await page.getByRole("checkbox", { name: `Select row ${number}`, exact: true }).check();
  await openExport(page);
  const sheet = page.getByRole("dialog", { name: "Export Dataset", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("button-export-csv-all")).toHaveText("Semua keputusan carian — 1,200 rekod");
  await expect(sheet.getByTestId("button-export-csv-filtered")).toHaveText("Paparan halaman ini — 25 rekod");
  await expect(sheet.getByTestId("button-export-csv-selected")).toHaveText("Rekod dipilih — 2 rekod");
  await expect(sheet.getByText(scopeHint, { exact: true })).toBeVisible();
  expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const bounds = await sheet.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(741);
  const downloaded = page.waitForEvent("download");
  await sheet.getByTestId("button-export-csv-selected").focus();
  await page.keyboard.press("Enter");
  await expectCsv(await downloaded, rows.slice(0, 2));
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("button-viewer-more-actions")).toBeFocused();
  await checkFixture(page, fixture.session);
});

test("Viewer export scope: unfiltered labels and hidden scope choices remain accurate after clearing search", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page);
  await page.getByTestId("input-search-viewer").fill("Synthetic Export");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1].search).toBe("Synthetic Export");
  await openExport(page, true);
  await expect(page.getByTestId("button-export-csv-all")).toHaveText("Semua keputusan carian — 1,200 rekod");
  await expect(page.getByTestId("button-export-csv-filtered")).toHaveText("Paparan halaman ini — 25 rekod");
  await expect(page.getByTestId("button-export-csv-selected")).toHaveCount(0);
  await closeDesktopExport(page);
  await page.getByTestId("input-search-viewer").fill("");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1].search).toBe("");
  await expect(page.getByTestId("select-viewer-page-size")).toBeEnabled();
  await openExport(page, true);
  for (const kind of ["csv", "pdf", "excel"]) {
    await expect(page.getByTestId(`button-export-${kind}-all`)).toHaveText("Semua data — 1,200 rekod");
    await expect(page.getByTestId(`button-export-${kind}-filtered`)).toHaveCount(0);
    await expect(page.getByTestId(`button-export-${kind}-selected`)).toHaveCount(0);
  }
  await expect(page.getByText(scopeHint, { exact: true })).toHaveCount(0);
  await closeDesktopExport(page);
  await expect(page.getByTestId("button-viewer-more-actions")).toBeFocused();
  await checkFixture(page, fixture.session);
});
