import { expect, test, type Download, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual Viewer UI and CSV exporter, with fictional records and loopback APIs.
// Expected row sets come from independent fixture numbers, not the app matcher.
test.use({ serviceWorkers: "block", acceptDownloads: true, screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const importId = "viewer-numeric-filter-synthetic";
const importName = "Synthetic numeric filter dataset";
const headers = ["Customer Name", "Amount", "Reference"];
const pointName = (value: number) => `Synthetic amount ${String(value).padStart(3, "0")}`;
const points = Array.from({ length: 131 }, (_, value) => ({ name: pointName(value), amount: String(value), number: value }));
const cases: Array<{ name: string; amount: string | null; number: number | null }> = [
  ...points,
  { name: "Synthetic negative", amount: "-10", number: -10 },
  { name: "Synthetic decimal", amount: "0.50", number: 0.5 },
  { name: "Synthetic grouped", amount: "1,000.50", number: 1000.5 },
  { name: "Synthetic blank", amount: "", number: null },
  { name: "Synthetic missing", amount: null, number: null },
  { name: "Synthetic text", amount: "not a number", number: null },
  { name: "Synthetic exponent", amount: "1e3", number: null },
  { name: "Synthetic invalid grouping", amount: "12,34", number: null },
];
const rows = cases.map((item, index) => ({ id: `numeric-row-${index + 1}`, importId,
  jsonDataJsonb: { "Customer Name": item.name, Amount: item.amount, Reference: `NUMERIC-${index + 1}` },
}));
type Filter = { column: string; operator: string; value: string; valueTo?: string };
type Read = { page: number; pageSize: number; cursor: string | null; search: string; filters: Filter[] };
const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });
const lower = (page: Page) => page.getByTestId("input-filter-value-0");
const upper = (page: Page) => page.getByTestId("input-filter-value-to-0");
const numeric = (value: string) => Number(value.replace(/,/g, ""));

function cursor(query: Read, offset: number) {
  return `numeric:${encodeURIComponent(JSON.stringify([query.pageSize, query.search, query.filters, offset]))}`;
}

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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-numeric.csv",
      rowCount: rows.length, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const received = JSON.parse(params.get("columnFilters") ?? "[]") as Filter[];
    expect(Array.isArray(received)).toBe(true);
    const filters = received.map((filter) => ({ column: filter.column, operator: filter.operator, value: filter.value,
      ...(filter.valueTo === undefined ? {} : { valueTo: filter.valueTo }),
    }));
    for (const filter of filters) {
      expect(filter.column).toBe("Amount");
      expect(["greaterThan", "lessThan", "between"]).toContain(filter.operator);
      expect(typeof filter.value).toBe("string");
      expect(filter.value.trim()).not.toBe("");
      expect(Number.isFinite(numeric(filter.value))).toBe(true);
      if (filter.operator === "between") {
        expect(typeof filter.valueTo).toBe("string");
        expect(filter.valueTo!.trim()).not.toBe("");
        expect(Number.isFinite(numeric(filter.valueTo!))).toBe(true);
        expect(numeric(filter.value)).toBeLessThanOrEqual(numeric(filter.valueTo!));
      }
    }
    const query: Read = { page: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 100),
      cursor: params.get("cursor"), search: params.get("search") ?? "", filters };
    expect([25, 100]).toContain(query.pageSize);
    const offset = (query.page - 1) * query.pageSize;
    expect(query.cursor, "Each cursor is bound to both numeric range limits").toBe(query.page === 1 ? null : cursor(query, offset));
    const matching = rows.filter((_row, index) => filters.every((filter) => {
      const value = cases[index].number;
      if (value === null) return false;
      if (filter.operator === "greaterThan") return value > numeric(filter.value);
      if (filter.operator === "lessThan") return value < numeric(filter.value);
      return value >= numeric(filter.value) && value <= numeric(filter.valueTo!);
    }));
    reads.push(query);
    const pageRows = matching.slice(offset, offset + query.pageSize);
    const hasNextPage = offset + pageRows.length < matching.length;
    const nextCursor = hasNextPage ? cursor(query, offset + pageRows.length) : null;
    return route.fulfill({ json: { headers, rows: pageRows, total: matching.length, page: query.page,
      pageSize: query.pageSize, limit: query.pageSize, offset, nextCursor,
      pagination: { mode: "hybrid", page: query.page, pageSize: query.pageSize, limit: query.pageSize, offset,
        nextCursor, total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / query.pageSize)),
        hasNextPage, hasPreviousPage: query.page > 1 } }, headers: { "Cache-Control": "no-store" } });
  });
  return { session, reads };
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
}

async function addNumericFilter(page: Page, label: "Greater than" | "Less than" | "Between") {
  await page.getByTestId("button-toggle-filters").click();
  await page.getByTestId("button-add-filter").click();
  await page.getByTestId("select-filter-column-0").click();
  await page.getByRole("option", { name: "Amount", exact: true }).click();
  await setOperator(page, label);
}

async function setOperator(page: Page, label: "Greater than" | "Less than" | "Between") {
  await page.getByTestId("select-filter-operator-0").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function expectFilter(page: Page, fixture: Fixture, filter: Filter, total: number) {
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.filters).toEqual([filter]);
  await expect(pagination(page)).toContainText(`Showing 1-${Math.min(total, 25)} of ${total} rows`);
}

