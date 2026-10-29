import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Native production Viewer with fictional records and isolated loopback HTTP.
// Only exact clipboard writes are substituted; scrolling uses browser keyboard input.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const importId = "viewer-detail-scroll-synthetic";
const importName = "Synthetic detail scroll dataset";
const customer = "Synthetic Scroll Customer with an unusually long identity that remains fully available in the record fields and accessible heading even on a compact phone screen";
const account = "00001234567890123456";
const noteHeader = "Synthetic Notes";
const note = "First fictional line\nSecond fictional line\nThird fictional line";
const longHeader = "Synthetic unusually long imported field heading for compact record details";
const extraHeaders = Array.from({ length: 38 }, (_, index) => `Extra Field${String(index + 1).padStart(2, "0")}`);
const headers = ["Customer Name", "Account Number", noteHeader, "Empty", longHeader, ...extraHeaders];
const retainedHeaders = headers.filter((header) => header !== "Empty");
const lastHeader = extraHeaders[extraHeaders.length - 1];
const lastValue = " 0000000043 \nSynthetic final field\n ";
const rows = [{ id: "detail-scroll-row-1", importId, jsonDataJsonb: {
  "Customer Name": customer, "Account Number": account, [noteHeader]: note, Empty: "",
  [longHeader]: "SyntheticVeryLongUnbrokenValue".repeat(12),
  ...Object.fromEntries(extraHeaders.map((header, index) => [header,
    header === lastHeader ? lastValue : `Fictional extra value ${index + 1}`])),
} }];
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-detail-scroll.csv",
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

async function installClipboard(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__viewerDetailScrollClipboard", { value: calls });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText(value: string) { calls.push(value); return Promise.resolve(); },
    } });
  });
}

async function openDetails(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  const trigger = page.getByTestId("button-viewer-row-details-0");
  await expect(trigger).toBeVisible();
  // Settle Viewer's existing initial empty-filter debounce before counting reads.
  await page.waitForTimeout(350);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByTestId("viewer-record-details");
  await expect(dialog).toHaveRole("dialog");
  await expect(dialog).toHaveAccessibleName(customer);
  await expect(dialog.getByRole("heading", { name: customer, exact: true })).toBeFocused();
  await expect(dialog.getByRole("heading", { name: customer, exact: true })).toHaveAttribute("title", customer);
  await expect(search(dialog)).not.toBeFocused();
  await expect(region(dialog)).toHaveRole("region");
  await expect(region(dialog)).toHaveAccessibleName("Medan rekod");
  await expect(region(dialog)).toHaveAttribute("tabindex", "0");
  await expect(region(dialog).getByTestId("viewer-detail-search-results")).toHaveJSProperty("tagName", "DL");
  for (const testId of ["viewer-record-details-header", "viewer-detail-search-controls", "viewer-record-details-footer"]) {
    await expect(dialog.getByTestId(testId)).toBeVisible();
    await expect(region(dialog).getByTestId(testId)).toHaveCount(0);
  }
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  return dialog;
}

const results = (dialog: Locator) => dialog.getByTestId("viewer-detail-search-results");
const search = (dialog: Locator) => dialog.getByTestId("input-viewer-detail-search");
const clear = (dialog: Locator) => dialog.getByTestId("button-clear-viewer-detail-search");
const region = (dialog: Locator) => dialog.getByTestId("viewer-detail-scroll");
const hideEmpty = (dialog: Locator) => dialog.getByRole("switch", { name: "Sorok medan kosong", exact: true });
const close = (dialog: Locator) => dialog.getByRole("button", { name: "Close details", exact: true });

async function layout(dialog: Locator) {
  return dialog.evaluate((element) => {
    const required = (selector: string) => {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) throw new Error(`Missing record details element: ${selector}`);
      return target;
    };
    const rect = (target: Element) => {
      const bounds = target.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        right: bounds.right, bottom: bounds.bottom };
    };
    const scroll = required('[data-testid="viewer-detail-scroll"]');
    return {
      dialog: rect(element),
      anchors: {
        header: rect(required('[data-testid="viewer-record-details-header"]')),
        controls: rect(required('[data-testid="viewer-detail-search-controls"]')),
        search: rect(required('[data-testid="input-viewer-detail-search"]')),
        hide: rect(required('[data-testid="label-viewer-hide-empty"]')),
        footer: rect(required('[data-testid="viewer-record-details-footer"]')),
        close: rect(required('[data-testid="viewer-record-details-footer"] button')),
      },
      body: { ...rect(scroll), top: scroll.scrollTop, clientHeight: scroll.clientHeight,
        scrollHeight: scroll.scrollHeight, clientWidth: scroll.clientWidth, scrollWidth: scroll.scrollWidth },
      outer: { top: element.scrollTop, left: element.scrollLeft,
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth },
      page: { x: window.scrollX, y: window.scrollY, top: document.scrollingElement?.scrollTop ?? 0 },
    };
  });
}

