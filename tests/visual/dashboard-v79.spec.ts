import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { closeKeyboardMenu, openKeyboardMenu } from "../../scripts/lib/ui-keyboard-menu.mjs";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

// Exercise the production React app through the loopback-only static build runner.
// All identities, permissions, Collection rows and activity are synthetic fixtures.
type Role = "superuser" | "manager" | "admin" | "user";
type CollectionState = "ready" | "loading" | "error" | "empty";
type Theme = "light" | "dark";
const viewports = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 390, height: 844 }, { width: 430, height: 900 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 },
  { width: 1366, height: 768 },
];
const longLeaderName = "Leader 01 with an exceptionally long operational team name that must remain fully readable";
const fixedNow = "2026-10-15T08:20:00.000Z";
const features = ["home", "import", "saved", "viewer", "general-search", "collection-report",
  "analysis", "dashboard", "monitor", "activity", "audit-logs", "backup", "settings"];
const grants: Record<Role, string[]> = {
  superuser: features,
  manager: ["home", "import", "general-search", "collection-report", "analysis", "dashboard", "activity"],
  admin: ["home", "import", "saved", "viewer", "general-search", "collection-report", "analysis", "settings"],
  // Collection remains an explicit grant; separate login regression cases also
  // exercise legacy Home=false payloads against the user's permanent Home access.
  user: ["home", "general-search", "collection-report"],
};

test.use({ serviceWorkers: "block" });

