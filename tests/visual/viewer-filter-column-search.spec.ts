import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Real Viewer controls with fictional headers/records and isolated loopback APIs.
// Searching column names is local metadata work; only selecting a column may
// change the existing filter query. No screenshots, traces or production data.
test.use({ serviceWorkers: "block", screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const importId = "viewer-column-search-synthetic";
const importName = "Synthetic column search dataset";
const lateHeader = 'Late Billing "OSP" <script>alert(1)</script> & Amount';
const longHeader = 'Outstanding principal balance with a long descriptive label — <img src=x> "RM" & total';
const otherOutstandingHeader = "Outstanding principal floor";
const headers = ["Customer Name", "Amount", "Reference",
  ...Array.from({ length: 45 }, (_, index) => `Synthetic Field ${String(index + 1).padStart(2, "0")}`),
  lateHeader, longHeader, otherOutstandingHeader,
];
const rows = [50, 150, 250].map((value, index) => ({ id: `column-search-row-${index + 1}`, importId,
  jsonDataJsonb: Object.fromEntries(headers.map((header) => [header, header === "Customer Name"
    ? `Synthetic customer ${index + 1}` : header === "Reference" ? `COLUMN-${index + 1}` : String(value)])),
}));
type Filter = { column: string; operator: string; value: string; valueTo?: string };
type Read = { page: number; pageSize: number; cursor: string | null; filters: Filter[] };
const trigger = (page: Page) => page.getByTestId("select-filter-column-0");
const search = (page: Page) => page.getByRole("combobox", { name: "Search filter columns", exact: true });
const picker = (page: Page) => page.getByTestId("viewer-filter-column-picker-0");
const options = (page: Page) => page.getByRole("listbox", { name: "Filter columns", exact: true }).getByRole("option");
const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function expectPickerAccessibility(page: Page) {
  await page.evaluate(axeSource);
  const violations = await picker(page).evaluate(async element => {
    const axe = (window as typeof window & { axe?: { run: (root: Element, options: { resultTypes: string[] }) => Promise<{
      violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }>;
    }> } }).axe;
    if (!axe) throw new Error("axe-core did not initialize");
    const result = await axe.run(element, { resultTypes: ["violations"] });
    return result.violations.filter(item => item.impact === "serious" || item.impact === "critical")
      .map(item => ({ id: item.id, targets: item.nodes.flatMap(node => node.target) }));
  });
  expect(violations, "Filter column picker serious/critical accessibility violations").toEqual([]);
}

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin;
  const reads: Read[] = [];
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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-columns.csv",
      rowCount: rows.length, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route(url => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, route => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const received = JSON.parse(params.get("columnFilters") ?? "[]") as Filter[];
    expect(Array.isArray(received)).toBe(true);
    const filters = received.map(({ column, operator, value, valueTo }) => ({ column, operator, value,
      ...(valueTo === undefined ? {} : { valueTo }),
    }));
    expect(params.get("numericSort")).toBeNull();
    expect(params.get("search")).toBeNull();
    for (const filter of filters) {
      expect(["Amount", lateHeader, longHeader]).toContain(filter.column);
      expect(filter).toMatchObject({ operator: "between", value: "50", valueTo: "150" });
    }
    const query: Read = { page: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 100),
      cursor: params.get("cursor"), filters };
    expect(query.page).toBe(1);
    expect(query.cursor).toBeNull();
    reads.push(query);
    const matching = rows.filter(row => filters.every(filter => {
      const value = Number(row.jsonDataJsonb[filter.column]);
      return value >= Number(filter.value) && value <= Number(filter.valueTo);
    }));
    return route.fulfill({ json: { headers, rows: matching, total: matching.length, page: 1,
      pageSize: query.pageSize, limit: query.pageSize, offset: 0, nextCursor: null,
      pagination: { mode: "hybrid", page: 1, pageSize: query.pageSize, limit: query.pageSize, offset: 0,
        nextCursor: null, total: matching.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
    headers: { "Cache-Control": "no-store" } });
  });
  return { session, reads };
}
type Fixture = Awaited<ReturnType<typeof installFixture>>;

async function openFilterRow(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await expect(pagination(page)).toContainText("Showing 1-3 of 3 rows");
  await page.getByTestId("button-toggle-filters").click();
  await page.getByTestId("button-add-filter").click();
  await expect(trigger(page)).toHaveAccessibleName("Filter 1 column");
}

async function configureRange(page: Page, fixture: Fixture) {
  await trigger(page).click();
  await expect(search(page)).toBeFocused();
  await search(page).fill("amount");
  await page.getByRole("option", { name: "Amount", exact: true }).click();
  await page.getByTestId("select-filter-operator-0").click();
  await page.getByRole("option", { name: "Between", exact: true }).click();
  await page.getByTestId("input-filter-value-0").fill("50");
  await page.getByTestId("input-filter-value-to-0").fill("150");
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.filters)
    .toEqual([{ column: "Amount", operator: "between", value: "50", valueTo: "150" }]);
  await expect(pagination(page)).toContainText("Showing 1-2 of 2 rows");
}

async function expectActiveOption(page: Page, option: Locator) {
  await expect(search(page)).toBeFocused();
  await expect(option).toHaveAttribute("data-selected", "true");
  await expect(option).toHaveAttribute("id", /.+/);
  await expect(search(page)).toHaveAttribute("aria-activedescendant", (await option.getAttribute("id"))!);
}

