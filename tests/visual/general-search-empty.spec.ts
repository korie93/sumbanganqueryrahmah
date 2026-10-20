import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";

// Actual built route and stylesheet; only synthetic loopback data is allowed.
test.use({ serviceWorkers: "block" });
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const now = "2026-10-20T04:00:00.000Z";
type Theme = "light" | "dark";
type Role = "user" | "admin" | "superuser";
type SearchMode = "simple" | "advanced";
type SearchRow = Record<string, unknown>;
type Reply = { rows?: SearchRow[]; total?: number; status?: number; networkFailure?: boolean; timeoutFailure?: boolean; malformed?: boolean; gate?: Promise<void> };
type AdvancedPayload = { filters: Array<{ field: string; operator: string; value: string }>; logic: "AND" | "OR"; page: number; pageSize: number };

const syntheticRow = {
  "Customer Name": "Synthetic Matching Customer", "Account Number": "SYNTHETIC-ACCOUNT-1",
  "Card No": "SYNTHETIC-CARD-1", "Source File": "synthetic-empty-state.csv",
};

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: Theme; role?: Role; lowSpec?: boolean; motion?: "reduce" | "no-preference";
} = {}) {
  expect(baseURL, "Run against the local built-frontend test server").toBeTruthy();
  const url = new URL(baseURL!);
  expect(url.protocol).toBe("http:");
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.port).not.toBe("");
  const origin = url.origin;
  const { theme = "light", role = "user", lowSpec = false, motion = "reduce" } = options;
  const replies = new Map<string, Reply>();
  const fixture = {
    unexpected: [] as string[], errors: [] as string[],
    settledSearches: [] as string[],
    searches: [] as Array<{ mode: SearchMode; query: string; page: number; pageSize: number; logic?: string }>,
    setReply(query: string, reply: Reply, mode: SearchMode = "simple") { replies.set(`${mode}:${query}`, reply); },
    hold(query: string, reply: Reply = {}, mode: SearchMode = "simple") {
      let release = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      replies.set(`${mode}:${query}`, { ...reply, gate });
      return release;
    },
  };
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, json: body, headers: { "Cache-Control": "no-store" },
  });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: theme, reducedMotion: motion });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ theme, lowSpec }) => {
    localStorage.setItem("theme", theme);
    localStorage.setItem("perf_mode", lowSpec ? "low" : "high");
  }, { theme, lowSpec });
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== origin) {
      fixture.unexpected.push(`Off-origin ${requestUrl.origin}${requestUrl.pathname}`);
      return route.abort();
    }
    if (!requestUrl.pathname.startsWith("/api/")) {
      if (["GET", "HEAD"].includes(request.method())) return route.continue();
      fixture.unexpected.push(`${request.method()} ${requestUrl.pathname}`);
      return route.abort();
    }
    const endpoint = `${request.method()} ${requestUrl.pathname}`;
    if (endpoint === "GET /api/health/connectivity") return route.fulfill({
      status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" },
    });
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route,
      { maintenance: false, message: "Fixture available", type: "soft", startTime: null, endTime: null });
    if (endpoint === "GET /api/me") return respond(route, { ok: true, sessionExpiresAt: "2036-01-01T00:00:00.000Z", user: {
      id: "general-search-empty-synthetic-user", username: "search.empty.fixture", fullName: "Synthetic Search Operator",
      email: "search-empty@example.test", role, status: "active", mustChangePassword: false,
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
    if (endpoint === "GET /api/analytics/summary") return respond(route, {
      activeSessions: 1, backupActions24h: 0, bannedUsers: 0, collectionRecordVersionConflicts24h: 0,
      loginFailures24h: 0, loginsToday: 1, totalDataRows: 1, totalImports: 1, totalUsers: 1,
    });
    if (["GET /api/analytics/login-trends", "GET /api/analytics/top-users", "GET /api/analytics/recent-login-activity",
      "GET /api/analytics/peak-hours", "GET /api/analytics/role-distribution"].includes(endpoint)) return respond(route, []);
    if (endpoint === "GET /api/search/columns") return respond(route, Object.keys(syntheticRow));
    if (endpoint === "GET /api/search/global" || endpoint === "POST /api/search/advanced") {
      const mode: SearchMode = request.method() === "GET" ? "simple" : "advanced";
      const payload = mode === "advanced" ? request.postDataJSON() as AdvancedPayload : null;
      const query = payload ? payload.filters.map((filter) => filter.value).join("|") : requestUrl.searchParams.get("q") ?? "";
      const pageNumber = payload?.page ?? Number(requestUrl.searchParams.get("page"));
      const pageSize = payload?.pageSize ?? Number(requestUrl.searchParams.get("pageSize"));
      expect(pageNumber).toBeGreaterThan(0);
      expect([20, 25, 40, 50, 80, 100]).toContain(pageSize);
      if (payload) {
        expect(["AND", "OR"]).toContain(payload.logic);
        expect(payload.filters.length).toBeGreaterThan(0);
      }
      fixture.searches.push({ mode, query, page: pageNumber, pageSize, ...(payload ? { logic: payload.logic } : {}) });
      // Capture each response when its request starts so releasing an old
      // response cannot silently substitute the next search's fixture data.
      const reply = replies.get(`${mode}:${query}`) ?? {};
      try {
        if (reply.gate) await reply.gate;
        if (reply.networkFailure) return await route.abort("failed");
        if (reply.timeoutFailure) return await route.abort("timedout");
        if (reply.malformed) return await respond(route, { total: 0, rows: [] });
        if (reply.status && reply.status >= 400) return await respond(route, {
          ok: false, code: `SYNTHETIC_SEARCH_${reply.status}`, message: `Synthetic ${reply.status} search failure`,
        }, reply.status);
        const allRows = reply.rows ?? [];
        const total = reply.total ?? allRows.length;
        const offset = (pageNumber - 1) * pageSize;
        const rows = allRows.slice(offset, offset + pageSize);
        const headers = Object.keys(allRows[0] ?? syntheticRow);
        return await respond(route, {
          columns: headers, headers, rows, results: rows, total, totalIsApproximate: false,
          page: pageNumber, pageSize, limit: pageSize, offset,
          pagination: { page: pageNumber, pageSize, limit: pageSize, mode: "offset", offset,
            total, totalPages: Math.max(1, Math.ceil(total / pageSize)), hasNextPage: offset + pageSize < total, hasPreviousPage: pageNumber > 1 },
        });
      } finally {
        fixture.settledSearches.push(`${mode}:${query}`);
      }
    }
    if (["POST /api/activity/heartbeat", "POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) {
      return respond(route, { ok: true });
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected synthetic empty-state request" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  return fixture;
}

function emptyPanel(page: Page) { return page.getByTestId("general-search-empty"); }
async function openSearch(page: Page) {
  await page.goto("/general-search", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("input-search")).toBeVisible();
}
async function submitSearch(page: Page, query = "Synthetic Missing") {
  await page.getByTestId("input-search").fill(query);
  await page.getByTestId("input-search").press("Enter");
}
async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await emptyPanel(page).evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}
function assertFixtureClean(fixture: Awaited<ReturnType<typeof installFixture>>) {
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
}
async function attachScreenshot(testInfo: TestInfo, name: string, target: Page | Locator) {
  const path = testInfo.outputPath(`${name}.png`);
  await target.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
async function assertAccessible(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: (root: Element, options: {
      runOnly: { type: string; values: string[] }; resultTypes: string[];
    }) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }> } }).axe;
    const root = document.querySelector('[data-testid="general-search-empty"]');
    if (!root) throw new Error("The successful-empty panel must be visible for axe");
    const result = await axe.run(root, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return result.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })) }));
  });
  expect(violations, "The successful-empty panel satisfies scoped WCAG A/AA checks").toEqual([]);
}

