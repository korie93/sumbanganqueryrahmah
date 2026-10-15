import { expect, test, type Page, type Route } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, nickname } from "./helpers/save-collection-fixture";

// Production frontend, loopback static assets and explicit synthetic responses.
// Unknown requests fall through to the shared fixture's deny-by-default handler.
test.use({ serviceWorkers: "block" });
const alternateNickname = "Report Alternate Collector";

async function closeNicknamePopover(page: Page) {
  const trigger = page.getByRole("button", { name: /^(Pilih staff nickname|\d+ nickname dipilih)$/ });
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // Radix restores focus after unmount. Wait for that before dismissing the
  // containing Sheet so a second Escape cannot target the exiting Popover.
  await expect(trigger).toBeFocused();
}

async function closeMobileFilters(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Nickname Summary Filters", exact: true });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
}

async function installFixture(page: Page, baseURL: string | undefined, options: {
  role?: "admin" | "user" | "superuser"; theme?: "light" | "dark"; additionalNickname?: string;
} = {}) {
  const fixture = await installSessionFixture(page, baseURL, { ...options, additionalNickname: options.additionalNickname ?? alternateNickname });
  const origin = new URL(baseURL!).origin;
  const summaryRequests: string[] = [];
  await page.context().route(`${origin}/api/collection/**`, async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const respond = (json: unknown) => route.fulfill({ status: 200, json, headers: { "Cache-Control": "no-store" } });
    if (url.pathname === "/api/collection/daily/users") return respond({
      ok: true, users: [{ id: "guidance-nickname", username: nickname, role: "user" }],
    });
    if (url.pathname === "/api/collection/daily/overview") {
      return respond({
        ok: true, username: nickname, usernames: [nickname], role: options.role ?? "admin",
        month: { year: 2026, month: 10, daysInMonth: 31 },
        summary: {
          monthlyTarget: 31000, collectedToDate: 15000, collectedAmount: 15000,
          remainingTarget: 16000, balancedAmount: 16000, workingDays: 31,
          elapsedWorkingDays: 10, remainingWorkingDays: 21, requiredPerRemainingWorkingDay: 761.90,
          baseDailyTarget: 1000, dailyTarget: 1000, expectedProgressAmount: 10000,
          progressVarianceAmount: 5000, completedDays: 10, incompleteDays: 0,
          noCollectionDays: 0, neutralDays: 21,
        },
        days: Array.from({ length: 31 }, (_, index) => ({
          day: index + 1, date: `2026-10-${String(index + 1).padStart(2, "0")}`,
          amount: index < 10 ? 1500 : 0, target: 1000, calendarStatus: "WORKING",
          leaveType: null, note: null, isWorkingDay: true, isHoliday: false,
          holidayName: null, customerCount: index < 10 ? 1 : 0, status: index < 10 ? "green" : "neutral",
        })),
      });
    }
    if (url.pathname === "/api/collection/daily/day-details") return respond({
      ok: true, username: nickname, usernames: [nickname], date: url.searchParams.get("date"),
      status: "green", amount: 1500, dailyTarget: 1000, customers: [], records: [],
      message: "Synthetic day details", summary: { monthlyTarget: 31000, collected: 15000, balanced: 16000, totalForDate: 1500 },
      pagination: { page: 1, pageSize: 10, totalRecords: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    if (url.pathname === "/api/collection/nickname-summary") {
      const nicknames = url.searchParams.get("nicknames")!.split(",");
      summaryRequests.push(url.search);
      return respond({
        ok: true, nicknames, totalRecords: nicknames.length, totalAmount: 1500 * nicknames.length,
        page: 1, pageSize: 50, limit: 50, offset: 0, records: [],
        nicknameTotals: nicknames.map((name) => ({ nickname: name, totalRecords: 1, totalAmount: 1500 })),
        pagination: { mode: "hybrid", page: 1, pageSize: 50, limit: 50, offset: 0,
          total: nicknames.length, totalPages: 1, nextCursor: null, hasNextPage: false, hasPreviousPage: false },
      });
    }
    return route.fallback();
  });
  return { ...fixture, summaryRequests };
}

test("Report controls applied-scope status wraps a long unbroken nickname on mobile", async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const longNickname = "SyntheticCollectorWithAnIntentionallyLongUnbrokenNicknameForMobileWrapping";
  const fixture = await installFixture(page, baseURL, { role: "admin", additionalNickname: longNickname });
  await page.goto("/collection/nickname-summary");
  await page.getByRole("button", { name: /^Summary Filters/ }).click();
  await page.getByRole("button", { name: "Pilih staff nickname", exact: true }).click();
  await page.getByRole("checkbox", { name: longNickname, exact: true }).check();
  await closeNicknamePopover(page);
  for (const [testId, day] of [["from", "1"], ["to", "10"]]) {
    await page.getByTestId(`collection-nickname-summary-${testId}-date`).click();
    await page.locator('button[name="day"]:not(.day-outside)').filter({ hasText: new RegExp(`^${day}$`) }).click();
  }
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const status = page.getByTestId("collection-nickname-summary-filter-status");
  await expect(status).toContainText(longNickname);
  await closeMobileFilters(page);
  await expect(status).toBeVisible();
  await expect(status).toHaveCSS("overflow-wrap", /^(anywhere|break-word)$/);
  const layout = await status.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, viewport: innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  await testInfo.attach("nickname-long-applied-status", { body: await status.screenshot(), contentType: "image/png" });
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const [width, theme] of [[1280, "light"], [390, "dark"]] as const) {
  test(`Report controls Daily keeps all display modes and day dialogs at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "superuser", theme });
    await page.goto("/collection/daily");
    const viewMode = page.getByRole("combobox", { name: "Choose calendar display mode", exact: true });
    await expect(viewMode).toHaveValue("content");
    await expect(viewMode.locator("option")).toHaveCount(7);
    for (const mode of ["list", "icon-sm", "icon-md", "icon-lg", "tiles", "heatmap", "content"]) {
      await viewMode.selectOption(mode);
      const calendar = page.getByTestId(width < 768 ? "collection-daily-calendar-mobile-list" : "collection-daily-calendar-grid");
      await expect(calendar).toHaveClass(new RegExp(`(?:list|grid)-mode-${mode}(?:\\s|$)`));
      await expect(page.getByTestId("collection-daily-day-1")).toHaveAttribute("aria-haspopup", "dialog");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await viewMode.selectOption("tiles");
    await page.reload();
    await expect(viewMode).toHaveValue("tiles");
    const managementToggle = page.locator("summary").filter({ hasText: "Target and calendar management" });
    const management = managementToggle.locator("..");
    await expect(management).not.toHaveAttribute("open");
    await managementToggle.focus();
    await managementToggle.press("Enter");
    await expect(page.getByRole("button", { name: "Save Target", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save Changed Days", exact: true })).toBeDisabled();
    await managementToggle.press("Enter");
    const tools = page.getByTestId("collection-daily-status-tools");
    await expect(tools).not.toHaveAttribute("open");
    await tools.locator(":scope > summary").press("Enter");
    const bulkToggle = tools.locator("summary").filter({ hasText: "Bulk daily status update" });
    await bulkToggle.press("Enter");
    await expect(tools.getByRole("combobox", { name: "Bulk daily status", exact: true })).toBeVisible();
    await expect(tools.getByRole("button", { name: "Apply to selected days", exact: true })).toBeDisabled();
    await tools.locator(":scope > summary").press("Enter");
    await page.getByTestId("collection-daily-day-1").click();
    const dayDialog = page.getByTestId("collection-daily-day-dialog");
    await expect(dayDialog).toBeVisible();
    await expect(dayDialog.getByRole("heading", { name: "Maklumat Kutipan Harian - 01/10/2026", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dayDialog).toBeHidden();
    const edit = page.getByRole("button", { name: "Edit calendar status for 01/10/2026", exact: true });
    await expect(edit).toHaveAttribute("aria-haspopup", "dialog");
    await edit.click();
    const editor = page.getByRole("dialog", { name: "Edit status 01/10/2026", exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("button", { name: "Save changed status", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    await testInfo.attach(`daily-report-${theme}-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    await checkFixture(page, fixture);
  });

  test(`Report controls Daily preserves read-only role at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "user", theme });
    await page.goto("/collection/daily");
    await expect(page.getByTestId("collection-daily-day-1")).toBeVisible();
    await expect(page.locator("summary").filter({ hasText: "Target and calendar management" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit calendar status for/ })).toHaveCount(0);
    const tools = page.getByTestId("collection-daily-status-tools");
    await tools.locator(":scope > summary").press("Enter");
    await expect(tools.locator("summary").filter({ hasText: "Bulk daily status update" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Choose calendar display mode", exact: true })).toBeEnabled();
    await checkFixture(page, fixture);
  });

  test(`Report controls Nickname summary distinguishes draft and applied values at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "admin", theme });
    await page.goto("/collection/nickname-summary");
    const mobile = width < 768;
    const openFilters = async () => {
      if (mobile) {
        await page.getByRole("button", { name: /^Summary Filters/ }).click();
        await expect(page.getByRole("dialog", { name: "Nickname Summary Filters", exact: true })).toBeVisible();
      }
    };
    await openFilters();
    const nicknameTrigger = () => page.getByRole("button", { name: /^(Pilih staff nickname|\d+ nickname dipilih)$/ });
    await nicknameTrigger().click();
    await page.getByRole("checkbox", { name: nickname, exact: true }).check();
    await closeNicknamePopover(page);
    for (const [testId, day] of [["from", "1"], ["to", "10"]]) {
      await page.getByTestId(`collection-nickname-summary-${testId}-date`).click();
      await page.locator('button[name="day"]:not(.day-outside)').filter({ hasText: new RegExp(`^${day}$`) }).click();
    }
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    const status = page.getByTestId("collection-nickname-summary-filter-status");
    await expect(status).toContainText("Filters applied.");
    if (mobile) await closeMobileFilters(page);
    await expect(page.getByRole("heading", { name: "Aggregate by Nickname", exact: true })).toBeVisible();
    expect(fixture.summaryRequests).toHaveLength(1);
    if (mobile) await expect(page.getByText("Applied", { exact: true })).toBeVisible();
    await openFilters();
    await nicknameTrigger().click();
    await page.getByRole("checkbox", { name: alternateNickname, exact: true }).check();
    await closeNicknamePopover(page);
    if (mobile) await closeMobileFilters(page);
    await expect(status).toContainText("Draft changes are not applied.");
    await expect(status).toContainText(`Showing results for ${nickname}`);
    await expect(status).not.toContainText(alternateNickname);
    expect(fixture.summaryRequests).toHaveLength(1);
    if (mobile) await expect(page.getByText("Unapplied changes", { exact: true })).toBeVisible();
    for (const eventName of ["collection:data-changed", "collection:target-changed"]) {
      const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/collection/nickname-summary");
      await page.evaluate((name) => window.dispatchEvent(new Event(name)), eventName);
      const response = await refreshed;
      await response.finished();
      const scope = new URL(response.url()).searchParams;
      expect(scope.get("nicknames")).toBe(nickname);
      expect(scope.get("from")).toBe("2026-10-01");
      expect(scope.get("to")).toBe("2026-10-10");
      await expect(page.getByRole("heading", { name: "Aggregate by Nickname", exact: true })).toBeVisible();
      await expect(status).toContainText("Draft changes are not applied.");
      await expect(status).not.toContainText(alternateNickname);
      if (mobile) await expect(page.getByText("Unapplied changes", { exact: true })).toBeVisible();
    }
    expect(fixture.summaryRequests).toHaveLength(3);
    await testInfo.attach(`nickname-draft-${theme}-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    await openFilters();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(status).toContainText("Filters applied.");
    await expect(status).toContainText(alternateNickname);
    expect(fixture.summaryRequests).toHaveLength(4);
    if (mobile) await closeMobileFilters(page);
    await checkFixture(page, fixture);
  });
}
