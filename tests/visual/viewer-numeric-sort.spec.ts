import { expect, test, type Download, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual Viewer UI/exporter; this loopback fixture has independent known numeric
// values and sorts the complete result before pagination. No application matcher.
test.use({ serviceWorkers: "block", acceptDownloads: true, screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const importId = "viewer-numeric-sort-synthetic";
const importName = "Synthetic numeric order dataset";
const headers = ["Customer Name", "Amount", "Reference"];
const pointName = (value: number) => `Synthetic amount ${String(value).padStart(3, "0")}`;
const cases: Array<{ name: string; amount: string | null; number: number | null }> = [
  ...Array.from({ length: 131 }, (_, index) => {
    const value = (index * 47) % 131;
    return { name: pointName(value), amount: String(value), number: value };
  }),
  { name: "Synthetic negative", amount: "-10", number: -10 },
  { name: "Synthetic decimal", amount: "0.50", number: 0.5 },
  { name: "Synthetic grouped", amount: "1,000.50", number: 1000.5 },
  { name: "Synthetic tied ten", amount: "10.000", number: 10 },
  { name: "Synthetic blank", amount: "", number: null },
  { name: "Synthetic missing", amount: null, number: null },
  { name: "Synthetic text", amount: "not numeric", number: null },
  { name: "Synthetic exponent text", amount: "1e3", number: null },
  { name: "Synthetic invalid grouping", amount: "12,34", number: null },
];
const rows = cases.map((item, index) => ({ id: `sort-row-${String(index + 1).padStart(4, "0")}`, importId,
  jsonDataJsonb: { "Customer Name": item.name, Amount: item.amount, Reference: `SORT-${index + 1}` },
}));
type NumericSort = { column: string; direction: "asc" | "desc" };
type Filter = { column: string; operator: string; value: string; valueTo?: string };
type Read = { page: number; pageSize: number; cursor: string | null; search: string; filters: Filter[]; numericSort: NumericSort | null };
const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });
const orderColumn = (page: Page) => page.getByRole("combobox", { name: "Number order column", exact: true });
const orderDirection = (page: Page) => page.getByRole("combobox", { name: "Number order direction", exact: true });
const customerCells = (page: Page) => page.locator('td[data-viewer-column="Customer Name"]');
const numeric = (value: string) => Number(value.replace(/,/g, ""));
function cursor(query: Read, offset: number) {
  return `sort:${encodeURIComponent(JSON.stringify([query.pageSize, query.search, query.filters, query.numericSort, offset]))}`;
}
function matchingRows(query: Pick<Read, "filters" | "numericSort" | "search">) {
  const selected = rows.map((row, index) => ({ row, number: cases[index].number })).filter(({ row, number }) => {
    if (query.search && !Object.values(row.jsonDataJsonb).some((value) => String(value ?? "").toLowerCase().includes(query.search.toLowerCase()))) return false;
    return query.filters.every((filter) => {
      if (number === null) return false;
      if (filter.operator === "greaterThan") return number > numeric(filter.value);
      if (filter.operator === "lessThan") return number < numeric(filter.value);
      return number >= numeric(filter.value) && number <= numeric(filter.valueTo!);
    });
  });
  if (query.numericSort) selected.sort((a, b) => {
    if (a.number === null || b.number === null) {
      if (a.number !== b.number) return a.number === null ? 1 : -1;
    } else if (a.number !== b.number) return (a.number - b.number) * (query.numericSort!.direction === "asc" ? 1 : -1);
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
  });
  return selected.map(({ row }) => row);
}

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin;
  const reads: Read[] = [];
  let failNextSortedPage = false;
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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-numeric-sort.csv",
      rowCount: rows.length, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const received = JSON.parse(params.get("columnFilters") ?? "[]") as Filter[];
    const numericSort = JSON.parse(params.get("numericSort") ?? "null") as NumericSort | null;
    expect(Array.isArray(received)).toBe(true);
    const filters = received.map(({ column, operator, value, valueTo }) => ({ column, operator, value,
      ...(valueTo === undefined ? {} : { valueTo }),
    }));
    if (numericSort !== null) {
      expect(Object.keys(numericSort).sort()).toEqual(["column", "direction"]);
      expect(numericSort.column).toBe("Amount");
      expect(["asc", "desc"]).toContain(numericSort.direction);
    }
    for (const filter of filters) {
      expect(filter.column).toBe("Amount");
      expect(["greaterThan", "lessThan", "between"]).toContain(filter.operator);
      expect(Number.isFinite(numeric(filter.value))).toBe(true);
      if (filter.operator === "between") expect(numeric(filter.value)).toBeLessThanOrEqual(numeric(filter.valueTo!));
    }
    const query: Read = { page: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 100),
      cursor: params.get("cursor"), search: params.get("search") ?? "", filters, numericSort };
    expect([25, 100]).toContain(query.pageSize);
    const offset = (query.page - 1) * query.pageSize;
    expect(query.cursor, "A cursor cannot cross numeric order or filter identity").toBe(query.page === 1 ? null : cursor(query, offset));
    reads.push(query);
    if (failNextSortedPage && numericSort !== null && query.page === 2) {
      failNextSortedPage = false;
      return route.fulfill({ status: 500, json: { message: "Synthetic temporary read failure" } });
    }
    const matching = matchingRows(query), pageRows = matching.slice(offset, offset + query.pageSize);
    const hasNextPage = offset + pageRows.length < matching.length;
    const nextCursor = hasNextPage ? cursor(query, offset + pageRows.length) : null;
    return route.fulfill({ json: { headers, rows: pageRows, total: matching.length, page: query.page,
      pageSize: query.pageSize, limit: query.pageSize, offset, nextCursor,
      pagination: { mode: "hybrid", page: query.page, pageSize: query.pageSize, limit: query.pageSize, offset,
        nextCursor, total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / query.pageSize)),
        hasNextPage, hasPreviousPage: query.page > 1 } }, headers: { "Cache-Control": "no-store" } });
  });
  return { session, reads, failNextSortedPage: () => { failNextSortedPage = true; } };
}
type Fixture = Awaited<ReturnType<typeof installFixture>>;
async function openViewer(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  const size = page.getByTestId("select-viewer-page-size");
  await expect(size).toBeEnabled();
  if (await size.inputValue() !== "25") await size.selectOption("25");
  await expect(pagination(page)).toContainText(`Showing 1-25 of ${rows.length} rows`);
  await page.getByTestId("button-toggle-filters").click();
  await expect(orderColumn(page)).toBeVisible();
}
async function selectOrder(page: Page, direction: "asc" | "desc") {
  await orderColumn(page).click();
  await page.getByRole("option", { name: "Amount", exact: true }).click();
  if (direction === "desc") {
    await orderDirection(page).click();
    await page.getByRole("option", { name: "Largest first", exact: true }).click();
  }
}
async function expectOrder(page: Page, fixture: Fixture, direction: "asc" | "desc", pageNumber = 1) {
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]).toMatchObject({ page: pageNumber, numericSort: { column: "Amount", direction } });
  const query = fixture.reads[fixture.reads.length - 1], expected = matchingRows(query);
  const offset = (pageNumber - 1) * 25;
  await expect(pagination(page)).toContainText(`Showing ${offset + 1}-${Math.min(offset + 25, expected.length)} of ${expected.length} rows`);
  await expect(customerCells(page)).toHaveText(expected.slice(offset, offset + 25).map((row) => row.jsonDataJsonb["Customer Name"]));
}
async function addRange(page: Page, minimum: string, maximum: string) {
  await page.getByTestId("button-add-filter").click();
  await page.getByTestId("select-filter-column-0").click();
  await page.getByRole("option", { name: "Amount", exact: true }).click();
  await page.getByTestId("select-filter-operator-0").click();
  await page.getByRole("option", { name: "Between", exact: true }).click();
  await page.getByTestId("input-filter-value-0").fill(minimum);
  await page.getByTestId("input-filter-value-to-0").fill(maximum);
}
async function expectCsv(download: Download, expected: typeof rows) {
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream!) {
    const buffer = Buffer.from(chunk); bytes += buffer.length;
    expect(bytes).toBeLessThan(512 * 1024); chunks.push(buffer);
  }
  expect(Buffer.concat(chunks).toString("utf8").trim().split(/\r?\n/)).toEqual([
    '"Customer Name","Amount","Reference"',
    ...expected.map((row) => `"${row.jsonDataJsonb["Customer Name"]}","${row.jsonDataJsonb.Amount ?? ""}","${row.jsonDataJsonb.Reference}"`),
  ]);
  await download.delete();
}