for (const theme of ["light", "dark"] as const) for (const width of [320, 390, 768, 1024, 1440]) {
  test(`General search empty ${theme} ${width}px is responsive, semantic and role-safe`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    const fixture = await installFixture(page, baseURL, { theme });
    await openSearch(page);
    await expect(page.getByText("Start Search", { exact: true })).toBeVisible();
    await expect(emptyPanel(page)).toHaveCount(0);
    expect(fixture.searches).toHaveLength(0);
    await submitSearch(page);
    await expect(emptyPanel(page)).toBeVisible();
    await expect(emptyPanel(page).getByRole("heading", { name: "Tiada rekod ditemui", exact: true })).toBeVisible();
    await expect(emptyPanel(page).locator('[role="status"]')).toHaveText("Carian selesai. Tiada rekod ditemui. 0 padanan.");
    await expect(emptyPanel(page).locator("output")).toHaveText("Synthetic Missing");
    await expect(emptyPanel(page).locator(".sqr-empty__art > .sqr-empty__scene > svg")).toHaveCount(1);
    await expect(page.getByTestId("general-search-results")).toHaveCount(0);
    await expect(page.getByTestId("button-export")).toHaveCount(0);
    await expect(emptyPanel(page)).toHaveAttribute("lang", "ms");
    await expect(page.getByTestId("input-search")).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const panelBox = await emptyPanel(page).boundingBox();
    const bodyBox = await emptyPanel(page).locator(".sqr-empty__body").boundingBox();
    expect(panelBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    expect(bodyBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
    expect(bodyBox!.x + bodyBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
    await assertNoOverflow(page);
    if (width === 320 || width === 1440) await assertAccessible(page);
    await attachScreenshot(testInfo, `general-search-empty-${theme}-${width}`, page);
    assertFixtureClean(fixture);
  });
}

test("General search empty is absent for idle, invalid input and a pending request", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  const release = fixture.hold("Pending Search");
  await openSearch(page);
  await submitSearch(page, "a");
  await expect(page.getByText("Please enter at least 2 characters.", { exact: true })).toBeVisible();
  expect(fixture.searches).toHaveLength(0);
  await expect(emptyPanel(page)).toHaveCount(0);
  await submitSearch(page, "Pending Search");
  await expect.poll(() => fixture.searches.length).toBe(1);
  await expect(page.getByTestId("button-search")).toBeDisabled();
  await expect(emptyPanel(page)).toHaveCount(0);
  release();
  await expect(emptyPanel(page)).toBeVisible();
  assertFixtureClean(fixture);
});

for (const failure of ["server", "network", "timeout", "unauthorized", "malformed"] as const) {
  test(`General search empty never represents a ${failure} failure as successful zero`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL);
    const failureReply: Record<typeof failure, Reply> = {
      server: { status: 500 }, network: { networkFailure: true }, timeout: { timeoutFailure: true },
      unauthorized: { status: 401 }, malformed: { malformed: true },
    };
    fixture.setReply("Failure Search", failureReply[failure]);
    await openSearch(page);
    await submitSearch(page, "Failure Search");
    await expect.poll(() => fixture.searches.length).toBeGreaterThan(0);
    await expect(page.getByTestId("button-search")).toBeEnabled();
    await expect(page.locator(".general-search-page .text-destructive")).toBeVisible();
    await expect(emptyPanel(page)).toHaveCount(0);
    await expect(page.getByText("No results found", { exact: true })).toHaveCount(0);
    assertFixtureClean(fixture);
  });
}