type Layout = Awaited<ReturnType<typeof layout>>;

async function expectStableHeight(dialog: Locator, height: number) {
  await expect.poll(async () => Math.abs((await layout(dialog)).dialog.height - height),
    { message: "Filtering loaded fields must keep the dialog height stable" }).toBeLessThanOrEqual(1);
}

async function expectAnchorsStable(dialog: Locator, before: Layout) {
  const after = await layout(dialog);
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(after.dialog[key] - before.dialog[key]), `Dialog ${key} must stay fixed during field scrolling`).toBeLessThanOrEqual(1);
    for (const anchor of ["header", "controls", "search", "hide", "footer", "close"] as const) {
      expect(Math.abs(after.anchors[anchor][key] - before.anchors[anchor][key]),
        `${anchor} ${key} must stay fixed during field scrolling`).toBeLessThanOrEqual(1);
    }
  }
  expect(after.outer.top, "The outer dialog must not scroll").toBe(0);
  expect(after.outer.left).toBe(0);
  expect(after.page, "Field scrolling must not move the page").toEqual(before.page);
}

async function expectFitsViewport(page: Page, dialog: Locator) {
  const viewport = page.viewportSize()!;
  const current = await layout(dialog);
  for (const [name, bounds] of Object.entries({ dialog: current.dialog, ...current.anchors })) {
    expect(bounds.x, `${name} must fit the viewport horizontally`).toBeGreaterThanOrEqual(-1);
    expect(bounds.right, `${name} must fit the viewport horizontally`).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y, `${name} must fit the viewport vertically`).toBeGreaterThanOrEqual(-1);
    expect(bounds.bottom, `${name} must fit the viewport vertically`).toBeLessThanOrEqual(viewport.height + 1);
  }
  expect(current.outer.scrollWidth).toBeLessThanOrEqual(current.outer.clientWidth + 1);
  expect(current.body.scrollWidth).toBeLessThanOrEqual(current.body.clientWidth + 1);
  expect(current.body.clientHeight, "The fields body must retain usable scroll space").toBeGreaterThan(0);
  expect(current.body.scrollHeight).toBeGreaterThan(current.body.clientHeight + 1);
  for (const control of [search(dialog), dialog.getByTestId("label-viewer-hide-empty"), close(dialog)]) {
    await expect(control).toBeVisible();
    await expect(control).toBeInViewport({ ratio: 1 });
  }
}

async function expectSearchHeightStable(dialog: Locator) {
  const height = (await layout(dialog)).dialog.height;
  await search(dialog).fill("Account Number");
  await expect(results(dialog).locator("dt")).toHaveText(["Account Number"]);
  await expectStableHeight(dialog, height);
  await search(dialog).fill("No fictional matching header");
  await expect(results(dialog).locator("dt")).toHaveCount(0);
  await expect(dialog.getByText("Tiada medan sepadan.", { exact: true })).toBeVisible();
  await expectStableHeight(dialog, height);
  await clear(dialog).click();
  await expect(search(dialog)).toBeFocused();
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await expectStableHeight(dialog, height);
  await hideEmpty(dialog).click();
  await expect(hideEmpty(dialog)).toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(retainedHeaders);
  await expectStableHeight(dialog, height);
  await search(dialog).fill("Empty");
  await expect(results(dialog).locator("dt")).toHaveCount(0);
  await expect(dialog.getByText("Semua medan sepadan kosong.", { exact: true })).toBeVisible();
  await expectStableHeight(dialog, height);
  await clear(dialog).click();
  await expect(search(dialog)).toBeFocused();
  await expect(hideEmpty(dialog)).toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(retainedHeaders);
  await expectStableHeight(dialog, height);
}

