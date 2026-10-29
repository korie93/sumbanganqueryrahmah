import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Production Viewer with fictional records and fail-closed loopback HTTP only.
// Pinning is local presentation state: order, export inputs and requests stay intact.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0, timeout: 60_000 });

const importId = "viewer-pinned-column-synthetic";
const importName = "Synthetic pinned column dataset";
const pinnedHeader = "Customer Name";
const headers = ["Account No", "Amount", pinnedHeader, "Reference", "Notes",
  ...Array.from({ length: 38 }, (_, index) => `Extra Field ${String(index + 1).padStart(2, "0")}`)];
const preferenceKey = "sqr.viewer.columns.v1";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function installFixture(page: Page, baseURL: string | undefined,
  { theme = "light", rowCount = 96, configuredSize = 100 }:
  { theme?: "light" | "dark"; rowCount?: number; configuredSize?: number } = {}) {
  const session = await installSessionFixture(page, baseURL, { role: "superuser", theme });
  const origin = new URL(baseURL!).origin;
  const dataReads: string[] = [];
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    id: `pinned-column-row-${index + 1}`, importId,
    jsonDataJsonb: Object.fromEntries(headers.map((header) => [header,
      header === pinnedHeader ? `Synthetic Customer ${String(index + 1).padStart(3, "0")}`
        : header === "Account No" ? `00000000${String(index + 1).padStart(8, "0")}`
          : header === "Amount" ? `${index + 1}.00` : `${header} fictional value ${index + 1}`,
    ])),
  }));
  await page.addInitScript(({ datasetId, fields, key }) => {
    localStorage.setItem("perf_mode", "high");
    localStorage.setItem(key, JSON.stringify({ datasets: [{ datasetId, order: fields, visible: fields, updatedAt: 1 }] }));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  }, { datasetId: importId, fields: headers, key: preferenceKey });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true } } }));
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.context().route(`${origin}/api/app-config`, (route) => route.request().method() !== "GET"
    ? route.fallback() : route.fulfill({ json: {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: configuredSize, wsIdleMinutes: 10,
    } }));
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-pinned-columns.csv",
      rowCount, createdAt: now, createdBy: "guidance.superuser", isDeleted: false }],
    pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const pageSize = Number(url.searchParams.get("pageSize") ?? 100);
    expect([25, 100, 200]).toContain(pageSize);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("cursor")).toBeNull();
    expect(url.searchParams.get("search") ?? "").toBe("");
    expect(JSON.parse(url.searchParams.get("columnFilters") ?? "[]")).toEqual([]);
    dataReads.push(url.search);
    const pageRows = rows.slice(0, pageSize);
    const hasNextPage = pageRows.length < rowCount;
    return route.fulfill({ json: { headers, rows: pageRows, total: rowCount, page: 1, pageSize, limit: pageSize, offset: 0,
      nextCursor: hasNextPage ? `synthetic-pinned:${pageSize}` : null,
      pagination: { page: 1, pageSize, limit: pageSize, mode: "hybrid", offset: 0,
        total: rowCount, totalPages: Math.ceil(rowCount / pageSize),
        nextCursor: hasNextPage ? `synthetic-pinned:${pageSize}` : null, hasNextPage, hasPreviousPage: false } },
    headers: { "Cache-Control": "no-store" } });
  });
  return { session, dataReads, rowCount, configuredSize };
}

const results = (page: Page) => page.getByTestId("viewer-column-search-results");
const pin = (page: Page, header = pinnedHeader) => results(page).getByRole("button", { name: `Pin ${header}`, exact: true });
const column = (page: Page, header = pinnedHeader) =>
  page.getByRole("region", { name: "Viewer data columns", exact: true }).locator(`[data-viewer-column="${header}"]`);
const viewport = (page: Page) => page.getByRole("region", { name: "Viewer data columns", exact: true });
const renderedSelections = (page: Page) => viewport(page).getByRole("checkbox", { name: /^Select row \d+$/ });

async function openViewer(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await expect(page.locator(".viewer-page-context")).toHaveText(`${fixture.rowCount} rekod · 43 lajur`);
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await expect(page.locator(".viewer-mobile-card").first()).toBeVisible();
  } else {
    await expect(column(page).first()).toBeVisible();
  }
  // Let the existing initial empty-filter debounce finish before counting reads.
  await page.waitForTimeout(350);
}

async function openColumns(page: Page) {
  await page.getByTestId("button-column-selector").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("input-viewer-column-search")).toBeVisible();
  await expect(results(page).getByRole("checkbox")).toHaveCount(43);
}

