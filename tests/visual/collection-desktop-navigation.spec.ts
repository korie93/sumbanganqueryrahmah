import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSaveFixture, nickname } from "./helpers/save-collection-fixture";

// The actual production frontend runs against loopback and exact synthetic
// responses only. Unexpected APIs, off-origin traffic and WebSockets are blocked
// by the shared fixture; no account, backend or production data is used.
test.use({ serviceWorkers: "block" });

const sectionNames = [
  "Simpan Collection Individual", "View Rekod Collection", "Collection Summary",
  "Monthly Comparison", "Collection Daily", "Billing Principal (OSP)",
  "Nickname Summary", "Manage Nickname",
];
const shortLabels = ["Simpan", "Rekod", "Summary", "Monthly", "Daily", "OSP", "Nickname", "Manage"];
const paths = ["save", "records", "summary", "monthly-comparison", "daily", "billing-principal", "nickname-summary", "nicknames"];
const sections = (page: Page) => page.getByRole("navigation", { name: "Collection sections", exact: true });

// Match the CSS viewport + raster scale of 125% browser zoom. Do not use CSS
// zoom or pinch zoom: those do not exercise responsive breakpoints correctly.
for (const physicalWidth of [1366, 1024, 390]) {
  test.describe(`125% effective browser viewport at ${physicalWidth}px`, () => {
    const width = Math.floor(physicalWidth / 1.25);
    test.use({ viewport: { width, height: 720 }, deviceScaleFactor: 1.25 });
    test("compact sections and form controls remain reachable", async ({ page, baseURL }, testInfo) => {
      const fixture = await installFixture(page, baseURL, { role: "admin", theme: "dark" });
      await page.goto("/collection/save");
      await expect(page.locator("#save-collection-customer-name")).toBeVisible();
      await expectOneRow(page, width);
      await expectCompactContext(page);
      await expectStaffBadge(page, width);
      await expect(page.locator(".save-collection-shortcut-hint")).toBeVisible();
      const records = sections(page).getByRole("button", { name: "View Rekod Collection", exact: true });
      await records.focus();
      await records.press("Enter");
      await expect(page.getByTestId("collection-records-page")).toBeVisible();
      await expectCurrent(page, "View Rekod Collection");
      await expectOneRow(page, width);
      await page.screenshot({ path: testInfo.outputPath(`zoom-125-${physicalWidth}.png`), fullPage: true });
      await checkFixture(page, fixture);
    });
  });
}

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
    if (url.pathname === "/api/collection/admin-groups") return fulfill({ ok: true, groups: [] });
    if (url.pathname === "/api/collection/daily/users") return fulfill({ ok: true, users: [] });
    if (url.pathname === "/api/collection/purge-summary") return fulfill({
      ok: true, retentionMonths: 6, cutoffDate: "2026-04-10", eligibleRecords: 0, totalAmount: 0,
    });
    if (url.pathname === "/api/collection/summary") return fulfill({
      ok: true, year: 2026,
      summary: [{ month: 1, monthName: "January", totalRecords: 0, totalAmount: 0 }],
      dashboard: { month: 1, scopeLabel: "Synthetic Collection records", canViewLeaderBreakdown: true,
        leaders: [], unassignedAmount: 0 },
    });
    if (url.pathname === "/api/collection/monthly-comparison") {
      const start = url.searchParams.get("startMonth")!;
      const end = url.searchParams.get("endMonth")!;
      return fulfill({
        ok: true, nickname, startMonth: start, endMonth: end,
        months: [{ month: start, label: start, totalCollection: 0, recordCount: 0, averagePerRecord: 0 },
          { month: end, label: end, totalCollection: 0, recordCount: 0, averagePerRecord: 0 }],
        comparison: { baseMonth: start, targetMonth: end, baseLabel: start, targetLabel: end,
          baseTotal: 0, targetTotal: 0, difference: 0, percentageChange: null,
          direction: "no_change", summary: "Synthetic empty collection comparison." },
      });
    }
    if (url.pathname === "/api/collection/monthly-target") {
      const key = url.searchParams.get("month")!;
      return fulfill({ ok: true, nickname, month: { key, year: Number(key.slice(0, 4)), month: Number(key.slice(5)) },
        monthlyTarget: 0, configured: false, source: "missing" });
    }
    if (url.pathname === "/api/collection/daily/overview") {
      const year = Number(url.searchParams.get("year"));
      const month = Number(url.searchParams.get("month"));
      return fulfill({ ok: true, username: nickname, usernames: [nickname], role: "superuser",
        month: { year, month, daysInMonth: new Date(year, month, 0).getDate() }, summary: {}, days: [] });
    }
    if (url.pathname === "/api/collection/report/billing-principal/saved-targets") return fulfill({
      ok: true, targets: [], page: 1, pageSize: 20, hasMore: false,
    });
    return route.fallback();
  });
  return fixture;
}

