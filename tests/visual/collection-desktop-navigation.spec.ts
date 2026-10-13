import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSaveFixture, nickname } from "./helpers/save-collection-fixture";

// Production frontend against a loopback static build and synthetic responses.
// The shared fixture blocks every off-origin or unexpected API request; these
// exact read-only responses cover navigation without accounts or a database.
test.use({ serviceWorkers: "block" });

const sectionNames = [
  "Simpan Collection Individual", "View Rekod Collection", "Collection Summary",
  "Monthly Comparison", "Collection Daily", "Billing Principal (OSP)",
  "Nickname Summary", "Manage Nickname",
];
const shortLabels = ["Simpan", "Rekod", "Summary", "Monthly", "Daily", "OSP", "Nickname", "Manage"];
const sections = (page: Page) => page.getByRole("navigation", { name: "Collection sections", exact: true });

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: "light" | "dark"; role?: "admin" | "user" | "superuser";
} = {}) {
  const fixture = await installSaveFixture(page, baseURL, options);
  const origin = new URL(baseURL!).origin;
  await page.context().route(`${origin}/api/collection/**`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const fulfill = (json: unknown) => route.fulfill({ status: 200, json, headers: { "Cache-Control": "no-store" } });
    if (url.pathname === "/api/collection/list") return fulfill({
      ok: true, records: [], total: 0, totalAmount: 0,
      page: 1, pageSize: 50, limit: 50, offset: 0, nextCursor: null,
      pagination: { mode: "hybrid", page: 1, pageSize: 50, limit: 50,
        offset: 0, total: 0, totalPages: 1, nextCursor: null,
        hasNextPage: false, hasPreviousPage: false },
    });
    if (url.pathname === "/api/collection/source-files") return fulfill({
      ok: true, sourceFiles: [], pagination: { limit: 50, total: 0, nextCursor: null },
    });
    if (url.pathname === "/api/collection/source-configs") return fulfill({ ok: true, sourceConfigs: [] });
    if (url.pathname === "/api/collection/teams") return fulfill({ ok: true, teams: [] });
    if (url.pathname === "/api/collection/purge-summary") return fulfill({
      ok: true, retentionMonths: 6, cutoffDate: "2026-04-10", eligibleRecords: 0, totalAmount: 0,
    });
    if (url.pathname === "/api/collection/summary") return fulfill({
      ok: true, year: 2026,
      summary: [{ month: 1, monthName: "January", totalRecords: 0, totalAmount: 0 }],
      dashboard: { month: 1, scopeLabel: "Synthetic Collection records", canViewLeaderBreakdown: true,
        leaders: [], unassignedAmount: 0 },
    });
    if (url.pathname === "/api/collection/report/billing-principal/saved-targets") return fulfill({
      ok: true, targets: [], page: 1, pageSize: 20, hasMore: false,
    });
    return route.fallback();
  });
  return fixture;
}

async function expectOneRow(page: Page) {
  const navigation = sections(page);
  await expect(navigation).toHaveCSS("flex-wrap", "nowrap");
  await expect(navigation).toHaveCSS("overflow-x", "auto");
  const tops = await navigation.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function expectCompactContext(page: Page) {
  const heading = page.getByRole("heading", { name: "Collection Report", level: 1, exact: true });
  await expect(heading).toHaveCount(1);
  const context = page.locator(".collection-report-context");
  expect((await context.boundingBox())!.height).toBeLessThanOrEqual(44);
  const titleContext = context.locator(".ops-page-heading > div:first-child");
  const titleBounds = (await titleContext.boundingBox())!;
  expect(titleBounds.width).toBeLessThanOrEqual(1);
  expect(titleBounds.height).toBeLessThanOrEqual(1);
  await expect(titleContext).toHaveCSS("overflow", "hidden");
  await expect(page.locator(".collection-report-frame")).toHaveCSS("gap", "16px");
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1024, 1280, 1920]) {
    test(`Collection desktop navigation is one compact row in ${theme} at ${width}px`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installFixture(page, baseURL, { theme, role: "superuser" });
      await page.goto("/collection/records");
      await expect(page.getByTestId("collection-records-page")).toBeVisible();
      await expect(sections(page).getByRole("button")).toHaveCount(8);
      await expectOneRow(page);
      await expectCompactContext(page);
      for (const [index, name] of sectionNames.entries()) {
        const button = sections(page).getByRole("button", { name, exact: true });
        await expect(button).toHaveAttribute("title", name);
        await expect(button.locator(".collection-section-label-short")).toHaveText(shortLabels[index]!);
        await expect(button).toHaveAccessibleName(name);
        const visibleLabel = await button.locator(".collection-section-label-short").innerText();
        const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
        expect(normalize((await button.getAttribute("aria-label"))!)).toContain(normalize(visibleLabel));
        await expect(button.locator(".collection-section-label-full")).not.toBeVisible();
      }
      await expect(sections(page).getByRole("button", { name: "View Rekod Collection", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(sections(page).locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator("#collection-records-search")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`collection-compact-${theme}-${width}.png`), fullPage: true, animations: "disabled" });
      await checkFixture(page, fixture);
    });
  }
}