async function installFixture(page: Page, baseURL: string | undefined, options: {
  role?: Role;
  theme?: Theme;
  collectionState?: CollectionState;
  leaderCount?: number;
  total?: number;
  mismatchedLeaders?: boolean;
  longNames?: boolean;
  collectionDenied?: boolean;
  initialAuthenticated?: boolean;
  legacyHomeDisabled?: boolean;
  storedPage?: string;
  twoFactorLogin?: boolean;
  forcedPasswordChange?: boolean;
} = {}) {
  expect(baseURL, "Use npm run test:visual:built; no live backend is required").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "superuser";
  const theme = options.theme ?? "light";
  const user = { id: `v79-${role}`, username: `v79.${role}.fixture`, fullName: "Dashboard Fixture",
    email: null, role, status: "active", isBanned: false, mustChangePassword: options.forcedPasswordChange ?? false,
    passwordResetBySuperuser: false, activatedAt: "2026-01-01T00:00:00.000Z",
    passwordChangedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: fixedNow,
    twoFactorEnabled: options.twoFactorLogin ?? false, twoFactorPendingSetup: false,
    twoFactorConfiguredAt: options.twoFactorLogin ? "2026-01-01T00:00:00.000Z" : null };
  const fixture = {
    role, theme, collectionState: options.collectionState ?? "ready" as CollectionState,
    tabs: Object.fromEntries(features.map((feature) => [feature, grants[role].includes(feature)])),
    requests: [] as string[], unexpected: [] as string[], errors: [] as string[], consoleErrors: [] as string[],
    collectionCalls: 0, loggedOut: false, authenticated: options.initialAuthenticated ?? true,
    loginCalls: 0, verificationCalls: 0,
    releaseCollection: () => {},
  };
  if (options.collectionDenied) fixture.tabs["collection-report"] = false;
  if (options.legacyHomeDisabled) fixture.tabs.home = false;
  let resolveCollection: () => void = () => {};
  const collectionGate = new Promise<void>((resolve) => { resolveCollection = resolve; });
  fixture.releaseCollection = () => { fixture.collectionState = "ready"; resolveCollection(); };
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, json: body, headers: { "Cache-Control": "no-store" },
  });
  await page.clock.setFixedTime(new Date(fixedNow));
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
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
      fixture.unexpected.push(`Unexpected static ${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const endpoint = `${request.method()} ${url.pathname}`;
    fixture.requests.push(endpoint);
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route, {
      maintenance: false, message: "Synthetic service is available", type: "soft", startTime: null, endTime: null,
    });
    if (endpoint === "GET /api/me") return fixture.loggedOut || !fixture.authenticated
      ? respond(route, { ok: false, message: "Synthetic session ended" }, 401)
      : respond(route, { ok: true, user, sessionExpiresAt: "2036-01-01T00:00:00.000Z" });
    if (endpoint === "POST /api/auth/login" && options.initialAuthenticated === false) {
      fixture.loginCalls++;
      expect(request.postDataJSON()).toMatchObject({ username: user.username, password: "Fixture-login-only-123!" });
      if (options.twoFactorLogin) return respond(route, { ok: true, twoFactorRequired: true,
        challengeToken: "synthetic-login-challenge", username: user.username, role,
        mustChangePassword: user.mustChangePassword, status: "active", user });
      fixture.authenticated = true;
      return route.fulfill({ json: { ok: true, username: user.username, role, activityId: "v79-login-activity",
        mustChangePassword: user.mustChangePassword, status: "active", user, sessionExpiresAt: "2036-01-01T00:00:00.000Z" },
        headers: { "Set-Cookie": "sqr_auth_hint=1; Path=/; SameSite=Lax" } });
    }
    if (endpoint === "POST /api/auth/verify-two-factor-login" && options.twoFactorLogin) {
      fixture.verificationCalls++;
      expect(request.postDataJSON()).toEqual({ challengeToken: "synthetic-login-challenge", code: "123456" });
      fixture.authenticated = true;
      return route.fulfill({ json: { ok: true, username: user.username, role, activityId: "v79-login-activity",
        mustChangePassword: user.mustChangePassword, status: "active", user, sessionExpiresAt: "2036-01-01T00:00:00.000Z" },
        headers: { "Set-Cookie": "sqr_auth_hint=1; Path=/; SameSite=Lax" } });
    }
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250,
      semanticSearchEnabled: false, sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route, { role,
      tabs: { ...fixture.tabs, canViewSystemPerformance: false } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0,
      total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "GET /api/collection/summary") {
      fixture.collectionCalls++;
      expect(url.searchParams.get("year")).toBe("2026");
      expect(url.searchParams.get("month")).toBe("10");
      expect(url.searchParams.get("includeDashboard")).toBe("1");
      if (fixture.collectionState === "loading") await collectionGate;
      if (fixture.collectionState === "error") return respond(route, { ok: false,
        message: "Synthetic Collection service unavailable" }, 503);
      const empty = fixture.collectionState === "empty";
      const total = empty ? 0 : options.total ?? 128640;
      const count = empty ? 0 : options.leaderCount ?? 3;
      const canViewLeaderBreakdown = role === "superuser" || role === "manager";
      const leaderAmount = count ? Math.floor(total * (options.mismatchedLeaders ? 2 : 0.9) / count * 100) / 100 : 0;
      return respond(route, { ok: true, year: 2026,
        summary: [{ month: 10, monthName: "October", totalRecords: empty ? 0 : 72, totalAmount: total }],
        dashboard: { month: 10, scopeLabel: canViewLeaderBreakdown ? "All Collection records" : "Your authorized Collection scope",
          canViewLeaderBreakdown,
          leaders: canViewLeaderBreakdown ? Array.from({ length: count }, (_, index) => ({
            id: `fixture-leader-${index + 1}`, name: options.longNames && index === 0 ? longLeaderName : `Leader ${String(index + 1).padStart(2, "0")}`,
            totalAmount: leaderAmount, totalRecords: 1,
          })) : [],
          unassignedAmount: canViewLeaderBreakdown ? Math.max(0, Math.round((total - count * leaderAmount) * 100) / 100) : 0,
        },
      });
    }
    if (endpoint === "GET /api/analytics/recent-login-activity") {
      expect(fixture.tabs.dashboard).toBe(true);
      return respond(route, []);
    }
    // Existing navigation hover/focus prefetches these authorized dashboard APIs.
    // Keep explicit fixtures instead of permitting arbitrary requests or disabling prefetch.
    if (["GET /api/analytics/summary", "GET /api/analytics/login-trends", "GET /api/analytics/top-users",
      "GET /api/analytics/peak-hours", "GET /api/analytics/role-distribution"].includes(endpoint)) {
      expect(fixture.tabs.dashboard).toBe(true);
      if (endpoint === "GET /api/analytics/summary") return respond(route, {
        totalUsers: 0, activeSessions: 0, loginsToday: 0, totalDataRows: 0, totalImports: 0,
        bannedUsers: 0, collectionRecordVersionConflicts24h: 0, loginFailures24h: 0, backupActions24h: 0,
      });
      if (endpoint === "GET /api/analytics/peak-hours") return respond(route,
        Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })));
      return respond(route, []);
    }
    if (endpoint === "GET /api/backups") {
      expect(fixture.tabs.backup).toBe(true);
      return respond(route, { backups: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } });
    }
    if (endpoint === "GET /api/settings") return respond(route, { categories: [
      { id: "general", name: "General", description: "Synthetic settings", settings: [] },
      { id: "security", name: "Security", description: "Account security", settings: [] },
    ] });
    if (endpoint === "GET /api/auth/two-factor") return respond(route, { ok: true, user,
      twoFactor: { enabled: false, pendingSetup: false, configuredAt: null } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, {
      ok: true, status: "ONLINE", lastActivityTime: fixedNow,
    });
    if (endpoint === "POST /api/activity/logout") {
      fixture.loggedOut = true;
      return route.fulfill({ json: { ok: true, success: true }, headers: { "Set-Cookie": "sqr_auth_hint=; Max-Age=0; Path=/" } });
    }
    // These are telemetry sinks only; fulfilling them never reaches a server.
    if (endpoint === "POST /api/telemetry/client-errors" || endpoint === "POST /api/telemetry/web-vitals") {
      return respond(route, { ok: true });
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected isolated dashboard fixture API" }, 404);
  });
  await page.addInitScript(({ nextTheme, nextUser, authenticated, storedPage }) => {
    localStorage.setItem("theme", nextTheme);
    localStorage.setItem("activeTab", storedPage);
    localStorage.setItem("lastPage", storedPage);
    if (!authenticated) return;
    sessionStorage.setItem("sessionStoredAt", String(Date.now()));
    sessionStorage.setItem("sessionExpiresAt", String(Date.now() + 60 * 60 * 1000));
    sessionStorage.setItem("user", JSON.stringify({ ...nextUser, sessionExpiresAt: "2036-01-01T00:00:00.000Z" }));
    sessionStorage.setItem("username", nextUser.username);
    sessionStorage.setItem("role", nextUser.role);
    document.cookie = "sqr_auth_hint=1; path=/; SameSite=Lax";
  }, { nextTheme: theme, nextUser: user, authenticated: fixture.authenticated, storedPage: options.storedPage ?? "home" });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const location = message.location().url;
    const status = /^Failed to load resource: the server responded with a status of (\d{3})\b/.exec(text)?.[1];
    const url = location ? new URL(location, origin) : null;
    // Only the explicitly simulated service failure and ended session are
    // expected HTTP errors. React, accessibility, bundle and other errors fail.
    const expectedHttpError = url?.origin === origin && (
      status === "503" && url.pathname === "/api/collection/summary" && options.collectionState === "error"
      || status === "401" && url.pathname === "/api/me" && (fixture.loggedOut || !fixture.authenticated)
    );
    if (!expectedHttpError) fixture.consoleErrors.push(`${text} (${location})`);
  });
  return fixture;
}

async function openWorkspace(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("home-dashboard")).toBeVisible();
  await expect(page.locator("html.app-ready")).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

async function submitUserPasswordLogin(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("button-login")).toBeVisible();
  await page.getByTestId("input-username").fill("v79.user.fixture");
  await page.getByTestId("input-password").fill("Fixture-login-only-123!");
  await page.getByTestId("button-login").click();
}

async function assertScopedUserHome(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("home-dashboard")).toBeVisible();
  await expect(page.getByTestId("collection-amount")).toContainText("128,640");
  await expect(page.getByTestId("collection-overview")).toContainText("Your authorized Collection scope");
  await expect(page.getByTestId("collection-leader")).toHaveCount(0);
  await expect(page.getByTestId("collection-unassigned")).toHaveCount(0);
  await expect(page.getByTestId("card-general-search")).toBeVisible();
  expect(fixture.requests.filter((endpoint) => endpoint.startsWith("GET /api/analytics/"))).toEqual([]);
  expect(fixture.requests.filter((endpoint) => endpoint === "GET /api/backups" || endpoint === "GET /api/settings")).toEqual([]);
}

async function assertLayout(page: Page) {
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll("[data-testid='home-dashboard'] button, [data-testid='collection-amount'], [data-testid='collection-leader']")]
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0
        && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1); })
      .map((element) => element.getAttribute("data-testid") || element.textContent),
  }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.clipped).toEqual([]);
}

function assertFixtureClean(fixture: Awaited<ReturnType<typeof installFixture>>) {
  expect(fixture.unexpected, "All browser requests stay inside the explicit synthetic contract").toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(fixture.consoleErrors, "No unexpected browser console errors").toEqual([]);
}

for (const width of [1366, 390]) {
  test(`V7.9 user login lands on Home at ${width} despite a legacy disabled Home and saved Search page`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installFixture(page, baseURL, { role: "user", initialAuthenticated: false,
      legacyHomeDisabled: true, storedPage: "general-search" });
    await submitUserPasswordLogin(page);
    await assertScopedUserHome(page, fixture);
    expect(fixture.loginCalls).toBe(1);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("lastPage"))).toBe("home");
    await page.getByTestId("card-general-search").click();
    await expect(page).toHaveURL(/\/general-search$/);
    await expect(page.getByTestId("input-search")).toBeVisible();
    if (width >= 1024) await page.getByTestId("nav-home").click();
    else {
      await page.getByTestId("button-open-mobile-nav").click();
      await page.getByTestId("mobile-nav-home").click();
    }
    await assertScopedUserHome(page, fixture);
    assertFixtureClean(fixture);
  });
}

test("V7.9 restored user session on the public login route opens Home with a legacy Home=false setting", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "user", legacyHomeDisabled: true, storedPage: "general-search" });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await assertScopedUserHome(page, fixture);
  expect(fixture.loginCalls).toBe(0);
  await expect(page.getByTestId("button-login")).toHaveCount(0);
  assertFixtureClean(fixture);
});

test("V7.9 user Home landing waits for required two-factor verification", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "user", initialAuthenticated: false,
    legacyHomeDisabled: true, storedPage: "general-search", twoFactorLogin: true });
  await submitUserPasswordLogin(page);
  await expect(page.getByTestId("input-two-factor-code")).toBeVisible();
  await expect(page.getByTestId("home-dashboard")).toHaveCount(0);
  expect(fixture.authenticated).toBe(false);
  expect(fixture.collectionCalls).toBe(0);
  expect(fixture.requests.some((endpoint) => endpoint.startsWith("GET /api/analytics/"))).toBe(false);
  await page.getByTestId("input-two-factor-code").fill("123456");
  await page.getByTestId("button-login").click();
  await assertScopedUserHome(page, fixture);
  expect(fixture.loginCalls).toBe(1);
  expect(fixture.verificationCalls).toBe(1);
  assertFixtureClean(fixture);
});

test("V7.9 mandatory password change still takes priority over user Home landing", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "user", initialAuthenticated: false,
    legacyHomeDisabled: true, storedPage: "general-search", forcedPasswordChange: true });
  await submitUserPasswordLogin(page);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.locator("#change-password-current-password")).toBeVisible();
  await expect(page.getByTestId("home-dashboard")).toHaveCount(0);
  expect(fixture.collectionCalls).toBe(0);
  expect(fixture.requests.some((endpoint) => endpoint.startsWith("GET /api/analytics/"))).toBe(false);
  expect(fixture.loginCalls).toBe(1);
  assertFixtureClean(fixture);
});

async function assertAccessible(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: (root: Document, options: { resultTypes: string[] }) => Promise<{
      violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[]; failureSummary?: string }> }>;
    }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter((entry) => entry.impact === "serious" || entry.impact === "critical")
      .map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })) }));
  });
  expect(violations, "No serious/critical accessibility defects in the visible workspace layer").toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of viewports) {
    test(`V7.9 ${theme} ${viewport.width}x${viewport.height} Collection remains readable with large totals and leaders`, async ({ page, baseURL }) => {
      await page.setViewportSize(viewport);
      const fixture = await installFixture(page, baseURL, { theme, leaderCount: 40, total: 987654321098.76, longNames: true });
      await openWorkspace(page);
      await expect(page.getByTestId("collection-amount")).toContainText("987,654,321,098.76");
      await expect(page.getByTestId("collection-leader").first()).toBeVisible();
      await expect(page.getByTestId("collection-unassigned")).toBeVisible();
      await expect(page.getByTestId("collection-unassigned").locator(".home-leader-rank, .home-leader-avatar")).toHaveCount(0);
      await expect(page.getByTestId("collection-leader").getByRole("heading", { name: longLeaderName, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await assertLayout(page);
      await page.screenshot({ path: test.info().outputPath(`workspace-${theme}-${viewport.width}x${viewport.height}.png`), fullPage: true, animations: "disabled" });
      assertFixtureClean(fixture);
    });
  }
  for (const state of ["loading", "error", "empty"] as const) {
    test(`V7.9 ${theme} Collection ${state} state is explicit and retryable`, async ({ page, baseURL }) => {
      const fixture = await installFixture(page, baseURL, { theme, collectionState: state });
      try {
        await openWorkspace(page);
        const overview = page.getByTestId("collection-overview");
        await expect(overview).toBeVisible();
        if (state === "loading") {
          await expect(overview).toContainText(/loading/i);
          await expect(page.getByTestId("collection-amount")).toHaveCount(0);
          fixture.releaseCollection();
          await expect(page.getByTestId("collection-amount")).toContainText("128,640");
        } else if (state === "error") {
          await expect(overview.getByRole("button", { name: "Retry Collection" })).toBeVisible();
          await expect(page.getByTestId("collection-amount")).toHaveCount(0);
          fixture.collectionState = "ready";
          await overview.getByRole("button", { name: "Retry Collection" }).click();
          await expect(page.getByTestId("collection-amount")).toContainText("128,640");
        } else {
          await expect(overview).toContainText(/no collection|no records/i);
          await expect(page.getByTestId("collection-leader")).toHaveCount(0);
        }
        await assertLayout(page);
        await page.screenshot({ path: test.info().outputPath(`collection-${theme}-${state}.png`), fullPage: true, animations: "disabled" });
        assertFixtureClean(fixture);
      } finally { fixture.releaseCollection(); }
    });
  }
}

for (const role of ["superuser", "manager", "admin", "user"] as const) {
  test(`V7.9 ${role} respects explicit permissions and Collection scope`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { role });
    await openWorkspace(page);
    await expect(page.getByTestId("collection-amount")).toContainText("128,640");
    await expect(page.getByTestId("collection-leader")).toHaveCount(role === "superuser" || role === "manager" ? 3 : 0);
    await page.keyboard.press("Control+k");
    const results = page.locator(".workspace-command-popup");
    await expect(results).toBeVisible();
    await page.getByTestId("input-quick-search").fill("audit");
    await expect(results.getByTestId("command-module-audit-logs")).toHaveCount(role === "superuser" ? 1 : 0);
    await page.getByTestId("input-quick-search").fill("sign out");
    await expect(results.getByRole("option", { name: /sign out/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(results).toBeHidden();
    await page.getByTestId("button-user-menu").click();
    await expect(page.getByRole("menuitem", { name: "Account", exact: true })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Security", exact: true })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Settings", exact: true })).toHaveCount(role === "admin" || role === "superuser" ? 1 : 0);
    await page.keyboard.press("Escape");
    assertFixtureClean(fixture);
  });
}

test("V7.9 permission revocation clears Collection and launcher entries", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "manager" });
  await openWorkspace(page);
  await expect(page.getByTestId("collection-leader")).toHaveCount(3);
  await page.keyboard.press("Control+k");
  await page.getByTestId("input-quick-search").fill("collection");
  const results = page.locator(".workspace-command-popup");
  await expect(results.getByTestId("command-module-collection-report")).toBeVisible();
  fixture.tabs["collection-report"] = false;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("settings-updated", {
    detail: { key: "tab_manager_collection_report_enabled" },
  })));
  await expect(page.getByTestId("collection-overview")).toHaveCount(0);
  await expect(page.getByTestId("collection-leader")).toHaveCount(0);
  await expect(results.getByTestId("command-module-collection-report")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nav-collection-report")).toHaveCount(0);
  assertFixtureClean(fixture);
});

test("V7.9 desktop flyouts, command search and profile restore keyboard focus", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  const searchInput = page.getByTestId("input-quick-search");
  await expect(searchInput).toHaveAttribute("aria-expanded", "false");
  await expect(searchInput).not.toHaveAttribute("aria-controls", /.+/);
  await expect(searchInput).not.toHaveAttribute("aria-activedescendant", /.+/);
  const trigger = page.getByTestId("nav-group-workspace");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const flyout = page.getByTestId("desktop-flyout-workspace");
  await expect(flyout).toBeVisible();
  await expect(flyout).toHaveRole("navigation");
  expect(await flyout.evaluate((element) => element.tagName)).toBe("NAV");
  await expect(trigger).toHaveAttribute("aria-controls", "desktop-flyout-workspace");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: test.info().outputPath("desktop-workspace-flyout.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(flyout).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".workspace-command-popup")).toBeVisible();
  const resultsId = await searchInput.getAttribute("aria-controls");
  expect(resultsId).toBeTruthy();
  await expect(page.locator(`[id="${resultsId}"]`)).toHaveRole("listbox");
  await expect(page.locator(`[id="${resultsId}"]`)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desktop-command-search.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveAttribute("aria-expanded", "false");
  await expect(searchInput).not.toHaveAttribute("aria-controls", /.+/);
  await expect(searchInput).not.toHaveAttribute("aria-activedescendant", /.+/);
  const profile = page.getByTestId("button-user-menu");
  await profile.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("button-logout")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desktop-profile.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(profile).toBeFocused();
  await page.getByTestId("button-toggle-theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
  assertFixtureClean(fixture);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`V7.9 smoke keyboard focus follows the real menu lifecycle with ${reducedMotion} motion`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL);
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page);
    const settings = page.getByTestId("nav-group-settings-menu");
    const flyout = page.getByTestId("desktop-flyout-settings-menu");
    // Match smoke's preceding desktop navigation before reopening the same flyout.
    await settings.click();
    await flyout.getByRole("button", { name: /Backup & Restore/i }).click();
    await expect(page.locator("#main-content").getByRole("heading", { name: "Backup & Restore", exact: true })).toBeVisible();
    const profile = page.getByTestId("button-user-menu");
    const profileMenu = page.getByRole("menu").filter({ has: page.getByTestId("button-logout") });
    for (let cycle = 0; cycle < 3; cycle++) {
      await openKeyboardMenu(page, settings, flyout);
      await closeKeyboardMenu(page, settings, flyout);
      await openKeyboardMenu(page, profile, profileMenu);
      await closeKeyboardMenu(page, profile, profileMenu);
    }
    assertFixtureClean(fixture);
  });
}

test("V7.9 mobile drawer owns focus, opens inline groups and restores its trigger", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  const trigger = page.getByTestId("button-open-mobile-nav");
  await trigger.click();
  const drawer = page.locator("#mobile-navigation-drawer");
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation", exact: true })).toBeVisible();
  await page.getByTestId("mobile-nav-group-workspace").click();
  await expect(page.getByTestId("mobile-submenu-workspace")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("mobile-inline-navigation.png"), animations: "disabled" });
  await expect(page.getByTestId("mobile-nav-group-workspace")).toHaveAttribute("aria-controls", "mobile-submenu-workspace");
  await page.getByTestId("mobile-nav-group-insights").click();
  await expect(page.getByTestId("mobile-submenu-workspace")).toHaveCount(0);
  await expect(page.getByTestId("mobile-submenu-insights")).toBeVisible();
  await page.getByTestId("mobile-nav-group-workspace").click();
  await expect(page.getByTestId("mobile-submenu-insights")).toHaveCount(0);
  await expect(page.getByTestId("desktop-flyout-workspace")).toHaveCount(0);
  await expect(page.getByTestId("button-user-menu-mobile")).toBeVisible();
  await page.getByTestId("button-user-menu-mobile").click();
  await expect(page.getByTestId("button-logout")).toBeVisible();
  // Visibility can precede Radix's post-mount focus scope and Escape listener.
  await expect.poll(() => page.locator(".workspace-profile-menu").evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-logout")).toBeHidden();
  await expect(page.getByTestId("button-user-menu-mobile")).toBeFocused();
  await expect(page.getByTestId("mobile-submenu-workspace")).toBeVisible();
  await expect(drawer).toBeVisible();
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("mobile-submenu-workspace")).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId("mobile-nav-group-workspace")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByTestId("button-command-search-mobile").click();
  await expect(page.getByTestId("command-search-dialog")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("mobile-command-search.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-command-search-mobile")).toBeFocused();
  await assertLayout(page);
  assertFixtureClean(fixture);
});

test("V7.9 leaders remain filterable and reachable without ranking unassigned totals", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { leaderCount: 40, longNames: true });
  await openWorkspace(page);
  const leaders = page.getByTestId("collection-leader");
  await expect(leaders).toHaveCount(6);
  await expect(page.getByText("Showing 6 of 40 leaders", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(leaders).toHaveCount(18);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(leaders).toHaveCount(40);
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
  await expect(leaders.getByRole("heading", { name: "Leader 40", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show fewer", exact: true }).click();
  await expect(leaders).toHaveCount(6);
  const filter = page.getByRole("searchbox", { name: "Filter team leaders" });
  await filter.fill("Leader 40");
  await expect(leaders).toHaveCount(1);
  await expect(leaders).toContainText("#40");
  await filter.fill("no matching fixture");
  await expect(leaders).toHaveCount(0);
  await expect(page.getByText("No leaders match your search.", { exact: true })).toBeVisible();
  await filter.fill("");
  await expect(leaders).toHaveCount(6);
  const unassigned = page.getByTestId("collection-unassigned");
  await expect(unassigned).toBeVisible();
  await expect(unassigned.locator(".home-leader-rank, .home-leader-avatar")).toHaveCount(0);
  await expect(page.getByTestId("collection-leaders").getByLabel("40 leaders", { exact: true })).toHaveText("40");
  assertFixtureClean(fixture);
});

test("V7.9 mismatched leader totals use safe subtotal percentages", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { leaderCount: 2, total: 100, mismatchedLeaders: true });
  await openWorkspace(page);
  await expect(page.getByTestId("collection-leader")).toHaveCount(2);
  await expect(page.getByTestId("collection-leaders").getByRole("status")).toContainText("Percentages use the leader subtotal");
  await expect(page.getByTestId("collection-leader").getByText("50.0% of leader subtotal", { exact: true })).toHaveCount(2);
  await expect(page.getByTestId("collection-amount")).toContainText("100.00");
  await expect(page.getByTestId("collection-unassigned")).toHaveCount(0);
  assertFixtureClean(fixture);
});

test("V7.9 collapsed navigation waits for expanded geometry and switches layers repeatedly", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  const toggle = page.getByTestId("button-toggle-sidebar");
  const workspace = page.getByTestId("nav-group-workspace");
  const flyout = page.getByTestId("desktop-flyout-workspace");
  const sidebar = page.locator("aside.workspace-sidebar");
  const profile = page.getByTestId("button-user-menu");
  const quickSearch = page.getByTestId("input-quick-search");
  await workspace.click();
  await expect(flyout).toBeVisible();
  await workspace.click();
  await expect(flyout).toBeHidden();
  await workspace.click();
  await page.getByTestId("nav-group-insights").click();
  await expect(flyout).toBeHidden();
  await expect(page.getByTestId("desktop-flyout-insights")).toBeVisible();
  await page.getByRole("heading", { name: /Good afternoon/ }).click();
  await expect(page.getByTestId("desktop-flyout-insights")).toBeHidden();
  for (const opening of ["click", "ArrowRight"] as const) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    if (opening === "click") await workspace.click();
    else { await workspace.focus(); await page.keyboard.press(opening); }
    await expect(flyout).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const geometry = await page.evaluate(() => ({
      sidebar: document.querySelector("aside.workspace-sidebar")!.getBoundingClientRect().toJSON(),
      flyout: document.querySelector('[data-testid="desktop-flyout-workspace"]')!.getBoundingClientRect().toJSON(),
    }));
    expect(geometry.sidebar.width).toBeGreaterThan(200);
    expect(geometry.flyout.left).toBeGreaterThanOrEqual(geometry.sidebar.right);
    await expect(page.locator(".is-opening")).toHaveCount(0);
    if (opening === "ArrowRight") await expect(flyout.getByRole("button").first()).toBeFocused();
    await quickSearch.click();
    await expect(flyout).toBeHidden();
    await expect(page.locator(".workspace-command-popup")).toBeVisible();
    await page.getByTestId("button-notification-center-desktop").click();
    await expect(page.locator(".workspace-command-popup")).toBeHidden();
    await expect(page.locator("#notification-center-desktop")).toBeVisible();
    await profile.click();
    await expect(page.locator("#notification-center-desktop")).toBeHidden();
    await expect(page.getByTestId("button-logout")).toBeVisible();
    await quickSearch.click();
    await expect(page.getByTestId("button-logout")).toBeHidden();
    await expect(quickSearch).toBeFocused();
    await expect(page.locator(".workspace-command-popup")).toBeVisible();
    await page.keyboard.press("Escape");
    await profile.click();
    await expect(page.locator(".workspace-profile-menu")).toBeVisible();
    await expect.poll(() => page.locator(".workspace-profile-menu").evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.keyboard.press("Escape");
    await expect(profile).toBeFocused();
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await profile.click();
  await expect(page.getByTestId("button-logout")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const sidebarBox = await sidebar.boundingBox();
  const menuBox = await page.locator(".workspace-profile-menu").boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width);
  await page.keyboard.press("Escape");
  await workspace.click();
  await expect(flyout).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(flyout).toBeHidden();
  await expect(page.getByTestId("button-open-mobile-nav")).toBeVisible();
  await expect(quickSearch).toHaveCount(0);
  await expect(page.getByTestId("button-command-search-mobile")).toBeVisible();
  await page.getByTestId("button-open-mobile-nav").click();
  await expect(page.locator("#mobile-navigation-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(quickSearch).toBeVisible();
  await expect(quickSearch).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("button-command-search-mobile")).toHaveCount(0);
  await workspace.click();
  await expect(flyout).toBeVisible();
  await page.keyboard.press("Escape");
  assertFixtureClean(fixture);
});

test("V7.9 Account and Security use canonical personal routes and sign out ends the session", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  for (const action of ["Account", "Security"]) {
    await page.getByTestId("button-user-menu").click();
    await page.getByRole("menuitem", { name: action, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${action.toLowerCase()}$`));
    await expect(page.getByRole("heading", { level: 1, name: action, exact: true })).toBeVisible();
    if (action === "Security") {
      await page.getByTestId("security-change-password").click();
      await expect(page.locator("#my-account-current-password")).toBeVisible();
    } else {
      await expect(page.locator("#my-account-current-password")).toHaveCount(0);
    }
    await page.getByTestId("nav-home").click();
    await expect(page.getByTestId("home-dashboard")).toBeVisible();
  }
  await page.getByTestId("button-user-menu").click();
  await page.getByTestId("button-logout").click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
  expect(fixture.loggedOut).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("user"))).toBeNull();
  await expect(page.getByTestId("home-dashboard")).toHaveCount(0);
  assertFixtureClean(fixture);
});

