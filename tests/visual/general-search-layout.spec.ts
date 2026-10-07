import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";

// Exercise the actual built React route and CSS with synthetic data only. The
// static runner has no backend; unexpected APIs and off-origin traffic fail closed.
test.use({ serviceWorkers: "block" });
const now = "2026-10-07T08:00:00.000Z";
type Theme = "light" | "dark";
type Role = "user" | "superuser";

function searchRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    "Customer Name": `Synthetic Customer ${String(index + 1).padStart(3, "0")}`,
    "Account Number": `SYNTHETIC-ACCOUNT-${String(index + 1).padStart(4, "0")}`,
    "Card No": `SYNTHETIC-CARD-${String(index + 1).padStart(4, "0")}`,
    "Home Address": "Synthetic address for responsive layout testing only",
    "Branch": "Synthetic operations branch",
    "Payment Reference": `SYNTHETIC-PAYMENT-${index + 1}`,
    "Processing Notes": "Synthetic long processing notes retained in the detail dialog",
    "Created By": "Synthetic Fixture Operator",
    "Source File": "synthetic-general-search-layout.csv",
  }));
}

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: Theme; role?: Role; count?: number; lowSpec?: boolean;
} = {}) {
  expect(baseURL, "Use npm run test:visual:built with the local static frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const { theme = "light", role = "superuser", count = 50, lowSpec = false } = options;
  const rows = searchRows(count);
  const fixture = { unexpected: [] as string[], errors: [] as string[], searchQueries: [] as string[] };
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, json: body, headers: { "Cache-Control": "no-store" },
  });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ theme, lowSpec }) => {
    localStorage.setItem("theme", theme);
    localStorage.setItem("perf_mode", lowSpec ? "low" : "high");
  }, { theme, lowSpec });
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
      id: "search-layout-synthetic-user", username: "search.layout.fixture", fullName: "Synthetic Search Operator",
      email: "search-layout@example.test", role, status: "active", mustChangePassword: false,
      passwordResetBySuperuser: false, isBanned: false, twoFactorEnabled: false,
      twoFactorPendingSetup: false, twoFactorConfiguredAt: null, activatedAt: now,
      passwordChangedAt: now, lastLoginAt: now,
    } });
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 100, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route,
      { role, tabs: { home: true, "general-search": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0,
      totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    // High-performance superuser navigation prefetches its dashboard. Keep that
    // existing behavior synthetic without allowing arbitrary analytics requests.
    if (endpoint === "GET /api/analytics/summary") return respond(route, {
      activeSessions: 1, backupActions24h: 0, bannedUsers: 0,
      collectionRecordVersionConflicts24h: 0, loginFailures24h: 0, loginsToday: 1,
      totalDataRows: count, totalImports: 1, totalUsers: 1,
    });
    if (["GET /api/analytics/login-trends", "GET /api/analytics/top-users",
      "GET /api/analytics/recent-login-activity", "GET /api/analytics/peak-hours",
      "GET /api/analytics/role-distribution"].includes(endpoint)) return respond(route, []);
    if (endpoint === "GET /api/search/global") {
      fixture.searchQueries.push(url.search);
      const pageNumber = Number(url.searchParams.get("page"));
      const pageSize = Number(url.searchParams.get("pageSize"));
      expect(url.searchParams.get("q")).toBe("Synthetic");
      expect([20, 25, 40, 50, 80, 100]).toContain(pageSize);
      expect(pageNumber).toBeGreaterThan(0);
      const offset = (pageNumber - 1) * pageSize;
      const results = rows.slice(offset, offset + pageSize);
      return respond(route, {
        columns: Object.keys(rows[0]!), rows: results, results, total: count,
        totalIsApproximate: false, page: pageNumber, pageSize, limit: pageSize, offset,
        pagination: { page: pageNumber, pageSize, limit: pageSize, mode: "offset", offset,
          total: count, totalPages: Math.max(1, Math.ceil(count / pageSize)),
          hasNextPage: offset + pageSize < count, hasPreviousPage: pageNumber > 1 },
      });
    }
    if (["POST /api/activity/heartbeat", "POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) {
      return respond(route, { ok: true });
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected synthetic search layout request" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  return fixture;
}

async function openSearch(page: Page) {
  await page.goto("/general-search", { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-search").fill("Synthetic");
  await page.getByTestId("button-search").click();
  await expect(page.getByTestId("general-search-results")).toBeVisible();
}

function resultViewport(page: Page) {
  return page.getByRole("region", { name: "General search result columns", exact: true });
}

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function assertNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function assertVisibleRowsCoverBody(viewport: Locator) {
  // Checking only the final row would miss a blank band above it. Cover the
  // full visible body, excluding the sticky header and native scrollbar.
  await expect.poll(() => viewport.evaluate((node) => {
    const view = node.getBoundingClientRect();
    const bodyTop = node.querySelector("thead")!.getBoundingClientRect().bottom;
    const bodyBottom = view.top + node.clientHeight;
    const visible = Array.from(node.querySelectorAll("tbody tr[aria-label]"))
      .map((row) => row.getBoundingClientRect())
      .filter((row) => row.bottom > bodyTop && row.top < bodyBottom);
    if (visible.length === 0) return false;
    return visible[0]!.top <= bodyTop + 1 && visible.at(-1)!.bottom >= bodyBottom - 2
      && visible.every((row, index) => index === 0 || row.top - visible[index - 1]!.bottom < 2);
  })).toBe(true);
}

async function attachScreenshot(testInfo: TestInfo, name: string, target: Page | Locator) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await target.screenshot({ path: screenshotPath });
  await testInfo.attach(name, { path: screenshotPath, contentType: "image/png" });
}

function assertFixtureClean(fixture: Awaited<ReturnType<typeof installFixture>>) {
  expect(fixture.searchQueries.length).toBeGreaterThan(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`General search layout ${theme} widens results and adapts table height to short and large desktops`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 600 });
    const fixture = await installFixture(page, baseURL, { theme, count: 100 });
    await openSearch(page);
    const frame = page.locator(".general-search-page");
    const controls = page.getByTestId("general-search-controls");
    const results = page.getByTestId("general-search-results");
    const viewport = resultViewport(page);
    await expect(viewport).toBeVisible();
    // The desktop sidebar consumes some of a 1366px viewport; compare the
    // expanded preset at 1920px below, where 1480px is actually available.
    expect((await bounds(frame)).width).toBeGreaterThan(900);
    expect((await bounds(frame)).width).toBeLessThanOrEqual(1480);
    expect((await bounds(controls)).width).toBeLessThanOrEqual(1152);
    expect((await bounds(results)).width).toBeGreaterThanOrEqual((await bounds(controls)).width);
    const shortHeight = (await bounds(viewport)).height;
    expect(shortHeight).toBeGreaterThanOrEqual(160);
    expect(shortHeight).toBeLessThan(300);
    await expect(viewport).toHaveCSS("overflow-x", "auto");
    await expect(viewport).toHaveCSS("overflow-y", "auto");
    const owners = await viewport.locator("table").evaluate((table) => {
      let count = 0;
      for (let node = table.parentElement; node && node.dataset.testid !== "general-search-results"; node = node.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(node).overflowX)) count++;
      }
      return count;
    });
    expect(owners).toBe(1);
    expect(await viewport.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    const navigation = page.getByRole("group", { name: "General search table column navigation" });
    await navigation.getByRole("button", { name: "Jump to last column" }).click();
    await expect(navigation.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    await navigation.getByRole("button", { name: "Jump to first column" }).click();
    await viewport.scrollIntoViewIfNeeded();
    await viewport.evaluate((node) => { node.scrollTop = 300; });
    await expect(viewport.locator("thead")).toHaveCSS("position", "sticky");
    await expect.poll(async () => Math.abs((await bounds(viewport.locator("thead"))).y - (await bounds(viewport)).y)).toBeLessThan(2);
    await assertNoPageOverflow(page);
    await attachScreenshot(testInfo, `search-short-${theme}`, page);
    const nextPage = page.getByTestId("button-next-page");
    const tableScrollTop = await viewport.evaluate((node) => node.scrollTop);
    await nextPage.scrollIntoViewIfNeeded();
    await expect(nextPage).toBeInViewport();
    expect(await viewport.evaluate((node) => node.scrollTop)).toBe(tableScrollTop);
    await nextPage.click();
    await expect(viewport.locator("tbody tr[aria-label]").first()).toContainText("Synthetic Customer 051");
    await page.getByTestId("button-prev-page").click();
    await expect(viewport.locator("tbody tr[aria-label]").first()).toContainText("Synthetic Customer 001");

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect.poll(async () => (await bounds(viewport)).height).toBeGreaterThan(shortHeight + 200);
    expect(Math.abs((await bounds(frame)).width - 1480)).toBeLessThan(2);
    expect(Math.abs((await bounds(controls)).width - 1152)).toBeLessThan(2);
    expect((await bounds(viewport)).height).toBeGreaterThan(600);
    expect((await bounds(viewport)).height).toBeLessThanOrEqual(832);
    await expect(page.getByTestId("button-export")).toBeVisible();
    await expect(viewport.getByRole("columnheader", { name: "Card No", exact: true })).toHaveCount(1);
    await assertNoPageOverflow(page);
    await attachScreenshot(testInfo, `search-wide-${theme}`, results);
    assertFixtureClean(fixture);
  });
}

test("General search layout leaves few results at their natural height and retains record details", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const fixture = await installFixture(page, baseURL, { count: 2 });
  await openSearch(page);
  const viewport = resultViewport(page);
  await expect(viewport.locator("tbody tr[aria-label]")).toHaveCount(2);
  expect((await bounds(viewport)).height).toBeLessThan(220);
  expect(await viewport.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await page.getByTestId("button-view-1").click();
  const dialog = page.getByTestId("general-search-record-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Synthetic Customer 002");
  await expect(dialog).toContainText("SYNTHETIC-CARD-0002");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("button-view-1")).toBeFocused();
  await assertNoPageOverflow(page);
  assertFixtureClean(fixture);
});

