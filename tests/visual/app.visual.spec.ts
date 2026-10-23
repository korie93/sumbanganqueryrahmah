import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Route } from "@playwright/test";

type VisualTheme = "light" | "dark";
type VisualRole = "superuser" | "admin" | "user" | "manager";

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

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort());
});

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
    readySelector: '[data-testid="dashboard-login-command-bar"]',
  },
  {
    id: "sumbangan-form",
    path: "/collection/save",
    readySelector: "#save-collection-superuser-nickname",
  },
  {
    id: "admin-settings",
    path: "/settings",
    readySelector: "#setting-card-control-system_name",
  },
];

function buildVisualMasks(page: Page, theme: VisualTheme) {
  return {
    mask: [
      page.locator('[data-testid="button-user-menu"]'),
      page.locator('[data-testid="button-user-menu-mobile"]'),
      page.locator('[data-testid="badge-dashboard-freshness"]'),
    ],
    maskColor: theme === "dark" ? "#111827" : "#f8fafc",
  };
}

async function installTheme(page: Page, theme: VisualTheme) {
  // Keep fixture-relative dates stable without stopping timers or application loading.
  await page.clock.setFixedTime(new Date("2026-01-15T08:20:00.000Z"));
  await page.emulateMedia({
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  await page.addInitScript((nextTheme) => {
    localStorage.setItem("theme", nextTheme);
    const applyTheme = () => {
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
    };
    if (document.documentElement) applyTheme();
    document.addEventListener("DOMContentLoaded", applyTheme, { once: true });
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

function savedShellResponse(empty = false) {
  return {
    imports: empty ? [] : [{
      id: "visual-import-1", name: "Baseline Import", filename: "baseline-import.csv",
      createdAt: "2026-01-15T08:00:00.000Z", createdBy: visualUser.username,
      rowCount: 24, sourceSizeBytes: 2048, isDeleted: false,
    }],
    pagination: {
      hasNextPage: false, hasPreviousPage: false, limit: 20, mode: "offset",
      offset: 0, page: 1, pageSize: 20, total: empty ? 0 : 1, totalPages: 1,
    },
  };
}

function collectSavedRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function expectSavedControlsFit(page: Page, width: number) {
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
  await expectViewerDesign3DocumentFits(page);
  for (const id of ["input-search-saved", "button-refresh", "button-date-filter", "button-toggle-saved-advanced-filters", "select-saved-workspace-view"]) {
    const control = page.getByTestId(id);
    const box = await control.boundingBox();
    expect(box, `${id} has layout bounds`).not.toBeNull();
    expect(box!.x, `${id} left bound`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${id} right bound`).toBeLessThanOrEqual(width + 1);
    expect(box!.height, `${id} target height`).toBeGreaterThanOrEqual(width < 768 ? 44 : 36);
  }
}

for (const theme of visualThemes) {
  for (const width of [320, 390, 722, 1440]) {
    test(`saved compact shell ${theme} ${width}px retains search through loading and empty results`, async ({ page }, testInfo) => {
      const runtimeErrors = collectSavedRuntimeErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await installMockAuthenticatedSession(page, theme);
      let releaseSearch = () => {};
      const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
      let markSearchStarted = () => {};
      const searchStarted = new Promise<void>((resolve) => { markSearchStarted = resolve; });
      const requestedViews = new Set<string>();
      await page.route((url) => url.pathname === "/api/imports", async (route) => {
        expect(route.request().method()).toBe("GET");
        const params = new URL(route.request().url()).searchParams;
        requestedViews.add(params.get("view") || "all");
        if (params.get("search") === "no-match") {
          markSearchStarted();
          await searchGate;
        }
        return jsonResponse(route, savedShellResponse(Boolean(params.get("search") === "no-match"
          || params.get("createdBy") || params.get("view") === "duplicates")));
      });
      try {
        await page.goto("/saved", { waitUntil: "domcontentloaded" });
        const search = page.getByTestId("input-search-saved");
        await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
        await expect(page.getByTestId("text-import-count")).toHaveText("1 file");
        await expectSavedControlsFit(page, width);
        const categoryBox = (await page.getByTestId("select-saved-workspace-view").boundingBox())!;
        const totalsBox = (await page.getByRole("group", { name: "Loaded page totals", exact: true }).boundingBox())!;
        expect(Math.abs(categoryBox.y + categoryBox.height / 2 - totalsBox.y - totalsBox.height / 2)).toBeLessThan(1);
        await page.screenshot({ path: testInfo.outputPath("saved-initial-shell.png") });
        await page.getByTestId("button-toggle-saved-advanced-filters").click();
        const originalInput = await search.elementHandle();
        await search.fill("no-match");
        await searchStarted;
        await expect(page.getByTestId("saved-loading-skeleton")).toBeVisible();
        await expect(search).toBeVisible();
        await expect(search).toBeFocused();
        await expect(page.getByTestId("text-import-count")).toHaveCount(0);
        await expect(page.getByTestId("input-saved-uploader")).toBeVisible();
        await expectSavedControlsFit(page, width);
        expect(await originalInput!.evaluate((element) => element.isConnected)).toBe(true);
        releaseSearch();
        await expect(page.getByText("No matching files", { exact: true })).toBeVisible();
        await expect(search).toBeFocused();
        await expect(search).toHaveValue("no-match");
        await expect(page.getByTestId("text-import-count")).toHaveText("0 matching");
        expect(await originalInput!.evaluate((element) => element.isConnected)).toBe(true);
        await expectSavedControlsFit(page, width);
        await expectNoSeriousAccessibilityViolations(page, "Saved empty search controls");
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.screenshot({ path: testInfo.outputPath("saved-zero-results.png") });
        await page.getByTestId("button-clear-filters-empty").click();
        await expect(search).toBeFocused();
        await expect(search).toHaveValue("");
        await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
        const uploader = page.getByTestId("input-saved-uploader");
        await uploader.fill("missing-uploader");
        await expect(page.getByText("No matching files", { exact: true })).toBeVisible();
        await expect(uploader).toBeFocused();
        await expect(page.getByTestId("button-toggle-saved-advanced-filters")).toHaveAttribute("aria-expanded", "true");
        await page.getByTestId("button-clear-filters-empty").click();
        await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
        const workspaceView = page.getByRole("combobox", { name: "Saved workspace views", exact: true });
        await workspaceView.selectOption("duplicates");
        await expect(workspaceView).toHaveValue("duplicates");
        await expect(page.getByText("No files in this view", { exact: true })).toBeVisible();
        await expect(page.getByText("No saved data yet", { exact: true })).toHaveCount(0);
        await expect(search).toBeVisible();
        await page.getByTestId("button-show-all-saved").click();
        await expect(workspaceView).toHaveValue("all");
        await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
        for (const view of ["recent", "large", "review", "all"]) {
          await workspaceView.selectOption(view);
          await expect(workspaceView).toHaveValue(view);
          await expect.poll(() => requestedViews.has(view)).toBe(true);
          await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
        }
        await workspaceView.focus();
        await expect(workspaceView).toBeFocused();
        await page.getByTestId("button-toggle-saved-advanced-filters").click();
        await expectViewerDesign3DocumentFits(page);
        await expectNoSeriousAccessibilityViolations(page, "Saved compact controls");
        expect(runtimeErrors).toEqual([]);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.screenshot({ path: testInfo.outputPath("saved-compact-shell.png") });
      } finally {
        releaseSearch();
        await logoutVisualSession(page);
      }
    });
  }
}

test("saved compact shell recovers initial empty, failed and superseded requests", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installMockAuthenticatedSession(page, "light");
  let initialEmpty = true;
  let releaseOlder = () => {};
  const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
  let markOlderStarted = () => {};
  const olderStarted = new Promise<void>((resolve) => { markOlderStarted = resolve; });
  let markOlderSettled = () => {};
  const olderSettled = new Promise<void>((resolve) => { markOlderSettled = resolve; });
  await page.route((url) => url.pathname === "/api/imports", async (route) => {
    const search = new URL(route.request().url()).searchParams.get("search");
    if (search === "older") {
      markOlderStarted();
      await olderGate;
      try {
        return await jsonResponse(route, savedShellResponse(true));
      } finally {
        markOlderSettled();
      }
    }
    if (search === "failed") return jsonResponse(route, { message: "Synthetic imports unavailable" }, 500);
    return jsonResponse(route, savedShellResponse(initialEmpty));
  });
  try {
    await page.goto("/saved", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("button-import-new")).toBeVisible();
    const search = page.getByTestId("input-search-saved");
    await expect(search).toBeVisible();
    initialEmpty = false;
    await page.getByTestId("button-refresh").click();
    await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
    await search.fill("failed");
    await expect(page.getByRole("alert")).toContainText("Synthetic imports unavailable");
    await expect(page.getByText("No saved data yet", { exact: true })).toHaveCount(0);
    await expect(search).toBeFocused();
    await search.fill("older");
    await olderStarted;
    await expect(page.getByTestId("saved-loading-skeleton")).toBeVisible();
    const olderAborted = page.waitForEvent("requestfailed", {
      predicate: (request) => new URL(request.url()).searchParams.get("search") === "older",
    });
    await search.fill("latest");
    expect((await olderAborted).failure()?.errorText).toContain("ERR_ABORTED");
    await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
    releaseOlder();
    await olderSettled;
    // Let any already-scheduled browser/React work run after the older route
    // settles before asserting the newer result cannot be overwritten.
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(page.getByTestId("text-import-count")).toHaveText("1 matching");
    await expect(search).toHaveValue("latest");
    await expect(search).toBeFocused();
    await expect(page.getByText("No matching files", { exact: true })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally {
    releaseOlder();
    await logoutVisualSession(page);
  }
});

for (const role of ["admin", "user"] as const) {
  test(`saved compact shell preserves ${role} search access without superuser controls`, async ({ page }) => {
    const runtimeErrors = collectSavedRuntimeErrors(page);
    await installMockAuthenticatedSession(page, "light", role);
    await page.route("**/api/settings/tab-visibility", (route) => jsonResponse(route, {
      role, tabs: { home: true, saved: true, viewer: true },
    }));
    await page.route((url) => url.pathname === "/api/imports", (route) => jsonResponse(route, savedShellResponse()));
    try {
      await page.goto("/saved", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
      await expect(page.getByTestId("input-search-saved")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Select Baseline Import", exact: true })).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: "Select all visible imports", exact: true })).toHaveCount(0);
      await expect(page.getByTestId("button-bulk-delete")).toHaveCount(0);
      await expect(page.getByTestId("button-configure-source-visual-import-1")).toHaveCount(0);
      await page.getByTestId("button-import-actions-visual-import-1").click();
      await expect(page.getByTestId("button-inspect-visual-import-1")).toBeVisible();
      await expect(page.getByTestId("button-analysis-visual-import-1")).toBeVisible();
      await expect(page.getByTestId("button-rename-visual-import-1")).toHaveCount(0);
      await expect(page.getByTestId("button-delete-visual-import-1")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("button-import-actions-visual-import-1")).toBeFocused();
      expect(runtimeErrors).toEqual([]);
    } finally {
      await logoutVisualSession(page);
    }
  });
}

test("saved compact shell preserves large page totals without widening 320px layout", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await installMockAuthenticatedSession(page, "light");
  const response = savedShellResponse();
  await page.route((url) => url.pathname === "/api/imports", (route) => jsonResponse(route, {
    ...response,
    imports: [{ ...response.imports[0], rowCount: Number.MAX_SAFE_INTEGER, sourceSizeBytes: Number.MAX_SAFE_INTEGER }],
  }));
  try {
    await page.goto("/saved", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("button-view-visual-import-1")).toBeVisible();
    await expect(page.getByRole("group", { name: "Loaded page totals", exact: true }))
      .toContainText(Number.MAX_SAFE_INTEGER.toLocaleString());
    await expectSavedControlsFit(page, 320);
    await expectNoSeriousAccessibilityViolations(page, "Saved compact selector with large totals");
  } finally {
    await logoutVisualSession(page);
  }
});

for (const theme of visualThemes) {
  for (const width of [320, 390, 722, 1440]) {
    test(`saved mobile actions ${theme} ${width}px keep live AI clear of pagination`, async ({ page }, testInfo) => {
      const runtimeErrors = collectSavedRuntimeErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await installMockAuthenticatedSession(page, theme, "superuser", true);
      let releaseImports = () => {};
      const importsGate = new Promise<void>((resolve) => { releaseImports = resolve; });
      await page.route((url) => url.pathname === "/api/imports", async (route) => {
        expect(route.request().method()).toBe("GET");
        await importsGate;
        const params = new URL(route.request().url()).searchParams;
        if (params.get("search")) return jsonResponse(route, savedShellResponse(true));
        const currentPage = Number(params.get("page") || 1);
        const response = savedShellResponse();
        return jsonResponse(route, {
          ...response,
          pagination: { ...response.pagination, page: currentPage, offset: (currentPage - 1) * 20,
            total: 40, totalPages: 2, hasNextPage: currentPage < 2, hasPreviousPage: currentPage > 1 },
        });
      });
      await page.route("**/api/imports/visual-import-1/summary", (route) => jsonResponse(route, {
        import: savedShellResponse().imports[0], columns: ["Customer Name"], columnCount: 1,
      }));
      const trigger = page.getByTestId("floating-ai-toggle");
      const assertClear = async () => {
        await expect(trigger).toBeVisible();
        await expect.poll(() => trigger.evaluate((button) => {
          const a = button.getBoundingClientRect();
          return Array.from(document.querySelectorAll(
            ".saved-workspace [data-floating-ai-avoid='true'], .saved-workspace [data-saved-ai-avoid='true'], .saved-workspace button",
          )).every((element) => {
            const b = element.getBoundingClientRect();
            return Math.min(a.right, b.right) <= Math.max(a.left, b.left)
              || Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top);
          });
        })).toBe(true);
      };
      try {
        await page.goto("/saved", { waitUntil: "domcontentloaded" });
        // AI mounts while imports are still pending: the stable Saved root must
        // resync newly rendered pagination without a body-wide observer.
        await expect(trigger).toBeVisible();
        releaseImports();
        const view = page.getByTestId("button-view-visual-import-1");
        const source = page.getByTestId("button-configure-source-visual-import-1");
        await expect(view).toBeVisible();
        await expect(source).toBeEnabled();
        if (width < 768) {
          const sourceBox = (await source.boundingBox())!;
          const viewBox = (await view.boundingBox())!;
          const sourceCell = (await source.locator("xpath=ancestor::td").boundingBox())!;
          const actionsCell = (await view.locator("xpath=ancestor::td").boundingBox())!;
          const moreBox = (await page.getByTestId("button-import-actions-visual-import-1").boundingBox())!;
          expect(sourceBox.y + sourceBox.height).toBeLessThanOrEqual(viewBox.y);
          expect(sourceCell.width).toBeGreaterThan(200);
          expect(Math.abs(sourceCell.width - actionsCell.width)).toBeLessThan(1);
          expect(viewBox.width).toBeGreaterThan(140);
          expect(moreBox.height).toBeGreaterThanOrEqual(44);
          expect(moreBox.width).toBeGreaterThanOrEqual(44);
          expect(Math.abs(moreBox.y - viewBox.y)).toBeLessThan(1);
          await assertClear();
          const selectFile = page.getByRole("checkbox", { name: "Select Baseline Import", exact: true });
          const checkDetailsFocus = async () => {
            // Selection survives closing Details. Re-select deliberately rather
            // than expecting an uncheck to reopen the sheet.
            if (await selectFile.getAttribute("aria-checked") === "true") {
              await selectFile.click();
              await expect(selectFile).toHaveAttribute("aria-checked", "false");
            }
            await selectFile.click();
            const drawer = page.getByTestId("saved-import-detail-drawer");
            await expect(drawer).toBeVisible();
            await expect(drawer.getByText("Customer Name", { exact: true })).toBeVisible();
            await expect(trigger).toBeHidden();
            await page.keyboard.press("Escape");
            await expect(drawer).toHaveCount(0);
            await expect(selectFile).toBeFocused();
            await assertClear();
          };
          // Also covers a portal opening before any scroll or AI-panel activity.
          await checkDetailsFocus();
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await assertClear();
          const next = page.getByRole("button", { name: "Next", exact: true });
          await next.focus();
          await assertClear();
          await page.keyboard.press("Enter");
          await expect(page.getByText("Page 2 / 2", { exact: true })).toBeVisible();
          await assertClear();
          await page.getByRole("button", { name: "Prev", exact: true }).click();
          await expect(page.getByText("Page 1 / 2", { exact: true })).toBeVisible();
          await page.getByTestId("button-toggle-files").click();
          await assertClear();
          await page.getByTestId("button-toggle-files").click();
          await expect(view).toBeVisible();
          await assertClear();
          await page.getByTestId("button-toggle-saved-advanced-filters").click();
          await assertClear();
          await page.getByTestId("button-toggle-saved-advanced-filters").click();
          await trigger.click();
          const aiDialog = page.locator("[data-floating-ai-dialog='true']");
          await expect(aiDialog).toBeVisible();
          await expect(aiDialog).toHaveAttribute("aria-modal", "true");
          await aiDialog.getByRole("button", { name: "Kecilkan panel AI SQR Visual Baseline", exact: true }).click();
          await expect(aiDialog).toHaveCount(0);
          await assertClear();
          // The Details sheet is portalled and may not resize the Saved root.
          // Its focus lifecycle must still hide and restore the idle launcher.
          await checkDetailsFocus();
        } else {
          const sourceBox = (await source.boundingBox())!;
          const viewBox = (await view.boundingBox())!;
          expect(Math.abs(sourceBox.y - viewBox.y)).toBeLessThan(8);
          expect(await trigger.evaluate((element) => element.parentElement?.style.getPropertyValue("--floating-ai-trigger-bottom"))).toBe("");
        }
        await expectViewerDesign3DocumentFits(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        if (width < 768) await assertClear();
        await page.screenshot({ path: testInfo.outputPath("saved-live-ai.png"), fullPage: true });
        await expectNoSeriousAccessibilityViolations(page, "Saved with live AI launcher");
        expect(runtimeErrors).toEqual([]);
      } finally {
        releaseImports();
        await logoutVisualSession(page);
      }
    });
  }
}

async function installMockPublicApi(page: Page) {
  // Public snapshots never need a live session or backend state.
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/health/connectivity" && route.request().method() === "GET") return route.fulfill({
      status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" },
    });
    if (pathname === "/api/health" && route.request().method() === "GET") {
      return jsonResponse(route, { status: "ok", ready: true });
    }
    return jsonResponse(route, { ok: false, message: "Unauthenticated visual fixture" },
      pathname === "/api/me" ? 401 : 404);
  });
}

async function installMockAuthenticatedApi(page: Page, role: VisualRole = "superuser") {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/api/health/connectivity" && request.method() === "GET") return route.fulfill({
      status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" },
    });

    if (pathname === "/api/me") {
      return jsonResponse(route, {
        ok: true,
        sessionExpiresAt: visualSessionExpiresAt,
        user: { ...visualUser, role },
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
        role,
        tabs: role === "superuser" ? {} : { home: true, "collection-report": true },
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

    if (pathname === "/api/collection/nickname-auth/session") {
      return jsonResponse(route, {
        ok: true,
        nickname: { id: "visual-nickname-1", nickname: "Collector Alpha" },
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
            createdBy: visualUser.id,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        ok: true,
      });
    }

    if (pathname === "/api/collection/summary") {
      return jsonResponse(route, {
        ok: true,
        year: 2026,
        summary: [{ month: 1, monthName: "January", totalRecords: 0, totalAmount: 0 }],
        dashboard: { month: 1, scopeLabel: "All Collection records", canViewLeaderBreakdown: true,
          leaders: [], unassignedAmount: 0 },
      });
    }

    if (pathname === "/api/activity/retention") {
      return jsonResponse(route, {
        ok: true, success: true,
        retention: {
          policy: { autoCleanupEnabled: true, batchSize: 500, securityRetentionDays: 365, standardRetentionDays: 90 },
          preview: { protectedActiveBanCount: 0, securityEligibleCount: 0, standardEligibleCount: 0, totalEligibleCount: 0 },
          securityCutoff: "2025-01-15T08:20:00.000Z", standardCutoff: "2025-10-17T08:20:00.000Z",
        },
      });
    }

    if (pathname === "/api/collection/list") {
      return jsonResponse(route, {
        ok: true, records: [], total: 0, totalAmount: 0,
        page: 1, pageSize: 20, limit: 20, offset: 0, nextCursor: null,
        pagination: { mode: "hybrid", page: 1, pageSize: 20, limit: 20,
          offset: 0, total: 0, totalPages: 1, nextCursor: null,
          hasNextPage: false, hasPreviousPage: false },
      });
    }
    if (pathname === "/api/collection/source-files") {
      return jsonResponse(route, { ok: true, sourceFiles: [], pagination: { limit: 50, total: 0, nextCursor: null } });
    }
    if (pathname === "/api/collection/source-configs") {
      return jsonResponse(route, { ok: true, sourceConfigs: [] });
    }
    if (pathname === "/api/collection/purge-summary") {
      return jsonResponse(route, {
        ok: true, retentionMonths: 6, cutoffDate: "2025-07-15", eligibleRecords: 0, totalAmount: 0,
      });
    }
    if (pathname === "/api/collection/teams") {
      return jsonResponse(route, { ok: true, teams: [] });
    }
    if (pathname === "/api/collection/report/billing-principal/saved-targets") {
      return jsonResponse(route, { ok: true, targets: [], page: 1, pageSize: 20, hasMore: false });
    }
    if (pathname === "/api/analyze/all") {
      return jsonResponse(route, {
        totalImports: 1, totalRows: 0,
        imports: [{ id: "visual-import-1", name: "Baseline Import", filename: "baseline-import.csv", rowCount: 0 }],
        analysis: {
          icLelaki: { count: 0, samples: [] }, icPerempuan: { count: 0, samples: [] },
          noPolis: { count: 0, samples: [] }, noTentera: { count: 0, samples: [] },
          passportMY: { count: 0, samples: [] }, passportLuarNegara: { count: 0, samples: [] },
          duplicates: { count: 0, items: [] }, columns: [],
          quality: { score: 0, grade: "no_data", completenessPercent: 0, typeConsistencyPercent: 0,
            profiledColumns: 0, columnsNeedingReview: 0, columnsWithMissingValues: 0, mixedTypeColumns: 0,
            limitedCardinalityColumns: 0, totalApplicableCells: 0, populatedCells: 0, emptyCells: 0, columnLimitReached: false },
        },
      });
    }
    if (pathname === "/api/admin/users") {
      return jsonResponse(route, { ok: true, users: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } });
    }
    if (pathname === "/api/admin/password-reset-requests") {
      return jsonResponse(route, { ok: true, requests: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } });
    }
    if (pathname === "/api/admin/dev-mail-outbox") {
      return jsonResponse(route, { ok: true, enabled: false, previews: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } });
    }

    if (request.method() === "POST" && pathname === "/api/activity/logout") {
      return jsonResponse(route, { ok: true });
    }

    return jsonResponse(route, { ok: true });
  });
}

async function installMockAuthenticatedSession(page: Page, theme: VisualTheme, role: VisualRole = "superuser", keepFloatingAi = false) {
  await installTheme(page, theme);
  await installMockAuthenticatedApi(page, role);
  await page.addInitScript(({ nextTheme, user, keepFloatingAi }) => {
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
    if (keepFloatingAi) return;
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
  }, { nextTheme: theme, user: { ...visualUser, role }, keepFloatingAi });
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
  });
  if (route.id === "sumbangan-form") {
    // A superuser must explicitly select a nickname before the real form exists.
    await page.locator(route.readySelector).click();
    await page.getByRole("button", { name: "Collector Alpha", exact: true }).click();
    await expect(page.locator("#save-collection-customer-name")).toBeVisible();
    await expect(page.locator(route.readySelector)).toContainText("Collector Alpha");
  }
  if (route.id === "admin-settings") {
    await expect(page.locator(route.readySelector)).toHaveValue("SQR Visual Baseline");
  }
  await page.evaluate(() => document.fonts.ready);
}

async function expectVisualBaseline(page: Page, name: string, theme: VisualTheme) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark")))
    .toBe(theme === "dark");
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
  // Keep every route in the theme reviewable after a visual mismatch. Soft
  // assertions still fail the test; they only avoid hiding later page diffs.
  await expect.soft(page).toHaveScreenshot(`${name}-${theme}.png`, {
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
    await installMockPublicApi(page);
    await navigateForSnapshot(page, publicRoutes[0]);
    await expectVisualBaseline(page, "login", theme);
  });
}

test.describe("authenticated key page baselines", () => {
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

test("V17 auth changes preserve authenticated module shells", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installMockAuthenticatedSession(page, "light");
  const modules: VisualRouteSpec[] = [
    { id: "home", path: "/", readySelector: '[data-testid="home-dashboard"] [data-testid="collection-overview"][data-state="empty"]' },
    { id: "general-search", path: "/general-search", readySelector: "[data-testid='input-search']" },
    { id: "collection-records", path: "/collection/records", readySelector: "[data-testid='collection-records-page']" },
    { id: "billing", path: "/collection/billing-principal", readySelector: "[data-testid='billing-principal-page'][data-state='empty']" },
    { id: "analysis", path: "/monitor?section=analysis", readySelector: "[data-testid='text-analysis-title']" },
    { id: "activity", path: "/monitor?section=activity", readySelector: "[data-testid^='activity-row-']" },
    { id: "accounts", path: "/settings?section=account-management", readySelector: "[data-testid='account-management-workspace'] [aria-label='Account health summary']" },
  ];
  try {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const module of modules) {
        await navigateForSnapshot(page, module);
        await expect(page.locator(".auth-v17")).toHaveCount(0);
        await expect(page.getByTestId("input-password")).toHaveCount(0);
        await expect(page.locator("main#main-content")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${module.id}/${width}: no document-level horizontal overflow`).toBe(true);
        await expect(page.getByText(/API contract mismatch|Something went wrong|Analysis unavailable/)).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath(`${module.id}-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
    expect(pageErrors).toEqual([]);
  } finally {
    await logoutVisualSession(page);
  }
});

test.describe("Collection layout polish", () => {
  for (const theme of visualThemes) {
    for (const width of [320, 390, 768, 1280, 1920]) {
      test(`${theme} at ${width}px keeps forms bounded and filters reachable`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") pageErrors.push(message.text());
        });
        await page.setViewportSize({ width, height: 900 });
        await installMockAuthenticatedSession(page, theme);
        await navigateForSnapshot(page, authenticatedRoutes[1]);
        const frame = page.locator(".collection-report-frame");
        await expect(frame).toHaveCSS("max-width", "1480px");
        await expect(frame).toHaveCSS("gap", "16px");
        const saveWidth = (await frame.boundingBox())!.width;
        expect(saveWidth).toBeLessThanOrEqual(1480);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.locator("#save-collection-customer-name").fill("Layout Test Customer");
        await page.locator("#save-collection-customer-name").blur();
        await page.getByRole("button", { name: "Reset Form", exact: true }).click();
        const resetConfirmation = page.getByRole("alertdialog", { name: "Kosongkan borang?" });
        await expect(resetConfirmation).toBeVisible();
        await resetConfirmation.getByRole("button", { name: "Kosongkan Borang", exact: true }).click();
        await expect(resetConfirmation).toBeHidden();
        await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
        await page.screenshot({ path: test.info().outputPath("save.png"), fullPage: true, animations: "disabled" });

        await navigateForSnapshot(page, {
          id: "collection-records", path: "/collection/records", readySelector: "[data-testid='collection-records-page']",
        });
        await expect(frame).toHaveCSS("max-width", "1480px");
        expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(1480);
        expect((await frame.boundingBox())!.width).toBe(saveWidth);
        const filterToggle = page.getByTestId("collection-records-filter-toggle");
        const search = page.locator(width < 768 ? "#collection-records-search-mobile" : "#collection-records-search");
        await expect(search).toBeVisible();
        await expect(page.getByTestId("collection-records-from-date")).not.toBeVisible();
        await filterToggle.click();
        if (width >= 1280) {
          const dateWidth = (await page.getByTestId("collection-records-from-date").boundingBox())!.width;
          expect((await search.boundingBox())!.width).toBeGreaterThan(dateWidth);
        }
        if (width >= 768) {
          const actions = page.getByTestId("collection-records-filter-actions");
          await expect(actions.getByRole("button")).toHaveCount(2);
          const filterBox = (await actions.getByRole("button", { name: "Filter", exact: true }).boundingBox())!;
          const resetBox = (await actions.getByRole("button", { name: "Reset", exact: true }).boundingBox())!;
          expect(Math.abs(filterBox.y - resetBox.y)).toBeLessThanOrEqual(1);
        }
        const clippedControls = await page.locator(width < 768 ? '[role="dialog"]' : ".collection-report-frame").evaluate((root) =>
          [...root.querySelectorAll("button, input, select")].filter((node) => {
            // Offscreen buttons inside the intentional horizontal strip stay
            // keyboard/scroll reachable; they must not widen the document.
            if (node.closest(".collection-section-nav")) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
          }).map((node) => node.id || node.textContent?.trim()),
        );
        expect(clippedControls).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.getByRole("button", { name: "Filter", exact: true }).click();
        await expect(page.getByTestId("collection-records-from-date")).not.toBeVisible();
        const cardNo = "00009007199254740993";
        const searched = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/collection/list" && url.searchParams.get("search") === cardNo;
        });
        await search.fill(cardNo);
        await searched;
        await expect(search).toHaveValue(cardNo);
        await filterToggle.click();
        await page.getByRole("button", { name: "Reset", exact: true }).click();
        if (width < 768) await expect(page.getByRole("dialog", { name: "Penapis rekod", exact: true })).toHaveCount(0);
        await expect(search).toHaveValue("");
        await page.screenshot({ path: test.info().outputPath("records.png"), fullPage: true, animations: "disabled" });
        expect(pageErrors).toEqual([]);
      });
    }
  }

  for (const role of ["admin", "user", "manager"] as const) {
    test(`${role} retains its save and filter permissions`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await installMockAuthenticatedSession(page, "light", role);
      await page.goto("/collection/save");
      const frame = page.locator(".collection-report-frame");
      if (role === "manager") {
        await expect(page.getByTestId("collection-records-page")).toBeVisible();
        await expect(frame).toHaveCSS("max-width", "1480px");
        await expect(page.locator("#save-collection-customer-name")).toHaveCount(0);
      } else {
        await expect(page.locator("#save-collection-customer-name")).toBeVisible();
        await expect(frame).toHaveCSS("max-width", "1480px");
        await page.getByRole("navigation", { name: "Collection sections", exact: true })
          .getByRole("button", { name: "View Rekod Collection", exact: true }).click();
        await expect(page.getByTestId("collection-records-page")).toBeVisible();
        await expect(frame).toHaveCSS("max-width", "1480px");
      }
      await expect(page.locator("#collection-records-search")).toBeVisible();
      await page.getByTestId("collection-records-filter-toggle").click();
      await expect(page.locator("#collection-records-nickname-filter")).toHaveCount(role === "user" ? 0 : 1);
      await expect(page.locator("#collection-records-leader-desktop")).toHaveCount(role === "manager" ? 1 : 0);
      await expect(page.getByTestId("collection-records-filter-actions").getByRole("button")).toHaveCount(2);
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
          fontSize: getComputedStyle(documentElement).fontSize,
          overflowingElements: [...document.querySelectorAll("main *")]
            .filter((node): node is HTMLElement => node instanceof HTMLElement)
            .filter((node) => node.getBoundingClientRect().right > documentElement.clientWidth + 1)
            .slice(0, 16)
            .map((node) => ({ tag: node.tagName, className: node.className,
              right: Math.round(node.getBoundingClientRect().right),
              width: Math.round(node.getBoundingClientRect().width) })),
          clippedDashboardActions,
          dashboardRight: dashboardRect?.right ?? Number.POSITIVE_INFINITY,
          documentClientWidth: documentElement.clientWidth,
          documentScrollWidth: documentElement.scrollWidth,
        };
      });

      expect(dashboardLayout.documentScrollWidth, JSON.stringify(dashboardLayout)).toBeLessThanOrEqual(
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
  await installMockPublicApi(page);

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
    await expect(brand).toHaveAccessibleName("SQR — home");
    await expect(brand.locator("img")).toHaveAttribute("src", "/brand/sqr-full-logo-light.svg");
    await expect.poll(() => brand.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

    const layout = await brand.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Sign In", exact: true })).toBeVisible();

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

// Viewer design 3 fixtures are deliberately local, read-only and independent of
// the existing baseline datasets. They exercise the real Saved -> Viewer flow.
const viewerDesign3Headers = [
  "Customer Name", "Reference", "Account Number", "Card Number", "Phone",
  "Email", "Region", "Amount (RM)", "Payment Date", "Notes",
] as const;
const viewerDesign3Account = "00001234567890123456";
const viewerDesign3Card = "00009007199254740993";
const viewerDesign3Note = "  First line\nSecond <script>example only</script> line  ";

async function installViewerDesign3Fixture(page: Page, rowCount = 24, role: VisualRole = "superuser") {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    id: `viewer-design3-row-${index + 1}`,
    importId: "visual-import-1",
    jsonDataJsonb: {
      "Customer Name": `Synthetic Customer ${String(index + 1).padStart(2, "0")}`,
      Reference: `SYN-${String(index + 1).padStart(5, "0")}`,
      "Account Number": index === 0 ? viewerDesign3Account : `00001234567890${String(index).padStart(6, "0")}`,
      "Card Number": index === 0 ? viewerDesign3Card : `00009007199254${String(index).padStart(6, "0")}`,
      Phone: "0123456789",
      Email: `synthetic.${index + 1}@example.test`,
      Region: index % 2 === 0 ? "Central" : "Northern",
      "Amount (RM)": index === 0 ? "00005000.00" : `${index + 1}.00`,
      "Payment Date": "2026-01-15",
      Notes: index === 0 ? viewerDesign3Note : `Synthetic record ${index + 1} — no production data`,
    },
  }));

  if (role !== "superuser") {
    // Only grant configurable access to roles that already support Viewer;
    // manager remains excluded by the shared role contract.
    expect(["admin", "user"]).toContain(role);
    await page.route("**/api/settings/tab-visibility", (route) => jsonResponse(route, {
      role, tabs: { home: true, saved: true, viewer: true, "collection-report": true },
    }));
  }

  if (rowCount > 100) {
    await page.route("**/api/app-config", (route) => jsonResponse(route, {
      aiEnabled: true,
      aiTimeoutMs: 30_000,
      heartbeatIntervalMinutes: 1,
      importUploadLimitBytes: 10 * 1024 * 1024,
      searchResultLimit: 250,
      semanticSearchEnabled: true,
      sessionTimeoutMinutes: 30,
      systemName: "SQR Visual Baseline",
      viewerRowsPerPage: 200,
      wsIdleMinutes: 10,
    }));
  }

  await page.route((url) => url.pathname === "/api/imports", (route) => jsonResponse(route, {
    imports: [{
      createdAt: "2026-01-15T08:00:00.000Z", createdBy: visualUser.username,
      filename: "baseline-import.csv", id: "visual-import-1", isDeleted: false,
      name: "Baseline Import", rowCount,
    }],
    pagination: {
      hasNextPage: false, hasPreviousPage: false, limit: 20, mode: "offset",
      offset: 0, page: 1, pageSize: 20, total: 1, totalPages: 1,
    },
  }));

  await page.route("**/api/imports/visual-import-1/data*", (route) => {
    expect(route.request().method()).toBe("GET");
    const url = new URL(route.request().url());
    const query = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    let filters: Array<{ column: string; operator: string; value: string }> = [];
    try {
      const candidate: unknown = JSON.parse(url.searchParams.get("columnFilters") ?? "[]");
      if (Array.isArray(candidate)) filters = candidate.filter((filter): filter is { column: string; operator: string; value: string } =>
        Boolean(filter) && typeof filter === "object" && typeof filter.column === "string"
        && typeof filter.operator === "string" && typeof filter.value === "string");
    } catch {
      return jsonResponse(route, { ok: false, message: "Invalid synthetic filter" }, 400);
    }
    const matches = rows.filter((row) => {
      const values: Record<string, string> = row.jsonDataJsonb;
      if (query && !Object.values(values).some((value) => value.toLowerCase().includes(query))) return false;
      return filters.every((filter) => {
        const value = String(values[filter.column] ?? "").toLowerCase();
        const expected = filter.value.toLowerCase();
        if (filter.operator === "equals") return value === expected;
        if (filter.operator === "startsWith") return value.startsWith(expected);
        if (filter.operator === "endsWith") return value.endsWith(expected);
        if (filter.operator === "notEquals") return value !== expected;
        return value.includes(expected);
      });
    });
    const pageSize = Math.min(500, Math.max(10, Number.parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100));
    const currentPage = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const cursorOffset = Number.parseInt((url.searchParams.get("cursor") ?? "").replace(/^viewer-design3:/, ""), 10);
    const offset = Number.isFinite(cursorOffset) && cursorOffset >= 0 ? cursorOffset : (currentPage - 1) * pageSize;
    const pageRows = matches.slice(offset, offset + pageSize);
    const hasNextPage = offset + pageRows.length < matches.length;
    const nextCursor = hasNextPage ? `viewer-design3:${offset + pageRows.length}` : null;
    return jsonResponse(route, {
      headers: viewerDesign3Headers, rows: pageRows, total: matches.length,
      page: currentPage, pageSize, limit: pageSize, offset, nextCursor,
      pagination: {
        hasNextPage, hasPreviousPage: currentPage > 1, limit: pageSize, mode: "hybrid",
        nextCursor, offset, page: currentPage, pageSize, total: matches.length,
        totalPages: Math.max(1, Math.ceil(matches.length / pageSize)),
      },
    });
  });
}

async function openViewerDesign3(page: Page) {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await page.getByTestId("button-view-visual-import-1").click();
  await expect(page).toHaveURL(/\/viewer(?:[?#]|$)/);
  await expect(page.getByRole("heading", { name: "Baseline Import", exact: true })).toHaveCount(1);
  await expect(page.getByTestId("input-search-viewer")).toBeVisible();
  await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();
}

async function expectViewerDesign3DocumentFits(page: Page) {
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const theme of visualThemes) {
  for (const width of [320, 390, 768, 1440]) {
    test(`viewer design3 ${theme} ${width}px keeps search recovery, independent details and responsive controls`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await installMockAuthenticatedSession(page, theme);
      await installViewerDesign3Fixture(page);
      try {
        await openViewerDesign3(page);
        await expect(page.getByRole("heading", { name: "Dataset rows", exact: true })).toHaveCount(0);
        await expectViewerDesign3DocumentFits(page);
        const search = page.getByRole("searchbox", { name: "Search all rows", exact: true });
        const searchElement = await search.elementHandle();
        expect(searchElement).not.toBeNull();

        await search.fill("zzznomatch");
        await expect(page.getByTestId("viewer-empty-state")).toContainText("Tiada hasil carian");
        await expect(page.getByTestId("viewer-empty-state")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(page.getByTestId("viewer-empty-state")).toHaveCSS("background-image", "none");
        await expect(search).toBeFocused();
        expect(await searchElement!.evaluate((element) => element.isConnected)).toBe(true);
        await expect(page.getByTestId("button-toggle-filters")).toBeVisible();
        await expect(page.getByTestId("button-column-selector")).toBeVisible();
        await expect(page.locator(".viewer-search-controls [role='status']")).toContainText("0 hasil");
        await page.getByRole("button", { name: "Kosongkan carian dan filter", exact: true }).click();
        await expect(search).toBeFocused();
        await expect(search).toHaveValue("");
        await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();
        await expect(page.locator(".viewer-search-controls [role='status']")).toContainText("24 hasil");

        await search.fill("z");
        await expect(page.getByTestId("viewer-empty-state")).toContainText("Teruskan menaip");
        await expect(page.getByTestId("viewer-empty-state")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(search).toBeFocused();
        expect(await searchElement!.evaluate((element) => element.isConnected)).toBe(true);
        await page.getByRole("button", { name: "Clear search", exact: true }).click();
        await expect(search).toBeFocused();
        await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();

        const columns = page.getByTestId("button-column-selector");
        await columns.click();
        if (width < 768) await expect(page.getByRole("dialog", { name: "Select Columns", exact: true })).toBeVisible();
        await page.getByTestId("checkbox-column-Notes").click();
        await page.keyboard.press("Escape");
        await expect(columns).toBeFocused();

        const selection = page.getByRole("checkbox", { name: "Select row 1", exact: true });
        await selection.click();
        await expect(selection).toHaveAttribute("aria-checked", "true");
        const detailsButton = page.getByTestId("button-viewer-row-details-0");
        await detailsButton.focus();
        await page.keyboard.press("Enter");
        const details = page.getByRole("dialog", { name: "Synthetic Customer 01", exact: true });
        await expect(details).toBeVisible();
        await expect(details.getByText(viewerDesign3Account, { exact: true })).toBeVisible();
        await expect(details.getByText(viewerDesign3Card, { exact: true })).toBeVisible();
        await expect(details.getByText("00005000.00", { exact: true })).toBeVisible();
        expect(await details.locator("dd").filter({ hasText: "<script>example only</script>" }).textContent()).toBe(viewerDesign3Note);
        await expect(details.locator("script")).toHaveCount(0);
        await expect(details.getByRole("button", { name: /edit|delete|save/i })).toHaveCount(0);
        await expectViewerDesign3DocumentFits(page);
        await expectNoSeriousAccessibilityViolations(page, `Viewer design3 ${theme} ${width}px details`);
        await page.keyboard.press("Escape");
        await expect(details).toHaveCount(0);
        await expect(detailsButton).toBeFocused();
        await expect(selection).toHaveAttribute("aria-checked", "true");
        await expect(page.getByTestId("button-clear-selection")).toBeVisible();
        await expectViewerDesign3DocumentFits(page);
      } finally {
        await logoutVisualSession(page);
      }
    });
  }
}

test("viewer design3 column-filter zero results retain live search and recover all rows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockAuthenticatedSession(page, "light");
  await installViewerDesign3Fixture(page);
  try {
    await openViewerDesign3(page);
    await page.getByTestId("button-toggle-filters").click();
    await page.getByTestId("button-add-filter").click();
    await page.getByTestId("input-filter-value-0").fill("zzznomatch");
    await expect(page.getByTestId("viewer-empty-state")).toContainText("Tiada hasil carian");
    await expect(page.getByTestId("input-search-viewer")).toBeVisible();
    await expect(page.getByTestId("button-toggle-filters")).toBeVisible();
    await page.getByRole("button", { name: "Kosongkan carian dan filter", exact: true }).click();
    await expect(page.getByTestId("input-search-viewer")).toBeFocused();
    await expect(page.getByTestId("input-filter-value-0")).toHaveCount(0);
    await expect(page.locator(".viewer-search-controls [role='status']")).toContainText("24 hasil");
    await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();
  } finally {
    await logoutVisualSession(page);
  }
});

for (const role of ["superuser", "admin", "user"] as const) {
  test(`viewer design3 ${role} More menu preserves export permission and keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installMockAuthenticatedSession(page, "light", role);
    await installViewerDesign3Fixture(page, 24, role);
    try {
      await openViewerDesign3(page);
      const more = page.getByTestId("button-viewer-more-actions");
      await more.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("button-clear-all")).toBeVisible();
      const exporter = page.getByTestId("button-export-menu");
      if (role === "superuser") {
        await expect(exporter).toBeVisible();
        await exporter.focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByTestId("button-export-csv-all")).toBeVisible();
        await page.keyboard.press("Escape");
      } else {
        await expect(exporter).toHaveCount(0);
        await expect(page.locator('[data-testid^="button-export-"]')).toHaveCount(0);
      }
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(more).toBeFocused();
      await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();
    } finally {
      await logoutVisualSession(page);
    }
  });
}

test("viewer design3 virtualized 150-row dataset keeps details, exact values and independent selection", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installMockAuthenticatedSession(page, "dark");
  await installViewerDesign3Fixture(page, 150);
  try {
    await openViewerDesign3(page);
    await expect(page.locator(".viewer-search-controls [role='status']")).toContainText("150 hasil");
    const scrollport = page.getByRole("region", { name: "Viewer data columns", exact: true });
    await expect(scrollport.locator("table")).toHaveCount(0);
    const renderedRows = await scrollport.locator('[aria-label^="Viewer row "]').count();
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(150);
    await expect(page.getByRole("checkbox", { name: "Select row 150", exact: true })).toHaveCount(0);

    const firstDetails = page.getByTestId("button-viewer-row-details-0");
    await firstDetails.click();
    const firstDialog = page.getByRole("dialog", { name: "Synthetic Customer 01", exact: true });
    await expect(firstDialog.getByText(viewerDesign3Account, { exact: true })).toBeVisible();
    await expect(firstDialog.getByText(viewerDesign3Card, { exact: true })).toBeVisible();
    expect(await firstDialog.locator("dd").filter({ hasText: "<script>example only</script>" }).textContent()).toBe(viewerDesign3Note);
    await page.keyboard.press("Escape");
    await expect(firstDetails).toBeFocused();
    await expect(page.getByRole("checkbox", { name: "Select row 1", exact: true })).toHaveAttribute("aria-checked", "false");

    const windowedViewport = scrollport.locator(".ops-data-table > div").last();
    await windowedViewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const lastSelection = page.getByRole("checkbox", { name: "Select row 150", exact: true });
    await expect(lastSelection).toBeVisible();
    await lastSelection.click();
    await expect(lastSelection).toHaveAttribute("aria-checked", "true");
    const lastDetails = page.getByTestId("button-viewer-row-details-149");
    await lastDetails.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Synthetic Customer 150", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(lastDetails).toBeFocused();
    await expect(lastSelection).toHaveAttribute("aria-checked", "true");
    await expectViewerDesign3DocumentFits(page);
    await expectNoSeriousAccessibilityViolations(page, "Viewer design3 virtualized table");
  } finally {
    await logoutVisualSession(page);
  }
});

test("viewer design3 delayed refinement announces loading without losing the search or existing rows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockAuthenticatedSession(page, "light");
  await installViewerDesign3Fixture(page);
  let releaseResponse: () => void = () => undefined;
  const responseReleased = new Promise<void>((resolve) => { releaseResponse = resolve; });
  let requestHeld = false;
  let heldRouteWork = Promise.resolve();
  const routePattern = "**/api/imports/visual-import-1/data*";
  const delayedSearchRoute = async (route: Route) => {
    if (new URL(route.request().url()).searchParams.get("search") !== "delayed-demo") {
      await route.fallback();
      return;
    }
    requestHeld = true;
    heldRouteWork = (async () => {
      await responseReleased;
      await route.fallback();
    })();
    await heldRouteWork;
  };
  await page.route(routePattern, delayedSearchRoute);
  try {
    await openViewerDesign3(page);
    const search = page.getByRole("searchbox", { name: "Search all rows", exact: true });
    const status = page.locator(".viewer-search-controls [role='status']");
    await expect(status).toContainText("24 hasil");
    await search.fill("delayed-demo");
    await expect.poll(() => requestHeld).toBe(true);
    await expect(status).toHaveText("Mencari rekod...");
    await expect(page.locator(".viewer-results")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("delayed-demo");

    releaseResponse();
    await expect(page.getByTestId("viewer-empty-state")).toContainText("Tiada hasil carian");
    await expect(status).toContainText("0 hasil");
    await expect(page.locator(".viewer-results")).toHaveAttribute("aria-busy", "false");
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("delayed-demo");
  } finally {
    // Release even when an assertion fails, so a pending route cannot stall
    // page teardown or the synthetic logout cleanup.
    releaseResponse();
    try {
      await heldRouteWork;
    } finally {
      await page.unroute(routePattern, delayedSearchRoute);
      await logoutVisualSession(page);
    }
  }
});

test.describe("viewer design3 touch menus", () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const width of [320, 390]) {
    test(`${width}px More and export sheet remain tappable, bounded and restore focus`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await installMockAuthenticatedSession(page, "dark");
      await installViewerDesign3Fixture(page);
      let downloadCount = 0;
      page.on("download", () => { downloadCount += 1; });
      try {
        await openViewerDesign3(page);
        expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
        const more = page.getByTestId("button-viewer-more-actions");
        await more.tap();
        await expect(page.getByTestId("button-clear-all")).toBeVisible();
        const exporter = page.getByTestId("button-export-menu");
        await exporter.tap();
        const exportSheet = page.getByRole("dialog", { name: "Export Dataset", exact: true });
        await expect(exportSheet).toBeVisible();
        await expect(page.getByRole("menu")).toHaveCount(0);
        const csvOption = exportSheet.getByTestId("button-export-csv-all");
        await expect(csvOption).toBeVisible();
        await expect.poll(() => exportSheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);
        const bounds = await exportSheet.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.y).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(901);
        await expectViewerDesign3DocumentFits(page);
        await page.screenshot({ path: testInfo.outputPath("viewer-mobile-export-sheet.png") });

        // Inspecting the menu must not start an export or change the dataset.
        await page.keyboard.press("Escape");
        await expect(exportSheet).toHaveCount(0);
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(more).toBeFocused();
        await expect(page.getByTestId("button-viewer-row-details-0")).toBeVisible();
        expect(downloadCount).toBe(0);
      } finally {
        await logoutVisualSession(page);
      }
    });
  }
});

