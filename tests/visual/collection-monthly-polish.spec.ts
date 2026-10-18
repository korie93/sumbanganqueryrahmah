import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

// Production-built React/CSS, synthetic responses only. Unknown API requests and
// every off-origin request fail closed; no backend, real accounts or database.
test.use({ serviceWorkers: "block" });
const nickname = "Monthly Synthetic Collector";
const stressNickname = `MONTHLY.${"UNBROKEN-COLLECTOR-".repeat(6)}END`;
const now = "2026-10-15T08:00:00.000Z";

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark", options: {
  loading?: "comparison" | "target";
  role?: "admin" | "user";
  stress?: boolean;
} = {}) {
  expect(baseURL, "Run through npm run test:visual:built").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const fixtureNickname = options.stress ? stressNickname : nickname;
  const amountScale = options.stress ? 100_000 : 1;
  const monthlyTarget = 31_000 * amountScale;
  const fixture = {
    unexpected: [] as string[], errors: [] as string[],
    comparisonRequests: [] as string[], recordRequests: [] as string[], release: () => {},
  };
  const gate = new Promise<void>((resolve) => { fixture.release = resolve; });
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, json: body, headers: { "Cache-Control": "no-store" },
  });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ nextTheme, staff }) => {
    localStorage.setItem("theme", nextTheme);
    sessionStorage.setItem("collection_staff_nickname", staff);
    sessionStorage.setItem("collection_staff_nickname_auth", "1");
  }, { nextTheme: theme, staff: fixtureNickname });
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      fixture.unexpected.push(`Off-origin ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (["GET", "HEAD"].includes(request.method())) return route.continue();
      fixture.unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const endpoint = `${request.method()} ${url.pathname}`;
    if (endpoint === "GET /api/health/connectivity") return route.fulfill({
      status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" },
    });
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route,
      { maintenance: false, message: "Fixture available", type: "soft", startTime: null, endTime: null });
    if (endpoint === "GET /api/me") return respond(route, { ok: true, sessionExpiresAt: "2036-01-01T00:00:00.000Z", user: {
      id: "monthly-polish-admin", username: "monthly.polish.fixture", fullName: "Synthetic Monthly Operator",
      email: "monthly@example.test", role: options.role || "admin", status: "active", mustChangePassword: false,
      passwordResetBySuperuser: false, isBanned: false, twoFactorEnabled: false,
      twoFactorPendingSetup: false, twoFactorConfiguredAt: null, activatedAt: now,
      passwordChangedAt: now, lastLoginAt: now,
    } });
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route,
      { role: options.role || "admin", tabs: { home: true, "collection-report": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0,
      totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true });
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route,
      { ok: true, nickname: { id: "monthly-polish-nickname", nickname: fixtureNickname } });
    if (endpoint === "GET /api/collection/nicknames") return respond(route, { ok: true, nicknames: [{
      id: "monthly-polish-nickname", nickname: fixtureNickname, isActive: true, roleScope: "both",
      createdBy: "monthly-polish-admin", createdAt: now,
    }] });
    if (endpoint === "GET /api/collection/list") {
      expect(url.searchParams.get("nickname")).toBe(fixtureNickname);
      fixture.recordRequests.push(url.search);
      return respond(route, {
        ok: true, records: [], total: 0, totalAmount: 0,
        page: 1, pageSize: 10, limit: 10, offset: 0, nextCursor: null,
        pagination: { mode: "hybrid", page: 1, pageSize: 10, limit: 10, offset: 0,
          total: 0, totalPages: 1, nextCursor: null, hasNextPage: false, hasPreviousPage: false },
      });
    }
    if (endpoint === "GET /api/collection/monthly-comparison") {
      expect(url.searchParams.get("nickname")).toBe(fixtureNickname);
      const startMonth = url.searchParams.get("startMonth")!;
      const endMonth = url.searchParams.get("endMonth")!;
      fixture.comparisonRequests.push(`${startMonth}:${endMonth}`);
      expect(startMonth).toMatch(/^2026-\d{2}$/);
      expect(endMonth).toBe("2026-10");
      if (options.loading === "comparison") await gate;
      const months = Array.from({ length: 11 - Number(startMonth.slice(-2)) }, (_, index) => {
        const month = Number(startMonth.slice(-2)) + index;
        const recordCount = month === 10 ? 15 : 30;
        const averagePerRecord = (month === 10 ? 1250 : 1000) * amountScale;
        return { month: `2026-${String(month).padStart(2, "0")}`,
          label: new Date(2026, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          totalCollection: recordCount * averagePerRecord, recordCount, averagePerRecord };
      });
      return respond(route, { ok: true, nickname: fixtureNickname, startMonth, endMonth, months, comparison: {
        baseMonth: months[0]!.month, targetMonth: "2026-10", baseLabel: months[0]!.label,
        targetLabel: "Oct 2026", baseTotal: 30000 * amountScale, targetTotal: 18750 * amountScale,
        difference: -11250 * amountScale,
        percentageChange: -37.5, direction: "decrease",
        summary: options.stress
          ? "Synthetic collection decreased by RM1,125,000,000.00 (-37.50%)."
          : "Synthetic collection decreased by RM11,250.00 (-37.50%).",
      } });
    }
    if (endpoint === "GET /api/collection/monthly-target") {
      expect(url.searchParams.get("nickname")).toBe(fixtureNickname);
      const key = url.searchParams.get("month")!;
      expect(key).toMatch(/^2026-\d{2}$/);
      if (options.loading === "target") await gate;
      return respond(route, { ok: true, nickname: fixtureNickname, month: { key, year: 2026, month: Number(key.slice(-2)) },
        monthlyTarget, configured: true, source: "configured" });
    }
    if (endpoint === "GET /api/collection/daily/overview") {
      expect(url.searchParams.get("usernames")).toBe(fixtureNickname);
      expect(url.searchParams.get("year")).toBe("2026");
      const month = Number(url.searchParams.get("month"));
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(10);
      const daysInMonth = new Date(2026, month, 0).getDate();
      return respond(route, { ok: true, username: fixtureNickname, usernames: [fixtureNickname], role: "admin",
        month: { year: 2026, month, daysInMonth }, summary: { monthlyTarget },
        days: Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1,
          date: `2026-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
          amount: (month === 10 ? index < 15 ? 1250 : 0 : options.stress ? 30000 / daysInMonth : 1000) * amountScale,
          target: options.stress ? monthlyTarget / daysInMonth : 1000,
          calendarStatus: "WORKING", leaveType: null, note: null, isWorkingDay: true,
          isHoliday: false, holidayName: null, customerCount: 1, status: "green",
        })),
      });
    }
    if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) {
      return respond(route, { ok: true });
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected isolated Monthly polish request" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  return fixture;
}