test("Viewer numeric sort: full-dataset order survives cursor retry and direction changes reset page and selection", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  await expect(orderDirection(page)).toBeDisabled();
  await selectOrder(page, "asc");
  await expectOrder(page, fixture, "asc");
  await expect(customerCells(page).first()).toHaveText("Synthetic negative");
  expect(await customerCells(page).allTextContents()).toContain(pointName(2));
  expect(await customerCells(page).allTextContents()).toContain(pointName(10));
  expect(await customerCells(page).allTextContents()).not.toContain(pointName(100));

  fixture.failNextSortedPage();
  await page.getByTestId("button-viewer-next-page").click();
  const retry = page.getByTestId("button-retry-viewer");
  await expect(retry).toBeEnabled();
  const failed = fixture.reads[fixture.reads.length - 1];
  await retry.click();
  await expectOrder(page, fixture, "asc", 2);
  expect(fixture.reads[fixture.reads.length - 1]).toEqual(failed);
  await page.getByRole("checkbox", { name: "Select row 26", exact: true }).check();
  await orderDirection(page).click();
  await page.getByRole("option", { name: "Largest first", exact: true }).click();
  await expectOrder(page, fixture, "desc");
  expect(fixture.reads[fixture.reads.length - 1].cursor).toBeNull();
  await expect(page.getByTestId("button-clear-selection")).toHaveCount(0);
  await expect(customerCells(page).first()).toHaveText("Synthetic grouped");
  const seen = await customerCells(page).allTextContents();
  for (let pageNumber = 2; pageNumber <= Math.ceil(rows.length / 25); pageNumber++) {
    await page.getByTestId("button-viewer-next-page").click();
    await expectOrder(page, fixture, "desc", pageNumber);
    seen.push(...await customerCells(page).allTextContents());
  }
  expect(seen).toEqual(matchingRows({ search: "", filters: [], numericSort: { column: "Amount", direction: "desc" } }).map((row) => row.jsonDataJsonb["Customer Name"]));
  expect(new Set(seen).size).toBe(rows.length);
  expect(seen.slice(-5)).toEqual(cases.filter((item) => item.number === null).map((item) => item.name));
  await addRange(page, "2", "10");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1].filters).toEqual([{ column: "Amount", operator: "between", value: "2", valueTo: "10" }]);
  await expectOrder(page, fixture, "desc");
  await expect(customerCells(page)).toHaveCount(10);
  await checkFixture(page, fixture.session);
});

