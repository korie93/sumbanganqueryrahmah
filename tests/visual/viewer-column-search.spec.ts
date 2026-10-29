import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Native production Viewer, fictional records and isolated loopback HTTP only.
// Column search must stay local to this popup rather than fetching dataset rows.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0 });

const importId = "viewer-column-search-synthetic";
const importName = "Synthetic column search dataset";
const headers = [
  "Customer Name", "Reference", "Account Number", "Card Number", "Notes [A.*]",
  ...Array.from({ length: 38 }, (_, index) => `Extra Field ${String(index + 1).padStart(2, "0")}`),
];
const rows = Array.from({ length: 12 }, (_, index) => ({
  id: `column-search-row-${index + 1}`, importId,
  jsonDataJsonb: Object.fromEntries(headers.map((header) => [header,
    header === "Customer Name" ? `Synthetic Customer ${String(index + 1).padStart(3, "0")}`
      : `${header} synthetic value ${index + 1}`,
  ])),
}));

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin;
  const dataReads: string[] = [];
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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-columns.csv",
      rowCount: rows.length, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const pageSize = Number(url.searchParams.get("pageSize") ?? 100);
    expect([25, 100]).toContain(pageSize);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("cursor")).toBeNull();
    expect(url.searchParams.get("search") ?? "").toBe("");
    expect(JSON.parse(url.searchParams.get("columnFilters") ?? "[]")).toEqual([]);
    dataReads.push(url.search);
    return route.fulfill({ json: { headers, rows, total: rows.length, page: 1, pageSize, limit: pageSize, offset: 0,
      nextCursor: null, pagination: { page: 1, pageSize, limit: pageSize, mode: "hybrid", offset: 0,
        total: rows.length, totalPages: 1, nextCursor: null, hasNextPage: false, hasPreviousPage: false } },
    headers: { "Cache-Control": "no-store" } });
  });
  return { session, dataReads };
}

async function openViewer(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await expect(page.locator(".viewer-page-context")).toHaveText("12 rekod · 43 lajur");
  await expect(page.getByTestId("button-column-selector")).toBeVisible();
  // Settle the existing initial empty-filter debounce before measuring reads.
  await page.waitForTimeout(350);
}

const search = (page: Page) => page.getByTestId("input-viewer-column-search");
const results = (page: Page) => page.getByTestId("viewer-column-search-results");
const resultStatus = (page: Page) => page.getByRole("status").filter({ hasText: /^\d+ daripada 43 lajur$/ });

async function openColumns(page: Page, keyboard = false) {
  const trigger = page.getByTestId("button-column-selector");
  if (keyboard) { await trigger.focus(); await page.keyboard.press("Enter"); }
  else await trigger.click();
  await expect(search(page)).toBeVisible();
  await expect(page.getByLabel("Cari lajur", { exact: true })).toBeVisible();
  await expect(results(page).getByRole("checkbox")).toHaveCount(43);
}

async function expectResultCount(page: Page, count: number) {
  const status = resultStatus(page);
  await expect(status).toHaveText(`${count} daripada 43 lajur`);
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(results(page).getByRole("checkbox")).toHaveCount(count);
}

async function columnOrder(page: Page) {
  return results(page).getByRole("checkbox").evaluateAll((elements) => elements.map((element) => {
    const id = element.id;
    return [...document.querySelectorAll("label")].find((label) => label.htmlFor === id)?.textContent?.trim() ?? "";
  }));
}

async function expectNoDataRefetch(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, before: number) {
  await expect(page.getByTestId("input-search-viewer")).toHaveValue("");
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Column search and selection must not fetch dataset rows").toHaveLength(before);
}

test("Viewer column search: desktop keyboard filters names literally while selection survives clear and reopen", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  await openColumns(page, true);
  expect(await columnOrder(page)).toEqual(headers);
  await search(page).fill("  eXtRa FiELD 0  ");
  await expectResultCount(page, 9);
  const extraThree = page.getByTestId("checkbox-column-Extra Field 03");
  await expect(extraThree).toBeChecked();
  await extraThree.focus();
  await page.keyboard.press("Space");
  await expect(extraThree).not.toBeChecked();
  await expect(page.getByTestId("button-column-selector")).toHaveAccessibleName("Columns (42/43)");
  await search(page).fill("[");
  await expectResultCount(page, 1);
  await expect(page.getByTestId("checkbox-column-Notes [A.*]")).toBeChecked();
  await search(page).fill("column that does not exist");
  await expectResultCount(page, 0);
  await expect(page.getByText("Tiada lajur sepadan.", { exact: true })).toBeVisible();
  await page.getByTestId("button-clear-viewer-column-search").click();
  await expect(search(page)).toHaveValue("");
  await expect(search(page)).toBeFocused();
  await expect(results(page).getByRole("checkbox")).toHaveCount(43);
  await expect(extraThree).not.toBeChecked();
  expect(await columnOrder(page)).toEqual(headers);
  await search(page).fill("reference");
  await expectResultCount(page, 1);
  await page.keyboard.press("Escape");
  await expect(search(page)).toBeHidden();
  await expect(page.getByTestId("button-column-selector")).toBeFocused();
  await openColumns(page, true);
  await expect(search(page)).toHaveValue("");
  await expect(page.getByTestId("checkbox-column-Extra Field 03")).not.toBeChecked();
  expect(await columnOrder(page)).toEqual(headers);
  await page.keyboard.press("Escape");
  await expectNoDataRefetch(page, fixture, reads);
  await checkFixture(page, fixture.session);
});