for (const leaderCount of [1, 6]) {
  test(`V7.9 ${leaderCount} leaders fit without unnecessary pagination or filtering`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { leaderCount });
    await openWorkspace(page);
    await expect(page.getByTestId("collection-leader")).toHaveCount(leaderCount);
    await expect(page.getByRole("searchbox", { name: "Filter team leaders" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show fewer", exact: true })).toHaveCount(0);
    await assertLayout(page);
    assertFixtureClean(fixture);
  });
}

test("V7.9 shortcuts preserve typing and search selects an authorized real route", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { leaderCount: 40 });
  await openWorkspace(page);
  await page.getByTestId("collection-leader").first().waitFor();
  const leaderFilter = page.getByRole("searchbox", { name: "Filter team leaders" });
  await leaderFilter.fill("Leader");
  await leaderFilter.press("/");
  await expect(leaderFilter).toHaveValue("Leader/");
  await expect(leaderFilter).toBeFocused();
  await expect(page.locator(".workspace-command-popup")).toHaveCount(0);
  await page.getByRole("heading", { name: /Good afternoon/ }).click();
  await page.keyboard.press("/");
  await expect(page.getByTestId("input-quick-search")).toBeFocused();
  await page.getByTestId("input-quick-search").fill("Switch to dark mode");
  await page.locator(".workspace-command-popup").getByRole("option", { name: "Switch to dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Control+k");
  await page.getByTestId("input-quick-search").fill("General Search");
  await page.getByTestId("input-quick-search").press("Enter");
  await expect(page).toHaveURL(/\/general-search$/);
  await expect(page.getByTestId("input-search")).toBeVisible();
  await expect(page.locator(".workspace-command-popup")).toHaveCount(0);
  assertFixtureClean(fixture);
});