async function scrollWithKeyboard(page: Page, dialog: Locator) {
  await region(dialog).focus();
  await expect(region(dialog)).toBeFocused();
  await page.keyboard.press("Home");
  await expect.poll(() => region(dialog).evaluate((element) => element.scrollTop)).toBe(0);
  const before = await layout(dialog);
  await page.keyboard.press("PageDown");
  await expect.poll(() => region(dialog).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectAnchorsStable(dialog, before);
  await page.keyboard.press("End");
  await expect.poll(() => region(dialog).evaluate((element) =>
    element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
  await expectAnchorsStable(dialog, before);
  return before;
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
  expect(violations, "Scrollable record details must have no serious/critical accessibility violations").toEqual([]);
}

async function closeAndCheckFixture(page: Page, dialog: Locator,
  fixture: Awaited<ReturnType<typeof installFixture>>, reads: number) {
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeFocused();
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Scrolling, searching, hiding and resizing loaded detail fields must not refetch rows").toHaveLength(reads);
  await expect(page.getByTestId("input-search-viewer")).toHaveValue("");
  await checkFixture(page, fixture.session);
}

test("Viewer detail scroll: desktop keeps stable height and anchors through search and bottom-field copy", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await installClipboard(page);
  const dialog = await openDetails(page);
  const reads = fixture.dataReads.length;
  await expectFitsViewport(page, dialog);
  await expectSearchHeightStable(dialog);
  const before = await scrollWithKeyboard(page, dialog);
  const copy = dialog.getByRole("button", { name: `Salin ${lastHeader}`, exact: true });
  await expect(copy).toBeInViewport({ ratio: 1 });
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect(copy.locator("..").getByRole("status")).toHaveText("Disalin");
  expect(await page.evaluate(() => (window as unknown as Window & { __viewerDetailScrollClipboard: string[] })
    .__viewerDetailScrollClipboard)).toEqual([lastValue]);
  await expectAnchorsStable(dialog, before);
  await expectAccessibleDetails(page);
  await closeAndCheckFixture(page, dialog, fixture, reads);
});

test("Viewer detail scroll: mobile320 dark keeps controls anchored and supports keyboard field scrolling", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, "dark");
  const dialog = await openDetails(page);
  const reads = fixture.dataReads.length;
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectFitsViewport(page, dialog);
  await expectSearchHeightStable(dialog);
  await scrollWithKeyboard(page, dialog);
  await expectFitsViewport(page, dialog);
  await expectAccessibleDetails(page);
  await closeAndCheckFixture(page, dialog, fixture, reads);
});

test("Viewer detail scroll: short phone fits a simulated keyboard viewport shrink with reachable controls", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const fixture = await installFixture(page, baseURL);
  const dialog = await openDetails(page);
  const reads = fixture.dataReads.length;
  await expectFitsViewport(page, dialog);
  await scrollWithKeyboard(page, dialog);
  const initialHeight = (await layout(dialog)).dialog.height;
  await search(dialog).focus();
  await expect(search(dialog)).toBeFocused();
  // This models a reduced available viewport; it does not invoke or test a real IME.
  await page.setViewportSize({ width: 320, height: 360 });
  await expect.poll(async () => {
    const { dialog: bounds } = await layout(dialog);
    return Math.max(-bounds.y, bounds.bottom - 360);
  }).toBeLessThanOrEqual(1);
  await expect(search(dialog)).toBeFocused();
  await expect(search(dialog)).toHaveValue("");
  await expect(hideEmpty(dialog)).not.toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  expect((await layout(dialog)).dialog.height).toBeLessThan(initialHeight);
  await expectFitsViewport(page, dialog);
  await scrollWithKeyboard(page, dialog);
  await expectFitsViewport(page, dialog);
  // Extremely short viewports may use the dialog's outer scroll fallback.
  // Its controls must remain reachable even when there is no room to pin them.
  await page.setViewportSize({ width: 320, height: 280 });
  await expect.poll(async () => {
    const { dialog: bounds } = await layout(dialog);
    return Math.max(-bounds.y, bounds.bottom - 280, -bounds.x, bounds.right - 320);
  }).toBeLessThanOrEqual(1);
  await close(dialog).scrollIntoViewIfNeeded();
  await expect(close(dialog)).toBeInViewport({ ratio: 1 });
  await search(dialog).scrollIntoViewIfNeeded();
  await expect(search(dialog)).toBeVisible();
  await expect(search(dialog)).toBeInViewport({ ratio: 1 });
  await expect(search(dialog)).toHaveValue("");
  await expect(results(dialog).locator("dt")).toHaveText(headers);
  await closeAndCheckFixture(page, dialog, fixture, reads);
});

