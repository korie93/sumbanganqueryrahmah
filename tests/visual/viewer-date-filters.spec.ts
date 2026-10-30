import { expect, test, type Download, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Actual Viewer/date fields/exporter with fictional values and loopback APIs.
// Canonical fixture days are independent metadata, never the app's date parser.
test.use({ serviceWorkers: "block", acceptDownloads: true, screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const importId = "viewer-date-filter-synthetic";
const importName = "Synthetic date filter dataset";
const headers = ["Customer Name", "Payment Date", "Amount", "Reference"];
const pointName = (day: number) => `Synthetic date ${String(day).padStart(3, "0")}`;
const dateAt = (offset: number) => new Date(Date.UTC(2024, 0, offset + 1)).toISOString().slice(0, 10);
const cases: Array<{ name: string; raw: unknown; date: string | null }> = [
  ...Array.from({ length: 131 }, (_, index) => {
    const day = (index * 47) % 131;
    return { name: pointName(day), raw: dateAt(day), date: dateAt(day) };
  }),
  { name: "Synthetic leap slash", raw: "29/2/2024", date: "2024-02-29" },
  { name: "Synthetic leap dash", raw: "29-02-2024", date: "2024-02-29" },
  { name: "Synthetic leap compact", raw: "20240229", date: "2024-02-29" },
  { name: "Synthetic leap JSON number", raw: 20240229, date: "2024-02-29" },
  { name: "Synthetic leap ASCII whitespace", raw: " \t2024-02-29\r\n", date: "2024-02-29" },
  { name: "Synthetic day-first April", raw: "03/04/2024", date: "2024-04-03" },
  { name: "Synthetic century leap", raw: "2000-02-29", date: "2000-02-29" },
  { name: "Synthetic invalid century leap", raw: "1900-02-29", date: null },
  { name: "Synthetic invalid day", raw: "2024-02-30", date: null },
  { name: "Synthetic invalid month", raw: "2024-13-01", date: null },
  { name: "Synthetic invalid mixed separators", raw: "29/02-2024", date: null },
  { name: "Synthetic invalid timestamp", raw: "2024-02-29T23:00:00Z", date: null },
  { name: "Synthetic invalid short year", raw: "02/03/24", date: null },
  { name: "Synthetic invalid Excel serial", raw: 45351, date: null },
  { name: "Synthetic blank", raw: "", date: null },
  { name: "Synthetic missing", raw: null, date: null },
  { name: "Synthetic invalid object", raw: { date: "2024-02-29" }, date: null },
  { name: "Synthetic invalid array", raw: ["2024-02-29"], date: null },
];
const rows = cases.map((item, index) => ({ id: `date-row-${String(index + 1).padStart(4, "0")}`, importId,
  jsonDataJsonb: { "Customer Name": item.name, "Payment Date": item.raw, Amount: String(index + 1), Reference: `DATE-${index + 1}` },
}));
type Filter = { column: string; operator: "dateBefore" | "dateAfter" | "dateBetween"; value: string; valueTo?: string };
type NumericSort = { column: string; direction: "asc" | "desc" };
type Read = { page: number; pageSize: number; cursor: string | null; search: string; filters: Filter[]; numericSort: NumericSort | null };
const lower = (page: Page) => page.getByTestId("input-filter-value-0");
const upper = (page: Page) => page.getByTestId("input-filter-value-to-0");
const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });
const cursor = (query: Read, offset: number) => `date:${encodeURIComponent(JSON.stringify([query.pageSize, query.search, query.filters, query.numericSort, offset]))}`;

function matchingRows(query: Pick<Read, "filters" | "numericSort" | "search">) {
  const selected = rows.map((row, index) => ({ row, date: cases[index].date, amount: index + 1 }))
    .filter(({ row, date }) => (!query.search || Object.values(row.jsonDataJsonb).some(value => String(value ?? "").toLowerCase().includes(query.search.toLowerCase())))
      && query.filters.every(filter => date !== null && (filter.operator === "dateBefore" ? date < filter.value
        : filter.operator === "dateAfter" ? date > filter.value : date >= filter.value && date <= filter.valueTo!)));
  if (query.numericSort) selected.sort((a, b) => (a.amount - b.amount) * (query.numericSort!.direction === "asc" ? 1 : -1));
  return selected.map(({ row }) => row);
}

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin, reads: Read[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, route => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } }));
  await page.context().route(`${origin}/api/collection/source-configs`, route => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.context().route(url => url.origin === origin && url.pathname === "/api/imports", route => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-dates.csv",
      rowCount: rows.length, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 1, totalPages: 1,
      hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route(url => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, route => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const raw = JSON.parse(params.get("columnFilters") ?? "[]") as Filter[];
    expect(Array.isArray(raw)).toBe(true);
    const filters = raw.map(({ column, operator, value, valueTo }) => ({ column, operator, value,
      ...(valueTo === undefined ? {} : { valueTo }),
    }));
    for (const filter of filters) {
      expect(filter.column).toBe("Payment Date");
      expect(["dateBefore", "dateAfter", "dateBetween"]).toContain(filter.operator);
      expect(filter.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (filter.operator === "dateBetween") {
        expect(filter.valueTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(filter.value <= filter.valueTo!).toBe(true);
      } else expect(filter.valueTo).toBeUndefined();
    }
    const numericSort = JSON.parse(params.get("numericSort") ?? "null") as NumericSort | null;
    if (numericSort) { expect(numericSort.column).toBe("Amount"); expect(["asc", "desc"]).toContain(numericSort.direction); }
    const query: Read = { page: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 100),
      cursor: params.get("cursor"), search: params.get("search") ?? "", filters, numericSort };
    expect([25, 100]).toContain(query.pageSize);
    expect(["", "synthetic"]).toContain(query.search);
    const offset = (query.page - 1) * query.pageSize;
    expect(query.cursor, "A retained cursor must include both date bounds, search and ordering").toBe(query.page === 1 ? null : cursor(query, offset));
    reads.push(query);
    const matching = matchingRows(query), pageRows = matching.slice(offset, offset + query.pageSize);
    const nextCursor = offset + pageRows.length < matching.length ? cursor(query, offset + pageRows.length) : null;
    return route.fulfill({ json: { headers, rows: pageRows, total: matching.length, page: query.page, pageSize: query.pageSize,
      limit: query.pageSize, offset, nextCursor, pagination: { mode: "hybrid", page: query.page, pageSize: query.pageSize,
        limit: query.pageSize, offset, nextCursor, total: matching.length,
        totalPages: Math.max(1, Math.ceil(matching.length / query.pageSize)), hasNextPage: nextCursor !== null, hasPreviousPage: query.page > 1 } },
    headers: { "Cache-Control": "no-store" } });
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
  await page.getByTestId("button-toggle-filters").click();
}
async function setOperator(page: Page, label: "Before date" | "After date" | "Between dates") {
  await page.getByTestId("select-filter-operator-0").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function addDateFilter(page: Page, label: "Before date" | "After date" | "Between dates") {
  await page.getByTestId("button-add-filter").click();
  await page.getByTestId("select-filter-column-0").click();
  const columnSearch = page.getByRole("combobox", { name: "Search filter columns", exact: true });
  await expect(columnSearch).toBeFocused();
  await columnSearch.fill("payment");
  await page.getByRole("option", { name: "Payment Date", exact: true }).click();
  await setOperator(page, label);
}
async function expectFilter(page: Page, fixture: Fixture, filter: Filter) {
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.filters).toEqual([filter]);
  const matching = matchingRows(fixture.reads[fixture.reads.length - 1]);
  await expect(pagination(page)).toContainText(`Showing 1-${Math.min(matching.length, 25)} of ${matching.length} rows`);
  return matching;
}
async function expectCsv(download: Download, expected: typeof rows) {
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream(); expect(stream).not.toBeNull();
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of stream!) { const part = Buffer.from(chunk); bytes += part.length; expect(bytes).toBeLessThan(512 * 1024); chunks.push(part); }
  const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  expect(Buffer.concat(chunks).toString("utf8").trim()).toBe([
    headers.map(csv).join(","), ...expected.map(row => headers.map(header => csv(row.jsonDataJsonb[header as keyof typeof row.jsonDataJsonb])).join(",")),
  ].join("\r\n"));
  await download.delete();
}

test("Viewer date filters: strict comparisons and inclusive leap-day ranges reject incomplete and inverted drafts", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page); await addDateFilter(page, "Before date");
  await expect(lower(page)).toHaveAttribute("type", "date");
  await expect(lower(page)).toHaveAccessibleName("Filter 1 date");
  await lower(page).fill("2024-01-03");
  await expectFilter(page, fixture, { column: "Payment Date", operator: "dateBefore", value: "2024-01-03" });
  await expect(page.getByText(pointName(1), { exact: true })).toBeVisible();
  await expect(page.getByText(pointName(2), { exact: true })).toHaveCount(0);
  await setOperator(page, "After date"); await lower(page).fill("2024-05-09");
  const after = await expectFilter(page, fixture, { column: "Payment Date", operator: "dateAfter", value: "2024-05-09" });
  expect(after.map(row => row.jsonDataJsonb["Customer Name"])).toEqual([pointName(130)]);
  await expect(page.getByText(pointName(130), { exact: true })).toBeVisible();
  await setOperator(page, "Between dates");
  await lower(page).fill("2024-02-29"); await upper(page).fill("2024-02-29");
  const leap = await expectFilter(page, fixture, { column: "Payment Date", operator: "dateBetween", value: "2024-02-29", valueTo: "2024-02-29" });
  expect(leap).toHaveLength(6);
  for (const row of leap) await expect(page.getByText(row.jsonDataJsonb["Customer Name"], { exact: true })).toBeVisible();
  const dateReadCount = () => fixture.reads.filter(read => read.filters.length > 0).length;
  const beforeInvalid = dateReadCount();
  await upper(page).fill("2024-02-28");
  await expect(upper(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#viewer-filter-help-0")).toHaveText("Start date must be on or before end date.");
  await page.waitForTimeout(450); expect(dateReadCount()).toBe(beforeInvalid);
  await upper(page).fill("");
  await expect(page.locator("#viewer-filter-help-0")).toHaveText("Enter both a start and end date.");
  await page.waitForTimeout(450); expect(dateReadCount()).toBe(beforeInvalid);
  await upper(page).fill("2024-03-01");
  await expectFilter(page, fixture, { column: "Payment Date", operator: "dateBetween", value: "2024-02-29", valueTo: "2024-03-01" });
  await setOperator(page, "Before date");
  await expect(upper(page)).toHaveCount(0);
  await expectFilter(page, fixture, { column: "Payment Date", operator: "dateBefore", value: "2024-02-29" });
  await checkFixture(page, fixture.session);
});

test("Viewer date filters: changing only the end date resets cursor and selection while sorted CSV keeps both bounds", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page); await addDateFilter(page, "Between dates");
  await lower(page).fill("2024-01-10"); await upper(page).fill("2024-05-01");
  await expectFilter(page, fixture, { column: "Payment Date", operator: "dateBetween", value: "2024-01-10", valueTo: "2024-05-01" });
  await page.getByTestId("input-search-viewer").fill("synthetic");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.search).toBe("synthetic");
  await page.getByRole("combobox", { name: "Number order column", exact: true }).click();
  await page.getByRole("option", { name: "Amount", exact: true }).click();
  await page.getByRole("combobox", { name: "Number order direction", exact: true }).click();
  await page.getByRole("option", { name: "Largest first", exact: true }).click();
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.numericSort).toEqual({ column: "Amount", direction: "desc" });
  await expect(pagination(page)).toContainText("Showing 1-25 of 119 rows");
  await page.getByTestId("button-viewer-next-page").click();
  await expect(pagination(page)).toContainText("Showing 26-50 of 119 rows");
  await page.getByRole("checkbox", { name: "Select row 26", exact: true }).check();
  await upper(page).fill("2024-04-20");
  const filtered = await expectFilter(page, fixture, { column: "Payment Date", operator: "dateBetween", value: "2024-01-10", valueTo: "2024-04-20" });
  expect(filtered).toHaveLength(108);
  expect(fixture.reads[fixture.reads.length - 1]).toMatchObject({ page: 1, cursor: null, search: "synthetic", numericSort: { column: "Amount", direction: "desc" } });
  await expect(page.getByTestId("button-clear-selection")).toHaveCount(0);
  const before = fixture.reads.length;
  await page.getByTestId("button-viewer-more-actions").click(); await page.getByTestId("button-export-menu").click();
  const downloaded = page.waitForEvent("download"); await page.getByTestId("button-export-csv-all").click();
  await expectCsv(await downloaded, filtered);
  expect(fixture.reads.slice(before).map(({ page: number, pageSize, search, filters, numericSort }) => ({ page: number, pageSize, search, filters, numericSort })))
    .toEqual([1, 2].map(number => ({ page: number, pageSize: 100, search: "synthetic", numericSort: { column: "Amount", direction: "desc" },
      filters: [{ column: "Payment Date", operator: "dateBetween", value: "2024-01-10", valueTo: "2024-04-20" }] })));
  await checkFixture(page, fixture.session);
});