const viewerCompactCardHeaders = [
  "Customer Name", "Reference", "Account Number", "Region", "Card Number",
  "Phone", "Email", "Amount (RM)", "Payment Date", "Notes",
] as const;
const viewerCompactCardLongName = "Synthetic Customer Nurul Afiqah binti Abdullah — East Coast Collection Operations Department / ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ";
const viewerCompactCardUnlistedValue = "SYNTHETIC_UNLISTED_FIELD_MUST_NOT_RENDER";

async function installViewerCompactCardFixture(page: Page) {
  await installViewerDesign3Fixture(page, 2);
  await page.route("**/api/imports/visual-import-1/data*", (route) => {
    expect(route.request().method()).toBe("GET");
    return jsonResponse(route, {
      headers: viewerCompactCardHeaders,
      rows: [viewerCompactCardLongName, "Synthetic Customer 02"].map((name, index) => ({
        id: `viewer-compact-card-${index + 1}`,
        importId: "visual-import-1",
        jsonDataJsonb: {
          "Customer Name": name,
          Reference: `SYN-${String(index + 1).padStart(5, "0")}`,
          "Account Number": index === 0 ? viewerDesign3Account : "00001234567890123457",
          Region: index === 0 ? "Central" : "Northern",
          "Card Number": index === 0 ? viewerDesign3Card : "00009007199254740994",
          Phone: "0123456789",
          Email: `synthetic.compact.${index + 1}@example.test`,
          "Amount (RM)": "00005000.00",
          "Payment Date": "2026-01-15",
          Notes: viewerDesign3Note,
          Unlisted: viewerCompactCardUnlistedValue,
        },
      })),
      total: 2, page: 1, pageSize: 100, limit: 100, offset: 0, nextCursor: null,
      pagination: {
        hasNextPage: false, hasPreviousPage: false, limit: 100, mode: "hybrid",
        nextCursor: null, offset: 0, page: 1, pageSize: 100, total: 2, totalPages: 1,
      },
    });
  });
}