test("General search empty displays an adversarial long keyword as literal text without overflow", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 960 });
  const fixture = await installFixture(page, baseURL);
  const query = `<img src=x onerror="window.__sqrEmptyXss=1"> & ' ${"LONG".repeat(100)}`;
  await openSearch(page);
  await submitSearch(page, query);
  await expect(emptyPanel(page)).toBeVisible();
  await expect(emptyPanel(page).locator("output")).toHaveText(query);
  await expect(emptyPanel(page).locator("output")).toHaveAttribute("title", query);
  await expect(emptyPanel(page).locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __sqrEmptyXss?: unknown }).__sqrEmptyXss)).toBeUndefined();
  await assertNoOverflow(page);
  assertFixtureClean(fixture);
});

test("General search empty rejects old responses after keyword changes and reset", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  const releaseOld = fixture.hold("Old Search");
  const releaseEdited = fixture.hold("Edited Search");
  const releaseReset = fixture.hold("Reset Pending");
  fixture.setReply("Matching Search", { rows: [syntheticRow] });
  await openSearch(page);
  await submitSearch(page, "Old Search");
  await expect.poll(() => fixture.searches.some((entry) => entry.query === "Old Search")).toBe(true);
  await page.getByTestId("input-search").fill("Matching Search");
  await expect(page.getByTestId("general-search-results")).toBeVisible();
  releaseOld();
  await expect.poll(() => fixture.settledSearches.includes("simple:Old Search")).toBe(true);
  await expect(page.getByTestId("general-search-results")).toContainText("Synthetic Matching Customer");
  await expect(emptyPanel(page)).toHaveCount(0);
  await page.getByTestId("input-search").fill("Missing Again");
  await expect(emptyPanel(page)).toBeVisible();
  await page.getByTestId("input-search").fill("Edited Search");
  await expect.poll(() => fixture.searches.some((entry) => entry.query === "Edited Search")).toBe(true);
  await expect(emptyPanel(page)).toHaveCount(0);
  releaseEdited();
  await expect(emptyPanel(page).locator("output")).toHaveText("Edited Search");
  await page.getByTestId("input-search").fill("Reset Pending");
  await expect.poll(() => fixture.searches.some((entry) => entry.query === "Reset Pending")).toBe(true);
  await page.getByTestId("button-reset").click();
  await expect(page.getByTestId("button-reset")).toBeFocused();
  releaseReset();
  await expect.poll(() => fixture.settledSearches.includes("simple:Reset Pending")).toBe(true);
  await expect(page.getByText("Start Search", { exact: true })).toBeVisible();
  await expect(page.getByTestId("input-search")).toHaveValue("");
  await expect(emptyPanel(page)).toHaveCount(0);
  await expect(page.getByTestId("general-search-results")).toHaveCount(0);
  assertFixtureClean(fixture);
});