test("General search layout low-spec virtual rows remain reachable at the bottom after viewport resize", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 600 });
  const fixture = await installFixture(page, baseURL, { lowSpec: true, count: 100 });
  await openSearch(page);
  await expect(page.locator("html")).toHaveClass(/low-spec/);
  await page.getByTestId("select-rows-per-page").click();
  await page.getByRole("option", { name: "100", exact: true }).click();
  await expect(page.getByTestId("select-rows-per-page")).toHaveText("100");
  const viewport = resultViewport(page);
  const rows = viewport.locator("tbody tr[aria-label]");
  await expect.poll(() => rows.count()).toBeLessThan(100);
  await expect.poll(() => viewport.evaluate((node) => node.scrollHeight)).toBeGreaterThan(4000);
  await viewport.evaluate((node) => { node.scrollTop = node.scrollHeight / 2; });
  await expect.poll(async () => rows.first().getAttribute("aria-label")).not.toMatch(/^Search result 1\./);
  await expect(rows.first()).toContainText("Synthetic Customer");
  expect(await rows.count()).toBeGreaterThan(0);
  await assertVisibleRowsCoverBody(viewport);
  for (const size of [{ width: 1366, height: 600 }, { width: 1920, height: 1080 }, { width: 1366, height: 600 }]) {
    await page.setViewportSize(size);
    await viewport.scrollIntoViewIfNeeded();
    await viewport.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(page.getByTestId("button-view-99")).toBeVisible();
    await expect(rows.last()).toContainText("Synthetic Customer 100");
    await expect.poll(async () => {
      const last = await bounds(rows.last());
      const view = await bounds(viewport);
      return Math.abs(last.y + last.height - view.y - view.height);
    }).toBeLessThan(25);
    expect(await rows.count()).toBeLessThan(40);
    await assertVisibleRowsCoverBody(viewport);
    const lastView = page.getByTestId("button-view-99");
    await lastView.click();
    const dialog = page.getByTestId("general-search-record-dialog");
    await expect(dialog).toContainText("Synthetic Customer 100");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(lastView).toBeFocused();
    await assertNoPageOverflow(page);
  }
  // Larger user text changes the actual row metrics independently of the
  // viewport. The virtual window must continue using measured geometry.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
  await viewport.evaluate((node) => { node.scrollTop = node.scrollHeight / 2; });
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  await expect.poll(async () => {
    const heights = await rows.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    return Math.max(...heights) - Math.min(...heights);
  }).toBeLessThan(2);
  await assertVisibleRowsCoverBody(viewport);
  await viewport.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect(page.getByTestId("button-view-99")).toBeVisible();
  await expect(rows.last()).toContainText("Synthetic Customer 100");
  await assertVisibleRowsCoverBody(viewport);
  await viewport.evaluate((node) => { node.scrollTop = 0; });
  await expect(page.getByTestId("button-view-0")).toBeVisible();
  await expect(rows.first()).toContainText("Synthetic Customer 001");
  await page.getByTestId("select-rows-per-page").click();
  await page.getByRole("option", { name: "20", exact: true }).click();
  await expect(page.getByTestId("select-rows-per-page")).toHaveText("20");
  await expect(rows).toHaveCount(20);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(rows.first()).toContainText("Synthetic Customer 001");
  await assertNoPageOverflow(page);
  expect(fixture.searchQueries.some((query) => query.includes("pageSize=100"))).toBe(true);
  assertFixtureClean(fixture);
});

for (const theme of ["light", "dark"] as const) for (const width of [320, 390]) {
  test(`General search layout ${theme} ${width}px preserves mobile cards and user permissions`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installFixture(page, baseURL, { theme, count: 2, role: "user" });
    await openSearch(page);
    const results = page.getByTestId("general-search-results");
    await expect(resultViewport(page)).toHaveCount(0);
    await expect(results.getByRole("article")).toHaveCount(2);
    await expect(results.getByRole("table")).toHaveCount(0);
    await expect(page.getByTestId("button-export")).toHaveCount(0);
    await expect(results.getByText("synthetic-general-search-layout.csv", { exact: true })).toHaveCount(0);
    await assertNoPageOverflow(page);
    await page.getByTestId("button-view-0").click();
    const dialog = page.getByTestId("general-search-record-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Synthetic Customer 001");
    await expect(dialog).toContainText("SYNTHETIC-CARD-0001");
    await expect(dialog).not.toContainText("synthetic-general-search-layout.csv");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("button-view-0")).toBeFocused();
    await assertNoPageOverflow(page);
    await attachScreenshot(testInfo, `search-mobile-${theme}-${width}`, page);
    assertFixtureClean(fixture);
  });
}