async function closeColumns(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("input-viewer-column-search")).toBeHidden();
  await expect(page.getByTestId("button-column-selector")).toBeFocused();
}

async function desktopOrder(page: Page) {
  return viewport(page).locator("[data-viewer-column]").evaluateAll((elements) => {
    const first = elements[0]?.parentElement;
    return elements.filter((element) => element.parentElement === first)
      .map((element) => element.getAttribute("data-viewer-column"));
  });
}

async function expectPinnedColumn(page: Page, header = pinnedHeader) {
  await expect(column(page, header).first()).toHaveAttribute("data-viewer-pinned", "true");
  const pinned = await viewport(page).locator('[data-viewer-pinned="true"]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.getAttribute("data-viewer-column")))]);
  expect(pinned, "Exactly one field may be pinned in the header and all rendered rows").toEqual([header]);
  await expect.poll(() => desktopOrder(page)).toEqual([header, ...headers.filter((value) => value !== header)]);
}

async function geometry(page: Page, header = pinnedHeader) {
  return viewport(page).evaluate((element, field) => {
    const cells = [...element.querySelectorAll<HTMLElement>("[data-viewer-column]")]
      .filter((cell) => cell.dataset.viewerColumn === field);
    const head = cells[0];
    if (!head || cells.length < 2) throw new Error(`Missing header/body cells for ${field}`);
    const horizontal = element.getBoundingClientRect();
    const yScroll = [...element.querySelectorAll<HTMLElement>("*")].find((candidate) =>
      candidate.scrollHeight > candidate.clientHeight + 1 && candidate.clientHeight > 0
      && /auto|scroll/.test(getComputedStyle(candidate).overflowY) && candidate.contains(cells[1]));
    const yBounds = yScroll?.getBoundingClientRect() ?? horizontal;
    const body = cells.slice(1).find((cell) => {
      const rect = cell.getBoundingClientRect();
      return rect.top >= Math.max(head.getBoundingClientRect().bottom, yBounds.top) - 1
        && rect.bottom <= Math.min(yBounds.bottom, innerHeight) + 1;
    });
    if (!body) throw new Error(`No fully visible body cell for ${field}`);
    const box = (node: Element) => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const rgba = (color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const paint = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      return { background: rgba(style.backgroundColor), backgroundImage: style.backgroundImage,
        foreground: rgba(style.color) };
    };
    const hit = (node: HTMLElement) => {
      const bounds = node.getBoundingClientRect();
      const x = Math.max(horizontal.left + 8, bounds.left + 8);
      const y = bounds.top + bounds.height / 2;
      const target = document.elementFromPoint(x, y);
      return target !== null && (target === node || node.contains(target));
    };
    const control = element.querySelector<HTMLElement>('[aria-label="Select all filtered rows"]')?.parentElement;
    return { viewport: box(element), inset: element.clientLeft, scrollLeft: element.scrollLeft,
      maxScrollLeft: element.scrollWidth - element.clientWidth, header: box(head), body: box(body),
      headerPaint: paint(head), bodyPaint: paint(body), bodyText: body.textContent?.trim(),
      headerHit: hit(head), bodyHit: hit(body), controlsRight: control?.getBoundingClientRect().right ?? null,
      scrollTop: yScroll?.scrollTop ?? 0 };
  }, header);
}

async function expectAlignedPin(page: Page, stuck: boolean, header = pinnedHeader) {
  await expect.poll(async () => {
    const current = await geometry(page, header);
    const expectedX = current.viewport.x + current.inset + (stuck ? 0 : 100);
    return Math.max(Math.abs(current.header.x - current.body.x), Math.abs(current.header.width - current.body.width),
      Math.abs(current.header.x - expectedX));
  }, { message: "Pinned header and body must align horizontally" }).toBeLessThanOrEqual(1);
  // react-window temporarily disables row pointer events while scrolling.
  // Wait for interaction to settle as well as layout before testing stacking.
  await expect.poll(async () => {
    const { headerHit, bodyHit } = await geometry(page, header);
    return { headerHit, bodyHit };
  }, { message: "Pinned cells must receive pointer hits after scrolling settles" }).toEqual({ headerHit: true, bodyHit: true });
  const current = await geometry(page, header);
  const expectedX = current.viewport.x + current.inset + (stuck ? 0 : 100);
  expect(Math.abs(current.header.x - expectedX), "Pin must reach the viewport edge after the leading controls scroll away")
    .toBeLessThanOrEqual(1);
  expect(current.headerPaint.background[3], "Pinned header must have an opaque background").toBe(255);
  expect(current.bodyPaint.background[3], "Pinned cells must cover the scrolling fields behind them").toBe(255);
  expect(current.bodyPaint.foreground[3], "Pinned cell text must remain opaque").toBe(255);
  expect(current.headerHit, "The pinned header must be on top of overlapping columns").toBe(true);
  expect(current.bodyHit, "The pinned cell must be on top of overlapping columns").toBe(true);
  if (stuck) {
    expect(current.scrollLeft).toBeGreaterThanOrEqual(100);
    expect(current.controlsRight).not.toBeNull();
    expect(current.controlsRight!).toBeLessThanOrEqual(current.viewport.x + 1);
  }
  return current;
}

async function scrollHorizontal(page: Page, fraction: number) {
  await viewport(page).evaluate((element, value) => {
    element.scrollTo({ left: (element.scrollWidth - element.clientWidth) * value, behavior: "auto" });
  }, fraction);
  await expect.poll(() => viewport(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
}

async function scrollVertical(page: Page, fraction: number) {
  await viewport(page).evaluate((element, value) => {
    const candidate = [...element.querySelectorAll<HTMLElement>("*")].find((node) =>
      node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0
      && /auto|scroll/.test(getComputedStyle(node).overflowY) && node.querySelector("[data-viewer-column]"));
    if (!candidate) throw new Error("Viewer must expose a vertical row scroll viewport");
    candidate.scrollTo({ top: (candidate.scrollHeight - candidate.clientHeight) * value, behavior: "auto" });
  }, fraction);
  if (fraction > 0) await expect.poll(async () => (await geometry(page)).scrollTop).toBeGreaterThan(0);
}

async function expectAccessible(page: Page, context: string) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & { axe: { run: (root: Document, options: { resultTypes: string[] }) =>
      Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, impact }) => ({ id, impact }));
  });
  expect(violations, `${context} must have no serious/critical accessibility violations`).toEqual([]);
}

