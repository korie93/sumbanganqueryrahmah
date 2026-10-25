import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSaveFixture, nickname } from "./helpers/save-collection-fixture";

// Run against the production build with test:visual:built. Observe route entry
// chunks only: shared utilities and styles are legitimate dependencies of the
// currently mounted page and must not be mistaken for speculative navigation.
const routeEntry = /^\/assets\/(GeneralSearch|Import|Saved|Viewer|Dashboard|Activity|Monitor|Analysis|AuditLogs|Settings|SystemMonitorLayout)-[A-Za-z0-9_-]+\.js$/;

test.use({ serviceWorkers: "block" });

function observeRouteEntries(page: Page) {
  const entries = new Set<string>();
  page.on("request", (request) => {
    const match = new URL(request.url()).pathname.match(routeEntry);
    if (match) entries.add(match[1]!);
  });
  return () => [...entries].sort();
}

async function installFixture(page: Page, baseURL: string | undefined, lowSpec = false) {
  const fixture = await installSaveFixture(page, baseURL, { role: "superuser" });
  const origin = new URL(baseURL!).origin;
  await page.addInitScript((low) => {
    localStorage.setItem("perf_mode", low ? "low" : "high");
    // An isolated Linux network namespace can report offline despite a working
    // loopback server. Model reachable synthetic APIs without enabling egress.
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  }, lowSpec);
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "superuser", tabs: {
      home: true, "general-search": true, "collection-report": true,
      import: true, saved: true, viewer: true, dashboard: true, activity: true,
      monitor: true, analysis: true, "audit-logs": true, settings: true, backup: true,
    } }, headers: { "Cache-Control": "no-store" } });
  });
  // Saved mounts its source configuration provider only on real navigation.
  // Keep the fixture's fail-closed handling for all other endpoints/methods.
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { ok: true, sourceConfigs: [] }, headers: { "Cache-Control": "no-store" } });
  });
  return fixture;
}

async function openSave(page: Page) {
  await page.goto("/collection/save");
  await page.locator("#save-collection-superuser-nickname").click();
  await page.getByRole("button", { name: nickname, exact: true }).click();
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 1024) await page.mouse.move(1000, 600);
}

async function observeIdleWindow(page: Page) {
  // A bounded negative observation deliberately exceeds the former 900ms
  // fallback; a single immediate assertion would miss scheduled preloading.
  await page.waitForTimeout(1_500);
}

for (const lowSpec of [false, true]) {
  test(`navigation prefetch: route preloading follows only leaf intent in ${lowSpec ? "low-spec" : "normal"} mode`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fixture = await installFixture(page, baseURL, lowSpec);
    const entries = observeRouteEntries(page);
    await openSave(page);
    if (lowSpec) await expect(page.locator("html")).toHaveClass(/low-spec/);
    else await expect(page.locator("html")).not.toHaveClass(/low-spec/);
    await observeIdleWindow(page);
    expect(entries(), "Idle must not download unrelated route entries").toEqual([]);

    const group = page.getByTestId("nav-group-workspace");
    await group.hover();
    await observeIdleWindow(page);
    expect(entries(), "Group hover must not preload its children").toEqual([]);
    await group.focus();
    await observeIdleWindow(page);
    expect(entries(), "Group focus must not preload its children").toEqual([]);
    await group.click();
    const panel = page.getByTestId("desktop-flyout-workspace");
    await expect(panel).toBeVisible();
    await observeIdleWindow(page);
    expect(entries(), "Mouse opening a group must not preload every child").toEqual([]);

    const viewer = panel.getByTestId("flyout-nav-viewer");
    await viewer.hover();
    await expect.poll(entries).toEqual(["Viewer"]);
    await observeIdleWindow(page);
    expect(entries(), "Leaf hover must leave sibling route entries unloaded").toEqual(["Viewer"]);
    await viewer.click();
    await expect(page).toHaveURL(/\/viewer$/);
    await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
    await checkFixture(page, fixture);
  });
}

test("navigation prefetch: Saved leaf keyboard focus preloads only Saved and Enter navigates", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  const entries = observeRouteEntries(page);
  await openSave(page);
  await page.getByTestId("nav-group-workspace").click();
  const panel = page.getByTestId("desktop-flyout-workspace");
  await expect(panel).toBeVisible();
  expect(entries()).toEqual([]);
  const saved = panel.getByTestId("flyout-nav-saved");
  await saved.focus();
  await expect(saved).toBeFocused();
  await expect.poll(entries).toEqual(["Saved"]);
  await observeIdleWindow(page);
  expect(entries(), "Keyboard intent must leave Import and Viewer unloaded").toEqual(["Saved"]);
  await saved.press("Enter");
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole("heading", { name: "Saved Imports", exact: true })).toBeVisible();
  await expect(page.getByTestId("text-import-count")).toHaveText("0 files");
  await checkFixture(page, fixture);
});

test.describe("mobile cold navigation", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("navigation prefetch: an unprefetched Viewer still opens on tap", async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL);
    const entries = observeRouteEntries(page);
    await openSave(page);
    await page.getByTestId("button-open-mobile-nav").tap();
    await page.getByTestId("mobile-nav-group-workspace").tap();
    const viewer = page.getByTestId("mobile-nav-viewer");
    await expect(viewer).toBeVisible();
    // The unchanged touch/focus path can warm the first Import leaf. Viewer
    // and Saved must remain cold; warming every Workspace child is forbidden.
    const otherEntries = () => entries().filter((name) => name !== "Import");
    expect(otherEntries(), "Viewer must remain cold before its own tap").toEqual([]);
    await viewer.tap();
    await expect(page).toHaveURL(/\/viewer$/);
    await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
    await expect.poll(otherEntries).toEqual(["Viewer"]);
    await expect(page.locator("#mobile-navigation-drawer")).toBeHidden();
    await checkFixture(page, fixture);
  });
});