test("Viewer numeric sort: all-results CSV preserves numeric order and filters across batches", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  await selectOrder(page, "desc");
  await addRange(page, "10", "120");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1].filters).toEqual([{ column: "Amount", operator: "between", value: "10", valueTo: "120" }]);
  await expectOrder(page, fixture, "desc");
  const query = fixture.reads[fixture.reads.length - 1], before = fixture.reads.length;
  await page.getByTestId("button-viewer-more-actions").click();
  await page.getByTestId("button-export-menu").click();
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("button-export-csv-all").click();
  await expectCsv(await downloaded, matchingRows(query));
  expect(fixture.reads.slice(before).map(({ page: number, pageSize, numericSort, filters }) => ({ page: number, pageSize, numericSort, filters })))
    .toEqual([1, 2].map((number) => ({ page: number, pageSize: 100, numericSort: { column: "Amount", direction: "desc" },
      filters: [{ column: "Amount", operator: "between", value: "10", valueTo: "120" }] })));
  await checkFixture(page, fixture.session);
});

test("Viewer numeric sort: mobile320 dark controls fit and keyboard order survives reopening the filter sheet", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page);
  const dialog = page.getByRole("dialog", { name: "Column Filters", exact: true });
  await expect(dialog).toBeVisible();
  await expect(orderDirection(page)).toBeDisabled();
  await orderColumn(page).focus();
  await expect(orderColumn(page)).toBeFocused();
  await page.keyboard.press("Enter");
  // Radix mounts its portal and schedules option focus asynchronously. Wait for
  // each keyboard result before sending another key, including on slow CPUs.
  const choices = page.getByRole("listbox");
  await expect(choices).toBeVisible();
  await expect(page.getByTestId("select-viewer-number-order-column")).toHaveAttribute("aria-expanded", "true");
  await expect(choices.getByRole("option", { name: "Default order", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(choices.getByRole("option", { name: "Default order", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choices.getByRole("option", { name: "Customer Name", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choices.getByRole("option", { name: "Amount", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(choices).toHaveCount(0);
  await expect(orderColumn(page)).toHaveText("Amount");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1].numericSort).toEqual({ column: "Amount", direction: "asc" });
  await orderDirection(page).focus();
  await expect(orderDirection(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(choices).toBeVisible();
  await expect(choices.getByRole("option", { name: "Smallest first", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(choices.getByRole("option", { name: "Largest first", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(choices).toHaveCount(0);
  await expect(orderDirection(page)).toHaveText("Largest first");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1].numericSort).toEqual({ column: "Amount", direction: "desc" });
  for (const control of [orderColumn(page), orderDirection(page)]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(741);
  }
  await expect(dialog.getByText("Across all matching rows. Empty or nonnumeric values appear last.", { exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-toggle-filters")).toBeFocused();
  await expect(pagination(page)).toContainText(`Showing 1-25 of ${rows.length} rows`);
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(25);
  await expect(page.locator(".viewer-mobile-card").first()).toContainText("Synthetic grouped");
  await page.keyboard.press("Enter");
  await expect(orderColumn(page)).toHaveText("Amount");
  await expect(orderDirection(page)).toHaveText("Largest first");
  await orderColumn(page).focus();
  await expect(orderColumn(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(choices).toBeVisible();
  await expect(choices.getByRole("option", { name: "Amount", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(choices.getByRole("option", { name: "Default order", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(choices).toHaveCount(0);
  await expect(orderColumn(page)).toHaveText("Default order");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]).toMatchObject({ page: 1, cursor: null, numericSort: null });
  await expect(orderDirection(page)).toBeDisabled();
  await page.keyboard.press("Escape");
  await checkFixture(page, fixture.session);
});
