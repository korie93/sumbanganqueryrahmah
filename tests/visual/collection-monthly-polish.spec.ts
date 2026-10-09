import { expect, test, type Page, type Route } from "@playwright/test";

// Production-built React/CSS, synthetic responses only. Unknown API requests and
// every off-origin request fail closed; no backend, real accounts or database.
test.use({ serviceWorkers: "block" });
const nickname = "Monthly Synthetic Collector";
const now = "2026-10-15T08:00:00.000Z";

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark", options: {
  loading?: "comparison" | "target";
} = {}) {
  expect(baseURL, "Run through npm run test:visual:built").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const fixture = {
    unexpected: [] as string[], errors: [] as string[],
    comparisonRequests: [] as string[], release: () => {},
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
  }, { nextTheme: theme, staff: nickname });
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
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route,
      { maintenance: false, message: "Fixture available", type: "soft", startTime: null, endTime: null });
    if (endpoint === "GET /api/me") return respond(route, { ok: true, sessionExpiresAt: "2036-01-01T00:00:00.000Z", user: {
      id: "monthly-polish-admin", username: "monthly.polish.fixture", fullName: "Synthetic Monthly Operator",
      email: "monthly@example.test", role: "admin", status: "active", mustChangePassword: false,
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
      { role: "admin", tabs: { home: true, "collection-report": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0,
      totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true });
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route,
      { ok: true, nickname: { id: "monthly-polish-nickname", nickname } });
    if (endpoint === "GET /api/collection/nicknames") return respond(route, { ok: true, nicknames: [{
      id: "monthly-polish-nickname", nickname, isActive: true, roleScope: "both",
      createdBy: "monthly-polish-admin", createdAt: now,
    }] });
    if (endpoint === "GET /api/collection/monthly-comparison") {
      expect(url.searchParams.get("nickname")).toBe(nickname);
      const startMonth = url.searchParams.get("startMonth")!;
      const endMonth = url.searchParams.get("endMonth")!;
      fixture.comparisonRequests.push(`${startMonth}:${endMonth}`);
      expect(startMonth).toMatch(/^2026-\d{2}$/);
      expect(endMonth).toBe("2026-10");
      if (options.loading === "comparison") await gate;
      const months = Array.from({ length: 11 - Number(startMonth.slice(-2)) }, (_, index) => {
        const month = Number(startMonth.slice(-2)) + index;
        const recordCount = month === 10 ? 15 : 30;
        const averagePerRecord = month === 10 ? 1250 : 1000;
        return { month: `2026-${String(month).padStart(2, "0")}`,
          label: new Date(2026, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          totalCollection: recordCount * averagePerRecord, recordCount, averagePerRecord };
      });
      return respond(route, { ok: true, nickname, startMonth, endMonth, months, comparison: {
        baseMonth: months[0]!.month, targetMonth: "2026-10", baseLabel: months[0]!.label,
        targetLabel: "Oct 2026", baseTotal: 30000, targetTotal: 18750, difference: -11250,
        percentageChange: -37.5, direction: "decrease",
        summary: "Synthetic collection decreased by RM11,250.00 (-37.50%).",
      } });
    }
    if (endpoint === "GET /api/collection/monthly-target") {
      expect(url.searchParams.get("nickname")).toBe(nickname);
      const key = url.searchParams.get("month")!;
      expect(key).toMatch(/^2026-\d{2}$/);
      if (options.loading === "target") await gate;
      return respond(route, { ok: true, nickname, month: { key, year: 2026, month: Number(key.slice(-2)) },
        monthlyTarget: 31000, configured: true, source: "configured" });
    }
    if (endpoint === "GET /api/collection/daily/overview") {
      expect(url.searchParams.get("usernames")).toBe(nickname);
      expect(url.searchParams.get("year")).toBe("2026");
      const month = Number(url.searchParams.get("month"));
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(10);
      const daysInMonth = new Date(2026, month, 0).getDate();
      return respond(route, { ok: true, username: nickname, usernames: [nickname], role: "admin",
        month: { year: 2026, month, daysInMonth }, summary: { monthlyTarget: 31000 },
        days: Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1,
          date: `2026-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
          amount: month === 10 ? index < 15 ? 1250 : 0 : 1000, target: 1000,
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
    await expect(panel.getByText("2 month(s) loaded", { exact: true })).toBeVisible();
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
    await expect(panel.getByText("3 month(s) loaded", { exact: true })).toBeVisible();
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
      await expect(panel.getByText("2 month(s) loaded", { exact: true })).toBeVisible();
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
      const monthlyChart = panel.getByRole("img", { name: /^Monthly collection comparison chart/ });
      await expect(monthlyChart.locator("path.recharts-line-curve[stroke-dasharray='6 4']"))
        .toHaveCSS("stroke", tokens.foreground!);
      await expect(monthlyChart.locator(".recharts-legend-item-text").filter({ hasText: "Monthly target" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await testInfo.attach(`monthly-pace-${theme}-${width}`, {
        body: await sameDayChart.screenshot(), contentType: "image/png",
      });
      await testInfo.attach(`monthly-reference-bars-${theme}-${width}`, {
        body: await panel.locator(".collection-monthly-comparison-section-card--pace").screenshot(), contentType: "image/png",
      });
      expect(fixture.unexpected).toEqual([]);
      expect(fixture.errors).toEqual([]);
    });
  }
}
