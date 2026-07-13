import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Route } from "@playwright/test";

type VisualTheme = "light" | "dark";

interface VisualRouteSpec {
  readonly id: string;
  readonly path: string;
  readonly readySelector: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const visualStabilizerPath = path.join(__dirname, "visual-regression.css");
const visualThemes: readonly VisualTheme[] = ["light", "dark"];
const visualSessionExpiresAt = "2036-01-01T00:00:00.000Z";
const visualUser = {
  activatedAt: "2026-01-01T00:00:00.000Z",
  email: "visual.admin@example.test",
  fullName: "Visual Admin",
  id: "visual-admin",
  isBanned: false,
  lastLoginAt: "2026-01-15T08:00:00.000Z",
  mustChangePassword: false,
  passwordChangedAt: "2026-01-01T00:00:00.000Z",
  passwordResetBySuperuser: false,
  role: "superuser",
  status: "active",
  twoFactorConfiguredAt: null,
  twoFactorEnabled: false,
  twoFactorPendingSetup: false,
  username: "visual-admin",
} as const;
const visualRecentLoginActivity = {
  browser: "Chrome 149",
  eventType: "success",
  failureReason: null,
  id: "visual-activity-1",
  ipAddress: "203.0.113.24",
  lastActivityTime: "2026-01-15T08:15:00.000Z",
  loginTime: "2026-01-15T08:00:00.000Z",
  logoutReason: null,
  logoutTime: null,
  platform: "Windows 11",
  role: "superuser",
  status: "active",
  userAgentSummary: "Chrome on Windows",
  username: visualUser.username,
} as const;
const visualActivityRows = Array.from({ length: 8 }, (_, index) => ({
  browser: `Google Chrome 149.0.${index} on a managed enterprise workstation`,
  deviceType: "desktop",
  id: `visual-activity-${index + 1}`,
  ipAddress: `203.0.113.${24 + index}`,
  isActive: index < 3,
  lastActivityTime: "2026-01-15T08:15:00.000Z",
  loginTime: "2026-01-15T08:00:00.000Z",
  logoutReason: index < 3 ? null : "USER_LOGOUT",
  logoutTime: index < 3 ? null : "2026-01-15T09:00:00.000Z",
  pcName: `OPERATIONS-WORKSTATION-${String(index + 1).padStart(2, "0")}`,
  platform: "Windows 11 Enterprise",
  role: index === 0 ? "superuser" : "admin",
  status: index < 3 ? "ONLINE" : "LOGOUT",
  username: `visual.operator.${String(index + 1).padStart(2, "0")}`,
}));
const visualViewerHeaders = [
  "Customer Name",
  "Identification Number",
  "Account Number",
  "Branch",
  "Collection Status",
  "Payment Reference",
  "Processing Notes",
  "Created By",
  "Created At",
  "Last Updated At",
] as const;
const visualSearchRows = Array.from({ length: 3 }, (_, index) =>
  Object.fromEntries(
    visualViewerHeaders.map((header) => [
      header,
      `${header} search result ${index + 1}`,
    ]),
  ),
);

const publicRoutes: readonly VisualRouteSpec[] = [
  {
    id: "login",
    path: "/login",
    readySelector: "[data-testid='button-login']",
  },
];

const authenticatedRoutes: readonly VisualRouteSpec[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    readySelector: "main#main-content",
  },
  {
    id: "sumbangan-form",
    path: "/collection/save",
    readySelector: "main#main-content",
  },
  {
    id: "admin-settings",
    path: "/settings",
    readySelector: "main#main-content",
  },
];

function buildVisualMasks(page: Page, theme: VisualTheme) {
  return {
    mask: [
      page.locator('[data-testid="button-user-menu"]'),
      page.locator('[data-testid="button-user-menu-mobile"]'),
      page.locator('[data-testid*="count"]'),
      page.locator('[data-testid*="date"]'),
      page.locator('[data-testid*="timestamp"]'),
      page.locator('[data-testid="badge-dashboard-freshness"]'),
      page.locator('[aria-live="polite"]'),
    ],
    maskColor: theme === "dark" ? "#111827" : "#f8fafc",
  };
}