test("V7.9 denied Collection is absent initially and never fetched", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "admin", collectionDenied: true });
  await openWorkspace(page);
  await expect(page.getByTestId("collection-overview")).toHaveCount(0);
  await expect(page.getByTestId("nav-collection-report")).toHaveCount(0);
  await expect(page.getByTestId("card-collection-report")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByTestId("input-quick-search").fill("collection");
  await expect(page.getByTestId("command-module-collection-report")).toHaveCount(0);
  expect(fixture.collectionCalls).toBe(0);
  assertFixtureClean(fixture);
});

test("V7.9 a revoked Collection request cannot restore stale authorized data", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "manager", collectionState: "loading" });
  try {
    await openWorkspace(page);
    await expect(page.getByTestId("collection-overview")).toHaveAttribute("data-state", "loading");
    await expect.poll(() => fixture.collectionCalls).toBe(1);
    fixture.tabs["collection-report"] = false;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("settings-updated", {
      detail: { key: "tab_manager_collection_report_enabled" },
    })));
    await expect(page.getByTestId("collection-overview")).toHaveCount(0);
    fixture.releaseCollection();
    await page.getByTestId("button-user-menu").click();
    await expect(page.getByTestId("button-logout")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("collection-amount")).toHaveCount(0);
    await expect(page.getByTestId("collection-leader")).toHaveCount(0);
    assertFixtureClean(fixture);
  } finally { fixture.releaseCollection(); }
});

