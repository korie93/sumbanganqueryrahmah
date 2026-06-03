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
const visualStabilizerPath = path.join(__dirname, "visual-regression.css");
const visualThemes: readonly VisualTheme[] = ["light", "dark"];
const visualUser = {
  email: "visual.admin@example.test",
  fullName: "Visual Admin",
  id: "visual-admin",
  isBanned: false,
  mustChangePassword: false,
  passwordResetBySuperuser: false,
  role: "superuser",
  sessionExpiresAt: "2036-01-01T00:00:00.000Z",
  status: "active",
  twoFactorEnabled: false,
  username: "visual-admin",
} as const;

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
        sessionExpiresAt: visualUser.sessionExpiresAt,
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
        sessionTimeoutMinutes: 30,
        systemName: "SQR Visual Baseline",
        viewerRowsPerPage: 100,
      });
    }

    if (pathname === "/api/settings/tab-visibility") {
      return jsonResponse(route, {
        role: visualUser.role,
        tabs: {},
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
          hasMore: false,
          limit: 1,
          nextCursor: null,
          pageSize: 1,
          mode: "cursor",
          total: 1,
        },
      });
    }

    if (pathname === "/api/analytics/summary") {
      return jsonResponse(route, {
        activeUsers: 18,
        todayLogins: 42,
        totalImports: 9,
        totalUsers: 128,
      });
    }

    if (pathname === "/api/analytics/login-trends") {
      return jsonResponse(route, [
        { date: "2026-01-09", count: 8 },
        { date: "2026-01-10", count: 12 },
        { date: "2026-01-11", count: 9 },
        { date: "2026-01-12", count: 15 },
        { date: "2026-01-13", count: 18 },
        { date: "2026-01-14", count: 14 },
        { date: "2026-01-15", count: 21 },
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
      return jsonResponse(route, [
        { hour: 9, count: 14 },
        { hour: 10, count: 18 },
        { hour: 15, count: 11 },
      ]);
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