async function installTheme(page: Page, theme: VisualTheme) {
  await page.emulateMedia({
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  await page.addInitScript((nextTheme) => {
    localStorage.setItem("theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
  }, theme);
}

function jsonResponse(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json; charset=utf-8",
    headers: {
      "Cache-Control": "no-store",
    },
    status,
  });
}

async function installMockAuthenticatedApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/api/me") {
      return jsonResponse(route, {
        ok: true,
        sessionExpiresAt: visualSessionExpiresAt,
        user: visualUser,
      });
    }

    if (pathname === "/api/app-config") {
      return jsonResponse(route, {
        aiEnabled: true,
        aiTimeoutMs: 30_000,
        heartbeatIntervalMinutes: 1,
        importUploadLimitBytes: 10 * 1024 * 1024,
        searchResultLimit: 250,
        semanticSearchEnabled: true,
        sessionTimeoutMinutes: 30,
        systemName: "SQR Visual Baseline",
        viewerRowsPerPage: 100,
        wsIdleMinutes: 10,
      });
    }

    if (pathname === "/api/settings/tab-visibility") {
      return jsonResponse(route, {
        role: visualUser.role,
        tabs: {},
      });
    }

    if (pathname === "/api/search/global") {
      return jsonResponse(route, {
        columns: visualViewerHeaders,
        rows: visualSearchRows,
        results: visualSearchRows,
        total: visualSearchRows.length,
        totalIsApproximate: false,
        page: 1,
        limit: 50,
        pageSize: 50,
        offset: 0,
        pagination: {
          hasNextPage: false,
          hasPreviousPage: false,
          limit: 50,
          mode: "offset",
          offset: 0,
          page: 1,
          pageSize: 50,
          total: visualSearchRows.length,
          totalPages: 1,
        },
      });
    }

    if (pathname === "/api/imports") {
      return jsonResponse(route, {
        imports: [
          {
            createdAt: "2026-01-15T08:00:00.000Z",
            createdBy: visualUser.username,
            filename: "baseline-import.csv",
            id: "visual-import-1",
            isDeleted: false,
            name: "Baseline Import",
            rowCount: 24,
          },
        ],
        pagination: {
          hasNextPage: false,
          hasPreviousPage: false,
          limit: 20,
          mode: "offset",
          offset: 0,
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
    }

    if (pathname === "/api/imports/visual-import-1/data") {
      return jsonResponse(route, {
        headers: visualViewerHeaders,
        limit: 100,
        nextCursor: null,
        offset: 0,
        page: 1,
        pageSize: 100,
        pagination: {
          hasNextPage: false,
          hasPreviousPage: false,
          limit: 100,
          mode: "hybrid",
          nextCursor: null,
          offset: 0,
          page: 1,
          pageSize: 100,
          total: 3,
          totalPages: 1,
        },
        rows: Array.from({ length: 3 }, (_, index) => ({
          id: `visual-row-${index + 1}`,
          importId: "visual-import-1",
          jsonDataJsonb: Object.fromEntries(
            visualViewerHeaders.map((header) => [
              header,
              `${header} sample value ${index + 1}`,
            ]),
          ),
        })),
        total: 3,
      });
    }

    if (pathname === "/api/activity/page") {
      return jsonResponse(route, {
        activities: visualActivityRows,
        pagination: {
          hasNextPage: false,
          hasPreviousPage: false,
          limit: 20,
          mode: "offset",
          offset: 0,
          page: 1,
          pageSize: 20,
          total: visualActivityRows.length,
          totalPages: 1,
        },
        summary: {
          idleCount: 0,
          kickedCount: 0,
          logoutCount: 5,
          onlineCount: 3,
        },
      });
    }

    if (pathname === "/api/users/banned") {
      return jsonResponse(route, { users: [] });
    }

    if (pathname === "/api/analytics/summary") {
      return jsonResponse(route, {
        activeSessions: 18,
        backupActions24h: 2,
        bannedUsers: 3,
        collectionRecordVersionConflicts24h: 1,
        loginFailures24h: 4,
        loginsToday: 42,
        totalDataRows: 24_680,
        totalImports: 9,
        totalUsers: 128,
      });
    }

    if (pathname === "/api/analytics/login-trends") {
      return jsonResponse(route, [
        { date: "2026-01-09", logins: 8, logouts: 5 },
        { date: "2026-01-10", logins: 12, logouts: 9 },
        { date: "2026-01-11", logins: 9, logouts: 8 },
        { date: "2026-01-12", logins: 15, logouts: 11 },
        { date: "2026-01-13", logins: 18, logouts: 13 },
        { date: "2026-01-14", logins: 14, logouts: 12 },
        { date: "2026-01-15", logins: 21, logouts: 15 },
      ]);
    }

    if (pathname === "/api/analytics/top-users") {
      return jsonResponse(route, [
        {
          lastLogin: "2026-01-15T08:00:00.000Z",
          loginCount: 12,
          role: "admin",
          username: "ops-admin",
        },
        {
          lastLogin: "2026-01-15T07:45:00.000Z",
          loginCount: 8,
          role: "user",
          username: "collector-alpha",
        },
      ]);
    }

    if (pathname === "/api/analytics/peak-hours") {
      return jsonResponse(
        route,
        Array.from({ length: 24 }, (_, hour) => ({
          hour,
          count: hour === 10 ? 18 : hour === 9 ? 14 : hour === 15 ? 11 : 2,
        })),
      );
    }

    if (pathname === "/api/analytics/recent-login-activity") {
      return jsonResponse(route, [visualRecentLoginActivity]);
    }

    if (pathname === "/api/analytics/recent-login-activity-page") {
      return jsonResponse(route, {
        activities: [visualRecentLoginActivity],
        filterCounts: {
          active: 1,
          all: 1,
          attention: 0,
          ended: 0,
          failed: 0,
        },
        pagination: {
          page: 1,
          pageSize: 4,
          totalItems: 1,
          totalPages: 1,
        },
      });
    }

    if (pathname === "/api/analytics/role-distribution") {
      return jsonResponse(route, [
        { count: 4, role: "superuser" },
        { count: 12, role: "admin" },
        { count: 112, role: "user" },
      ]);
    }

    if (pathname === "/api/settings") {
      return jsonResponse(route, {
        categories: [
          {
            description: "Core runtime options for the visual baseline.",
            id: "general",
            name: "General",
            settings: [
              {
                defaultValue: "SQR",
                description: "Displayed product name.",
                isCritical: false,
                key: "system_name",
                label: "System Name",
                options: [],
                permission: { canEdit: true, canView: true },
                type: "text",
                updatedAt: "2026-01-15T08:00:00.000Z",
                value: "SQR Visual Baseline",
              },
              {
                defaultValue: "false",
                description: "Maintenance mode banner.",
                isCritical: true,
                key: "maintenance_mode",
                label: "Maintenance Mode",
                options: [],
                permission: { canEdit: true, canView: true },
                type: "boolean",
                updatedAt: "2026-01-15T08:00:00.000Z",
                value: "false",
              },
            ],
          },
          {
            description: "Account security controls.",
            id: "security",
            name: "Security",
            settings: [],
          },
        ],
      });
    }

    if (pathname === "/api/collection/nicknames") {
      return jsonResponse(route, {
        nicknames: [
          {
            id: "visual-nickname-1",
            isActive: true,
            nickname: "Collector Alpha",
            roleScope: "both",
          },
        ],
        ok: true,
      });
    }

    if (request.method() === "POST" && pathname === "/api/activity/logout") {
      return jsonResponse(route, { ok: true });
    }

    return jsonResponse(route, { ok: true });
  });
}

