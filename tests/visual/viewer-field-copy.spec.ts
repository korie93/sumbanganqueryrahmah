import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Native production Viewer with fictional records and isolated loopback HTTP.
// Only the browser Clipboard API is substituted; app copy behavior stays real.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0 });

const importId = "viewer-field-copy-synthetic";
const importName = "Synthetic field copy dataset";
const customer = "Synthetic Copy Customer";
const account = "00001234567890123456";
const note = '  First synthetic line\n<script>window.__viewerCopyExecuted = true</script> & <img data-copy-probe src="/copy-probe">\nLast line <>&"  ';
const longHeader = "Synthetic unusually long imported field heading for compact record details";
const headers = ["Customer Name", "Account Number", "Notes", "Empty", "Whitespace", "Null value", "Missing value", "Literal dash", "Literal em dash", longHeader];
const rows = [{ id: "field-copy-row-1", importId, jsonDataJsonb: {
  "Customer Name": customer, "Account Number": account, Notes: note,
  Empty: "", Whitespace: " \n\t ", "Null value": null, "Literal dash": "-", "Literal em dash": "—",
  [longHeader]: "SyntheticVeryLongUnbrokenValue".repeat(12),
} }];
const failure = "Gagal menyalin. Pilih dan salin nilai secara manual.";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

type ClipboardHarness = { calls: string[]; pending: Array<() => void>; mode: "hold" | "deny" };
type ClipboardWindow = Window & { __viewerClipboard: ClipboardHarness; __viewerCopyExecuted?: boolean };

async function installClipboard(page: Page, mode: ClipboardHarness["mode"] = "hold") {
  await page.addInitScript((initialMode) => {
    const harness: ClipboardHarness = { calls: [], pending: [], mode: initialMode };
    Object.defineProperty(window, "__viewerClipboard", { value: harness });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText(value: string) {
        harness.calls.push(value);
        if (harness.mode === "deny") return Promise.reject(new DOMException("Synthetic clipboard denial", "NotAllowedError"));
        return new Promise<void>((resolve) => harness.pending.push(resolve));
      },
    } });
  }, mode);
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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-copy.csv",
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

async function openDetails(page: Page, keyboard = false) {
  const trigger = page.getByTestId("button-viewer-row-details-0");
  if (keyboard) { await trigger.focus(); await page.keyboard.press("Enter"); }
  else await trigger.click();
  const dialog = page.getByRole("dialog", { name: customer, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

function field(dialog: Locator, header: string) {
  return dialog.locator("dt").filter({ hasText: new RegExp(`^${header}$`) }).locator("..");
}
const copy = (dialog: Locator, header: string) => dialog.getByRole("button", { name: `Salin ${header}`, exact: true });
const value = (dialog: Locator, header: string) => field(dialog, header).locator("[data-viewer-detail-value]");
const clipboardCalls = (page: Page) => page.evaluate(() => (window as unknown as ClipboardWindow).__viewerClipboard.calls);
const releaseCopy = (page: Page) => page.evaluate(() => (window as unknown as ClipboardWindow).__viewerClipboard.pending.shift()?.());

async function expectAccessibleDetails(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & { axe: { run: (root: Document, options: { resultTypes: string[] }) =>
      Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, impact }) => ({ id, impact }));
  });
  expect(violations, "Record details must have no serious/critical accessibility violations").toEqual([]);
}

async function expectNoRefetch(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, reads: number) {
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Copying loaded fields must not refetch dataset rows").toHaveLength(reads);
  await checkFixture(page, fixture.session);
}

