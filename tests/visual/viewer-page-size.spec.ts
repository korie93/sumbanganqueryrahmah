import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture } from "./helpers/save-collection-fixture";

// Real production Viewer with a small fail-closed synthetic HTTP fixture. No
// backend, real identities or production requests are involved.
const importId = "viewer-page-size-synthetic";
const importName = "Synthetic paged Viewer";
const rowCount = 237;
const headers = ["Customer Name", "Reference", "Account Number", "Region", "Notes"];
const customer = (number: number) => `Synthetic Customer ${String(number).padStart(3, "0")}`;
const rows = Array.from({ length: rowCount }, (_, index) => ({
  id: `viewer-size-row-${index + 1}`, importId,
  jsonDataJsonb: {
    "Customer Name": customer(index + 1), Reference: `SYNTHETIC-${index + 1}`,
    "Account Number": `00001234567890${String(index).padStart(6, "0")}`,
    Region: (index + 1) % 2 === 0 ? "Even" : "Odd", Notes: `Synthetic note ${index + 1}`,
  },
}));
type ColumnFilter = { column: string; operator: string; value: string };
type DataRequest = { page: number; pageSize: number; cursor: string | null; search: string; filters: ColumnFilter[] };

test.use({ serviceWorkers: "block" });

async function installFixture(page: Page, baseURL: string | undefined, configuredSize = 100, delayConfigUntilData = false) {
  const fixture = await installSessionFixture(page, baseURL, { role: "admin" });
  const origin = new URL(baseURL!).origin;
  const requests: DataRequest[] = [];
  let releaseConfiguration: () => void = () => {};
  const configurationReady = new Promise<void>((resolve) => { releaseConfiguration = resolve; });
  if (!delayConfigUntilData) releaseConfiguration();
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "admin", tabs: { home: true, saved: true, viewer: true } } });
  });
  await page.context().route(`${origin}/api/app-config`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await configurationReady;
    return route.fulfill({ json: {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: configuredSize, wsIdleMinutes: 10,
    } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: {
      imports: [{ id: importId, name: importName, filename: "synthetic-pages.csv", rowCount,
        createdAt: "2026-10-10T08:00:00.000Z", createdBy: "guidance.admin", isDeleted: false }],
      pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
        total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const pageSize = Number(url.searchParams.get("pageSize"));
    const currentPage = Number(url.searchParams.get("page"));
    expect(Number.isInteger(pageSize) && pageSize >= 10 && pageSize <= 500).toBe(true);
    expect(Number.isInteger(currentPage) && currentPage > 0).toBe(true);
    const cursor = url.searchParams.get("cursor");
    const search = url.searchParams.get("search") ?? "";
    const filters = JSON.parse(url.searchParams.get("columnFilters") ?? "[]") as ColumnFilter[];
    expect(Array.isArray(filters)).toBe(true);
    for (const filter of filters) {
      expect(headers).toContain(filter.column);
      expect(["contains", "equals", "startsWith", "endsWith", "notEquals"]).toContain(filter.operator);
      expect(typeof filter.value).toBe("string");
    }
    requests.push({ page: currentPage, pageSize, cursor, search, filters });
    // Release the slower configuration only after Viewer has actually used its
    // fallback batch. Freezing that first fallback in state must fail this case.
    if (delayConfigUntilData && requests.length === 1) releaseConfiguration();
    let offset = (currentPage - 1) * pageSize;
    if (cursor !== null) {
      const match = /^viewer-size:(\d+):(\d+)$/.exec(cursor);
      expect(match, "Only the cursor emitted for this page size may be reused").not.toBeNull();
      expect(Number(match![1]), "A page-size change must discard the old cursor").toBe(pageSize);
      offset = Number(match![2]);
      expect(offset).toBe((currentPage - 1) * pageSize);
    }
    const matches = rows.filter((row) => {
      const values: Record<string, string> = row.jsonDataJsonb;
      if (search && !Object.values(values).some((value) => value.toLowerCase().includes(search.toLowerCase()))) return false;
      return filters.every(({ column, operator, value }) => {
        const actual = values[column]!.toLowerCase();
        const expected = value.toLowerCase();
        if (operator === "equals") return actual === expected;
        if (operator === "startsWith") return actual.startsWith(expected);
        if (operator === "endsWith") return actual.endsWith(expected);
        if (operator === "notEquals") return actual !== expected;
        return actual.includes(expected);
      });
    });
    const pageRows = matches.slice(offset, offset + pageSize);
    const hasNextPage = offset + pageRows.length < matches.length;
    const nextCursor = hasNextPage ? `viewer-size:${pageSize}:${offset + pageRows.length}` : null;
    return route.fulfill({ json: {
      headers, rows: pageRows, total: matches.length, page: currentPage, pageSize, limit: pageSize, offset, nextCursor,
      pagination: { mode: "hybrid", page: currentPage, pageSize, limit: pageSize, offset, nextCursor,
        total: matches.length, totalPages: Math.ceil(matches.length / pageSize) || 1,
        hasNextPage, hasPreviousPage: currentPage > 1 },
    } });
  });
  return { fixture, requests, releaseConfiguration };
}

async function openViewer(page: Page) {
  await page.goto("/saved");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page).toHaveURL(/\/viewer(?:[?#]|$)/);
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await expect(page.getByTestId("select-viewer-page-size")).toBeVisible();
}

const pagination = (page: Page) => page.getByRole("navigation", { name: "Dataset pagination", exact: true });

test("Viewer page size: cards start at 25, resize preserves page and selection, changing size resets the cursor", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { fixture, requests } = await installFixture(page, baseURL);
  await openViewer(page);
  await expect(page.getByTestId("select-viewer-page-size")).toHaveValue("25");
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(25);
  expect(requests[0]).toMatchObject({ page: 1, pageSize: 25, cursor: null, search: "", filters: [] });
  await page.getByTestId("button-viewer-next-page").click();
  await expect(pagination(page)).toContainText("Showing 26-50 of 237 rows");
  await expect.poll(() => requests[requests.length - 1]).toMatchObject({ page: 2, pageSize: 25, cursor: "viewer-size:25:25" });
  const selection = page.getByRole("checkbox", { name: "Select row 26", exact: true });
  await selection.check();
  await expect(selection).toHaveAttribute("aria-checked", "true");
  const beforeResize = requests.length;
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Select row 26", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("select-viewer-page-size")).toHaveValue("25");
  await expect(pagination(page)).toContainText("Showing 26-50 of 237 rows");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(25);
  await expect(selection).toHaveAttribute("aria-checked", "true");
  // Include the existing 300ms search/filter debounce window: resizing must
  // neither refetch the dataset nor silently reset page, cursor or selection.
  await page.waitForTimeout(650);
  expect(requests.length).toBe(beforeResize);

  await page.getByTestId("select-viewer-page-size").selectOption("50");
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(50);
  await expect(pagination(page)).toContainText("Showing 1-50 of 237 rows");
  await expect.poll(() => requests[requests.length - 1]).toMatchObject({ page: 1, pageSize: 50, cursor: null });
  await expect(page.getByTestId("button-clear-selection")).toHaveCount(0);
  await page.getByTestId("button-viewer-next-page").click();
  await expect(pagination(page)).toContainText("Showing 51-100 of 237 rows");
  await expect.poll(() => requests[requests.length - 1]).toMatchObject({ page: 2, pageSize: 50, cursor: "viewer-size:50:50" });
  await checkFixture(page, fixture);
});

test("Viewer page size: 320px keyboard control preserves full-dataset search and column filters", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const { fixture, requests } = await installFixture(page, baseURL);
  await openViewer(page);
  const size = page.getByLabel("Rows per page", { exact: true });
  await expect(size).toHaveAttribute("id", "viewer-page-size");
  await size.focus();
  await expect(size).toBeFocused();
  await size.press("ArrowDown");
  await size.press("Enter");
  await expect(size).toHaveValue("50");
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(50);

  await page.getByTestId("button-toggle-filters").click();
  const dialog = page.getByRole("dialog", { name: "Column Filters", exact: true });
  await dialog.getByTestId("button-add-filter").click();
  await dialog.getByTestId("select-filter-column-0").click();
  await page.getByRole("option", { name: "Region", exact: true }).click();
  await dialog.getByTestId("input-filter-value-0").fill("Even");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByTestId("input-search-viewer").fill(customer(120));
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(1);
  await expect(page.locator(".viewer-mobile-card").first()).toContainText(customer(120));
  await expect.poll(() => requests[requests.length - 1]).toMatchObject({ page: 1, pageSize: 50, search: customer(120),
    filters: [{ column: "Region", operator: "contains", value: "Even" }] });
  await size.selectOption("100");
  await expect.poll(() => requests[requests.length - 1]).toMatchObject({ page: 1, pageSize: 100, cursor: null, search: customer(120),
    filters: [{ column: "Region", operator: "contains", value: "Even" }] });
  await expect(page.getByTestId("input-search-viewer")).toHaveValue(customer(120));
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(1);
  await expect(page.locator(".viewer-mobile-card").first()).toContainText(customer(120));
  await expect(size).toHaveValue("100");
  const bounds = await size.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
  await checkFixture(page, fixture);
});

for (const configuredSize of [100, 200]) {
  test(`Viewer page size: desktop keeps configured ${configuredSize} rows without a compact-layout override`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const delayed = configuredSize === 200;
    const { fixture, requests, releaseConfiguration } = await installFixture(page, baseURL, configuredSize, delayed);
    try {
      await openViewer(page);
      const size = page.getByTestId("select-viewer-page-size");
      await expect(size).toHaveValue(String(configuredSize));
      await expect(size.locator(`option[value="${configuredSize}"]`)).toHaveCount(1);
      expect(requests[0]).toMatchObject({ page: 1, pageSize: delayed ? 100 : configuredSize, cursor: null });
      await expect.poll(() => requests[requests.length - 1]).toMatchObject({ page: 1, pageSize: configuredSize, cursor: null });
      await expect(pagination(page)).toContainText(`Showing 1-${configuredSize} of ${rowCount} rows`);
      await expect(page.locator(".viewer-mobile-card")).toHaveCount(0);
      await checkFixture(page, fixture);
    } finally {
      // Teardown never leaves a deliberately held synthetic route unresolved.
      releaseConfiguration();
    }
  });
}