async function installMockAuthenticatedSession(page: Page, theme: VisualTheme) {
  await installTheme(page, theme);
  await installMockAuthenticatedApi(page);
  await page.addInitScript(({ nextTheme, user }) => {
    const now = Date.now();
    const expiresAt = now + 60 * 60 * 1000;
    localStorage.setItem("activeTab", "home");
    localStorage.setItem("lastPage", "home");
    sessionStorage.setItem("sessionStoredAt", String(now));
    sessionStorage.setItem("sessionExpiresAt", String(expiresAt));
    sessionStorage.setItem("username", user.username);
    sessionStorage.setItem("role", user.role);
    sessionStorage.setItem("user", JSON.stringify({
      ...user,
      sessionExpiresAt: new Date(expiresAt).toISOString(),
    }));
    sessionStorage.setItem("collection_staff_nickname", "Collector Alpha");
    sessionStorage.setItem("collection_staff_nickname_auth", "1");
    localStorage.setItem("theme", nextTheme);
    document.cookie = "sqr_auth_hint=1; path=/; SameSite=Lax";
    document.addEventListener("DOMContentLoaded", () => {
      const hideFloatingAi = () => {
        document
          .querySelectorAll<HTMLElement>('[data-testid="floating-ai-toggle"]')
          .forEach((element) => {
            element.parentElement?.remove();
          });
      };
      const observer = new MutationObserver(hideFloatingAi);
      observer.observe(document.documentElement, {
        attributeFilter: ["hidden"],
        attributes: true,
        childList: true,
        subtree: true,
      });
      window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
      hideFloatingAi();
    }, { once: true });
  }, { nextTheme: theme, user: visualUser });
}