test("Viewer date filters: mobile320 dark date fields fit and keyboard navigation preserves the range", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page); await addDateFilter(page, "Between dates");
  const dialog = page.getByRole("dialog", { name: "Column Filters", exact: true });
  await expect(dialog).toBeVisible();
  const start = dialog.getByLabel("Filter 1 start date", { exact: true });
  const end = dialog.getByLabel("Filter 1 end date", { exact: true });
  for (const input of [start, end]) {
    await expect(input).toHaveAttribute("type", "date");
    await expect(input).toHaveAttribute("min", "0001-01-01");
    await expect(input).toHaveAttribute("max", "9999-12-31");
    await expect(input).toHaveAttribute("aria-describedby", "viewer-filter-help-0");
    await input.scrollIntoViewIfNeeded();
    const box = await input.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(321);
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(741);
  }
  await start.fill("2024-02-29"); await start.focus(); await expect(start).toBeFocused();
  // Native date segments can use more than one Tab stop. Keep navigation real
  // and bounded while waiting until focus reaches the next labeled date field.
  for (let step = 0; step < 8 && !(await end.evaluate(element => element === document.activeElement)); step++) await page.keyboard.press("Tab");
  await expect(end).toBeFocused(); await end.fill("2024-02-29");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.filters)
    .toEqual([{ column: "Payment Date", operator: "dateBetween", value: "2024-02-29", valueTo: "2024-02-29" }]);
  await expect(dialog.locator("#viewer-filter-help-0")).toContainText("Includes both dates.");
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-toggle-filters")).toBeFocused();
  await expect(pagination(page)).toContainText("Showing 1-6 of 6 rows");
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(6);
  await page.keyboard.press("Enter"); await expect(start).toHaveValue("2024-02-29"); await expect(end).toHaveValue("2024-02-29");
  await page.keyboard.press("Escape"); await checkFixture(page, fixture.session);
});