for (const width of [320, 1024]) {
test(`Viewer detail scroll: synthetic overlay visualViewport keeps controls inside its visible bounds ${width}px`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 740 });
  await page.addInitScript(() => {
    // Synthetic visualViewport events model an overlay without resizing the layout
    // viewport. This fixture does not invoke or verify a real keyboard or device.
    const viewport = Object.assign(new EventTarget(), {
      width: window.innerWidth, height: window.innerHeight, scale: 1,
      offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0,
      onresize: null, onscroll: null,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    Object.defineProperty(window, "__viewerDetailOverlayViewport", { value: viewport });
  });
  const fixture = await installFixture(page, baseURL);
  const dialog = await openDetails(page);
  const reads = fixture.dataReads.length;
  await search(dialog).fill("Extra Field");
  await hideEmpty(dialog).click();
  await expect(hideEmpty(dialog)).toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(extraHeaders);
  await search(dialog).focus();
  await expect(search(dialog)).toBeFocused();
  const initial = await layout(dialog);
  const layoutViewport = await page.evaluate(() => ({
    width: window.innerWidth, height: window.innerHeight, clientHeight: document.documentElement.clientHeight,
  }));
  expect(layoutViewport).toEqual({ width, height: 740, clientHeight: 740 });

  await page.evaluate(() => {
    const viewport = (window as unknown as Window & {
      __viewerDetailOverlayViewport: EventTarget & { height: number; offsetTop: number; pageTop: number };
    }).__viewerDetailOverlayViewport;
    Object.assign(viewport, { height: 360, offsetTop: 20, pageTop: 20 });
    viewport.dispatchEvent(new Event("resize"));
  });
  // Visible range is 20..380; retain the narrow/wide dialog gutter within it.
  const gutter = width >= 640 ? 16 : 8;
  const visibleTop = 20 + gutter;
  const visibleBottom = 380 - gutter;
  await expect.poll(async () => {
    const { dialog: bounds } = await layout(dialog);
    return Math.max(visibleTop - bounds.y, bounds.bottom - visibleBottom);
  }).toBeLessThanOrEqual(1);
  await expect(search(dialog)).toBeFocused();
  await expect(search(dialog)).toHaveValue("Extra Field");
  await expect(hideEmpty(dialog)).toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(extraHeaders);
  expect(page.viewportSize()).toEqual({ width, height: 740 });
  expect(await page.evaluate(() => ({
    width: window.innerWidth, height: window.innerHeight, clientHeight: document.documentElement.clientHeight,
  }))).toEqual(layoutViewport);
  const overlaid = await layout(dialog);
  expect(overlaid.dialog.height).toBeLessThan(initial.dialog.height);
  for (const [name, bounds] of Object.entries({ dialog: overlaid.dialog, ...overlaid.anchors, body: overlaid.body })) {
    expect(bounds.y, `${name} must fit below the synthetic visualViewport top gutter`).toBeGreaterThanOrEqual(visibleTop - 1);
    expect(bounds.bottom, `${name} must fit above the synthetic visualViewport bottom gutter`).toBeLessThanOrEqual(visibleBottom + 1);
  }
  await expect(clear(dialog)).toBeVisible();
  await expectFitsViewport(page, dialog);
  await scrollWithKeyboard(page, dialog);
  await expectFitsViewport(page, dialog);

  // Removing the synthetic overlay must remove its positioning/height effect.
  await search(dialog).focus();
  await page.evaluate(() => {
    const viewport = (window as unknown as Window & {
      __viewerDetailOverlayViewport: EventTarget & { height: number; offsetTop: number; pageTop: number };
    }).__viewerDetailOverlayViewport;
    Object.assign(viewport, { height: window.innerHeight, offsetTop: 0, pageTop: 0 });
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect.poll(async () => {
    const restored = await layout(dialog);
    return Math.max(Math.abs(restored.dialog.height - initial.dialog.height),
      Math.abs(restored.dialog.y - initial.dialog.y));
  }).toBeLessThanOrEqual(1);
  await expect(search(dialog)).toBeFocused();
  await expect(search(dialog)).toHaveValue("Extra Field");
  await expect(hideEmpty(dialog)).toBeChecked();
  await expect(results(dialog).locator("dt")).toHaveText(extraHeaders);
  await expectAnchorsStable(dialog, initial);
  await expectFitsViewport(page, dialog);
  await closeAndCheckFixture(page, dialog, fixture, reads);
});
}
