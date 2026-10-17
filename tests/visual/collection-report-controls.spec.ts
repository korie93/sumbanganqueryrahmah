import { expect, test, type Page, type Route } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, nickname } from "./helpers/save-collection-fixture";

// Production frontend, loopback static assets and explicit synthetic responses.
// Unknown requests fall through to the shared fixture's deny-by-default handler.
test.use({ serviceWorkers: "block" });
const alternateNickname = "Report Alternate Collector";
type DailyDetailsRequest = { date: string; page: number; pageSize: number; index: number };

function buildDailyDetailsFixture({ date, page, pageSize }: DailyDetailsRequest) {
  const day = Number(date.slice(-2));
  const totalRecords = day === 1 ? 12 : day < 11 ? 1 : 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const records = Array.from({ length: totalRecords }, (_, index) => ({
    id: `daily-${date}-${index + 1}`, customerName: `Synthetic ${date} customer ${index + 1}`,
    accountNumber: `TEST-${day}-${index + 1}`, paymentDate: date, amount: 1500 / totalRecords,
    batch: "P25", paymentReference: `TEST-REF-${day}-${index + 1}`, username: "guidance.user",
    collectionStaffNickname: nickname, createdAt: `${date}T08:00:00.000Z`, receiptFile: null, receipts: [],
  }));
  return {
    ok: true, username: nickname, usernames: [nickname], date,
    status: totalRecords ? "green" : "neutral", amount: totalRecords ? 1500 : 0, dailyTarget: 1000,
    customers: records.map(({ id, customerName, accountNumber, amount, collectionStaffNickname }) => ({
      id, customerName, accountNumber, amount, collectionStaffNickname,
    })),
    records: records.slice((page - 1) * pageSize, page * pageSize), message: "Synthetic day details",
    summary: { monthlyTarget: 31000, collected: 15000, balanced: 16000, totalForDate: totalRecords ? 1500 : 0, targetForDate: 1000 },
    pagination: { page, pageSize, totalRecords, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  };
}

function createRequestGate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

async function expectDailyPeriod(page: Page, year: number, month: number) {
  await expect(page.locator("#collection-daily-year-input")).toHaveValue(String(year));
  await expect(page.locator("#collection-daily-month-input")).toHaveValue(String(month));
  await expect(page.getByTestId("collection-daily-day-1")).toHaveAttribute(
    "data-collection-daily-date", `${year}-${String(month).padStart(2, "0")}-01`,
  );
}

function dayDateNavigation(page: Page) {
  return page.getByRole("navigation", { name: "Tukar tarikh kutipan dalam bulan ini", exact: true });
}

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
  onDailyDetails?: (route: Route, request: DailyDetailsRequest, response: ReturnType<typeof buildDailyDetailsFixture>) => Promise<unknown>;
} = {}) {
  const fixture = await installSessionFixture(page, baseURL, { ...options, additionalNickname: options.additionalNickname ?? alternateNickname });
  const origin = new URL(baseURL!).origin;
  const summaryRequests: string[] = [];
  const overviewRequests: Array<{ year: number; month: number }> = [];
  const dayDetailsRequests: DailyDetailsRequest[] = [];
  await page.context().route(`${origin}/api/collection/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") {
      fixture.unexpected.push(`${route.request().method()} ${url.pathname}`);
      return route.abort();
    }
    const respond = (json: unknown) => route.fulfill({ status: 200, json, headers: { "Cache-Control": "no-store" } });
    if (url.pathname === "/api/collection/daily/users") return respond({
      ok: true, users: [{ id: "guidance-nickname", username: nickname, role: "user" }],
    });
    if (url.pathname === "/api/collection/daily/overview") {
      const year = Number(url.searchParams.get("year") ?? 2026);
      const month = Number(url.searchParams.get("month") ?? 10);
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      overviewRequests.push({ year, month });
      return respond({
        ok: true, username: nickname, usernames: [nickname], role: options.role ?? "admin",
        month: { year, month, daysInMonth },
        summary: {
          monthlyTarget: 31000, collectedToDate: 15000, collectedAmount: 15000,
          remainingTarget: 16000, balancedAmount: 16000, workingDays: 31,
          elapsedWorkingDays: 10, remainingWorkingDays: 21, requiredPerRemainingWorkingDay: 761.90,
          baseDailyTarget: 1000, dailyTarget: 1000, expectedProgressAmount: 10000,
          progressVarianceAmount: 5000, completedDays: 10, incompleteDays: 0,
          noCollectionDays: 0, neutralDays: 21,
        },
        days: Array.from({ length: daysInMonth }, (_, index) => ({
          day: index + 1, date: `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
          amount: index < 10 ? 1500 : 0, target: 1000, calendarStatus: "WORKING",
          leaveType: null, note: null, isWorkingDay: true, isHoliday: false,
          holidayName: null, customerCount: index === 0 ? 12 : index < 10 ? 1 : 0, status: index < 10 ? "green" : "neutral",
        })),
      });
    }
    if (url.pathname === "/api/collection/daily/day-details") {
      const request = {
        date: url.searchParams.get("date")!, page: Number(url.searchParams.get("page") ?? 1),
        pageSize: Number(url.searchParams.get("pageSize") ?? 10), index: dayDetailsRequests.length + 1,
      };
      dayDetailsRequests.push(request);
      const response = buildDailyDetailsFixture(request);
      if (options.onDailyDetails) return options.onDailyDetails(route, request, response);
      return respond(response);
    }
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
  return { ...fixture, summaryRequests, overviewRequests, dayDetailsRequests };
}