async function finishFixture(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, reads: number) {
  await expect(page.getByTestId("input-search-viewer")).toHaveValue("");
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Pinning, hiding, resetting and resizing loaded columns must not fetch rows").toHaveLength(reads);
  await checkFixture(page, fixture.session);
}

test("Viewer pinned column: standard light keyboard pin stays aligned through both scroll axes and unpins to original order", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page, fixture);
  await expect(renderedSelections(page)).toHaveCount(96);
  await expect.poll(() => desktopOrder(page)).toEqual(headers);
  const reads = fixture.dataReads.length;
  const preference = await page.evaluate((key) => localStorage.getItem(key), preferenceKey);
  await openColumns(page);
  await expect(results(page).locator("[data-viewer-pin-control]")).toHaveCount(43);
  await expect(pin(page)).toHaveAttribute("aria-pressed", "false");
  await pin(page).focus();
  await page.keyboard.press("Enter");
  await expect(pin(page)).toBeFocused();
  await expect(pin(page)).toHaveAccessibleName(`Pin ${pinnedHeader}`);
  await expect(pin(page)).toHaveAttribute("aria-pressed", "true");
  await expect(results(page).locator('[data-viewer-pin-control][aria-pressed="true"]')).toHaveCount(1);
  await expect(results(page).locator("[data-viewer-column-name]")).toHaveText(headers);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe(preference);
  await expectAccessible(page, "Columns pin controls");
  await closeColumns(page);
  await expectPinnedColumn(page);
  await page.mouse.move(0, 0);
  const initial = await expectAlignedPin(page, false);
  await page.getByRole("checkbox", { name: "Select row 1", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "Select row 1", exact: true })).toBeChecked();
  // Remove pointer hover so the paint difference represents selection alone.
  await page.mouse.move(0, 0);
  const selected = await expectAlignedPin(page, false);
  expect(selected.bodyPaint.backgroundImage, "Pinned selection must paint its tint over the opaque base").not.toBe("none");
  expect(selected.bodyPaint.backgroundImage, "Pinned selection must remain visibly distinct").not.toBe(initial.bodyPaint.backgroundImage);
  expect(selected.bodyPaint.foreground).toEqual(initial.bodyPaint.foreground);
  await scrollHorizontal(page, 0.5);
  const middle = await expectAlignedPin(page, true);
  await page.getByRole("button", { name: "Jump to last column", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => {
    const current = await geometry(page);
    return current.maxScrollLeft - current.scrollLeft;
  }).toBeLessThanOrEqual(1);
  await expectAlignedPin(page, true);
  await scrollVertical(page, 0.6);
  const down = await expectAlignedPin(page, true);
  expect(Math.abs(down.header.y - middle.header.y), "The header must stay vertically anchored while rows scroll").toBeLessThanOrEqual(1);
  expect(down.bodyText).not.toBe(initial.bodyText);
  await expectAccessible(page, "Scrolled table with a pinned field");
  await page.getByRole("button", { name: "Jump to first column", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => viewport(page).evaluate((element) => element.scrollLeft)).toBe(0);
  await expectAlignedPin(page, false);
  await openColumns(page);
  await pin(page, "Amount").focus();
  await page.keyboard.press("Space");
  await expect(pin(page, "Amount")).toHaveAttribute("aria-pressed", "true");
  await expect(pin(page)).toHaveAttribute("aria-pressed", "false");
  await expect(results(page).locator('[data-viewer-pin-control][aria-pressed="true"]')).toHaveCount(1);
  await closeColumns(page);
  await expectPinnedColumn(page, "Amount");
  await openColumns(page);
  await pin(page, "Amount").focus();
  await page.keyboard.press("Enter");
  await expect(pin(page, "Amount")).toHaveAttribute("aria-pressed", "false");
  await closeColumns(page);
  await expect(viewport(page).locator('[data-viewer-pinned="true"]')).toHaveCount(0);
  await expect.poll(() => desktopOrder(page)).toEqual(headers);
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe(preference);
  await finishFixture(page, fixture, reads);
});