for (const theme of visualThemes) {
  for (const width of [320, 390, 700]) {
    test(`viewer compact mobile cards ${theme} ${width}px preserve unique identity, preview budget and independent actions`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await installMockAuthenticatedSession(page, theme);
      await installViewerCompactCardFixture(page);
      try {
        await openViewerDesign3(page);
        const detailsButton = page.getByTestId("button-viewer-row-details-0");
        const firstCard = page.locator("article").filter({ has: detailsButton });
        await expect(firstCard).toHaveCount(1);
        await expect.poll(async () => ((await firstCard.textContent()) ?? "").split(viewerCompactCardLongName).length - 1).toBe(1);
        await expect(firstCard.locator("dt").filter({ hasText: /^Customer Name$/ })).toHaveCount(0);
        await expect(firstCard.locator("dt:visible")).toHaveText(["Reference", "Account Number", "Region"]);
        await expect(firstCard.getByText("SYN-00001", { exact: true })).toBeVisible();
        await expect(firstCard.getByText(viewerDesign3Account, { exact: true })).toBeVisible();
        await expect(firstCard.getByText("Central", { exact: true })).toBeVisible();
        await expect(firstCard.locator("dt").filter({ hasText: /^Card Number$/ })).not.toBeVisible();
        await expect(firstCard.getByText(viewerDesign3Card, { exact: true })).not.toBeVisible();
        await expect(firstCard.getByText("0123456789", { exact: true })).not.toBeVisible();
        await expect(page.getByText(viewerCompactCardUnlistedValue, { exact: true })).toHaveCount(0);
        const disclosure = firstCard.locator("details > summary");
        await expect(disclosure).toHaveText("Show 6 more fields");
        const detailsBounds = await detailsButton.boundingBox();
        expect(detailsBounds).not.toBeNull();
        expect(detailsBounds!.width).toBeGreaterThanOrEqual(44);
        expect(detailsBounds!.height).toBeGreaterThanOrEqual(44);
        const fit = await firstCard.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            left: bounds.left,
            right: bounds.right,
            viewportWidth: document.documentElement.clientWidth,
          };
        });
        expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);
        expect(fit.left).toBeGreaterThanOrEqual(-1);
        expect(fit.right).toBeLessThanOrEqual(fit.viewportWidth + 1);
        await expectViewerDesign3DocumentFits(page);
        await page.screenshot({ path: testInfo.outputPath("viewer-compact-mobile-card.png") });

        await disclosure.focus();
        await page.keyboard.press("Enter");
        await expect(firstCard.locator("details")).toHaveAttribute("open", "");
        await expect(firstCard.locator("dt:visible")).toHaveText([
          "Reference", "Account Number", "Region", "Card Number", "Phone", "Email", "Amount (RM)", "Payment Date", "Notes",
        ]);
        await expect(firstCard.getByText(viewerDesign3Card, { exact: true })).toBeVisible();
        await expect.poll(async () => ((await firstCard.textContent()) ?? "").split(viewerCompactCardLongName).length - 1).toBe(1);

        // Hiding an overflow column must not backfill it into the preview or
        // expose an unlisted field when the disclosure is expanded again.
        const columns = page.getByTestId("button-column-selector");
        await columns.click();
        await expect(page.getByRole("dialog", { name: "Select Columns", exact: true })).toBeVisible();
        await page.getByTestId("checkbox-column-Card Number").click();
        await page.keyboard.press("Escape");
        await expect(columns).toBeFocused();
        await expect(firstCard.locator("dt").filter({ hasText: /^Card Number$/ })).toHaveCount(0);
        await expect(disclosure).toHaveText("Show 5 more fields");
        if (await firstCard.locator("details").getAttribute("open") !== null) {
          await disclosure.click();
        }
        await expect(firstCard.locator("dt:visible")).toHaveText(["Reference", "Account Number", "Region"]);
        await expect(firstCard.getByText("0123456789", { exact: true })).not.toBeVisible();
        await disclosure.click();
        await expect(firstCard.locator("dt:visible")).toHaveText([
          "Reference", "Account Number", "Region", "Phone", "Email", "Amount (RM)", "Payment Date", "Notes",
        ]);
        await expect(page.getByText(viewerCompactCardUnlistedValue, { exact: true })).toHaveCount(0);

        const selection = firstCard.getByRole("checkbox", { name: "Select row 1", exact: true });
        await expect(selection).toHaveAttribute("aria-checked", "false");
        await detailsButton.focus();
        await page.keyboard.press("Enter");
        const details = page.getByRole("dialog", { name: viewerCompactCardLongName, exact: true });
        await expect(details).toBeVisible();
        await expect(details.getByText(viewerDesign3Account, { exact: true })).toBeVisible();
        // Column visibility is a layout choice, not a permission boundary: the
        // existing read-only dialog still includes all authorized loaded fields.
        await expect(details.getByText(viewerDesign3Card, { exact: true })).toBeVisible();
        await expect(details.getByText(viewerCompactCardUnlistedValue, { exact: true })).toHaveCount(0);
        await expect(details.getByRole("button", { name: "Close details", exact: true })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(details).toHaveCount(0);
        await expect(detailsButton).toBeFocused();
        await expect(selection).toHaveAttribute("aria-checked", "false");

        await selection.click();
        await expect(selection).toHaveAttribute("aria-checked", "true");
        await detailsButton.focus();
        await page.keyboard.press("Enter");
        await expect(details).toBeVisible();
        await expect(details.getByRole("button", { name: "Close details", exact: true })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(details).toHaveCount(0);
        await expect(detailsButton).toBeFocused();
        await expect(selection).toHaveAttribute("aria-checked", "true");
        await expect(page.getByRole("checkbox", { name: "Select row 2", exact: true })).toHaveAttribute("aria-checked", "false");
        await expectViewerDesign3DocumentFits(page);
      } finally {
        await logoutVisualSession(page);
      }
    });
  }
}