async function expectContainedMonthlyLayout(page: Page, panel: Locator) {
  const overflowDiagnostic = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1
    ? { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, items: [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().height > 0 && !el.closest('svg, details:not([open])'))
      .slice(0, 18).map((el) => ({ tag: el.tagName, cls: el.className, right: el.getBoundingClientRect().right, text: el.textContent?.slice(0, 80) })) } : null);
  if (overflowDiagnostic) console.log(JSON.stringify(overflowDiagnostic));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    { message: "The document must not gain horizontal scrolling after transitions settle" }).toBe(true);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    "Only the explicitly bounded ledger/table regions may scroll horizontally").toBe(true);
  const panelBounds = await panel.boundingBox();
  expect(panelBounds).not.toBeNull();
  const controls = panel.locator(".monthly-comparison-toolbar-grid input, .monthly-comparison-toolbar-grid select, .monthly-comparison-toolbar-grid button");
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue;
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(panelBounds!.x - 1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width + 1);
  }
  const clippedText = await panel.locator([
    ".monthly-comparison-headline-group",
    ".monthly-comparison-export-context",
    ".collection-monthly-comparison-disclosure p:not(.sr-only)",
  ].join(", ")).evaluateAll((elements) => elements.flatMap((element) => {
    // Chromium can report retained boxes inside a closed native disclosure.
    // They are not painted; check these only after the disclosure is opened.
    if (element.closest("details:not([open])")) return [];
    const box = element.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) return [];
    return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
      ? [{ text: element.textContent?.trim().slice(0, 160), className: element.className,
        parentClass: element.parentElement?.className, width: element.clientWidth,
        scrollWidth: element.scrollWidth, height: element.clientHeight, scrollHeight: element.scrollHeight }] : [];
  }));
  expect(clippedText, "Visible summary/analysis text must wrap without clipping inside its own box").toEqual([]);
}