test("Viewer pinned column: hiding Min and Reset clear the pin without reviving it or fetching rows", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openViewer(page, fixture);
  const reads = fixture.dataReads.length;
  await openColumns(page);
  await pin(page).click();
  await page.getByTestId(`checkbox-column-${pinnedHeader}`).uncheck();
  await expect(pin(page)).toBeDisabled();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "false");
  await expect(viewport(page).locator('[data-viewer-pinned="true"]')).toHaveCount(0);
  await page.getByTestId(`checkbox-column-${pinnedHeader}`).check();
  await expect(pin(page)).toBeEnabled();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "false");
  await closeColumns(page);
  await expect.poll(() => desktopOrder(page)).toEqual(headers);
  await openColumns(page);
  // Pin the retained first field: Min must clear even a pin that stays visible.
  await pin(page, "Account No").click();
  await page.getByTestId("button-deselect-columns").click();
  await expect(pin(page, "Account No")).toBeEnabled();
  await expect(pin(page, "Account No")).toHaveAttribute("aria-pressed", "false");
  await expect(pin(page)).toBeDisabled();
  await closeColumns(page);
  await expect.poll(() => desktopOrder(page)).toEqual(["Account No"]);
  await expect(viewport(page).locator('[data-viewer-pinned="true"]')).toHaveCount(0);
  await openColumns(page);
  await page.getByTestId(`checkbox-column-${pinnedHeader}`).check();
  await pin(page).click();
  await closeColumns(page);
  await expect.poll(() => desktopOrder(page)).toEqual([pinnedHeader, "Account No"]);
  await expect(column(page).first()).toHaveAttribute("data-viewer-pinned", "true");
  const fewColumns = await geometry(page);
  if (fewColumns.maxScrollLeft > 100) {
    await page.getByRole("button", { name: "Jump to last column", exact: true }).click();
    await expectAlignedPin(page, true);
    await page.getByRole("button", { name: "Jump to first column", exact: true }).click();
  } else {
    // A wide table with only two data fields stretches those fields, while the
    // selection and row-number columns must retain their exact 44px + 56px.
    await expectAlignedPin(page, false);
  }
  await openColumns(page);
  await page.getByTestId("button-select-all-columns").click();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Move Amount up", exact: true }).click();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("button-reset-columns").click();
  await expect(results(page).locator('[data-viewer-pin-control][aria-pressed="true"]')).toHaveCount(0);
  await expect(results(page).locator("[data-viewer-column-name]")).toHaveText(headers);
  await expect(results(page).locator('[role="checkbox"][aria-checked="true"]')).toHaveCount(43);
  await closeColumns(page);
  await expect(viewport(page).locator('[data-viewer-pinned="true"]')).toHaveCount(0);
  await expect.poll(() => desktopOrder(page)).toEqual(headers);
  await finishFixture(page, fixture, reads);
});