async function expectCsv(download: Download, expected: typeof rows) {
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream!) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    expect(size).toBeLessThan(512 * 1024);
    chunks.push(bytes);
  }
  expect(Buffer.concat(chunks).toString("utf8").trim().split(/\r?\n/)).toEqual([
    '"Customer Name","Amount","Reference"',
    ...expected.map((row) => `"${row.jsonDataJsonb["Customer Name"]}","${row.jsonDataJsonb.Amount}","${row.jsonDataJsonb.Reference}"`),
  ]);
  await download.delete();
}

test("Viewer numeric filters: comparisons use numbers and inclusive bounds while invalid ranges stay local", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  await addNumericFilter(page, "Greater than");
  await lower(page).fill("100");
  await expectFilter(page, fixture, { column: "Amount", operator: "greaterThan", value: "100" }, 31);
  await expect(page.getByText(pointName(101), { exact: true })).toBeVisible();
  await expect(upper(page)).toHaveCount(0);

  await setOperator(page, "Less than");
  await lower(page).fill("0");
  await expectFilter(page, fixture, { column: "Amount", operator: "lessThan", value: "0" }, 1);
  await expect(page.getByText("Synthetic negative", { exact: true })).toBeVisible();
  await expect(page.getByText(pointName(0), { exact: true })).toHaveCount(0);

  await setOperator(page, "Between");
  await upper(page).fill("1");
  await expectFilter(page, fixture, { column: "Amount", operator: "between", value: "0", valueTo: "1" }, 3);
  for (const name of [pointName(0), pointName(1), "Synthetic decimal"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
  const numericReads = () => fixture.reads.filter((read) => read.filters.length > 0).length;
  const beforeInvalid = numericReads();
  await upper(page).fill("not a number");
  await expect(upper(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#viewer-filter-help-0")).toHaveText("Enter a valid number (for example, 1,000.50).");
  // A negative observation extends beyond the existing 300ms debounce.
  await page.waitForTimeout(450);
  expect(numericReads()).toBe(beforeInvalid);
  await upper(page).fill("-1");
  await expect(page.locator("#viewer-filter-help-0")).toHaveText("Minimum must be less than or equal to maximum.");
  await page.waitForTimeout(450);
  expect(numericReads()).toBe(beforeInvalid);
  await upper(page).fill("1");
  await expectFilter(page, fixture, { column: "Amount", operator: "between", value: "0", valueTo: "1" }, 3);
  await checkFixture(page, fixture.session);
});

test("Viewer numeric filters: changing only the maximum resets pagination and all-results CSV keeps both bounds", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  await addNumericFilter(page, "Between");
  await lower(page).fill("10");
  await upper(page).fill("120");
  await expectFilter(page, fixture, { column: "Amount", operator: "between", value: "10", valueTo: "120" }, 111);
  await page.getByTestId("button-viewer-next-page").click();
  await expect(pagination(page)).toContainText("Showing 26-50 of 111 rows");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.page).toBe(2);
  await page.getByRole("checkbox", { name: "Select row 26", exact: true }).check();
  await upper(page).fill("110");
  await expectFilter(page, fixture, { column: "Amount", operator: "between", value: "10", valueTo: "110" }, 101);
  expect(fixture.reads[fixture.reads.length - 1]).toMatchObject({ page: 1, cursor: null });
  await expect(page.getByTestId("button-clear-selection")).toHaveCount(0);

  const beforeExport = fixture.reads.length;
  await page.getByTestId("button-viewer-more-actions").click();
  await page.getByTestId("button-export-menu").click();
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("button-export-csv-all").click();
  await expectCsv(await downloaded, rows.slice(10, 111));
  expect(fixture.reads.slice(beforeExport).map(({ page: number, pageSize, filters }) => ({ page: number, pageSize, filters })))
    .toEqual([1, 2].map((number) => ({ page: number, pageSize: 100,
      filters: [{ column: "Amount", operator: "between", value: "10", valueTo: "110" }] })));
  await checkFixture(page, fixture.session);
});

test("Viewer numeric filters: mobile320 dark range fields fit, stay labelled and preserve keyboard focus", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page);
  await addNumericFilter(page, "Between");
  const dialog = page.getByRole("dialog", { name: "Column Filters", exact: true });
  await expect(dialog).toBeVisible();
  const minimum = dialog.getByRole("textbox", { name: "Filter 1 minimum value", exact: true });
  const maximum = dialog.getByRole("textbox", { name: "Filter 1 maximum value", exact: true });
  for (const input of [minimum, maximum]) {
    await expect(input).toHaveAttribute("inputmode", "decimal");
    await expect(input).toHaveAttribute("aria-describedby", "viewer-filter-help-0");
    const bounds = await input.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(741);
  }
  await minimum.focus();
  await page.keyboard.type("0");
  await maximum.focus();
  await page.keyboard.type("1");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.filters)
    .toEqual([{ column: "Amount", operator: "between", value: "0", valueTo: "1" }]);
  await expect(dialog.locator("#viewer-filter-help-0")).toHaveText("Includes both limits.");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-toggle-filters")).toBeFocused();
  await expect(pagination(page)).toContainText("Showing 1-3 of 3 rows");
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(3);
  await page.keyboard.press("Enter");
  await expect(minimum).toHaveValue("0");
  await expect(maximum).toHaveValue("1");
  await page.keyboard.press("Escape");
  await checkFixture(page, fixture.session);
});
