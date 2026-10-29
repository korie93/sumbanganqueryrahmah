import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Native production Viewer with fictional records and isolated loopback HTTP.
// Only the browser Clipboard API is substituted when exact copied text is checked.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0 });

const importId = "viewer-hide-empty-synthetic";
const importName = "Synthetic hide empty dataset";
const customer = "Synthetic Hide Empty Customer";
const alternateCustomer = "Synthetic Alternate Hide Empty Customer";
const account = "00001234567890123456";
const noteHeader = "Notes [A.*]";
const note = '  First synthetic line\n<script>window.__viewerHideEmptyExecuted = true</script> & <img data-hide-empty-probe src="/hide-empty-probe">\nLast line <>&"  ';
const longHeader = "Synthetic unusually long imported field heading for compact record details";
const longValue = "SyntheticVeryLongUnbrokenValue".repeat(12);
const emptyHeaders = ["Empty", "Whitespace", "Null value", "Missing value"];
const headers = ["Customer Name", "Account Number", noteHeader, ...emptyHeaders,
  "Literal dash", "Literal em dash", "Numeric zero", "False value", "Padded value", longHeader];
const retainedHeaders = headers.filter((header) => !emptyHeaders.includes(header));
const rows = [customer, alternateCustomer].map((name, index) => ({
  id: `hide-empty-row-${index + 1}`, importId,
  jsonDataJsonb: {
    "Customer Name": name, "Account Number": account, [noteHeader]: note,
    Empty: "", Whitespace: " \n\t ", "Null value": null,
    "Literal dash": "-", "Literal em dash": "—", "Numeric zero": 0,
    "False value": false, "Padded value": " 0001 ", [longHeader]: longValue,
  },
}));
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

type HideEmptyWindow = Window & { __viewerHideEmptyClipboard: string[]; __viewerHideEmptyExecuted?: boolean };

async function installClipboard(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__viewerHideEmptyClipboard", { value: calls });
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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-hide-empty.csv",
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
  await expect(search(dialog)).not.toBeFocused();
  await expect(hideEmpty(dialog)).not.toBeFocused();
  return dialog;
}

const results = (dialog: Locator) => dialog.getByTestId("viewer-detail-search-results");
const search = (dialog: Locator) => dialog.getByTestId("input-viewer-detail-search");
const clear = (dialog: Locator) => dialog.getByTestId("button-clear-viewer-detail-search");
const hideEmpty = (dialog: Locator) => dialog.getByRole("switch", { name: "Sorok medan kosong", exact: true });
const hideLabel = (dialog: Locator) => dialog.getByTestId("label-viewer-hide-empty");
const restore = (dialog: Locator) => dialog.getByRole("button", { name: "Paparkan medan kosong", exact: true });
const copy = (dialog: Locator, header: string) => dialog.getByRole("button", { name: `Salin ${header}`, exact: true });
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const field = (dialog: Locator, header: string) => results(dialog).locator("dt")
  .filter({ hasText: new RegExp(`^${escapeRegExp(header)}$`) }).locator("..");
const value = (dialog: Locator, header: string) => field(dialog, header).locator("[data-viewer-detail-value]");

async function expectMatches(dialog: Locator, matchedHeaders: string[], hidden: number) {
  await expect(results(dialog)).toHaveJSProperty("tagName", "DL");
  await expect(results(dialog).locator("dt")).toHaveText(matchedHeaders);
  const count = `${matchedHeaders.length} daripada ${headers.length} medan`;
  const status = dialog.getByRole("status").filter({ hasText: new RegExp(`^${count}$`) });
  await expect(status).toHaveText(count);
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("aria-live", "polite");
  if (hidden > 0) await expect(dialog.getByText(`${hidden} medan kosong disorok.`, { exact: true })).toBeVisible();
  else await expect(dialog.getByText(/\d+ medan kosong disorok\./)).toHaveCount(0);
}

async function expectNoRefetch(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, reads: number) {
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Hiding, restoring and searching loaded detail fields must not refetch dataset rows").toHaveLength(reads);
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
  expect(violations, "Record details hide-empty controls must have no serious/critical accessibility violations").toEqual([]);
}