async function expectOneRow(page: Page, width: number) {
  const navigation = sections(page);
  await expect(navigation).toHaveCount(1);
  await expect(navigation).toHaveCSS("flex-wrap", "nowrap");
  await expect(navigation).toHaveCSS("overflow-x", "auto");
  const boxes = await navigation.getByRole("button").evaluateAll((buttons) => buttons.map((button) => {
    const { top, width, height } = button.getBoundingClientRect();
    return { top, width, height };
  }));
  const tops = boxes.map((box) => box.top);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 40);
    expect(box.width).toBeGreaterThanOrEqual(40);
  }
  await expect(page.getByTestId("button-open-collection-sections")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Collection sections mobile", exact: true })).toHaveCount(0);
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
  await expect(page.locator(".collection-report-save-shortcut")).toHaveCount(0);
  const navigation = (await page.locator(".collection-report-navigation").boundingBox())!;
  const content = (await page.locator(".collection-report-content").boundingBox())!;
  expect(navigation.height).toBeLessThanOrEqual(72);
  expect(content.y - navigation.y - navigation.height).toBeGreaterThanOrEqual(15);
  expect(content.y - navigation.y - navigation.height).toBeLessThanOrEqual(17);
}

async function expectCurrent(page: Page, name: string) {
  await expect(sections(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(sections(page).getByRole("button", { name, exact: true })).toHaveAttribute("aria-current", "page");
}

async function expectSectionContent(page: Page, index: number) {
  const route = paths[index];
  if (route === "save") await expect(page.locator("#save-collection-superuser-nickname")).toBeVisible();
  else if (route === "records") await expect(page.getByTestId("collection-records-page")).toBeVisible();
  else if (route === "daily") await expect(page.getByTestId("collection-daily-page")).toBeVisible();
  else if (route === "billing-principal") await expect(page.getByTestId("billing-principal-page")).toBeVisible();
  else if (route === "monthly-comparison") await expect(page.locator(".collection-report-content header")
    .getByRole("heading", { name: "Monthly Collection Comparison", exact: true })).toBeVisible();
  else await expect(page.getByRole("heading", { name: sectionNames[index]!, exact: true })).toBeVisible();
}

async function expectStaffBadge(page: Page, width: number) {
  const context = page.locator(".collection-report-context");
  const badge = context.locator(".collection-report-staff-badge");
  await expect(badge).toHaveCount(1);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("title", `Staff Nickname: ${nickname}`);
  await expect(badge).toHaveText(`Staff Nickname: ${nickname}`);
  await expect(badge).toHaveCSS("text-overflow", "ellipsis");
  await expect(badge).toHaveCSS("white-space", "nowrap");
  const navBounds = (await sections(page).boundingBox())!;
  const contextBounds = (await context.boundingBox())!;
  const badgeBounds = (await badge.boundingBox())!;
  expect(contextBounds.x).toBeGreaterThanOrEqual(navBounds.x + navBounds.width - 1);
  expect(contextBounds.width).toBeLessThanOrEqual(width < 768 ? 112 : 180);
  expect(badgeBounds.x).toBeGreaterThanOrEqual(contextBounds.x - 1);
  expect(badgeBounds.x + badgeBounds.width).toBeLessThanOrEqual(contextBounds.x + contextBounds.width + 1);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 1024, 768, 390, 360]) {
    test(`Save and Records share compact navigation in ${theme} at ${width}px`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installFixture(page, baseURL, { theme, role: "admin" });
      const geometry: Array<{ x: number; y: number; width: number; height: number }> = [];
      for (const route of ["save", "records"] as const) {
        await page.goto(`/collection/${route}`);
        if (route === "save") await expect(page.locator("#save-collection-customer-name")).toBeVisible();
        else await expect(page.getByTestId("collection-records-page")).toBeVisible();
        await expect(sections(page).getByRole("button")).toHaveCount(7);
        await expectOneRow(page, width);
        await expectCompactContext(page);
        await expectStaffBadge(page, width);
        await expectCurrent(page, sectionNames[route === "save" ? 0 : 1]!);
        await expect(sections(page).locator(".collection-section-label-short")).toHaveText(shortLabels.slice(0, 7));
        for (const name of sectionNames.slice(0, 7)) {
          const button = sections(page).getByRole("button", { name, exact: true });
          await expect(button).toHaveAttribute("title", name);
          await expect(button).toHaveAccessibleName(name);
          const visibleLabel = await button.locator(".collection-section-label-short").innerText();
          expect(name.toLowerCase()).toContain(visibleLabel.toLowerCase());
          await expect(button.locator(".collection-section-label-full")).toHaveCount(0);
        }
        geometry.push((await page.locator(".collection-report-navigation").boundingBox())!);
        await page.screenshot({ path: testInfo.outputPath(`collection-compact-${route}-${theme}-${width}.png`), fullPage: true, animations: "disabled" });
      }
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(geometry[0]![key] - geometry[1]![key]), `Save/Records ${key}`).toBeLessThanOrEqual(1);
      }
      await expect(page.locator(width < 768 ? "#collection-records-search-mobile" : "#collection-records-search")).toBeVisible();
      expect(fixture.saves).toHaveLength(0);
      expect(fixture.matches).toBe(0);
      await checkFixture(page, fixture);
    });
  }
}