for (const width of [1024, 1200, 1280]) {
  test(`Monthly stress layout at ${width}px contains long nickname and large amounts with analyses open`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = await installFixture(page, baseURL, width === 1200 ? "light" : "dark", { stress: true });
    await page.goto("/collection/monthly-comparison");
    const panel = page.locator(".collection-monthly-comparison-panel");
    await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
    const sidebarToggle = page.getByTestId("button-toggle-sidebar");
    if (await sidebarToggle.getAttribute("aria-expanded") === "false") await sidebarToggle.click();
    await expect(sidebarToggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByTestId("monthly-comparison-export-context")).toContainText(stressNickname);
    const headline = panel.locator(".monthly-comparison-headline");
    await expect(headline).toContainText("3,000,000,000.00");
    await expect(headline).toContainText("1,875,000,000.00");
    await expect(headline).toContainText("1,125,000,000.00");
    await expectContainedMonthlyLayout(page, panel);

    const targetSummary = panel.locator('summary[aria-label^="Monthly target details:"]');
    await targetSummary.click();
    for (const testId of ["collection-monthly-same-day-analysis", "collection-monthly-detailed-analysis"]) {
      const disclosure = panel.getByTestId(testId);
      await disclosure.locator(":scope > summary").click();
      await expect(disclosure).toHaveAttribute("open", "");
    }
    await expect(panel.getByRole("progressbar", { name: "October 2026 same-day total", exact: true })).toBeVisible();
    await expect(panel.getByRole("img", { name: /^Monthly collection comparison chart/ })).toBeVisible();
    await testInfo.attach(`monthly-stress-${width}`, { body: await panel.screenshot(), contentType: "image/png" });
    await expectContainedMonthlyLayout(page, panel);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test("Monthly phone stress analysis and full chart portals contain long content and exact money values", async ({ page, baseURL }, testInfo) => {
  const width = 390;
  const height = 844;
  await page.setViewportSize({ width, height });
  const fixture = await installFixture(page, baseURL, "dark", { stress: true });
  await page.goto("/collection/monthly-comparison");
  const panel = page.locator(".collection-monthly-comparison-panel");
  await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
  const paceDisclosure = panel.getByTestId("collection-monthly-same-day-analysis");
  const detailDisclosure = panel.getByTestId("collection-monthly-detailed-analysis");
  for (const disclosure of [paceDisclosure, detailDisclosure]) {
    await disclosure.locator(":scope > summary").click();
    await expect(disclosure).toHaveAttribute("open", "");
  }
  await expect(panel.getByRole("progressbar", { name: "October 2026 same-day total", exact: true })).toBeVisible();
  await expectContainedMonthlyLayout(page, panel);
  await testInfo.attach("monthly-phone-stress-expanded", { body: await panel.screenshot(), contentType: "image/png" });

  for (const [disclosure, title] of [
    [paceDisclosure, "Same-day pace trend"],
    [detailDisclosure, "Monthly performance trend"],
  ] as const) {
    const viewFull = disclosure.getByRole("button", { name: "View Full", exact: true });
    await viewFull.focus();
    await viewFull.press("Enter");
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      "The full chart portal may scroll vertically but must not overflow horizontally").toBe(true);
    const moneyValues = dialog.locator("p:not(.sr-only), dd").filter({ hasText: /RM\s*[\d,]+\.\d{2}/ });
    if (title === "Same-day pace trend") {
      expect(await moneyValues.count(), "The selected same-day detail must retain exact RM values in its portal").toBeGreaterThan(0);
    } else {
      await expect(dialog).toContainText(stressNickname);
    }
    for (const value of await moneyValues.all()) {
      if (!await value.isVisible()) continue;
      const box = await value.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(await value.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        "Visible exact money must fit/wrap in the portal, not rely on panel-scoped CSS").toBe(true);
    }
    await testInfo.attach(`monthly-phone-stress-${title.replaceAll(" ", "-")}`, {
      body: await dialog.screenshot(), contentType: "image/png",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(viewFull).toBeFocused();
  }
  await expectContainedMonthlyLayout(page, panel);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Monthly full chart drill-down preserves October record scope and returns focus to View Full", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  const fixture = await installFixture(page, baseURL, "light");
  await page.goto("/collection/monthly-comparison");
  const panel = page.locator(".collection-monthly-comparison-panel");
  await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
  const detailDisclosure = panel.getByTestId("collection-monthly-detailed-analysis");
  await detailDisclosure.locator(":scope > summary").click();
  await expect(detailDisclosure).toHaveAttribute("open", "");
  const viewFull = detailDisclosure.getByRole("button", { name: "View Full", exact: true });
  await viewFull.focus();
  await viewFull.press("Enter");
  const fullChartDialog = page.getByRole("dialog", { name: "Monthly performance trend", exact: true });
  await expect(fullChartDialog).toBeVisible();
  const fullChart = fullChartDialog.getByRole("img", { name: /^Monthly collection comparison chart/ });
  const bars = fullChart.locator(".recharts-bar-rectangle .recharts-rectangle");
  await expect(bars).toHaveCount(2);
  // Fixture months are chronological Sep/Oct. Exercise the actual full-chart
  // pointer workflow, not the separate labelled month buttons or Inspect select.
  await bars.last().click();
  const recordsDialog = page.getByRole("dialog", { name: "October 2026", exact: true });
  await expect(recordsDialog).toBeVisible();
  await expect(fullChartDialog).toBeHidden();
  await expect.poll(() => fixture.recordRequests.length).toBe(1);
  const query = new URLSearchParams(fixture.recordRequests[0]);
  expect(query.get("nickname")).toBe(nickname);
  expect(query.get("from")).toBe("2026-10-01");
  expect(query.get("to")).toBe("2026-10-31");
  await page.keyboard.press("Escape");
  await expect(recordsDialog).toBeHidden();
  await expect(viewFull).toBeFocused();
  expect(await viewFull.evaluate((element) => element.isConnected)).toBe(true);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Monthly invalid month guidance keeps peer controls aligned and does not change loaded scope", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const fixture = await installFixture(page, baseURL, "light");
  await page.goto("/collection/monthly-comparison");
  const panel = page.locator(".collection-monthly-comparison-panel");
  await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
  const start = panel.getByLabel("Start month", { exact: true });
  const initialValue = await start.inputValue();
  const requestCount = fixture.comparisonRequests.length;
  await start.fill("2026-");
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#collection-monthly-comparison-start-month-format")).toBeVisible();
  const startBounds = await start.boundingBox();
  expect(startBounds).not.toBeNull();
  for (const peer of [
    panel.getByLabel("End month", { exact: true }),
    panel.getByRole("button", { name: "Apply", exact: true }),
    panel.getByRole("button", { name: "Reset", exact: true }),
  ]) {
    const bounds = await peer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.y - startBounds!.y), "Validation copy must not lift only one control off the row").toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.height - startBounds!.height)).toBeLessThanOrEqual(1);
  }
  await expectContainedMonthlyLayout(page, panel);
  expect(fixture.comparisonRequests).toHaveLength(requestCount);
  await start.press("Enter");
  await expect(start).toHaveValue(initialValue);
  await expect(start).not.toHaveAttribute("aria-invalid", "true");
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Monthly text at 200 percent reflows at a 720px viewport without clipping report controls", async ({ page, baseURL }, testInfo) => {
  // A real reflow viewport plus doubled root text, not pinch zoom or a scaled screenshot.
  await page.setViewportSize({ width: 720, height: 1000 });
  const fixture = await installFixture(page, baseURL, "light", { stress: true, role: "user" });
  await page.goto("/collection/monthly-comparison");
  const panel = page.locator(".collection-monthly-comparison-panel");
  await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(panel.getByLabel("Staff nickname", { exact: true })).toHaveAttribute("readonly", "");
  await panel.locator('summary[aria-label^="Monthly target details:"]').click();
  await expectContainedMonthlyLayout(page, panel);
  const start = panel.getByLabel("Start month", { exact: true });
  await start.focus();
  await page.keyboard.press("Tab");
  await expect(panel.getByLabel("End month", { exact: true })).toBeFocused();
  await testInfo.attach("monthly-text-200-percent-720", { body: await panel.screenshot(), contentType: "image/png" });
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 390]) {
    test(`Monthly visual ledger ${theme} at ${width}px keeps six aligned chronological months`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const fixture = await installFixture(page, baseURL, theme);
      await page.goto("/collection/monthly-comparison");
      const panel = page.locator(".collection-monthly-comparison-panel");
      await panel.getByLabel("Start month", { exact: true }).fill("2026-05");
      await panel.getByRole("button", { name: "Apply", exact: true }).click();
      const ledger = panel.getByRole("table", { name: "Monthly collection performance", exact: true });
      const rows = ledger.locator(".monthly-comparison-ledger-row");
      await expect(rows).toHaveCount(6);
      expect(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-month"))))
        .toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
      await expect(panel.getByRole("heading", { name: "Monthly Collection Comparison", exact: true })).toHaveCount(1);
      const headline = panel.locator(".monthly-comparison-headline");
      await expect(headline).toBeVisible();
      await expect(headline).toContainText("May 2026");
      await expect(headline).toContainText("Oct 2026");
      await expect(headline).toContainText("30,000.00");
      await expect(headline).toContainText("18,750.00");
      await expect(headline).toContainText(/-37\.50%/);
      await expect(ledger.getByRole("columnheader", { name: "Records", exact: true })).toBeVisible();
      await expect(ledger.getByRole("button", { name: /^View collection records for/ })).toHaveCount(6);
      await expect(rows.first()).toContainText("30,000.00");
      await expect(rows.last()).toContainText("18,750.00");
      await expect(rows.last().locator(".monthly-comparison-ledger-records")).toHaveText("15");
      await expect(rows.last().locator(".monthly-comparison-ledger-change")).toContainText("-37.50%");
      await expect(rows.first().locator(".monthly-comparison-ledger-bar")).toHaveAttribute("aria-hidden", "true");
      await expect(rows.first().locator(".monthly-comparison-ledger-bar")).toHaveAttribute("max", "31000");
      await expect(rows.last().locator(".monthly-comparison-ledger-bar")).toHaveAttribute("max", "31000");
      await expect(rows.last().locator(".monthly-comparison-ledger-bar")).toHaveAttribute("value", "18750");
      await expect(ledger.locator("tfoot progress")).toHaveCount(0);
      await expect(ledger.locator("tfoot")).toContainText("168,750.00");
      await expect(ledger.locator("tfoot")).toContainText("165");
      await expect(panel.getByTestId("collection-monthly-same-day-analysis")).not.toHaveAttribute("open");
      await expect(panel.getByTestId("collection-monthly-detailed-analysis")).not.toHaveAttribute("open");
      await expect(panel.getByRole("img", { name: /^Monthly collection comparison chart/ })).toBeHidden();
      await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      // Keep screenshots independent of hover caused by the preceding Apply
      // click or the element screenshot's automatic scroll into view.
      await page.mouse.move(0, 0);
      await testInfo.attach(`monthly-visual-ledger-${theme}-${width}`, {
        body: await panel.screenshot(), contentType: "image/png",
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page).toHaveScreenshot(`monthly-visual-ledger-${theme}-${width}.png`, { fullPage: true });
      expect(fixture.unexpected).toEqual([]);
      expect(fixture.errors).toEqual([]);
    });
  }
}