test("General search empty advanced mode owns its filters, logic and reset focus", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const fixture = await installFixture(page, baseURL);
  const releaseSimple = fixture.hold("Old Simple");
  const releaseAdvanced = fixture.hold("Advanced Missing", {}, "advanced");
  await openSearch(page);
  await submitSearch(page, "Old Simple");
  await expect.poll(() => fixture.searches.some((entry) => entry.query === "Old Simple")).toBe(true);
  await page.getByTestId("button-advanced-search").click();
  await expect(page.getByTestId("select-field-0")).toBeVisible();
  releaseSimple();
  await expect.poll(() => fixture.settledSearches.includes("simple:Old Simple")).toBe(true);
  await expect(emptyPanel(page)).toHaveCount(0);
  await page.getByTestId("select-field-0").click();
  await page.getByRole("option", { name: "Customer Name", exact: true }).click();
  await page.getByTestId("input-value-0").fill("Advanced Missing");
  await expect.poll(() => fixture.searches.some((entry) => entry.mode === "advanced" && entry.query === "Advanced Missing")).toBe(true);
  await expect(emptyPanel(page)).toHaveCount(0);
  releaseAdvanced();
  await expect(emptyPanel(page)).toBeVisible();
  await expect(emptyPanel(page)).toContainText("Kriteria carian");
  await expect(emptyPanel(page).locator("output")).toContainText("Advanced Missing");
  await expect(emptyPanel(page)).not.toContainText("Old Simple");
  await page.getByTestId("button-logic-or").click();
  await expect.poll(() => fixture.searches.some((entry) => entry.mode === "advanced" && entry.logic === "OR")).toBe(true);
  await expect(emptyPanel(page)).toBeVisible();
  await page.getByTestId("button-reset-advanced").click();
  await expect(page.getByTestId("button-reset-advanced")).toBeFocused();
  await expect(page.getByTestId("select-field-0")).toHaveText("Select field...");
  await expect(page.getByTestId("input-value-0")).toHaveValue("");
  await expect(page.getByText("Start Search", { exact: true })).toBeVisible();
  await expect(emptyPanel(page)).toHaveCount(0);
  await expect(page.getByTestId("button-search-advanced")).toBeVisible();
  assertFixtureClean(fixture);
});

