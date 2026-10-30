import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Native production Viewer with fictional records and isolated loopback HTTP.
// Only the browser Clipboard API is substituted when exact copied text is checked.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0 });

const importId = "viewer-detail-search-synthetic";
const importName = "Synthetic detail search dataset";
const customer = "Synthetic Customer";
const alternateCustomer = "Synthetic Alternate Customer";
const account = "00001234567890123456";
const noteHeader = "Notes [A.*]";
const note = '  First synthetic line\n<script>window.__viewerDetailSearchExecuted = true</script> & <img data-detail-search-probe src="/detail-search-probe">\nLast line <>&"  ';
const longHeader = "Synthetic unusually long imported field heading for compact record details";
const extraHeaders = Array.from({ length: 38 }, (_, index) => `Extra Field${String(index + 1).padStart(2, "0")}`);
const headers = ["Customer Name", "Account Number", noteHeader, "Empty", longHeader, ...extraHeaders];
const longValue = "SyntheticVeryLongUnbrokenValue".repeat(12);
const rows = [customer, alternateCustomer].map((name, index) => ({
  id: `detail-search-row-${index + 1}`, importId,
  jsonDataJsonb: {
    "Customer Name": name, "Account Number": account, [noteHeader]: note, Empty: "",
    [longHeader]: longValue,
    ...Object.fromEntries(extraHeaders.map((header, fieldIndex) => [header, `Synthetic extra value ${fieldIndex + 1}`])),
  },
}));
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
type DetailSearchWindow = Window & { __viewerDetailSearchClipboard: string[]; __viewerDetailSearchExecuted?: boolean };

async function installClipboard(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__viewerDetailSearchClipboard", { value: calls });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText(value: string) { calls.push(value); return Promise.resolve(); },
    } });
  });
}

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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-detail-search.csv",
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
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();
  // Settle Viewer's existing initial empty-filter debounce before counting reads.
  await page.waitForTimeout(350);
}

async function openDetails(page: Page, { index = 0, keyboard = false } = {}) {
  const trigger = page.getByTestId(`button-viewer-row-details-${index}`);
  if (keyboard) { await trigger.focus(); await page.keyboard.press("Enter"); }
  else await trigger.click();
  const name = index === 0 ? customer : alternateCustomer;
  const dialog = page.getByRole("dialog", { name, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name, exact: true })).toBeFocused();
  await expect(dialog.getByTestId("input-viewer-detail-search")).not.toBeFocused();
  return dialog;
}

const results = (dialog: Locator) => dialog.getByTestId("viewer-detail-search-results");
const search = (dialog: Locator) => dialog.getByTestId("input-viewer-detail-search");
const clear = (dialog: Locator) => dialog.getByTestId("button-clear-viewer-detail-search");
const copy = (dialog: Locator, header: string) => dialog.getByRole("button", { name: `Salin ${header}`, exact: true });
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const field = (dialog: Locator, header: string) => results(dialog).locator("dt")
  .filter({ hasText: new RegExp(`^${escapeRegExp(header)}$`) }).locator("..");
const value = (dialog: Locator, header: string) => field(dialog, header).locator("[data-viewer-detail-value]");
const clipboardCalls = (page: Page) => page.evaluate(() => (window as unknown as DetailSearchWindow).__viewerDetailSearchClipboard);

async function expectMatches(dialog: Locator, matchedHeaders: string[]) {
  await expect(results(dialog)).toHaveJSProperty("tagName", "DL");
  await expect(results(dialog).locator("dt")).toHaveText(matchedHeaders);
  const status = dialog.getByRole("status").filter({ hasText: new RegExp(`^${matchedHeaders.length} daripada ${headers.length} medan$`) });
  await expect(status).toHaveText(`${matchedHeaders.length} daripada ${headers.length} medan`);
  await expect(status).toHaveAttribute("aria-live", "polite");
}

async function expectNoRefetch(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, reads: number) {
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Searching loaded detail fields must not refetch dataset rows").toHaveLength(reads);
  await expect(page.getByTestId("input-search-viewer")).toHaveValue("");
  await checkFixture(page, fixture.session);
}

async function expectAccessibleDetails(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & { axe: { run: (root: Document, options: { resultTypes: string[] }) =>
      Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, impact }) => ({ id, impact }));
  });
  expect(violations, "Record details search must have no serious/critical accessibility violations").toEqual([]);
}