async function navigateForSnapshot(page: Page, route: VisualRouteSpec) {
  await page.goto(route.path, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
  await page.locator(route.readySelector).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.locator("html.app-ready").waitFor({
    state: "attached",
    timeout: 20_000,
  }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function expectVisualBaseline(page: Page, name: string, theme: VisualTheme) {
  const ciSnapshotTolerance =
    process.env.CI && name === "admin-settings" && theme === "dark"
      ? { maxDiffPixelRatio: 0.1 }
      : {};

  await page
    .locator('[data-testid="floating-ai-toggle"]')
    .evaluateAll((elements) => {
      elements.forEach((element) => {
        element.parentElement?.remove();
      });
    });
  await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
    animations: "disabled",
    caret: "hide",
    fullPage: false,
    stylePath: visualStabilizerPath,
    ...buildVisualMasks(page, theme),
    ...ciSnapshotTolerance,
  });
}

async function logoutVisualSession(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/activity/logout", {
      body: "{}",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }).catch(() => undefined);
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => undefined);
  await page.context().clearCookies();
}

async function expectNoSeriousAccessibilityViolations(page: Page, label: string) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe?: {
        run: (
          root: Document,
          options: { resultTypes: string[] },
        ) => Promise<{
          violations: Array<{
            id: string;
            impact: string | null;
            nodes: Array<{ target: string[] }>;
          }>;
        }>;
      };
    }).axe;
    if (!axe) {
      throw new Error("axe-core did not initialize");
    }
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.flatMap((node) => node.target),
      }));
  });

  expect(violations, `${label} serious/critical accessibility violations`).toEqual([]);
}

for (const theme of visualThemes) {
  test(`public login page matches ${theme} baseline`, async ({ page }) => {
    await installTheme(page, theme);
    await navigateForSnapshot(page, publicRoutes[0]);
    await expectVisualBaseline(page, "login", theme);
  });
}

test.describe("authenticated key page baselines", () => {
  test.describe.configure({ mode: "serial" });

  for (const theme of visualThemes) {
    test(`authenticated pages match ${theme} baselines`, async ({ page }) => {
      await installMockAuthenticatedSession(page, theme);

      try {
        for (const route of authenticatedRoutes) {
          await navigateForSnapshot(page, route);
          await expectVisualBaseline(page, route.id, theme);
        }
      } finally {
        await logoutVisualSession(page);
      }
    });
  }
});

