import { expect, test, type Locator, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture } from "./helpers/save-collection-fixture";

// Production frontend, 100 synthetic rows and 43 columns. The shared session
// fixture rejects unexpected API methods/endpoints and all off-origin traffic.
// app.visual.spec.ts's Viewer fixture is local to that spec; reuse the smaller
// shared authenticated fixture rather than importing another test suite.
const importId = "viewer-deferred-synthetic";
const importName = "Synthetic deferred Viewer fields";
const headers = [
  "Customer Name", "Reference", "Account Number", "Card Number", "Notes",
  ...Array.from({ length: 38 }, (_, index) => `Extra Field ${String(index + 1).padStart(2, "0")}`),
];
const rowCount = 100;
const previewCount = 3; // Four preview positions, with Customer Name represented by the title.
const overflowCount = headers.length - 4;
const escapedNote = '<script>window.__sqrDeferredExecuted = true</script> <img data-deferred-probe src="/deferred-fields-probe" onerror="window.__sqrDeferredExecuted = true">';
const customer = (index: number) => `Synthetic Customer ${String(index + 1).padStart(3, "0")}`;
const rows = Array.from({ length: rowCount }, (_, index) => ({
  id: `viewer-deferred-row-${index + 1}`, importId,
  jsonDataJsonb: Object.fromEntries(headers.map((header, column) => [header,
    header === "Customer Name" ? customer(index)
      : header === "Account Number" ? `00001234567890${String(index).padStart(6, "0")}`
        : header === "Card Number" ? `00009007199254${String(index).padStart(6, "0")}`
          : header === "Notes" ? index === 0 ? escapedNote : `Current note for synthetic row ${index + 1}`
            : `${header} row ${index + 1} column ${column + 1}`,
  ])),
}));

test.use({ serviceWorkers: "block" });

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const fixture = await installSessionFixture(page, baseURL, { role: "admin", theme });
  const origin = new URL(baseURL!).origin;
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    // Reachable loopback APIs in the isolated test namespace, without egress.
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "admin", tabs: { home: true, saved: true, viewer: true } } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === "/api/imports", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: {
      imports: [{ id: importId, name: importName, filename: "synthetic-deferred.csv", rowCount,
        createdAt: "2026-10-10T08:00:00.000Z", createdBy: "guidance.admin", isDeleted: false }],
      pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
        total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    } });
  });
  await page.context().route((url) => url.origin === origin && url.pathname === `/api/imports/${importId}/data`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const query = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const matches = rows.filter((row) => !query || Object.values(row.jsonDataJsonb)
      .some((value) => value.toLowerCase().includes(query)));
    const pageSize = Number(url.searchParams.get("pageSize"));
    const currentPage = Number(url.searchParams.get("page"));
    expect([25, 100]).toContain(pageSize);
    expect(currentPage).toBe(1);
    expect(url.searchParams.has("columnFilters")).toBe(false);
    const pageRows = matches.slice(0, pageSize);
    const hasNextPage = pageRows.length < matches.length;
    const nextCursor = hasNextPage ? `deferred:${pageSize}` : null;
    return route.fulfill({ json: {
      headers, rows: pageRows, total: matches.length, page: 1, pageSize, limit: pageSize, offset: 0, nextCursor,
      pagination: { mode: "hybrid", page: 1, pageSize, limit: pageSize, offset: 0, nextCursor,
        total: matches.length, totalPages: Math.ceil(matches.length / pageSize) || 1, hasNextPage, hasPreviousPage: false },
    } });
  });
  return fixture;
}