test("Viewer hide empty: desktop keyboard preserves nonempty order and exact copied values", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await installClipboard(page);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  const dialog = await openDetails(page, { keyboard: true });
  await expect(hideEmpty(dialog)).toHaveAttribute("data-testid", "switch-viewer-hide-empty");
  await expect(dialog.getByLabel("Sorok medan kosong", { exact: true })).toHaveAttribute("data-testid", "switch-viewer-hide-empty");
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  for (const header of emptyHeaders) {
    await expect(value(dialog, header)).toHaveText("-");
    await expect(copy(dialog, header)).toBeDisabled();
  }
  await expect(dialog.getByText(/\d+ medan kosong disorok\./)).toHaveCount(0);
  await hideEmpty(dialog).focus();
  await page.keyboard.press("Space");
  await expect(hideEmpty(dialog)).toBeChecked();
  await expect(hideEmpty(dialog)).toBeFocused();
  await expectMatches(dialog, retainedHeaders, 4);
  for (const header of emptyHeaders) await expect(copy(dialog, header)).toHaveCount(0);
  for (const [header, expected] of [["Numeric zero", "0"], ["False value", "false"], ["Padded value", " 0001 "],
    ["Literal dash", "-"], ["Literal em dash", "—"], ["Account Number", account], [noteHeader, note]]) {
    expect(await value(dialog, header).textContent()).toBe(expected);
    await expect(copy(dialog, header)).toBeEnabled();
    await copy(dialog, header).focus();
    await page.keyboard.press("Enter");
    await expect(field(dialog, header).getByRole("status")).toHaveText("Disalin");
  }
  expect(await page.evaluate(() => (window as unknown as HideEmptyWindow).__viewerHideEmptyClipboard))
    .toEqual(["0", "false", " 0001 ", "-", "—", account, note]);
  await expect(dialog.locator("script, img[data-hide-empty-probe]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as HideEmptyWindow).__viewerHideEmptyExecuted)).toBeUndefined();
  await hideEmpty(dialog).focus();
  await page.keyboard.press("Space");
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await expect(dialog.getByText(/\d+ medan kosong disorok\./)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeFocused();
  await expectNoRefetch(page, fixture, reads);
});

test("Viewer hide empty: header search distinguishes hidden matches and resets on reopen or another row", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  let dialog = await openDetails(page, { keyboard: true });
  await search(dialog).fill("value");
  await expectMatches(dialog, ["Null value", "Missing value", "False value", "Padded value"], 0);
  await hideEmpty(dialog).focus();
  await page.keyboard.press("Space");
  await expectMatches(dialog, ["False value", "Padded value"], 2);
  await clear(dialog).click();
  await expect(search(dialog)).toBeFocused();
  await expect(hideEmpty(dialog)).toBeChecked();
  await expectMatches(dialog, retainedHeaders, 4);
  await search(dialog).fill(" [a.*] ");
  await expectMatches(dialog, [noteHeader], 0);
  expect(await value(dialog, noteHeader).textContent()).toBe(note);
  await search(dialog).fill("  EmPtY  ");
  await expectMatches(dialog, [], 1);
  await expect(dialog.getByText("Semua medan sepadan kosong.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Tiada medan sepadan.", { exact: true })).toHaveCount(0);
  await restore(dialog).focus();
  await page.keyboard.press("Enter");
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(hideEmpty(dialog)).toBeFocused();
  await expect(search(dialog)).toHaveValue("  EmPtY  ");
  await expectMatches(dialog, ["Empty"], 0);
  await expect(copy(dialog, "Empty")).toBeDisabled();
  await expect(restore(dialog)).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(hideEmpty(dialog)).toBeChecked();
  await search(dialog).fill("No synthetic matching header");
  await expectMatches(dialog, [], 0);
  await expect(dialog.getByText("Tiada medan sepadan.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Semua medan sepadan kosong.", { exact: true })).toHaveCount(0);
  await expect(restore(dialog)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeFocused();
  dialog = await openDetails(page, { keyboard: true });
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(search(dialog)).toHaveValue("");
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await search(dialog).fill("value");
  await hideEmpty(dialog).click();
  await expectMatches(dialog, ["False value", "Padded value"], 2);
  await dialog.getByRole("button", { name: "Close details", exact: true }).click();
  dialog = await openDetails(page, { index: 1, keyboard: true });
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(search(dialog)).toHaveValue("");
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await expect(dialog.getByText(/\d+ medan kosong disorok\./)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-viewer-row-details-1")).toBeFocused();
  await expectNoRefetch(page, fixture, reads);
});

test("Viewer hide empty: mobile320 dark controls fit and remain accessible", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await openViewer(page);
  const reads = fixture.dataReads.length;
  const dialog = await openDetails(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(hideLabel(dialog)).toContainText("Sorok medan kosong");
  await expect(hideEmpty(dialog)).toHaveCSS("transition-property", "none");
  await expect(hideEmpty(dialog).locator("span").first()).toHaveCSS("transition-property", "none");
  await hideLabel(dialog).click();
  await expect(hideEmpty(dialog)).toBeChecked();
  await expectMatches(dialog, retainedHeaders, 4);
  await search(dialog).fill("Empty");
  await expectMatches(dialog, [], 1);
  await expect(dialog.getByText("Semua medan sepadan kosong.", { exact: true })).toBeVisible();
  for (const control of [hideLabel(dialog), search(dialog), clear(dialog), restore(dialog)]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(321);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expectAccessibleDetails(page);
  await restore(dialog).click();
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(hideEmpty(dialog)).toBeFocused();
  await expect(search(dialog)).toHaveValue("Empty");
  await expectMatches(dialog, ["Empty"], 0);
  await clear(dialog).click();
  await expect(search(dialog)).toBeFocused();
  await hideLabel(dialog).click();
  await search(dialog).fill("unusually long");
  await expectMatches(dialog, [longHeader], 0);
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