test("Viewer pinned column: virtual dark keeps header and bounded rows aligned after horizontal and vertical scrolling", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { theme: "dark", rowCount: 150, configuredSize: 200 });
  await openViewer(page, fixture);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByTestId("select-viewer-page-size")).toHaveValue("200");
  await expect(page.getByRole("navigation", { name: "Dataset pagination", exact: true })).toContainText("Showing 1-150 of 150 rows");
  const reads = fixture.dataReads.length;
  const expectBoundedRows = async () => {
    const count = await renderedSelections(page).count();
    expect(count, "Virtual rows must retain a usable visible window").toBeGreaterThan(1);
    expect(count, "Pinning must not render the entire 150-row dataset").toBeLessThan(80);
    await expect(column(page)).toHaveCount(count + 1);
  };
  await expectBoundedRows();
  await openColumns(page);
  await pin(page).focus();
  await page.keyboard.press("Enter");
  await closeColumns(page);
  await expectPinnedColumn(page);
  await page.mouse.move(0, 0);
  const initial = await expectAlignedPin(page, false);
  await page.getByRole("checkbox", { name: "Select row 1", exact: true }).check();
  await page.mouse.move(0, 0);
  const selected = await expectAlignedPin(page, false);
  expect(selected.bodyPaint.backgroundImage, "Pinned selection must paint its tint over the opaque base").not.toBe("none");
  expect(selected.bodyPaint.backgroundImage, "Pinned selection must remain visibly distinct").not.toBe(initial.bodyPaint.backgroundImage);
  expect(selected.bodyPaint.foreground).toEqual(initial.bodyPaint.foreground);
  await scrollHorizontal(page, 0.5);
  await expectAlignedPin(page, true);
  await page.getByRole("button", { name: "Jump to last column", exact: true }).click();
  const right = await expectAlignedPin(page, true);
  expect(right.maxScrollLeft - right.scrollLeft).toBeLessThanOrEqual(1);
  await scrollVertical(page, 0.75);
  const down = await expectAlignedPin(page, true);
  expect(Math.abs(down.header.y - right.header.y)).toBeLessThanOrEqual(1);
  expect(down.bodyText).not.toBe(initial.bodyText);
  await expectBoundedRows();
  await expectPinnedColumn(page);
  await expectAccessible(page, "Dark virtual rows with a pinned field");
  await page.getByRole("button", { name: "Jump to first column", exact: true }).click();
  await expect.poll(() => viewport(page).evaluate((element) => element.scrollLeft)).toBe(0);
  await expectAlignedPin(page, false);
  await expectBoundedRows();
  await finishFixture(page, fixture, reads);
});

test("Viewer pinned column: mobile320 preserves original card order and a desktop pin survives responsive resizing", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const fixture = await installFixture(page, baseURL, { theme: "dark", rowCount: 12 });
  await openViewer(page, fixture);
  const reads = fixture.dataReads.length;
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(12);
  await openColumns(page);
  await expect(page.getByRole("dialog", { name: "Select Columns", exact: true })).toBeVisible();
  await expect(results(page).locator("[data-viewer-pin-control]")).toHaveCount(0);
  await expect(results(page).locator("[data-viewer-column-name]")).toHaveText(headers);
  await closeColumns(page);
  const card = page.locator(".viewer-mobile-card").first();
  await expect(card.locator("dt")).toHaveText(["Account No", "Amount", "Reference"]);
  await card.locator("summary").click();
  await expect(card.locator("dt")).toHaveText(headers.filter((header) => header !== pinnedHeader));
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(0);
  await openColumns(page);
  await expect(results(page).locator("[data-viewer-pin-control]")).toHaveCount(43);
  await pin(page).focus();
  await page.keyboard.press("Enter");
  await closeColumns(page);
  await expectPinnedColumn(page);
  await page.setViewportSize({ width: 767, height: 740 });
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(12);
  await expect(viewport(page).locator('[data-viewer-pinned="true"]')).toHaveCount(0);
  await openColumns(page);
  await expect(results(page).locator("[data-viewer-pin-control]")).toHaveCount(0);
  await expect(results(page).locator("[data-viewer-column-name]")).toHaveText(headers);
  await closeColumns(page);
  await expect(card.locator("dt")).toHaveText(["Account No", "Amount", "Reference"]);
  await card.locator("summary").click();
  await expect(card.locator("dt")).toHaveText(headers.filter((header) => header !== pinnedHeader));
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(card.locator("dt")).toHaveText(headers.filter((header) => header !== pinnedHeader));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(0);
  await expectPinnedColumn(page);
  await openColumns(page);
  await expect(pin(page)).toHaveAttribute("aria-pressed", "true");
  await closeColumns(page);
  await expectAlignedPin(page, false);
  await finishFixture(page, fixture, reads);
});
