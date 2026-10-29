import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Native production Viewer with fictional records and isolated loopback HTTP.
// Native browser title tooltips are verified through their complete title value;
// the browser's tooltip UI is outside Playwright's page DOM and is not inspected.
test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block",
  screenshot: "off", trace: "off", video: "off" });
test.describe.configure({ retries: 0 });

const importId = "viewer-column-labels-synthetic";
const importName = "Synthetic column labels dataset";
const sharedPrefix = "Synthetic imported column with a shared heading describing the original customer registration reference and the complete historical verification information for the receiving department";
const sharedAlpha = `${sharedPrefix} — Alpha ending`;
const sharedBeta = `${sharedPrefix} — Beta ending`;
const unbroken = "SyntheticUnbrokenImportedColumnName".repeat(8);
const unicode = "Maklumat pelanggan 中文欄位 العربية — nombor rujukan dan alamat penghantaran lengkap ".repeat(3).trim();
const literal = 'Literal imported heading with angle brackets and quoted content retained exactly as plain text for the complete customer registration record <img data-column-label-probe src="/column-label-probe"> & "quoted" [A.*]';
const headers = ["Customer Name", sharedAlpha, sharedBeta, unbroken, unicode, literal,
  ...Array.from({ length: 37 }, (_, index) => `Extra Field ${String(index + 1).padStart(2, "0")}`)];
const longHeaders = [sharedAlpha, sharedBeta, unbroken, unicode, literal];
const rows = Array.from({ length: 12 }, (_, index) => ({
  id: `column-labels-row-${index + 1}`, importId,
  jsonDataJsonb: Object.fromEntries(headers.map((header) => [header,
    header === "Customer Name" ? `Synthetic Customer ${String(index + 1).padStart(3, "0")}`
      : `Synthetic field value ${index + 1}`,
  ])),
}));
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark") {
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
    return route.fulfill({ json: { imports: [{ id: importId, name: importName, filename: "synthetic-column-labels.csv",
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

const search = (page: Page) => page.getByTestId("input-viewer-column-search");
const results = (page: Page) => page.getByTestId("viewer-column-search-results");
const checkbox = (page: Page, header: string) => results(page).getByRole("checkbox", { name: header, exact: true });
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const label = (page: Page, header: string) => results(page).locator("label")
  .filter({ hasText: new RegExp(`^${escapeRegExp(header)}$`) });
const move = (page: Page, header: string, direction: "up" | "down") =>
  page.getByRole("button", { name: `Move ${header} ${direction}`, exact: true });

async function openViewer(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  await expect(page.locator(".viewer-page-context")).toHaveText("12 rekod · 43 lajur");
  // Settle the existing initial empty-filter debounce before counting reads.
  await page.waitForTimeout(350);
}

async function openColumns(page: Page) {
  await page.getByTestId("button-column-selector").focus();
  await page.keyboard.press("Enter");
  await expect(search(page)).toBeVisible();
  await expect(page.getByLabel("Cari lajur", { exact: true })).toBeVisible();
  await expect(results(page).getByRole("checkbox")).toHaveCount(43);
}

async function expectMatches(page: Page, query: string, matched: string[]) {
  await search(page).fill(query);
  await expect(results(page).locator("[data-viewer-column-name]")).toHaveText(matched);
  await expect(page.getByRole("status").filter({ hasText: /^\d+ daripada 43 lajur$/ }))
    .toHaveText(`${matched.length} daripada 43 lajur`);
}

async function expectCompleteNames(page: Page) {
  await expect(results(page).locator("[data-viewer-column-name]")).toHaveText(headers);
  for (const header of headers) {
    await expect(checkbox(page, header)).toHaveAttribute("data-testid", `checkbox-column-${header}`);
    await expect(checkbox(page, header)).toHaveAccessibleName(header);
    await expect(label(page, header)).toHaveAttribute("title", header);
    await expect(label(page, header).locator("[data-viewer-column-name]")).toHaveText(header);
  }
  const extraTabStops = await results(page).locator("label, [data-viewer-column-name]")
    .evaluateAll((elements) => elements.filter((element) => (element as HTMLElement).tabIndex >= 0).length);
  expect(extraTabStops, "Column names must not add keyboard stops").toBe(0);
  await expect(results(page).locator("img[data-column-label-probe]")).toHaveCount(0);
}

async function expectNameLayout(page: Page, header: string, mobile: boolean) {
  const nameLabel = label(page, header);
  const name = nameLabel.locator("[data-viewer-column-name]");
  await expect(name).toBeVisible();
  const geometry = await nameLabel.evaluate((element) => {
    const name = element.querySelector<HTMLElement>("[data-viewer-column-name]")!;
    const row = element.parentElement!.parentElement!;
    const checkbox = row.querySelector<HTMLElement>('[role="checkbox"]')!;
    const buttons = [...row.querySelectorAll("button")].filter((button) => button.getAttribute("role") !== "checkbox");
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, height: rect.height };
    };
    const style = getComputedStyle(name);
    return { name: box(name), label: box(element), checkbox: box(checkbox), buttons: buttons.map(box),
      scrollWidth: name.scrollWidth, clientWidth: name.clientWidth, display: style.display,
      whiteSpace: style.whiteSpace, textOverflow: style.textOverflow, overflow: style.overflow,
      overflowWrap: style.overflowWrap, lineClamp: style.webkitLineClamp };
  });
  expect(geometry.clientWidth).toBeGreaterThan(0);
  expect(geometry.name.x).toBeGreaterThanOrEqual(geometry.checkbox.right - 0.5);
  expect(geometry.checkbox.right).toBeLessThanOrEqual(geometry.label.x + 0.5);
  expect(geometry.name.x).toBeGreaterThanOrEqual(0);
  expect(geometry.name.right).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  expect(geometry.buttons).toHaveLength(mobile ? 2 : 3);
  for (const button of geometry.buttons) {
    expect(geometry.label.right).toBeLessThanOrEqual(button.x + 0.5);
    expect(geometry.name.right).toBeLessThanOrEqual(button.x + 0.5);
    expect(button.right).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  }
  expect(geometry.overflow).toBe("hidden");
  if (mobile) {
    expect(geometry.label.height).toBeGreaterThanOrEqual(44);
    expect(geometry.name.height).toBeGreaterThan(20);
    expect(geometry.name.height).toBeLessThanOrEqual(40);
    expect(geometry.lineClamp).toBe("2");
    expect(geometry.whiteSpace).toBe("normal");
    expect(geometry.overflowWrap).toBe("anywhere");
  } else {
    expect(geometry.label.height).toBeGreaterThanOrEqual(32);
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
    expect(geometry.name.height).toBeLessThanOrEqual(20);
    expect(geometry.display).toBe("block");
    expect(geometry.whiteSpace).toBe("nowrap");
    expect(geometry.textOverflow).toBe("ellipsis");
    await nameLabel.hover();
    await expect(nameLabel).toHaveAttribute("title", header);
  }
}

async function expectAccessibleColumns(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as Window & { axe: { run: (root: Document, options: { resultTypes: string[] }) =>
      Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, impact }) => ({ id, impact }));
  });
  expect(violations, "Columns labels must have no serious/critical accessibility violations").toEqual([]);
}