for (const width of [768, 1024, 1280, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Report controls Daily summary fits shared desktop tiers at ${width}px ${theme}`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installFixture(page, baseURL, { role: "superuser", theme });
      await page.goto("/collection/daily");
      const summary = page.locator(".collection-daily-summary-card");
      const primaryMetrics = summary.locator(".collection-daily-summary-content > .collection-daily-summary-metrics");
      const values = primaryMetrics.locator(".ops-metric-value");
      await expect(values).toHaveCount(4);
      const layout = await primaryMetrics.evaluate((element) => ({
        columns: getComputedStyle(element).gridTemplateColumns.split(/\s+/).length,
        amounts: [...element.querySelectorAll<HTMLElement>(".ops-metric-value")].map((value) => ({
          text: value.innerText, clientWidth: value.clientWidth, scrollWidth: value.scrollWidth,
        })),
      }));
      expect(layout.columns).toBe(width < 1024 ? 2 : 4);
      for (const amount of layout.amounts) {
        expect(amount.text).toMatch(/^RM\s+[\d,.]+$/);
        expect(amount.scrollWidth, `Complete ${amount.text} fits at ${width}px`).toBeLessThanOrEqual(amount.clientWidth + 1);
      }
      await testInfo.attach(`daily-summary-${theme}-${width}`, { body: await summary.screenshot(), contentType: "image/png" });
      await checkFixture(page, fixture);
    });
  }
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
  test(`Report controls Daily month shortcuts and today stay read-only at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "user", theme });
    await page.goto("/collection/daily");
    await expectDailyPeriod(page, 2026, 10);
    await expect(page.getByTestId("collection-daily-day-10")).toHaveAttribute("aria-current", "date");
    await expect(page.locator('[data-collection-daily-date][aria-current="date"]')).toHaveCount(1);
    const previous = page.getByRole("button", { name: "Bulan sebelumnya", exact: true });
    const next = page.getByRole("button", { name: "Bulan seterusnya", exact: true });
    await previous.click();
    await expectDailyPeriod(page, 2026, 9);
    await expect(page.locator('[data-collection-daily-date][aria-current="date"]')).toHaveCount(0);
    await next.click();
    await expectDailyPeriod(page, 2026, 10);
    await page.locator("#collection-daily-month-input").fill("12");
    await page.locator("#collection-daily-month-input").press("Enter");
    await expectDailyPeriod(page, 2026, 12);
    await next.click();
    await expectDailyPeriod(page, 2027, 1);
    await previous.click();
    await expectDailyPeriod(page, 2026, 12);
    await page.getByRole("button", { name: "Bulan ini", exact: true }).click();
    await expectDailyPeriod(page, 2026, 10);
    await expect(page.getByTestId("collection-daily-day-10")).toHaveAttribute("aria-current", "date");
    for (const mode of ["list", "icon-sm", "icon-md", "icon-lg", "tiles", "heatmap", "content"]) {
      await page.getByRole("combobox", { name: "Choose calendar display mode", exact: true }).selectOption(mode);
      await expect(page.getByTestId("collection-daily-day-10")).toHaveAttribute("aria-current", "date");
      await expect(page.locator('[data-collection-daily-date][aria-current="date"]')).toHaveCount(1);
    }
    for (const [year, month, disabledButton] of [[2000, 1, previous], [2100, 12, next]] as const) {
      await page.locator("#collection-daily-year-input").fill(String(year));
      await page.locator("#collection-daily-year-input").press("Enter");
      await page.locator("#collection-daily-month-input").fill(String(month));
      await page.locator("#collection-daily-month-input").press("Enter");
      await expectDailyPeriod(page, year, month);
      await expect(disabledButton).toBeDisabled();
    }
    await page.getByRole("button", { name: "Bulan ini", exact: true }).click();
    await expectDailyPeriod(page, 2026, 10);
    await expect(page.getByTestId("collection-daily-management-toggle")).toHaveCount(0);
    expect(fixture.overviewRequests).toContainEqual({ year: 2027, month: 1 });
    await checkFixture(page, fixture);
  });

  test(`Report controls Daily date navigation stays in the month and restores the opener at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "user", theme });
    await page.goto("/collection/daily");
    const opener = page.getByTestId("collection-daily-day-1");
    await opener.click();
    const dialog = page.getByTestId("collection-daily-day-dialog");
    const navigation = dayDateNavigation(page);
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 01/10/2026", exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Tarikh sebelumnya", exact: true })).toBeDisabled();
    await navigation.getByRole("button", { name: "Tarikh seterusnya", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 02/10/2026", exact: true })).toBeVisible();
    await expect(dialog.getByText("Synthetic 2026-10-02 customer 1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Synthetic 2026-10-01 customer 1", { exact: true })).toHaveCount(0);
    const pagination = dialog.getByRole("navigation", { name: "Navigasi halaman rekod kutipan harian", exact: true });
    await expect(pagination).toContainText("Halaman 1 daripada 1");
    await expect(pagination.getByRole("button", { name: "Seterusnya", exact: true })).toBeDisabled();
    await navigation.getByRole("button", { name: "Tarikh sebelumnya", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 01/10/2026", exact: true })).toBeVisible();
    await expect(pagination).toContainText("Halaman 1 daripada 2");
    await navigation.getByRole("button", { name: "Tarikh seterusnya", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 02/10/2026", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    const finalDay = page.getByTestId("collection-daily-day-31");
    await finalDay.click();
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 31/10/2026", exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Tarikh seterusnya", exact: true })).toBeDisabled();
    await navigation.getByRole("button", { name: "Tarikh sebelumnya", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 30/10/2026", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(finalDay).toBeFocused();
    expect(fixture.dayDetailsRequests.every(({ date }) => /^2026-10-\d{2}$/.test(date))).toBe(true);
    await checkFixture(page, fixture);
  });

  test(`Report controls Daily loading preserves the shell without showing stale records at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const pageGate = createRequestGate();
    const dateGate = createRequestGate();
    let failedThirdDay = false;
    const fixture = await installFixture(page, baseURL, { role: "user", theme,
      onDailyDetails: async (route, request, response) => {
        if (request.date === "2026-10-01" && request.page === 2) await pageGate.wait;
        if (request.date === "2026-10-02") await dateGate.wait;
        if (request.date === "2026-10-03" && !failedThirdDay) {
          failedThirdDay = true;
          return route.fulfill({ status: 500, json: { ok: false, message: "Synthetic day unavailable", code: "SYNTHETIC_FAILURE" } });
        }
        return route.fulfill({ status: 200, json: response, headers: { "Cache-Control": "no-store" } });
      },
    });
    try {
      await page.goto("/collection/daily");
      await page.getByTestId("collection-daily-day-1").click();
      const dialog = page.getByTestId("collection-daily-day-dialog");
      const records = page.getByTestId("collection-day-records");
      const pagination = dialog.getByRole("navigation", { name: "Navigasi halaman rekod kutipan harian", exact: true });
      const dateNavigation = dayDateNavigation(page);
      await expect(records.getByText("Synthetic 2026-10-01 customer 1", { exact: true })).toBeVisible();
      await dialog.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
      });
      let originalBounds = (await dialog.boundingBox())!;
      const summary = dialog.getByRole("region", { name: "Target, kutipan dan baki harian", exact: true });
      const originalSummary = await summary.innerText();
      const expectStableBounds = async () => {
        const bounds = (await dialog.boundingBox())!;
        for (const key of ["x", "y", "width", "height"] as const) {
          expect(Math.abs(bounds[key] - originalBounds[key]), `Stable popup ${key}`).toBeLessThanOrEqual(1);
        }
      };

      await pagination.getByRole("button", { name: "Seterusnya", exact: true }).click();
      await expect(records).toHaveAttribute("aria-busy", "true");
      await expect(records.locator(".collection-day-record-card")).toHaveCount(0);
      await expect.poll(() => summary.innerText()).toBe(originalSummary);
      await expect(pagination).toBeVisible();
      await expect(pagination.getByRole("button", { name: "Seterusnya", exact: true })).toBeDisabled();
      await expect(dateNavigation.getByRole("button", { name: "Tarikh seterusnya", exact: true })).toBeDisabled();
      await expectStableBounds();
      await testInfo.attach(`daily-page-loading-${theme}-${width}`, { body: await dialog.screenshot(), contentType: "image/png" });
      pageGate.release();
      await expect(records).toHaveAttribute("aria-busy", "false");
      await expect(records.getByText("Synthetic 2026-10-01 customer 11", { exact: true })).toBeVisible();
      await expect(records.getByText("Synthetic 2026-10-01 customer 1", { exact: true })).toHaveCount(0);
      await expect(pagination).toContainText("Halaman 2 daripada 2");
      await expectStableBounds();

      await dateNavigation.getByRole("button", { name: "Tarikh seterusnya", exact: true }).click();
      await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 02/10/2026", exact: true })).toBeVisible();
      await expect(records).toHaveAttribute("aria-busy", "true");
      await expect(records.locator(".collection-day-record-card")).toHaveCount(0);
      await expect(summary).toHaveCount(0);
      await expect(dialog.getByRole("region", { name: "Ringkasan harian belum dimuatkan", exact: true })).toBeVisible();
      await expect(pagination).toBeVisible();
      await expectStableBounds();
      await testInfo.attach(`daily-date-loading-${theme}-${width}`, { body: await dialog.screenshot(), contentType: "image/png" });
      dateGate.release();
      await expect(records.getByText("Synthetic 2026-10-02 customer 1", { exact: true })).toBeVisible();
      await expect(pagination).toContainText("Halaman 1 daripada 1");
      await expectStableBounds();

      await dateNavigation.getByRole("button", { name: "Tarikh seterusnya", exact: true }).click();
      await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 03/10/2026", exact: true })).toBeVisible();
      const retry = dialog.getByRole("button", { name: "Cuba lagi", exact: true });
      await expect(retry).toBeVisible();
      const errorNotification = page.locator('[data-slot="toast"]').filter({ hasText: "Failed to Load Day Details" });
      await expect(errorNotification).toHaveAttribute("data-state", "open");
      await expect(records.locator(".collection-day-record-card")).toHaveCount(0);
      await expect(pagination).toBeVisible();
      await expectStableBounds();
      await retry.click();
      // Retry supersedes this owned notification immediately, not after its
      // normal 5s timeout. Wait for the outgoing Radix layer before Escape.
      await expect(page.locator('[data-slot="toast"][data-state="open"]').filter({ hasText: "Failed to Load Day Details" })).toHaveCount(0, { timeout: 1000 });
      await expect(errorNotification).toBeHidden();
      await expect(records.getByText("Synthetic 2026-10-03 customer 1", { exact: true })).toBeVisible();
      await expect(retry).toHaveCount(0);
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await expectStableBounds();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("collection-daily-day-1")).toBeFocused();
      expect(fixture.dayDetailsRequests.filter(({ date }) => date === "2026-10-03")).toHaveLength(2);

      // A new open session should size naturally again rather than retaining
      // the long first day's height. Its compact shell must also stay steady
      // when moving back to a day with many records (not just long -> short).
      await page.getByTestId("collection-daily-day-2").click();
      await expect(records.getByText("Synthetic 2026-10-02 customer 1", { exact: true })).toBeVisible();
      await dialog.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
      });
      const compactBounds = (await dialog.boundingBox())!;
      if (width >= 768) expect(compactBounds.height).toBeLessThan(originalBounds.height - 50);
      originalBounds = compactBounds;
      await dateNavigation.getByRole("button", { name: "Tarikh sebelumnya", exact: true }).click();
      await expect(records.getByText("Synthetic 2026-10-01 customer 1", { exact: true })).toBeVisible();
      await expect(records.locator(".collection-day-record-card")).toHaveCount(10);
      await expectStableBounds();
      const scrollArea = dialog.getByRole("region", { name: "Collection day details scroll area", exact: true });
      expect(await scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      await testInfo.attach(`daily-compact-session-${theme}-${width}`, { body: await dialog.screenshot(), contentType: "image/png" });
      // The session height must not defeat viewport caps, including mobile's
      // fullscreen rules. Restoring the viewport restores the original shell.
      await page.setViewportSize({ width, height: 600 });
      await expect.poll(async () => {
        const bounds = (await dialog.boundingBox())!;
        return bounds.y >= -1 && bounds.y + bounds.height <= 601;
      }).toBe(true);
      await expect(pagination).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
      expect(await scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      await page.setViewportSize({ width, height: 900 });
      await expectStableBounds();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("collection-daily-day-2")).toBeFocused();
      await checkFixture(page, fixture);
    } finally {
      pageGate.release();
      dateGate.release();
    }
  });

  test(`Report controls Daily protects unsaved calendar changes before changing periods at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "superuser", theme });
    await page.goto("/collection/daily");
    await expectDailyPeriod(page, 2026, 10);
    await page.getByTestId("collection-daily-management-toggle").click();
    await page.getByRole("button", { name: "Edit calendar status for 11/10/2026", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit status 11/10/2026", exact: true });
    await editor.getByRole("radio", { name: "Holiday / Leave", exact: true }).check();
    await expect(editor.getByText("Perubahan belum disimpan", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    const periodNavigation = page.getByRole("navigation", { name: "Navigasi bulan Collection Daily", exact: true });
    await expect(periodNavigation.getByRole("button", { name: "Bulan sebelumnya", exact: true })).toBeDisabled();
    await expect(periodNavigation.getByRole("button", { name: "Bulan seterusnya", exact: true })).toBeDisabled();
    await expect(periodNavigation.getByRole("button", { name: "Bulan ini", exact: true })).toBeDisabled();
    await expect(page.locator("#collection-daily-year-input")).toBeDisabled();
    await expect(page.locator("#collection-daily-month-input")).toBeDisabled();
    await expect(page.locator("#collection-daily-period-help")).toContainText("Simpan perubahan kalendar");
    const review = page.getByRole("region", { name: "Semakan perubahan status harian belum disimpan", exact: true });
    await expect(review).toBeVisible();
    const refresh = page.getByTestId("collection-daily-refresh");
    await refresh.click();
    const discard = page.getByRole("alertdialog", { name: "Buang perubahan kalendar yang belum disimpan?", exact: true });
    await expect(discard).toBeVisible();
    const beforeDiscardReads = fixture.overviewRequests.length;
    await discard.getByRole("button", { name: "Kekalkan perubahan", exact: true }).click();
    await expect(discard).toBeHidden();
    await expect(refresh).toBeFocused();
    await expect(review).toBeVisible();
    expect(fixture.overviewRequests).toHaveLength(beforeDiscardReads);
    await refresh.click();
    await discard.getByRole("button", { name: "Refresh dan buang perubahan", exact: true }).click();
    await expect(discard).toBeHidden();
    await expect(review).toHaveCount(0);
    await expect(page.locator("#collection-daily-year-input")).toBeEnabled();
    await expect(periodNavigation.getByRole("button", { name: "Bulan sebelumnya", exact: true })).toBeEnabled();
    await expectDailyPeriod(page, 2026, 10);
    expect(fixture.overviewRequests.length).toBeGreaterThan(beforeDiscardReads);
    // Only local drafts and GET requests were used: no calendar mutation was sent.
    await checkFixture(page, fixture);
  });

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
    const calendarManagement = page.getByTestId("collection-daily-management-toggle");
    await expect(calendarManagement).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /^Edit calendar status for/ })).toHaveCount(0);
    await calendarManagement.press("Enter");
    await expect(calendarManagement).toHaveAttribute("aria-pressed", "true");
    const tools = page.getByTestId("collection-daily-status-tools");
    await expect(tools.getByRole("combobox", { name: "Bulk daily status", exact: true })).toBeVisible();
    await expect(tools.getByRole("button", { name: "Apply to selected days", exact: true })).toBeDisabled();
    await calendarManagement.press("Enter");
    await expect(tools).toHaveCount(0);
    await page.getByTestId("collection-daily-day-1").click();
    const dayDialog = page.getByTestId("collection-daily-day-dialog");
    await expect(dayDialog).toBeVisible();
    await expect(dayDialog.getByRole("heading", { name: "Kutipan Harian · 01/10/2026", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dayDialog).toBeHidden();
    await expect(page.getByTestId("collection-daily-day-1")).toBeFocused();
    await calendarManagement.press("Enter");
    const edit = page.getByRole("button", { name: "Edit calendar status for 01/10/2026", exact: true });
    await expect(edit).toHaveAttribute("aria-haspopup", "dialog");
    await edit.click();
    const editor = page.getByRole("dialog", { name: "Edit status 01/10/2026", exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("button", { name: "Save changed status", exact: true })).toBeDisabled();
    await editor.getByRole("button", { name: "View collection details", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(dayDialog).toBeVisible();
    await expect.poll(() => dayDialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dayDialog).toBeHidden();
    await expect(page.getByTestId("collection-daily-day-1")).toBeFocused();
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
    await expect(page.getByTestId("collection-daily-management-toggle")).toHaveCount(0);
    await expect(page.getByTestId("collection-daily-status-tools")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Bulk daily status", exact: true })).toHaveCount(0);
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

test("Report controls Daily ignores a late response after closing and choosing another date", async ({ page, baseURL }) => {
  const staleGate = createRequestGate();
  let staleResponseReleased = false;
  const fixture = await installFixture(page, baseURL, { role: "user",
    onDailyDetails: async (route, request, response) => {
      if (request.date === "2026-10-04") {
        await staleGate.wait;
        await route.fulfill({ status: 200, json: response });
        staleResponseReleased = true;
        return;
      }
      return route.fulfill({ status: 200, json: response });
    },
  });
  try {
    await page.goto("/collection/daily");
    await page.getByTestId("collection-daily-day-4").click();
    const dialog = page.getByTestId("collection-daily-day-dialog");
    await expect(page.getByTestId("collection-day-records")).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => fixture.dayDetailsRequests.some(({ date }) => date === "2026-10-04")).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("collection-daily-day-4")).toBeFocused();
    await page.getByTestId("collection-daily-day-5").click();
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 05/10/2026", exact: true })).toBeVisible();
    await expect(dialog.getByText("Synthetic 2026-10-05 customer 1", { exact: true })).toBeVisible();
    staleGate.release();
    await expect.poll(() => staleResponseReleased).toBe(true);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(dialog.getByRole("heading", { name: "Kutipan Harian · 05/10/2026", exact: true })).toBeVisible();
    await expect(dialog.getByText("Synthetic 2026-10-05 customer 1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Synthetic 2026-10-04 customer 1", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("collection-daily-day-5")).toBeFocused();
    await checkFixture(page, fixture);
  } finally {
    staleGate.release();
  }
});