test("Viewer column search: filtered movement keeps global order bounds and All Min Reset keep their full scope", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  await openColumns(page);
  await search(page).fill("Extra Field 38");
  await expectResultCount(page, 1);
  const up = page.getByRole("button", { name: "Move Extra Field 38 up", exact: true });
  const down = page.getByRole("button", { name: "Move Extra Field 38 down", exact: true });
  await expect(up).toBeEnabled();
  await expect(down).toBeDisabled();
  await up.click();
  await expect(search(page)).toHaveValue("Extra Field 38");
  await expectResultCount(page, 1);
  await expect(down).toBeEnabled();
  await page.getByTestId("button-clear-viewer-column-search").click();
  const moved = [...headers.slice(0, -2), "Extra Field 38", "Extra Field 37"];
  await expect.poll(() => columnOrder(page)).toEqual(moved);
  await search(page).fill("Customer Name");
  await expectResultCount(page, 1);
  await expect(page.getByRole("button", { name: "Move Customer Name up", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move Customer Name down", exact: true })).toBeEnabled();
  await page.getByTestId("button-deselect-columns").click();
  await expect(page.getByTestId("button-column-selector")).toHaveAccessibleName("Columns (1/43)");
  await page.getByTestId("button-clear-viewer-column-search").click();
  await expect(results(page).locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(1);
  await search(page).fill("Extra Field 38");
  await expect(page.getByTestId("checkbox-column-Extra Field 38")).not.toBeChecked();
  await page.getByTestId("button-select-all-columns").click();
  await expect(page.getByTestId("button-column-selector")).toHaveAccessibleName("Columns (43/43)");
  await expect(page.getByTestId("checkbox-column-Extra Field 38")).toBeChecked();
  await page.getByTestId("button-reset-columns").click();
  await page.getByTestId("button-clear-viewer-column-search").click();
  await expect(results(page).locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(43);
  await expect.poll(() => columnOrder(page)).toEqual(headers);
  await page.keyboard.press("Escape");
  await expectNoDataRefetch(page, fixture, reads);
  await checkFixture(page, fixture.session);
});

test("Viewer column search: mobile320 dark sheet stays within bounds and keyboard clear Escape preserve selection", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page);
  const reads = fixture.dataReads.length;
  await openColumns(page);
  const dialog = page.getByRole("dialog", { name: "Select Columns", exact: true });
  await expect(dialog).toBeVisible();
  await search(page).fill("Extra Field 0");
  await expectResultCount(page, 9);
  await page.getByTestId("checkbox-column-Extra Field 02").uncheck();
  await search(page).fill("no matching column");
  await expectResultCount(page, 0);
  const clear = page.getByRole("button", { name: "Kosongkan carian lajur", exact: true });
  await expect(clear).toHaveAttribute("data-testid", "button-clear-viewer-column-search");
  const layout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const input = element.querySelector('[data-testid="input-viewer-column-search"]')!.getBoundingClientRect();
    const button = element.querySelector('[data-testid="button-clear-viewer-column-search"]')!.getBoundingClientRect();
    return { x: rect.x, right: rect.right, height: rect.height, scroll: element.scrollWidth, width: element.clientWidth,
      inputX: input.x, inputRight: input.right, clearX: button.x, clearRight: button.right };
  });
  expect(layout.x).toBeGreaterThanOrEqual(-1);
  expect(layout.right).toBeLessThanOrEqual(321);
  expect(layout.height).toBeLessThanOrEqual(741);
  expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.inputX).toBeGreaterThanOrEqual(0);
  expect(layout.inputRight).toBeLessThanOrEqual(321);
  expect(layout.clearX).toBeGreaterThanOrEqual(0);
  expect(layout.clearRight).toBeLessThanOrEqual(321);
  await clear.focus();
  await page.keyboard.press("Enter");
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveValue("");
  await expect(results(page).getByRole("checkbox")).toHaveCount(43);
  await expect(page.getByTestId("checkbox-column-Extra Field 02")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-column-selector")).toBeFocused();
  await openColumns(page);
  await expect(search(page)).toHaveValue("");
  await expect(page.getByTestId("checkbox-column-Extra Field 02")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expectNoDataRefetch(page, fixture, reads);
  await checkFixture(page, fixture.session);
});