test("Viewer filter columns: desktop search is local, case-insensitive and preserves exact selected headers and numeric bounds", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await openFilterRow(page);
  await configureRange(page, fixture);
  const beforeSearch = fixture.reads.length;
  await trigger(page).click();
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveValue("");
  await expect(options(page)).toHaveCount(headers.length);
  await search(page).fill("Amount");
  const sameColumn = page.getByRole("option", { name: "Amount", exact: true });
  await expectActiveOption(page, sameColumn);
  // IME confirmation belongs to composition, not column selection. A real
  // Enter after composition can select the current column without refetching.
  await search(page).dispatchEvent("keydown", {
    key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true,
  });
  await expect(picker(page)).toBeVisible();
  await expectActiveOption(page, sameColumn);
  expect(fixture.reads.length).toBe(beforeSearch);
  await page.keyboard.press("Enter");
  await expect(picker(page)).toBeHidden();
  await expect(trigger(page)).toHaveText("Amount");
  await expect(trigger(page)).toBeFocused();
  await page.waitForTimeout(400);
  expect(fixture.reads.length).toBe(beforeSearch);
  await trigger(page).click();
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveValue("");
  await search(page).fill("  lAtE bIlLiNg  ");
  await expect(options(page)).toHaveText([lateHeader]);
  await expectPickerAccessibility(page);
  await expect(trigger(page)).toHaveText("Amount");
  await search(page).fill("nothing-matches-this-column");
  await expect(options(page)).toHaveCount(0);
  await expect(search(page)).not.toHaveAttribute("aria-activedescendant", /.+/);
  await expect(picker(page).getByRole("status")).toHaveText("No columns found.");
  await expect(page.getByRole("listbox", { name: "Filter columns", exact: true }).getByRole("status")).toHaveCount(0);
  await expectPickerAccessibility(page);
  await page.keyboard.press("Enter");
  await expect(picker(page)).toBeVisible();
  await expect(trigger(page)).toHaveText("Amount");
  // Extend the negative observation beyond the existing filter-query debounce.
  await page.waitForTimeout(400);
  expect(fixture.reads.length).toBe(beforeSearch);
  await page.keyboard.press("Escape");
  await expect(picker(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await expect(search(page)).toHaveValue("");
  await expect(options(page)).toHaveCount(headers.length);
  await search(page).fill("LATE BILLING");
  const selected = page.getByRole("option", { name: lateHeader, exact: true });
  await expect(selected).toHaveText(lateHeader);
  await expect(selected.locator("script, img")).toHaveCount(0);
  await selected.click();
  await expect(picker(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveText(lateHeader);
  await expect.poll(() => fixture.reads[fixture.reads.length - 1]?.filters)
    .toEqual([{ column: lateHeader, operator: "between", value: "50", valueTo: "150" }]);
  await expect(page.getByTestId("select-filter-operator-0")).toHaveText("Between");
  await expect(page.getByTestId("input-filter-value-0")).toHaveValue("50");
  await expect(page.getByTestId("input-filter-value-to-0")).toHaveValue("150");
  await expect(pagination(page)).toContainText("Showing 1-2 of 2 rows");
  await checkFixture(page, fixture.session);
});

test("Viewer filter columns: mobile320 dark keyboard search wraps long labels and closes before its parent sheet", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openFilterRow(page);
  const sheet = page.getByRole("dialog", { name: "Column Filters", exact: true });
  await expect(sheet).toBeVisible();
  await trigger(page).focus();
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveAttribute("name", "viewerFilterColumnSearch1");
  await page.keyboard.insertText("OUTSTANDING principal");
  await expect(options(page)).toHaveText([longHeader, otherOutstandingHeader]);
  await expectPickerAccessibility(page);
  const first = page.getByRole("option", { name: longHeader, exact: true });
  const second = page.getByRole("option", { name: otherOutstandingHeader, exact: true });
  await expectActiveOption(page, first);
  await page.keyboard.press("ArrowDown");
  await expectActiveOption(page, second);
  await page.keyboard.press("ArrowUp");
  await expectActiveOption(page, first);
  for (const element of [picker(page), search(page), first]) {
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(741);
  }
  expect(await picker(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(first.locator("img")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(picker(page)).toBeHidden();
  await expect(trigger(page)).toHaveText(longHeader);
  await expect(trigger(page)).toBeFocused();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveValue("");
  await search(page).fill("not-present");
  await expect(picker(page).getByRole("status")).toHaveText("No columns found.");
  await page.keyboard.press("Escape");
  await expect(picker(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(sheet).toBeVisible();
  await expect(trigger(page)).toHaveText(longHeader);
  await page.keyboard.press("Enter");
  await expect(search(page)).toHaveValue("");
  await expect(options(page)).toHaveCount(headers.length);
  // Outside interaction dismisses the picker while preserving the user's next
  // editing target, rather than stealing focus back to its trigger.
  const valueInput = sheet.getByTestId("input-filter-value-0");
  await valueInput.click();
  await expect(picker(page)).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect(valueInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("button-toggle-filters")).toBeFocused();
  expect(fixture.reads.every(read => read.filters.length === 0)).toBe(true);
  await checkFixture(page, fixture.session);
});