test("dashboard scaling and data tables preserve reachable content", async ({ page }) => {
  test.setTimeout(90_000);
  await installMockAuthenticatedSession(page, "light");

  try {
    await navigateForSnapshot(page, authenticatedRoutes[0]);

    for (const viewport of [
      { fontSize: 16, width: 1280 },
      { fontSize: 20, width: 1024 },
      { fontSize: 24, width: 800 },
      { fontSize: 32, width: 1024 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await page.evaluate((fontSize) => {
        document.documentElement.style.fontSize = `${fontSize}px`;
      }, viewport.fontSize);
      await page.waitForTimeout(150);

      const dashboardLayout = await page.evaluate(() => {
        const dashboard = document.querySelector("[data-dashboard-export-root]");
        const documentElement = document.documentElement;
        const dashboardRect = dashboard?.getBoundingClientRect();
        const clippedDashboardActions = dashboard
          ? [...dashboard.querySelectorAll("a[href], button, input, select, textarea")]
              .filter((node): node is HTMLElement => node instanceof HTMLElement)
              .filter((node) => {
                const style = getComputedStyle(node);
                if (style.display === "none" || style.visibility === "hidden") return false;
                const rect = node.getBoundingClientRect();
                let scrollOwner = node.parentElement;
                while (scrollOwner && dashboard.contains(scrollOwner)) {
                  const ownerStyle = getComputedStyle(scrollOwner);
                  const scrollableX = ownerStyle.overflowX === "auto" || ownerStyle.overflowX === "scroll";
                  if (scrollableX && scrollOwner.scrollWidth > scrollOwner.clientWidth + 1) break;
                  scrollOwner = scrollOwner.parentElement;
                }
                if (scrollOwner && dashboard.contains(scrollOwner)) return false;
                return rect.width > 0
                  && rect.height > 0
                  && (rect.left < -1 || rect.right > documentElement.clientWidth + 1);
              })
              .map((node) => node.getAttribute("aria-label") || node.textContent?.trim() || node.tagName)
          : ["dashboard root missing"];

        return {
          clippedDashboardActions,
          dashboardRight: dashboardRect?.right ?? Number.POSITIVE_INFINITY,
          documentClientWidth: documentElement.clientWidth,
          documentScrollWidth: documentElement.scrollWidth,
        };
      });

      expect(dashboardLayout.documentScrollWidth).toBeLessThanOrEqual(
        dashboardLayout.documentClientWidth + 1,
      );
      expect(dashboardLayout.dashboardRight).toBeLessThanOrEqual(
        dashboardLayout.documentClientWidth + 1,
      );
      expect(dashboardLayout.clippedDashboardActions).toEqual([]);
    }

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto("/monitor?section=activity", { waitUntil: "domcontentloaded" });

    const activityRow = page.locator('[data-testid^="activity-row-"]').first();
    await expect(activityRow).toBeVisible();
    const comfortableActivityHeight = (await activityRow.boundingBox())?.height ?? 0;
    await page.getByTestId("activity-density-compact").click();
    await expect(activityRow).toHaveAttribute("data-density", "compact");
    const compactActivityHeight = (await activityRow.boundingBox())?.height ?? 0;
    expect(compactActivityHeight).toBeLessThan(comfortableActivityHeight);

    await page.getByTestId("button-activity-columns").click();
    await page.getByRole("checkbox", { name: "Show Browser column" }).click();
    await page.getByRole("button", { name: "Move Duration up" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: "Browser" })).toHaveCount(0);
    const activityHeaderOrder = await page
      .getByRole("columnheader")
      .allTextContents();
    expect(activityHeaderOrder.indexOf("Duration")).toBeLessThan(
      activityHeaderOrder.indexOf("Logout"),
    );

    const activityScrollport = page.getByRole("region", { name: "Activity log columns" });
    await expect(activityScrollport).toBeVisible();
    const activityScrollNavigation = page.getByRole("group", {
      name: "Activity table column navigation",
    });
    await expect(activityScrollNavigation).toBeVisible();
    await expect(
      activityScrollNavigation.getByRole("button", { name: "Scroll columns left" }),
    ).toBeDisabled();
    await expect(activityScrollNavigation.getByRole("progressbar")).toHaveText("0%");
    await activityScrollNavigation.getByRole("button", { name: "Scroll columns right" }).click();
    await expect.poll(() => activityScrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await activityScrollNavigation.getByRole("button", { name: "Jump to last column" }).click();
    await expect(activityScrollNavigation.getByRole("progressbar")).toHaveText("100%");
    await expect(
      activityScrollNavigation.getByRole("button", { name: "Jump to last column" }),
    ).toBeDisabled();
    await activityScrollNavigation.getByRole("button", { name: "Jump to first column" }).click();
    await expect.poll(() => activityScrollport.evaluate((element) => element.scrollLeft)).toBe(0);
    await expect(activityScrollNavigation.getByRole("progressbar")).toHaveText("0%");
    const activityMetrics = await activityScrollport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(activityMetrics.scrollWidth).toBeGreaterThan(activityMetrics.clientWidth);
    expect(activityMetrics.overflowX).toBe("auto");
    expect(activityMetrics.scrollbarWidth).not.toBe("none");
    await activityScrollport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect.poll(() => activityScrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const activityViewportRect = await activityScrollport.boundingBox();
    const actionsHeaderRect = await activityScrollport.getByText("Actions", { exact: true }).boundingBox();
    expect(activityViewportRect).not.toBeNull();
    expect(actionsHeaderRect).not.toBeNull();
    expect(actionsHeaderRect!.x + actionsHeaderRect!.width).toBeLessThanOrEqual(
      activityViewportRect!.x + activityViewportRect!.width + 1,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "Activity log columns" })).toBeVisible();
    await expect(page.locator('[data-testid^="activity-row-"]').first()).toHaveAttribute(
      "data-density",
      "compact",
    );
    await expect(page.getByRole("columnheader", { name: "Duration" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Browser" })).toHaveCount(0);
    const persistedActivityHeaderOrder = await page
      .getByRole("columnheader")
      .allTextContents();
    expect(persistedActivityHeaderOrder.indexOf("Duration")).toBeLessThan(
      persistedActivityHeaderOrder.indexOf("Logout"),
    );
    await expectNoSeriousAccessibilityViolations(page, "Activity column preferences");

    await page.goto("/saved", { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-view-visual-import-1").click();

    const viewerScrollport = page.getByRole("region", { name: "Viewer data columns" });
    await expect(viewerScrollport).toBeVisible();
    const viewerScrollNavigation = page.getByRole("group", {
      name: "Viewer table column navigation",
    });
    await expect(viewerScrollNavigation).toBeVisible();
    await expect(
      viewerScrollNavigation.getByRole("button", { name: "Scroll columns left" }),
    ).toBeDisabled();
    await expect(viewerScrollNavigation.getByRole("progressbar")).toHaveText("0%");
    await viewerScrollNavigation.getByRole("button", { name: "Scroll columns right" }).click();
    await expect.poll(() => viewerScrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await viewerScrollNavigation.getByRole("button", { name: "Jump to last column" }).click();
    await expect(viewerScrollNavigation.getByRole("progressbar")).toHaveText("100%");
    await expect(
      viewerScrollNavigation.getByRole("button", { name: "Jump to last column" }),
    ).toBeDisabled();
    await viewerScrollNavigation.getByRole("button", { name: "Jump to first column" }).click();
    await expect.poll(() => viewerScrollport.evaluate((element) => element.scrollLeft)).toBe(0);
    await expect(viewerScrollNavigation.getByRole("progressbar")).toHaveText("0%");
    const viewerRow = viewerScrollport.locator("tbody tr").first();
    await expect(viewerRow).toBeVisible();
    const comfortableViewerHeight = (await viewerRow.boundingBox())?.height ?? 0;
    await page.getByTestId("viewer-density-compact").click();
    await expect(viewerRow).toHaveAttribute("data-density", "compact");
    const compactViewerHeight = (await viewerRow.boundingBox())?.height ?? 0;
    expect(compactViewerHeight).toBeLessThan(comfortableViewerHeight);

    await page.getByTestId("button-column-selector").click();
    await page.getByTestId("checkbox-column-Processing Notes").click();
    await page.getByRole("button", { name: "Move Last Updated At up" }).click();
    await page.keyboard.press("Escape");
    await expect(
      viewerScrollport.getByRole("columnheader", { name: "Processing Notes" }),
    ).toHaveCount(0);
    const viewerHeaderOrder = await viewerScrollport.getByRole("columnheader").allTextContents();
    expect(viewerHeaderOrder.indexOf("Last Updated At")).toBeLessThan(
      viewerHeaderOrder.indexOf("Created At"),
    );
    const viewerMetrics = await viewerScrollport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(viewerMetrics.scrollWidth).toBeGreaterThan(viewerMetrics.clientWidth);
    expect(viewerMetrics.overflowX).toBe("auto");
    expect(viewerMetrics.scrollbarWidth).not.toBe("none");
    await viewerScrollport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect.poll(() => viewerScrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect(
      viewerScrollport.getByRole("columnheader", { name: "Last Updated At" }),
    ).toBeInViewport();
    await page.goto("/saved", { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-view-visual-import-1").click();
    const persistedViewerScrollport = page.getByRole("region", { name: "Viewer data columns" });
    await expect(persistedViewerScrollport).toBeVisible();
    await expect(persistedViewerScrollport.locator("tbody tr").first()).toHaveAttribute(
      "data-density",
      "compact",
    );
    await expect(
      persistedViewerScrollport.getByRole("columnheader", { name: "Last Updated At" }),
    ).toBeVisible();
    await expect(
      persistedViewerScrollport.getByRole("columnheader", { name: "Processing Notes" }),
    ).toHaveCount(0);
    const persistedViewerHeaderOrder = await persistedViewerScrollport
      .getByRole("columnheader")
      .allTextContents();
    expect(persistedViewerHeaderOrder.indexOf("Last Updated At")).toBeLessThan(
      persistedViewerHeaderOrder.indexOf("Created At"),
    );
    await expectNoSeriousAccessibilityViolations(page, "Viewer column preferences");

    await page.goto("/import", { waitUntil: "domcontentloaded" });
    const importPreviewCsv = [
      visualViewerHeaders.join(","),
      visualViewerHeaders.map((header) => `${header} import preview`).join(","),
      visualViewerHeaders.map((header) => `${header} second row`).join(","),
    ].join("\n");
    await page.getByTestId("input-file").setInputFiles({
      buffer: Buffer.from(importPreviewCsv),
      mimeType: "text/csv",
      name: "visual-import-preview.csv",
    });
    await expect(page.getByRole("heading", { name: "Confirm column mapping" })).toBeVisible();
    await page.getByTestId("button-import-next").click();

    const importScrollport = page.getByRole("region", { name: "Import preview columns" });
    await expect(importScrollport).toBeVisible();
    const importScrollNavigation = page.getByRole("group", {
      name: "Import preview column navigation",
    });
    await expect(importScrollNavigation).toBeVisible();
    await expect(importScrollNavigation.getByRole("progressbar")).toHaveText("0%");
    await importScrollNavigation.getByRole("button", { name: "Jump to last column" }).click();
    await expect(importScrollNavigation.getByRole("progressbar")).toHaveText("100%");
    await expect.poll(() => importScrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const importMetrics = await importScrollport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(importMetrics.scrollWidth).toBeGreaterThan(importMetrics.clientWidth);
    expect(importMetrics.overflowX).toBe("auto");
    expect(importMetrics.scrollbarWidth).not.toBe("none");
    await importScrollNavigation.getByRole("button", { name: "Jump to first column" }).click();
    await expect.poll(() => importScrollport.evaluate((element) => element.scrollLeft)).toBe(0);
    await expectNoSeriousAccessibilityViolations(page, "Import preview table navigation");

    await page.goto("/general-search", { waitUntil: "domcontentloaded" });
    await page.getByTestId("input-search").fill("visual");
    await page.getByTestId("button-search").click();

    const searchScrollport = page.getByRole("region", {
      name: "General search result columns",
    });
    await expect(searchScrollport).toBeVisible();
    const searchScrollNavigation = page.getByRole("group", {
      name: "General search table column navigation",
    });
    await expect(searchScrollNavigation).toBeVisible();
    await expect(searchScrollNavigation.getByRole("progressbar")).toHaveText("0%");
    await searchScrollNavigation.getByRole("button", { name: "Jump to last column" }).click();
    await expect(searchScrollNavigation.getByRole("progressbar")).toHaveText("100%");
    await expect.poll(() => searchScrollport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const searchMetrics = await searchScrollport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(searchMetrics.scrollWidth).toBeGreaterThan(searchMetrics.clientWidth);
    expect(searchMetrics.overflowX).toBe("auto");
    expect(searchMetrics.scrollbarWidth).not.toBe("none");
    await searchScrollNavigation.getByRole("button", { name: "Jump to first column" }).click();
    await expect.poll(() => searchScrollport.evaluate((element) => element.scrollLeft)).toBe(0);
    await expectNoSeriousAccessibilityViolations(page, "General search table navigation");
  } finally {
    await logoutVisualSession(page);
  }
});

test("landing header keeps its brand readable on narrow and enlarged-text viewports", async ({ page }) => {
  await installTheme(page, "light");

  for (const viewport of [
    { fontSize: 16, height: 568, width: 320 },
    { fontSize: 20, height: 640, width: 360 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate((fontSize) => {
      document.documentElement.style.fontSize = `${fontSize}px`;
    }, viewport.fontSize);

    const brand = page.getByTestId("landing-brand-title");
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText("SQR System");

    const layout = await brand.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    await expect(page.getByRole("button", { name: "Log Masuk", exact: true })).toBeVisible();

    const skipLink = page.getByRole("link", { name: "Langkau ke kandungan utama" });
    const hiddenSkipLinkBox = await skipLink.boundingBox();
    expect(hiddenSkipLinkBox?.y).toBeLessThan(0);
    expect((hiddenSkipLinkBox?.y ?? 0) + (hiddenSkipLinkBox?.height ?? 0)).toBeLessThanOrEqual(0);

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await expect.poll(async () => (await skipLink.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    const focusedSkipLinkBox = await skipLink.boundingBox();
    expect(focusedSkipLinkBox?.y).toBeGreaterThanOrEqual(0);
    expect((focusedSkipLinkBox?.y ?? 0) + (focusedSkipLinkBox?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height,
    );
  }
});