for (const role of ["user", "admin", "superuser"] as const) {
  test(`General search empty preserves populated results and ${role} permissions`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    const fixture = await installFixture(page, baseURL, { role });
    fixture.setReply("Matching Search", { rows: [syntheticRow] });
    await openSearch(page);
    await submitSearch(page);
    await expect(emptyPanel(page)).toBeVisible();
    await page.getByTestId("input-search").fill("Matching Search");
    const results = page.getByTestId("general-search-results");
    await expect(results).toBeVisible();
    await expect(emptyPanel(page)).toHaveCount(0);
    await expect(results.getByRole("table")).toBeVisible();
    await expect(page.getByTestId("button-export")).toHaveCount(role === "superuser" ? 1 : 0);
    await expect(results).toContainText("Synthetic Matching Customer");
    if (role === "user") await expect(results).not.toContainText("synthetic-empty-state.csv");
    else await expect(results).toContainText("synthetic-empty-state.csv");
    await page.getByTestId("button-view-0").click();
    const dialog = page.getByTestId("general-search-record-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("SYNTHETIC-CARD-1");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("button-view-0")).toBeFocused();
    await expect(page.getByTestId("input-search")).toHaveValue("Matching Search");
    assertFixtureClean(fixture);
  });
}

test("General search empty does not label an empty page with a positive total as globally empty", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  fixture.setReply("Positive Total", { rows: [], total: 20 });
  await openSearch(page);
  await submitSearch(page, "Positive Total");
  await expect(page.getByText("No results found", { exact: true })).toBeVisible();
  await expect(emptyPanel(page)).toHaveCount(0);
  assertFixtureClean(fixture);
});

test("General search empty preserves an accepted result table after PDF export failure", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const fixture = await installFixture(page, baseURL, { role: "superuser" });
  fixture.setReply("Matching Search", { rows: [syntheticRow] });
  await openSearch(page);
  await submitSearch(page, "Matching Search");
  const results = page.getByTestId("general-search-results");
  await expect(results).toBeVisible();
  // Fail only the on-demand PDF-export chunk, after real results have loaded.
  // No backend/search response or application code is replaced by this check.
  let failedExportLoads = 0;
  await page.context().route("**/assets/export-*.js", async (route) => {
    failedExportLoads++;
    await route.abort("failed");
  });
  await page.getByTestId("button-export").click();
  await page.getByTestId("button-export-pdf").click();
  await expect.poll(() => failedExportLoads).toBeGreaterThan(0);
  await expect(page.getByText(/^Failed to export PDF:/)).toBeVisible();
  await expect(results).toContainText("Synthetic Matching Customer");
  await expect(results.getByRole("table")).toBeVisible();
  await expect(emptyPanel(page)).toHaveCount(0);
  await expect(page.getByTestId("button-export")).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByTestId("button-view-0").click();
  await expect(page.getByTestId("general-search-record-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-view-0")).toBeFocused();
  await expect(page.getByTestId("input-search")).toHaveValue("Matching Search");
  assertFixtureClean(fixture);
});

for (const lowSpec of [false, true]) {
  test(`General search empty ${lowSpec ? "low-spec" : "normal"} keeps the 10s fish story and respects reduced motion`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { lowSpec, motion: "no-preference" });
    await openSearch(page);
    await submitSearch(page);
    await expect(emptyPanel(page)).toBeVisible();
    if (lowSpec) await expect(page.locator("html")).toHaveClass(/low-spec/);
    else await expect(page.locator("html")).not.toHaveClass(/low-spec/);
    const fish = emptyPanel(page).locator(".fish-main");
    await expect(fish).toHaveCSS("animation-name", "se-fish");
    await expect(fish).toHaveCSS("animation-duration", "10s");
    await expect(fish).toHaveCSS("animation-iteration-count", "infinite");
    await expect(emptyPanel(page).locator(".fisher")).toHaveCSS("animation-duration", "10s");
    const timeline = await fish.evaluate((node) => node.getAnimations().map((animation) => ({
      duration: animation.effect?.getTiming().duration,
      frames: (animation.effect as KeyframeEffect | null)?.getKeyframes().map((frame) => frame.transform),
    })));
    expect(timeline).toHaveLength(1);
    expect(timeline[0]!.duration).toBe(10_000);
    expect(timeline[0]!.frames!.length).toBeGreaterThan(10);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => emptyPanel(page).evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(fish).toHaveCSS("animation-name", "none");
    await expect(emptyPanel(page)).toBeVisible();
    assertFixtureClean(fixture);
  });
}