test("native Enter navigation preserves inner content and browser back/forward history", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "admin" });
  await page.goto("/collection/save");
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  const records = sections(page).getByRole("button", { name: "View Rekod Collection", exact: true });
  await records.focus();
  await records.press("Enter");
  await expect(page).toHaveURL(/\/collection\/records$/);
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
  await expectCurrent(page, "View Rekod Collection");
  await expect(page.locator("#collection-records-search")).toBeVisible();
  await expect(page.getByTestId("collection-records-filter-toggle")).toBeVisible();

  const summary = sections(page).getByRole("button", { name: "Collection Summary", exact: true });
  await summary.focus();
  await summary.press("Enter");
  await expect(page).toHaveURL(/\/collection\/summary$/);
  await expect(page.getByRole("heading", { name: "Collection Summary", exact: true })).toBeVisible();
  await expectCurrent(page, "Collection Summary");

  await page.goBack();
  await expect(page).toHaveURL(/\/collection\/records$/);
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
  await expectCurrent(page, "View Rekod Collection");
  await page.goBack();
  await expect(page).toHaveURL(/\/collection\/save$/);
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  await expectCurrent(page, "Simpan Collection Individual");
  await page.goForward();
  await expect(page).toHaveURL(/\/collection\/records$/);
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
  await expectCurrent(page, "View Rekod Collection");
  await expectCompactContext(page);
  await checkFixture(page, fixture);
});