test("Viewer detail search: desktop keyboard matches literal header names and resets on reopen", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  let dialog = await openDetails(page, { keyboard: true });
  await expect(search(dialog)).toHaveAccessibleName("Cari medan");
  await expect(dialog.getByLabel("Cari medan", { exact: true })).toHaveAttribute("data-testid", "input-viewer-detail-search");
  await expect(dialog.getByText("Cari medan", { exact: true })).toBeVisible();
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await expect(value(dialog, "Empty")).toHaveText("-");
  await dialog.getByText("Cari medan", { exact: true }).click();
  await expect(search(dialog)).toBeFocused();
  await page.keyboard.type("  aCcOuNt nUmBeR  ");
  await expectMatches(dialog, ["Account Number"]);
  expect(await value(dialog, "Account Number").textContent()).toBe(account);

  for (const query of [" [a.*] ", ".*", "["]) {
    await search(dialog).fill(query);
    await expectMatches(dialog, [noteHeader]);
  }
  // This text occurs in a value only, so it must never match a header search.
  await search(dialog).fill(customer);
  await expectMatches(dialog, []);
  await expect(dialog.getByText("Tiada medan sepadan.", { exact: true })).toBeVisible();
  await expect(clear(dialog)).toHaveAccessibleName("Kosongkan carian medan");
  await clear(dialog).focus();
  await page.keyboard.press("Enter");
  await expect(search(dialog)).toHaveValue("");
  await expect(search(dialog)).toBeFocused();
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await expect(dialog.getByText("Tiada medan sepadan.", { exact: true })).toHaveCount(0);
  await search(dialog).fill("   ");
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await search(dialog).fill("Notes");
  await expectMatches(dialog, [noteHeader]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeFocused();
  dialog = await openDetails(page, { keyboard: true });
  await expect(search(dialog)).toHaveValue("");
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await search(dialog).fill("Account");
  await dialog.getByRole("button", { name: "Close details", exact: true }).click();
  // Finish Radix's deferred focus restoration before keyboard-opening another row.
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeFocused();
  dialog = await openDetails(page, { index: 1, keyboard: true });
  await expect(search(dialog)).toHaveValue("");
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await page.keyboard.press("Escape");
  await expectNoRefetch(page, fixture, reads);
});

test("Viewer detail search: filtered copy preserves imported text and leading zeroes", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await installClipboard(page);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  const dialog = await openDetails(page, { keyboard: true });
  await search(dialog).fill("notes [a.*]");
  await expectMatches(dialog, [noteHeader]);
  expect(await value(dialog, noteHeader).textContent()).toBe(note);
  await copy(dialog, noteHeader).focus();
  await page.keyboard.press("Enter");
  await expect(field(dialog, noteHeader).getByRole("status")).toHaveText("Disalin");
  await expect(copy(dialog, noteHeader)).toHaveAccessibleName(`Salin ${noteHeader}`);
  expect(await clipboardCalls(page)).toEqual([note]);
  await expect(dialog.locator("script, img[data-detail-search-probe]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as DetailSearchWindow).__viewerDetailSearchExecuted)).toBeUndefined();
  await search(dialog).fill("account");
  await expectMatches(dialog, ["Account Number"]);
  expect(await value(dialog, "Account Number").textContent()).toBe(account);
  await copy(dialog, "Account Number").focus();
  await page.keyboard.press("Space");
  await expect(field(dialog, "Account Number").getByRole("status")).toHaveText("Disalin");
  expect(await clipboardCalls(page)).toEqual([note, account]);
  await search(dialog).fill(account);
  await expectMatches(dialog, []);
  await clear(dialog).click();
  expect(await value(dialog, noteHeader).textContent()).toBe(note);
  expect(await value(dialog, "Account Number").textContent()).toBe(account);
  await search(dialog).fill("Empty");
  await expectMatches(dialog, ["Empty"]);
  await expect(copy(dialog, "Empty")).toBeDisabled();
  await expect(value(dialog, "Empty")).toHaveText("-");
  await page.keyboard.press("Escape");
  await expectNoRefetch(page, fixture, reads);
});

test("Viewer detail search: mobile320 dark controls fit and remain accessible", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page);
  const reads = fixture.dataReads.length;
  const dialog = await openDetails(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(dialog.getByText("Cari medan", { exact: true })).toBeVisible();
  await search(dialog).fill("[a.*]");
  await expectMatches(dialog, [noteHeader]);
  expect(await value(dialog, noteHeader).textContent()).toBe(note);
  for (const control of [search(dialog), clear(dialog), copy(dialog, noteHeader)]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(321);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expectAccessibleDetails(page);
  await clear(dialog).click();
  await expect(search(dialog)).toBeFocused();
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await search(dialog).fill("unusually long");
  await expectMatches(dialog, [longHeader]);
  expect(await value(dialog, longHeader).textContent()).toBe(longValue);
  const bounds = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, right: rect.right, height: rect.height, width: element.clientWidth, scroll: element.scrollWidth };
  });
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(321);
  expect(bounds.height).toBeLessThanOrEqual(741);
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  await expectAccessibleDetails(page);
  await dialog.getByRole("button", { name: "Close details", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectNoRefetch(page, fixture, reads);
});