async function openViewer(page: Page) {
  await page.goto("/saved");
  await page.getByTestId(`button-view-${importId}`).click();
  await expect(page).toHaveURL(/\/viewer(?:[?#]|$)/);
  await expect(page.locator("#viewer-dataset-title")).toHaveText(importName);
  // Keep this an explicit 100-row DOM stress regression after compact Viewer
  // adopts its lighter initial page size. The user's choice is made via the UI.
  await page.getByTestId("select-viewer-page-size").selectOption("100");
  await expect(page.locator(".viewer-mobile-card")).toHaveCount(rowCount);
  await expect(page.locator(".viewer-mobile-card dt")).toHaveCount(rowCount * previewCount);
  await expect(page.locator(".viewer-mobile-card details dl")).toHaveCount(0);
}

function field(card: Locator, header: string) {
  return card.locator("dt").filter({ hasText: new RegExp(`^${header}$`) }).locator("..").locator("dd");
}

async function expectOpen(card: Locator) {
  await expect(card.locator("details")).toHaveAttribute("open", "");
  await expect(card.locator("details dt")).toHaveCount(overflowCount);
}

async function expectClosed(card: Locator) {
  await expect(card.locator("details")).not.toHaveAttribute("open", "");
  await expect(card.locator("details dl")).toHaveCount(0);
  await expect(card.locator("dt")).toHaveCount(previewCount);
}

test("Viewer deferred fields: native keyboard open/close mounts only one row and escapes imported text", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  const card = page.locator(".viewer-mobile-card").first();
  const summary = card.locator("summary");
  const selection = card.getByRole("checkbox", { name: "Select row 1", exact: true });
  await selection.check();
  await expect(selection).toHaveAttribute("aria-checked", "true");
  await expect(summary).toHaveText(`Show ${overflowCount} more fields`);
  await summary.focus();
  await summary.press("Enter");
  await expectOpen(card);
  await expect(page.locator(".viewer-mobile-card dt")).toHaveCount(rowCount * previewCount + overflowCount);
  await expect(field(card, "Notes")).toHaveText(escapedNote);
  await expect(field(card, "Extra Field 38")).toHaveText(rows[0]!.jsonDataJsonb["Extra Field 38"]!);
  await expect(card.locator("script, img[data-deferred-probe]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __sqrDeferredExecuted?: boolean }).__sqrDeferredExecuted)).toBeUndefined();
  await summary.press("Space");
  await expectClosed(card);
  await expect(summary).toBeFocused();
  await expect(page.locator(".viewer-mobile-card dt")).toHaveCount(rowCount * previewCount);

  // Native toggle events can coalesce. State must follow the final DOM state,
  // rather than invert once per event and leave hidden fields mounted.
  await card.locator("details").evaluate((element: HTMLDetailsElement) => {
    element.open = true;
    element.open = false;
    element.open = true;
  });
  await expectOpen(card);
  await summary.press("Enter");
  await expectClosed(card);
  await expect(selection).toHaveAttribute("aria-checked", "true");
  await checkFixture(page, fixture);
});

test("Viewer deferred fields: removing all overflow columns resets the restored disclosure", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL);
  await openViewer(page);
  const card = page.locator(".viewer-mobile-card").first();
  await card.locator("summary").click();
  await expectOpen(card);
  await page.getByTestId("button-column-selector").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("button-deselect-columns").click();
  await expect(page.locator(".viewer-mobile-card details")).toHaveCount(0);
  await dialog.getByTestId("button-select-all-columns").click();
  await expect(page.locator(".viewer-mobile-card details")).toHaveCount(rowCount);
  await expect(page.locator(".viewer-mobile-card details[open]")).toHaveCount(0);
  await expect(page.locator(".viewer-mobile-card details dl")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await card.locator("summary").focus();
  await card.locator("summary").press("Enter");
  await expectOpen(card);
  await expect(field(card, "Notes")).toHaveText(escapedNote);
  await checkFixture(page, fixture);
});

test.describe("touch Viewer", () => {
  test.use({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true });

  test("Viewer deferred fields: touch reopens current filtered row values without retained overflow DOM", async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, "dark");
    await openViewer(page);
    const card = page.locator(".viewer-mobile-card").first();
    await card.locator("summary").tap();
    await expectOpen(card);
    await expect(field(card, "Notes")).toHaveText(escapedNote);
    const search = page.getByTestId("input-search-viewer");
    const filteredResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/imports/${importId}/data` && url.searchParams.get("search") === customer(1);
    });
    await search.fill(customer(1));
    expect((await filteredResponse).status()).toBe(200);
    await expect(page.locator(".viewer-mobile-card")).toHaveCount(1);
    await expect(card).toContainText(customer(1));
    await expect(card.getByTestId("button-viewer-row-details-0")).toBeVisible();
    // The result list reuses row position zero after filtering. Whether native
    // disclosure stays open or remounts, it must render the current row's data.
    if (!await card.locator("details").evaluate((element: HTMLDetailsElement) => element.open)) {
      await card.locator("summary").tap();
    }
    await expectOpen(card);
    await expect(field(card, "Notes")).toHaveText("Current note for synthetic row 2");
    await expect(card).not.toContainText(escapedNote);
    await card.locator("summary").tap();
    await expectClosed(card);
    await card.locator("summary").tap();
    await expectOpen(card);
    await expect(field(card, "Notes")).toHaveText("Current note for synthetic row 2");
    await card.locator("summary").tap();
    await expectClosed(card);
    const unfilteredResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/imports/${importId}/data` && !url.searchParams.has("search");
    });
    await search.fill("");
    expect((await unfilteredResponse).status()).toBe(200);
    await expect(page.locator(".viewer-mobile-card")).toHaveCount(rowCount);
    await expect(page.locator(".viewer-mobile-card details dl")).toHaveCount(0);
    await expect(page.locator(".viewer-mobile-card dt")).toHaveCount(rowCount * previewCount);
    await checkFixture(page, fixture);
  });
});