test("V7.9 notifications remain anchored and close with focus on their trigger", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const variant = width >= 1024 ? "desktop" : "mobile";
    const trigger = page.getByTestId(`button-notification-center-${variant}`);
    await expect(trigger).toHaveAttribute("aria-controls", `notification-center-${variant}`);
    await expect(trigger).toHaveAccessibleName("Open notifications");
    await trigger.click();
    const panel = page.locator(`#notification-center-${variant}`);
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: test.info().outputPath(`${variant}-notifications.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  assertFixtureClean(fixture);
});

test("V7.9 personal Security navigation and Backup query keep the correct active child", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  await page.getByTestId("nav-group-settings-menu").click();
  await page.getByTestId("flyout-nav-settings").click();
  await expect(page.getByRole("navigation", { name: "Settings Navigation" })).toBeVisible();
  await page.getByRole("navigation", { name: "Settings Navigation" }).getByRole("button", { name: "General", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?section=general$/);
  await page.getByTestId("button-user-menu").click();
  await page.getByRole("menuitem", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/\/security$/);
  await page.getByTestId("security-change-password").click();
  await expect(page.locator("#my-account-current-password")).toBeVisible();
  await page.getByTestId("nav-group-settings-menu").click();
  await page.getByTestId("flyout-nav-backup").click();
  await expect(page).toHaveURL(/\/settings\?section=backup-restore$/);
  await expect(page.getByTestId("nav-group-settings-menu")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("nav-group-settings-menu").click();
  await expect(page.getByTestId("flyout-nav-backup")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("flyout-nav-settings")).not.toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("button-open-mobile-nav").click();
  await expect(page.getByTestId("mobile-nav-group-settings-menu")).toHaveClass(/is-active/);
  await page.getByTestId("mobile-nav-group-settings-menu").click();
  await expect(page.getByTestId("mobile-nav-backup")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("mobile-nav-settings")).not.toHaveAttribute("aria-current", "page");
  assertFixtureClean(fixture);
});

test("V7.9 blank collapsed rail expands without navigation", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  const toggle = page.getByTestId("button-toggle-sidebar");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const sidebar = page.locator("aside.workspace-sidebar");
  const box = await sidebar.boundingBox();
  await sidebar.click({ position: { x: 2, y: box!.height / 2 } });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-testid^="desktop-flyout-"]')).toHaveCount(0);
  assertFixtureClean(fixture);
});

test("V7.9 mobile backdrop and search closure release scrolling and preserve profile access", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  const menu = page.getByTestId("button-open-mobile-nav");
  const search = page.getByTestId("button-command-search-mobile");
  await expect(page.getByTestId("command-search-dialog")).toHaveCount(0);
  await expect(page.locator("#mobile-navigation-drawer")).toHaveCount(0);
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).overflow)).toBe("hidden");
  await page.mouse.click(385, 420);
  await expect(page.locator("#mobile-navigation-drawer")).toHaveCount(0);
  await expect(menu).toBeFocused();
  await expect.poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).overflow)).not.toBe("hidden");
  for (const closeWith of ["button", "backdrop", "Escape"] as const) {
    await search.click();
    const dialog = page.getByTestId("command-search-dialog");
    await expect(dialog).toBeVisible();
    if (closeWith === "button") await dialog.getByRole("button", { name: "Close", exact: true }).click();
    else if (closeWith === "backdrop") await page.mouse.click(385, 100);
    else await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect.poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).overflow)).not.toBe("hidden");
    await menu.click();
    await page.getByTestId("button-user-menu-mobile").click();
    await expect(page.getByTestId("button-logout")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
  }
  assertFixtureClean(fixture);
});

test("V7.9 an open mobile search closes across viewport changes without reopening a desktop popup", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  const mobileSearch = page.getByTestId("button-command-search-mobile");
  await mobileSearch.click();
  await expect(page.getByTestId("command-search-dialog")).toBeVisible();
  await page.getByTestId("input-command-search").fill("collection");
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.getByTestId("command-search-dialog")).toHaveCount(0);
  const desktopSearch = page.getByTestId("input-quick-search");
  await expect(desktopSearch).toBeVisible();
  await expect(desktopSearch).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".workspace-command-popup")).toHaveCount(0);
  await expect.poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).overflow)).not.toBe("hidden");
  await page.getByTestId("button-user-menu").click();
  await expect(page.getByTestId("button-logout")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(desktopSearch).toHaveCount(0);
  await expect(mobileSearch).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("command-search-dialog")).toHaveCount(0);
  await page.getByTestId("button-open-mobile-nav").click();
  await page.getByTestId("button-user-menu-mobile").click();
  await expect(page.getByTestId("button-logout")).toBeVisible();
  assertFixtureClean(fixture);
});

for (const theme of ["light", "dark"] as const) {
  test(`V7.9 ${theme} Home and navigation layers have no serious accessibility violations`, async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const fixture = await installFixture(page, baseURL, { theme });
    await openWorkspace(page);
    await expect(page.getByTestId("collection-amount")).toBeVisible();
    await assertAccessible(page);
    await page.getByTestId("nav-group-workspace").click();
    await expect(page.getByTestId("desktop-flyout-workspace")).toBeVisible();
    await assertAccessible(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await expect(page.locator(".workspace-command-popup")).toBeVisible();
    await assertAccessible(page);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("button-command-search-mobile").click();
    await expect(page.getByTestId("command-search-dialog")).toBeVisible();
    await assertAccessible(page);
    await page.keyboard.press("Escape");
    await page.getByTestId("button-open-mobile-nav").click();
    await page.getByTestId("mobile-nav-group-workspace").click();
    await expect(page.getByTestId("mobile-submenu-workspace")).toBeVisible();
    await assertAccessible(page);
    assertFixtureClean(fixture);
  });
}