test("clicking every authorized section uses its real SPA route without reloading the document", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "superuser" });
  await page.goto("/collection/records");
  await expectSectionContent(page, 1);
  const initialDocument = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, historyLength: history.length }));

  // Clicking the current Records section must not add an entry. Then exercise
  // every remaining real button, including all permission-sensitive modules.
  for (const [step, index] of [1, 0, 2, 3, 4, 5, 6, 7].entries()) {
    await test.step(sectionNames[index]!, async () => {
      await sections(page).getByRole("button", { name: sectionNames[index]!, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/collection/${paths[index]}$`));
      await expectSectionContent(page, index);
      await expectCurrent(page, sectionNames[index]!);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialDocument.timeOrigin);
      expect(await page.evaluate(() => history.length)).toBe(initialDocument.historyLength + step);
    });
  }
  expect(fixture.saves).toHaveLength(0);
  expect(fixture.matches).toBe(0);
  await checkFixture(page, fixture);
});

for (const width of [1366, 390, 360]) {
  test(`Tab reveals every overflow section and leaves the strip at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "superuser" });
    await page.goto("/collection/records");
    await expect(page.getByTestId("collection-records-page")).toBeVisible();
    const navigation = sections(page);
    await navigation.getByRole("button").first().focus();
    for (const [index, name] of sectionNames.entries()) {
      const button = navigation.getByRole("button", { name, exact: true });
      await expect(button).toBeFocused();
      await expect.poll(async () => {
        const nav = (await navigation.boundingBox())!;
        const item = (await button.boundingBox())!;
        return item.x >= nav.x - 1 && item.x + item.width <= nav.x + nav.width + 1;
      }).toBe(true);
      if (index > 0) expect(await button.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
      await page.keyboard.press("Tab");
    }
    expect(await navigation.evaluate((element) => element.contains(document.activeElement))).toBe(false);
    await page.keyboard.press("Shift+Tab");
    await expect(navigation.getByRole("button", { name: "Manage Nickname", exact: true })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expectCurrent(page, "View Rekod Collection");
    await expectOneRow(page, width);
    await checkFixture(page, fixture);
  });
}

test("direct Billing route reveals its selected overflow item on mobile without scrolling the page", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "superuser" });
  await page.goto("/collection/billing-principal");
  await expect(page.getByTestId("billing-principal-page")).toBeVisible();
  const selected = sections(page).getByRole("button", { name: "Billing Principal (OSP)", exact: true });
  await expectCurrent(page, "Billing Principal (OSP)");
  await expect.poll(async () => {
    const nav = (await sections(page).boundingBox())!;
    const button = (await selected.boundingBox())!;
    return button.x >= nav.x - 1 && button.x + button.width <= nav.x + nav.width + 1;
  }).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectOneRow(page, 360);
  await expectCompactContext(page);
  await checkFixture(page, fixture);
});

for (const width of [1366, 360]) {
  for (const [role, count] of [["user", 5], ["admin", 7], ["superuser", 8]] as const) {
    test(`compact labels preserve ${role} section permissions at ${width}px`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installFixture(page, baseURL, { role });
      await page.goto("/collection/records");
      await expect(page.getByTestId("collection-records-page")).toBeVisible();
      await expect(sections(page).getByRole("button")).toHaveCount(count);
      await expect(sections(page).locator(".collection-section-label-short")).toHaveText(shortLabels.slice(0, count));
      for (const [name, visible] of [
        ["Billing Principal (OSP)", role !== "user"],
        ["Nickname Summary", role !== "user"],
        ["Manage Nickname", role === "superuser"],
      ] as const) {
        await expect(sections(page).getByRole("button", { name, exact: true })).toHaveCount(visible ? 1 : 0);
      }
      await expectCurrent(page, "View Rekod Collection");
      await expectOneRow(page, width);
      await checkFixture(page, fixture);
    });
  }
}

for (const [index, route] of paths.entries()) {
  test(`direct /collection/${route} and refresh retain the authoritative selected section`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "superuser" });
    await page.goto(`/collection/${route}`);
    await expectSectionContent(page, index);
    await expectCurrent(page, sectionNames[index]!);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/collection/${route}$`));
    await expectSectionContent(page, index);
    await expectCurrent(page, sectionNames[index]!);
    await expectCompactContext(page);
    await checkFixture(page, fixture);
  });
}