async function exerciseNames(page: Page, mobile: boolean) {
  await expectCompleteNames(page);
  await expectAccessibleColumns(page);
  await expectMatches(page, sharedPrefix, [sharedAlpha, sharedBeta]);
  await expectNameLayout(page, sharedAlpha, mobile);
  await expectNameLayout(page, sharedBeta, mobile);
  for (const header of longHeaders.slice(2)) {
    await expectMatches(page, header, [header]);
    await expectNameLayout(page, header, mobile);
  }
  await expectMatches(page, "[A.*]", [literal]);
  await expect(results(page).locator("img[data-column-label-probe]")).toHaveCount(0);
  await expectMatches(page, "Alpha ending", [sharedAlpha]);
  await expect(checkbox(page, sharedAlpha)).toBeChecked();
  await label(page, sharedAlpha).click();
  await expect(checkbox(page, sharedAlpha)).not.toBeChecked();
  await expectMatches(page, sharedPrefix, [sharedAlpha, sharedBeta]);
  await expect(checkbox(page, sharedBeta)).toBeChecked();
  await checkbox(page, sharedBeta).focus();
  await page.keyboard.press("Space");
  await expect(checkbox(page, sharedBeta)).not.toBeChecked();
  await expect(checkbox(page, sharedAlpha)).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(checkbox(page, sharedBeta)).toBeChecked();
  // The modal sheet hides background controls from the accessibility tree.
  await expect(page.getByTestId("button-column-selector")).toHaveAttribute("aria-label", "Columns (42/43)");
  await expect(move(page, sharedBeta, "up")).toBeEnabled();
  await move(page, sharedBeta, "up").click();
  await expect(search(page)).toHaveValue(sharedPrefix);
  await expect(results(page).locator("[data-viewer-column-name]")).toHaveText([sharedBeta, sharedAlpha]);
  await expectMatches(page, "Customer Name", ["Customer Name"]);
  await expect(move(page, "Customer Name", "up")).toBeDisabled();
  await expect(move(page, "Customer Name", "down")).toBeEnabled();
  await expectMatches(page, "Extra Field 37", ["Extra Field 37"]);
  await expect(move(page, "Extra Field 37", "up")).toBeEnabled();
  await expect(move(page, "Extra Field 37", "down")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(search(page)).toBeHidden();
  await expect(page.getByTestId("button-column-selector")).toBeFocused();
  await expect(page.getByTestId("button-column-selector")).toHaveAccessibleName("Columns (42/43)");
  await openColumns(page);
  await expect(search(page)).toHaveValue("");
  await expect(results(page).locator("[data-viewer-column-name]"))
    .toHaveText([headers[0], sharedBeta, sharedAlpha, ...headers.slice(3)]);
  await expect(checkbox(page, sharedAlpha)).not.toBeChecked();
  await expect(checkbox(page, sharedBeta)).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-column-selector")).toBeFocused();
}

async function finishFixture(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>, reads: number) {
  await expect(page.getByTestId("input-search-viewer")).toHaveValue("");
  await page.waitForTimeout(400);
  expect(fixture.dataReads, "Column labels, local search, selection and movement must not fetch dataset rows").toHaveLength(reads);
  await checkFixture(page, fixture.session);
}

test("Viewer column labels: desktop truncates long names while preserving full labels and controls", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, "light");
  await openViewer(page);
  const reads = fixture.dataReads.length;
  await openColumns(page);
  await exerciseNames(page, false);
  await finishFixture(page, fixture, reads);
});

for (const width of [320, 700]) {
  test(`Viewer column labels: mobile sheet wraps long names without displacing controls ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 740 });
    const fixture = await installFixture(page, baseURL, "dark");
    await openViewer(page);
    const reads = fixture.dataReads.length;
    await openColumns(page);
    const dialog = page.getByRole("dialog", { name: "Select Columns", exact: true });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, right: rect.right, height: rect.height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(bounds.x).toBeGreaterThanOrEqual(-0.5);
    expect(bounds.right).toBeLessThanOrEqual(width + 0.5);
    expect(bounds.height).toBeLessThanOrEqual(740.5);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
    await exerciseNames(page, true);
    await expect(dialog).toBeHidden();
    await finishFixture(page, fixture, reads);
  });
}