test("Collection desktop buttons support Enter and preserve inner headers, search and controls", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "admin" });
  await page.goto("/collection/save");
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  const records = sections(page).getByRole("button", { name: "View Rekod Collection", exact: true });
  await records.focus();
  await expect(records).toBeFocused();
  await records.press("Enter");
  await expect(page).toHaveURL(/\/collection\/records$/);
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
  await expect(records).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#collection-records-search")).toBeVisible();
  await expect(page.getByTestId("collection-records-filter-toggle")).toBeVisible();

  const summary = sections(page).getByRole("button", { name: "Collection Summary", exact: true });
  await summary.focus();
  await summary.press("Enter");
  await expect(page).toHaveURL(/\/collection\/summary$/);
  await expect(page.getByRole("heading", { name: "Collection Summary", level: 2, exact: true })).toBeVisible();
  await expect(summary).toHaveAttribute("aria-current", "page");
  await expectCompactContext(page);
  await checkFixture(page, fixture);
});

test("direct Billing routes reveal the selected overflow item without scrolling the page", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "superuser" });
  await page.goto("/collection/billing-principal");
  await expect(page.getByTestId("billing-principal-page")).toBeVisible();
  const selected = sections(page).getByRole("button", { name: "Billing Principal (OSP)", exact: true });
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect.poll(async () => {
    const navBounds = (await sections(page).boundingBox())!;
    const buttonBounds = (await selected.boundingBox())!;
    return buttonBounds.x >= navBounds.x - 1 && buttonBounds.x + buttonBounds.width <= navBounds.x + navBounds.width + 1;
  }).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectOneRow(page);
  await expectCompactContext(page);
  await checkFixture(page, fixture);
});

test("the admin staff badge stays inside its desktop context without overlapping sections at 1024px", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "admin" });
  await page.goto("/collection/records");
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
  const context = page.locator(".collection-report-context");
  const actions = context.locator(".ops-page-heading > div:nth-child(2)");
  const badge = context.locator(".collection-report-staff-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("title", `Staff Nickname: ${nickname}`);
  await expect(badge).toHaveText(`Staff Nickname: ${nickname}`);
  await expect(badge).toHaveCSS("text-overflow", "ellipsis");
  await expect(badge).toHaveCSS("white-space", "nowrap");
  const navBounds = (await sections(page).boundingBox())!;
  const contextBounds = (await context.boundingBox())!;
  expect(contextBounds.x).toBeGreaterThanOrEqual(navBounds.x + navBounds.width - 1);
  for (const element of [actions, badge]) {
    const bounds = (await element.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(contextBounds.x - 1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(contextBounds.x + contextBounds.width + 1);
  }
  await expectOneRow(page);
  await expectCompactContext(page);
  await checkFixture(page, fixture);
});

for (const [role, count] of [["user", 5], ["admin", 7], ["superuser", 8]] as const) {
  test(`short collection labels preserve ${role} section permissions`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const fixture = await installFixture(page, baseURL, { role });
    await page.goto("/collection/records");
    await expect(page.getByTestId("collection-records-page")).toBeVisible();
    await expect(sections(page).getByRole("button")).toHaveCount(count);
    await expect(sections(page).getByRole("button", { name: "Billing Principal (OSP)", exact: true })).toHaveCount(role === "user" ? 0 : 1);
    await expect(sections(page).getByRole("button", { name: "Nickname Summary", exact: true })).toHaveCount(role === "user" ? 0 : 1);
    await expect(sections(page).getByRole("button", { name: "Manage Nickname", exact: true })).toHaveCount(role === "superuser" ? 1 : 0);
    await expectOneRow(page);
    await checkFixture(page, fixture);
  });
}

test("tablet retains the full heading and original wrapped section labels", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "admin" });
  await page.goto("/collection/save");
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  await expect(page.locator(".collection-report-frame")).toHaveCSS("gap", "24px");
  await expect(page.getByRole("heading", { name: "Collection Report", level: 1, exact: true })).toBeVisible();
  expect((await page.locator(".collection-report-context .ops-page-heading > div:first-child").boundingBox())!.height).toBeGreaterThan(30);
  await expect(sections(page)).toHaveCSS("flex-wrap", "wrap");
  await expect(sections(page).getByRole("button", { name: "Simpan Collection Individual", exact: true }).locator(".collection-section-label-full")).toBeVisible();
  await expect(sections(page).locator(".collection-section-label-short").first()).not.toBeVisible();
  await checkFixture(page, fixture);
});

test("mobile keeps its full-label section Sheet and returns keyboard focus on close", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL, { role: "admin" });
  await page.goto("/collection/save");
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  await expect(sections(page)).toHaveCount(0);
  await expect(page.locator(".collection-report-frame")).toHaveCSS("gap", "16px");
  const launcher = page.getByTestId("button-open-collection-sections");
  await launcher.click();
  const drawer = page.getByRole("dialog", { name: "Collection sections", exact: true });
  await expect(drawer).toBeVisible();
  const mobileSections = drawer.getByRole("navigation", { name: "Collection sections mobile", exact: true });
  const records = mobileSections.getByRole("button", { name: /^View Rekod Collection\b/ });
  await expect(records).toBeVisible();
  await expect(records.getByText("View Rekod Collection", { exact: true })).toBeVisible();
  await expect(records.getByText("Semak, tapis, dan kemas kini rekod collection.", { exact: true })).toBeVisible();
  // Sheet visibility may precede the focus-scope effect on slower CI machines.
  await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await records.click();
  await expect(page).toHaveURL(/\/collection\/records$/);
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
  await expect(page.locator("#collection-records-search-mobile")).toBeVisible();
  await checkFixture(page, fixture);
});