for (const role of ["admin", "user"] as const) {
  test(`Monthly visual ledger ${role} opens the selected month with keyboard and returns focus`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const fixture = await installFixture(page, baseURL, "light", { role });
    await page.goto("/collection/monthly-comparison");
    const panel = page.locator(".collection-monthly-comparison-panel");
    const nicknameControl = panel.getByLabel("Staff nickname", { exact: true });
    if (role === "user") await expect(nicknameControl).toHaveAttribute("readonly", "");
    const ledger = panel.getByRole("table", { name: "Monthly collection performance", exact: true });
    const monthButton = ledger.getByRole("button", { name: "View collection records for Oct 2026", exact: true });
    await expect(monthButton).toBeVisible();
    await monthButton.focus();
    await monthButton.press("Enter");
    const dialog = page.getByRole("dialog", { name: "October 2026", exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(() => fixture.recordRequests.length).toBe(1);
    const query = new URLSearchParams(fixture.recordRequests[0]);
    expect(query.get("nickname")).toBe(nickname);
    expect(query.get("from")).toBe("2026-10-01");
    expect(query.get("to")).toBe("2026-10-31");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(monthButton).toBeFocused();
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test("Monthly visual ledger native quick range applies once and preserves labelled keyboard controls", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, "dark");
  await page.goto("/collection/monthly-comparison");
  const panel = page.locator(".collection-monthly-comparison-panel");
  await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
  const presets = panel.getByRole("combobox", { name: "Quick range", exact: true });
  const controls = [
    panel.getByLabel("Staff nickname", { exact: true }), presets,
    panel.getByLabel("Start month", { exact: true }), panel.getByLabel("End month", { exact: true }),
    panel.getByRole("button", { name: "Apply", exact: true }),
    panel.getByRole("button", { name: "Reset", exact: true }),
  ];
  await controls[0]!.focus();
  for (const control of controls.slice(1)) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
  }
  const requestCount = fixture.comparisonRequests.length;
  await presets.focus();
  await presets.selectOption({ label: "Last 6 months" });
  await expect(panel.getByLabel("Start month", { exact: true })).toHaveValue("2026-05");
  await expect(panel.getByLabel("End month", { exact: true })).toHaveValue("2026-10");
  await expect(panel.locator(".monthly-comparison-ledger-row")).toHaveCount(6);
  await expect(panel.getByTestId("monthly-comparison-export-context")).toContainText("2026-05 to 2026-10");
  expect(fixture.comparisonRequests).toHaveLength(requestCount + 1);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const width of [320, 390, 768, 1024]) {
  test(`Monthly compact filters and amount bars stay usable at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = await installFixture(page, baseURL, width === 390 || width === 1024 ? "dark" : "light");
    await page.goto("/collection/monthly-comparison");
    const panel = page.locator(".collection-monthly-comparison-panel");
    await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
    const controls = [
      panel.getByLabel("Staff nickname", { exact: true }),
      panel.getByRole("combobox", { name: "Quick range", exact: true }),
      panel.getByLabel("Start month", { exact: true }),
      panel.getByLabel("End month", { exact: true }),
      panel.getByRole("button", { name: "Apply", exact: true }),
      panel.getByRole("button", { name: "Reset", exact: true }),
    ];
    const bounds = [];
    for (const control of controls) {
      await expect(control).toBeVisible();
      const bound = await control.boundingBox();
      expect(bound).not.toBeNull();
      bounds.push(bound!);
      expect(bound!.x).toBeGreaterThanOrEqual(0);
      expect(bound!.x + bound!.width).toBeLessThanOrEqual(width + 1);
      expect(bound!.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 36);
    }
    if (width < 768) {
      // Visual pairs follow native DOM/tab order: staff/range, months, actions.
      for (const [left, right] of [[0, 1], [2, 3], [4, 5]] as const) {
        expect(Math.abs(bounds[left]!.y - bounds[right]!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds[left]!.width - bounds[right]!.width)).toBeLessThanOrEqual(1);
        expect(bounds[left]!.x + bounds[left]!.width).toBeLessThanOrEqual(bounds[right]!.x);
      }
      expect(bounds[2]!.y).toBeGreaterThan(bounds[0]!.y);
      expect(bounds[4]!.y).toBeGreaterThan(bounds[2]!.y);
    }
    const targetSummary = panel.locator('summary[aria-label^="Monthly target details:"]');
    await expect(targetSummary).toHaveText("Target details");
    await expect(targetSummary).toHaveAccessibleName(/Monthly target details: RM\s?31,000\.00/);
    await expect(panel.locator(".monthly-comparison-ledger-target")).toHaveText(/Configured monthly target: RM\s?31,000\.00/);
    await targetSummary.click();
    await expect(targetSummary.locator("..")).toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await targetSummary.press("Enter");
    await expect(targetSummary.locator("..")).not.toHaveAttribute("open");
    const ledger = panel.getByRole("table", { name: "Monthly collection performance", exact: true });
    const firstRow = ledger.locator(".monthly-comparison-ledger-row").first();
    const desktopBar = firstRow.locator(".monthly-comparison-ledger-bar");
    const mobileBar = firstRow.locator(".monthly-comparison-ledger-mobile-bar");
    for (const bar of [desktopBar, mobileBar]) {
      await expect(bar).toHaveAttribute("max", "31000");
      await expect(bar).toHaveAttribute("aria-hidden", "true");
    }
    if (width < 768) {
      await expect(desktopBar).toBeHidden();
      await expect(mobileBar).toBeVisible();
    } else {
      await expect(desktopBar).toBeVisible();
      await expect(mobileBar).toBeHidden();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test("Monthly closed analysis disclosures retain both charts for native printing without opening them", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  const fixture = await installFixture(page, baseURL, "light");
  await page.goto("/collection/monthly-comparison");
  const panel = page.locator(".collection-monthly-comparison-panel");
  await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
  const sameDay = panel.getByTestId("collection-monthly-same-day-analysis");
  const detailed = panel.getByTestId("collection-monthly-detailed-analysis");
  const monthlyChart = panel.getByRole("img", { name: /^Monthly collection comparison chart/ });
  const sameDayChart = panel.getByRole("img", { name: /^Same-day/ });
  await expect(sameDay).not.toHaveAttribute("open");
  await expect(detailed).not.toHaveAttribute("open");
  await expect(monthlyChart).toBeHidden();
  await expect(sameDayChart).toBeHidden();
  try {
    await page.emulateMedia({ media: "print" });
    await expect(monthlyChart).toBeVisible();
    await expect(sameDayChart).toBeVisible();
    await expect(monthlyChart.locator("svg").first()).toBeVisible();
    await expect(sameDayChart.locator("svg").first()).toBeVisible();
    await expect(sameDay).not.toHaveAttribute("open");
    await expect(detailed).not.toHaveAttribute("open");
  } finally {
    await page.emulateMedia({ media: "screen" });
  }
  await expect(monthlyChart).toBeHidden();
  await expect(sameDayChart).toBeHidden();
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const width of [1366, 320]) {
  test(`Monthly export scope at ${width}px follows the loaded report until Apply`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installFixture(page, baseURL, "light");
    await page.goto("/collection/monthly-comparison");
    const panel = page.locator(".collection-monthly-comparison-panel");
    const start = panel.getByLabel("Start month", { exact: true });
    const apply = panel.getByRole("button", { name: "Apply", exact: true });
    const scope = panel.getByTestId("monthly-comparison-export-context");
    const csv = panel.getByRole("button", { name: "Export CSV", exact: true });
    const print = panel.getByRole("button", { name: "Print report", exact: true });
    await expect(csv).toBeEnabled();
    await start.fill("2026-09");
    await apply.click();
    await expect(panel.locator(".monthly-comparison-ledger-row")).toHaveCount(2);
    await expect(csv).toBeEnabled();
    await expect(scope).toBeVisible();
    await expect(scope).toContainText("2026-09 to 2026-10");
    await expect(scope).toContainText(nickname);
    await expect(csv).toHaveAccessibleDescription(/2026-09 to 2026-10/);
    await expect(print).toHaveAccessibleDescription(/2026-09 to 2026-10/);

    const requestCount = fixture.comparisonRequests.length;
    await start.fill("2026-08");
    await expect(start).toHaveValue("2026-08");
    await expect(scope).toContainText("2026-09 to 2026-10");
    await expect(scope).not.toContainText("2026-08");
    await expect(scope).toContainText(/Apply changed filters/i);
    await expect(csv).toBeEnabled();
    await expect(print).toBeEnabled();
    expect(fixture.comparisonRequests).toHaveLength(requestCount);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await scope.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await testInfo.attach(`monthly-export-context-${width}`, {
      body: await panel.locator(".collection-monthly-comparison-filter-card").screenshot(), contentType: "image/png",
    });

    await apply.click();
    await expect(panel.locator(".monthly-comparison-ledger-row")).toHaveCount(3);
    await expect(csv).toBeEnabled();
    await expect(scope).toContainText("2026-08 to 2026-10");
    await expect(scope).not.toContainText(/Apply changed filters/i);
    expect(fixture.comparisonRequests.at(-1)).toBe("2026-08:2026-10");
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const loading of ["comparison", "target"] as const) {
  test(`Monthly export explains ${loading} loading without a hover at phone width`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fixture = await installFixture(page, baseURL, "light", { loading });
    try {
      await page.goto("/collection/monthly-comparison");
      const panel = page.locator(".collection-monthly-comparison-panel");
      const scope = panel.getByTestId("monthly-comparison-export-context");
      const reason = loading === "comparison" ? /comparison.*loading|loading.*comparison/i : /target.*loading|loading.*target/i;
      await expect(scope).toBeVisible();
      await expect(scope).toContainText(reason);
      for (const name of ["Export CSV", "Print report"]) {
        const action = panel.getByRole("button", { name, exact: true });
        await expect(action).toBeDisabled();
        await expect(action).toHaveAccessibleDescription(reason);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      fixture.release();
      await expect(panel.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
      await expect(scope).not.toContainText(reason);
      expect(fixture.unexpected).toEqual([]);
      expect(fixture.errors).toEqual([]);
    } finally { fixture.release(); }
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 390]) {
    test(`Monthly polish ${theme} at ${width}px preserves labelled neutral references`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      const fixture = await installFixture(page, baseURL, theme);
      await page.goto("/collection/monthly-comparison");
      const panel = page.locator(".collection-monthly-comparison-panel");
      await expect(panel).toBeVisible();
      await page.locator("#collection-monthly-comparison-start-month").fill("2026-09");
      await page.locator("#collection-monthly-comparison-end-month").fill("2026-10");
      await panel.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(panel.locator(".monthly-comparison-ledger-row")).toHaveCount(2);
      await expect(panel.getByRole("table", { name: "Monthly collection performance", exact: true })).toBeVisible();
      const monthlyChart = panel.getByRole("img", { name: /^Monthly collection comparison chart/ });
      await expect(monthlyChart).toBeHidden();
      const paceDisclosure = panel.getByTestId("collection-monthly-same-day-analysis");
      const insightsDisclosure = panel.getByTestId("collection-monthly-detailed-analysis");
      await expect(paceDisclosure).not.toHaveAttribute("open");
      await expect(insightsDisclosure).not.toHaveAttribute("open");
      const paceToggle = paceDisclosure.locator(":scope > summary");
      await paceToggle.focus();
      await paceToggle.press("Enter");
      await expect(paceDisclosure).toHaveAttribute("open", "");
      await expect(paceToggle).toBeFocused();
      const current = panel.getByRole("progressbar", { name: "October 2026 same-day total", exact: true });
      const previous = panel.getByRole("progressbar", { name: "September 2026 same-day total", exact: true });
      const target = panel.getByRole("progressbar", { name: "Expected same-day target pace", exact: true });
      await expect(current).toBeVisible();
      await expect(previous).toBeVisible();
      await expect(target).toBeVisible();
      await expect(panel.getByText("Expected range target pace", { exact: true }).first()).toBeVisible();

      const tokens = await panel.evaluate((element) => {
        const probe = document.createElement("span");
        probe.hidden = true;
        element.append(probe);
        try {
          return Object.fromEntries(["primary", "muted-foreground", "foreground", "destructive"].map((token) => {
            probe.style.color = `hsl(var(--${token}))`;
            return [token, getComputedStyle(probe).color];
          }));
        } finally { probe.remove(); }
      });
      await expect(current).toHaveCSS("accent-color", tokens.primary!);
      await expect(previous).toHaveCSS("accent-color", tokens["muted-foreground"]!);
      await expect(target).toHaveCSS("accent-color", tokens.foreground!);
      expect(tokens.foreground).not.toBe(tokens.destructive);
      expect(tokens["muted-foreground"]).not.toBe(tokens.primary);

      const sameDayChart = panel.getByRole("img", { name: /^Same-day/ });
      await expect(sameDayChart).toBeVisible();
      const currentLine = sameDayChart.locator("path.recharts-line-curve[stroke='hsl(var(--primary))']");
      const previousLine = sameDayChart.locator("path.recharts-line-curve[stroke-dasharray='6 5']");
      const targetLine = sameDayChart.locator("path.recharts-line-curve[stroke-dasharray='3 5']");
      await expect(currentLine).toHaveCSS("stroke", tokens.primary!);
      await expect(previousLine).toHaveCSS("stroke", tokens["muted-foreground"]!);
      await expect(targetLine).toHaveCSS("stroke", tokens.foreground!);
      await expect(sameDayChart.locator(".recharts-legend-item-text")).toHaveText(["October 2026", "September 2026", "Target pace"]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await testInfo.attach(`monthly-pace-${theme}-${width}`, {
        body: await sameDayChart.screenshot(), contentType: "image/png",
      });
      await testInfo.attach(`monthly-reference-bars-${theme}-${width}`, {
        body: await panel.locator(".collection-monthly-comparison-section-card--pace").screenshot(), contentType: "image/png",
      });
      await paceToggle.focus();
      await paceToggle.press("Enter");
      await expect(paceDisclosure).not.toHaveAttribute("open");
      await expect(sameDayChart).toBeHidden();
      const insightsToggle = insightsDisclosure.locator(":scope > summary");
      await insightsToggle.focus();
      await insightsToggle.press("Space");
      await expect(insightsDisclosure).toHaveAttribute("open", "");
      await expect(insightsDisclosure.getByText("Benchmark lens", { exact: true })).toBeVisible();
      await expect(monthlyChart).toBeVisible();
      await expect(monthlyChart.locator("path.recharts-line-curve[stroke-dasharray='6 4']"))
        .toHaveCSS("stroke", tokens.foreground!);
      await expect(monthlyChart.locator(".recharts-legend-item-text").filter({ hasText: "Monthly target" })).toBeVisible();
      await insightsToggle.press("Enter");
      await expect(insightsDisclosure).not.toHaveAttribute("open");
      await page.emulateMedia({ media: "print" });
      await expect(current).toBeVisible();
      await expect(insightsDisclosure.getByText("Benchmark lens", { exact: true })).toBeVisible();
      await page.emulateMedia({ media: "screen" });
      expect(fixture.unexpected).toEqual([]);
      expect(fixture.errors).toEqual([]);
    });
  }
}