test("Viewer field copy: desktop keyboard preserves exact values and resets feedback on reopen", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await installClipboard(page);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  let dialog = await openDetails(page, true);
  const accountCopy = copy(dialog, "Account Number");
  expect(await value(dialog, "Account Number").textContent()).toBe(account);
  await accountCopy.focus();
  await page.keyboard.press("Enter");
  await expect(accountCopy).toBeDisabled();
  await expect(accountCopy).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Enter");
  expect(await clipboardCalls(page)).toEqual([account]);
  await releaseCopy(page);
  await expect(accountCopy).toBeEnabled();
  await expect(accountCopy).toHaveAccessibleName("Salin Account Number");
  await expect(field(dialog, "Account Number").getByRole("status")).toHaveText("Disalin");
  await accountCopy.focus();
  await page.keyboard.press("Space");
  await expect(accountCopy).toHaveAttribute("aria-busy", "true");
  expect(await clipboardCalls(page)).toEqual([account, account]);
  await releaseCopy(page);
  await expect(accountCopy).toContainText("Disalin");

  expect(await value(dialog, "Notes").textContent()).toBe(note);
  await copy(dialog, "Notes").focus();
  await page.keyboard.press("Enter");
  await expect(copy(dialog, "Notes")).toBeDisabled();
  expect(await clipboardCalls(page)).toEqual([account, account, note]);
  await releaseCopy(page);
  await expect(field(dialog, "Notes").getByRole("status")).toHaveText("Disalin");
  await expect(dialog.locator("script, img[data-copy-probe]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as ClipboardWindow).__viewerCopyExecuted)).toBeUndefined();
  await expect(accountCopy).toHaveText("Salin");
  await expect(field(dialog, "Account Number").getByRole("status")).toHaveText("");
  await expectAccessibleDetails(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeFocused();
  dialog = await openDetails(page, true);
  await expect(dialog.getByText("Disalin", { exact: true })).toHaveCount(0);
  await copy(dialog, "Notes").click();
  await expect(copy(dialog, "Notes")).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  dialog = await openDetails(page, true);
  await releaseCopy(page);
  // Let the previous, now-unmounted field's promise continuation settle.
  await page.waitForTimeout(100);
  await expect(copy(dialog, "Notes")).toBeEnabled();
  await expect(copy(dialog, "Notes")).not.toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByText("Disalin", { exact: true })).toHaveCount(0);
  expect(await value(dialog, "Notes").textContent()).toBe(note);
  await page.keyboard.press("Escape");
  await expectNoRefetch(page, fixture, reads);
});

test("Viewer field copy: denied and unavailable clipboard retain values and never announce success", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await installClipboard(page, "deny");
  await openViewer(page);
  const reads = fixture.dataReads.length;
  const dialog = await openDetails(page);
  const button = copy(dialog, "Notes");
  for (let attempt = 1; attempt <= 2; attempt++) {
    await button.click();
    await expect(field(dialog, "Notes").getByRole("status")).toHaveText(failure);
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute("aria-busy", "true");
    expect(await clipboardCalls(page)).toEqual(Array(attempt).fill(note));
    await expect(dialog.getByText("Disalin", { exact: true })).toHaveCount(0);
    expect(await value(dialog, "Notes").textContent()).toBe(note);
  }
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
  const unavailableButton = copy(dialog, "Account Number");
  await unavailableButton.focus();
  await page.keyboard.press("Enter");
  await expect(field(dialog, "Account Number").getByRole("status")).toHaveText(failure);
  await expect(unavailableButton).toBeEnabled();
  await expect(unavailableButton).toHaveAccessibleName("Salin Account Number");
  await expect(dialog.getByText("Disalin", { exact: true })).toHaveCount(0);
  expect(await clipboardCalls(page)).toEqual([note, note]);
  expect(await value(dialog, "Notes").textContent()).toBe(note);
  expect(await value(dialog, "Account Number").textContent()).toBe(account);
  await page.keyboard.press("Escape");
  await expectNoRefetch(page, fixture, reads);
});

test("Viewer field copy: mobile320 dark details fit long fields and disable only missing values", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  await installClipboard(page);
  await openViewer(page);
  const reads = fixture.dataReads.length;
  const dialog = await openDetails(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
  for (const header of ["Empty", "Whitespace", "Null value", "Missing value"]) {
    await expect(copy(dialog, header)).toBeDisabled();
    await expect(copy(dialog, header)).toHaveAccessibleName(`Salin ${header}`);
    await expect(value(dialog, header)).toHaveText("-");
  }
  for (const [header, expected] of [["Literal dash", "-"], ["Literal em dash", "—"], [longHeader, rows[0].jsonDataJsonb[longHeader]]]) {
    const button = copy(dialog, header);
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await releaseCopy(page);
    await expect(field(dialog, header).getByRole("status")).toHaveText("Disalin");
    expect(await value(dialog, header).textContent()).toBe(expected);
  }
  expect(await clipboardCalls(page)).toEqual(["-", "—", rows[0].jsonDataJsonb[longHeader]]);
  const bounds = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, right: rect.right, height: rect.height, width: element.clientWidth, scroll: element.scrollWidth,
      buttons: [...element.querySelectorAll('button[aria-label^="Salin "]')].map((button) => {
        const box = button.getBoundingClientRect();
        return { x: box.x, right: box.right, width: box.width, height: box.height };
      }) };
  });
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(321);
  expect(bounds.height).toBeLessThanOrEqual(741);
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.buttons).toHaveLength(headers.length);
  for (const button of bounds.buttons) {
    expect(button.x).toBeGreaterThanOrEqual(0);
    expect(button.right).toBeLessThanOrEqual(321);
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  await expectAccessibleDetails(page);
  await dialog.getByRole("button", { name: "Close details", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectNoRefetch(page, fixture, reads);
});
