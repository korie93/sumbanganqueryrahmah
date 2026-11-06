import { expect, test, type Page, type Route } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, nickname } from "./helpers/save-collection-fixture";

// Actual production chunks and UI, authenticated only with the shared isolated
// synthetic fixture. No production API, identity, data or external AI service.
const runtimeChunk = /^\/assets\/FloatingAI\d*-[A-Za-z0-9_-]+\.js$/;
const dialogSelector = "[data-floating-ai-dialog='true'][role='dialog']";
const answer = "Synthetic answer retained.";

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });

function isRuntimeUrl(url: string) {
  return runtimeChunk.test(new URL(url).pathname);
}

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark" = "light") {
  const fixture = await installSessionFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme });
  const origin = new URL(baseURL!).origin;
  const runtimeRequests: string[] = [];
  const state = { searches: 0, completed: 0, holdSearch: false, queries: [] as string[] };
  let releaseSearch: () => void = () => {};
  const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });

  page.on("request", (request) => {
    if (isRuntimeUrl(request.url())) runtimeRequests.push(new URL(request.url()).pathname);
  });
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "superuser", tabs: {
      home: true, saved: true, viewer: true, "collection-report": true,
    } }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { ok: true, sourceConfigs: [] }, headers: { "Cache-Control": "no-store" } });
  });
  await page.context().route(`${origin}/api/ai/search`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as { query?: unknown };
    expect(typeof body.query).toBe("string");
    state.searches++;
    state.queries.push(String(body.query));
    if (state.holdSearch) await searchGate;
    await route.fulfill({ json: { ai_explanation: answer }, headers: { "Cache-Control": "no-store" } });
    state.completed++;
  });
  return { fixture, origin, runtimeRequests, state, releaseSearch };
}

async function openWorkspace(page: Page) {
  await page.goto("/viewer", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
  await expect(page.getByTestId("floating-ai-toggle")).toBeVisible();
}

async function navigateSaved(page: Page) {
  await page.getByTestId("nav-group-workspace").click();
  await expect(page.getByTestId("desktop-flyout-workspace")).toBeVisible();
  await page.getByTestId("flyout-nav-saved").click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole("heading", { name: "Saved Imports", exact: true })).toBeVisible();
}

async function expectOpenPanel(page: Page) {
  const panel = page.locator(dialogSelector);
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("floating-ai-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true })).toBeVisible();
  return panel;
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [375, 1366]) {
    test("layout repair L13 Home values stay clear before and after AI activation at " + width + "px " + theme, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installFixture(page, baseURL, theme);
      let release = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      await page.context().route(`${fixture.origin}/api/collection/summary?*`, (route) => route.fulfill({ json: {
        ok: true, year: 2026, summary: [],
      } }));
      await page.context().route(`${fixture.origin}/api/analytics/recent-login-activity?*`, async (route) => {
        await gate;
        return route.fulfill({ json: Array.from({ length: 5 }, (_, index) => ({
          id: `synthetic-home-activity-${index}`, username: `synthetic.operator.${index + 1}`, role: "user",
          loginTime: "2026-10-10T08:00:00.000Z", logoutTime: null, status: "active",
          browser: "Synthetic browser", platform: "Synthetic workstation", ipAddress: "203.0.113.10",
          lastActivityTime: "2026-10-10T08:00:00.000Z", failureReason: null, eventType: "success",
          logoutReason: null, userAgentSummary: "Synthetic browser",
        })) });
      });
      try {
        await page.goto("/");
        await expect(page.getByTestId("home-recent-activity")).toContainText("Loading recent activity");
        await expect(page.getByTestId("floating-ai-toggle")).toBeVisible();
        expect(fixture.runtimeRequests).toEqual([]);
        release();
        await expect(page.locator(".home-activity-row time")).toHaveCount(5);
        const assertClear = async () => {
          await page.locator(".home-activity-row:last-child time").evaluate((element) => {
            element.scrollIntoView({ block: "end", behavior: "instant" });
            window.scrollBy(0, element.getBoundingClientRect().bottom - (innerHeight - 22));
          });
          await expect.poll(() => page.evaluate(() => {
            const trigger = document.querySelector('[data-testid="floating-ai-toggle"]')!.getBoundingClientRect();
            const value = document.querySelector(".home-activity-row:last-child time")!.getBoundingClientRect();
            return trigger.width > 0 && value.top >= 0 && value.bottom <= innerHeight
              && (Math.min(trigger.right, value.right) <= Math.max(trigger.left, value.left)
                || Math.min(trigger.bottom, value.bottom) <= Math.max(trigger.top, value.top));
          })).toBe(true);
        };
        await assertClear();
        expect(fixture.runtimeRequests).toEqual([]);
        await page.getByTestId("floating-ai-toggle").click();
        const panel = await expectOpenPanel(page);
        await panel.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
        await expect(panel).toBeHidden();
        await assertClear();
        expect(fixture.runtimeRequests).toHaveLength(1);
        expect(fixture.state.searches).toBe(0);
        await checkFixture(page, fixture.fixture);
      } finally {
        release();
      }
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1024, 1366]) {
    test("layout repair L14 Save adaptive placement clears its sidebar and controls at " + width + "px " + theme, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installFixture(page, baseURL, theme);
      await page.goto("/collection/save");
      await page.locator("#save-collection-superuser-nickname").click();
      await page.getByRole("button", { name: nickname, exact: true }).click();
      await expect(page.locator("#save-collection-customer-name")).toBeVisible();
      const assertClear = async () => {
        await page.locator("#save-collection-actions").scrollIntoViewIfNeeded();
        for (const offset of [0, -144, 72]) {
          await page.evaluate((delta) => window.scrollBy(0, delta), offset);
          await expect.poll(() => page.evaluate(() => {
            const trigger = document.querySelector('[data-testid="floating-ai-toggle"]')!.getBoundingClientRect();
            const sidebar = document.querySelector(".workspace-sidebar")!.getBoundingClientRect();
            const topbar = document.querySelector(".workspace-topbar")!.getBoundingClientRect();
            const controls = [...document.querySelectorAll(".save-collection-workspace input:not([type='hidden']), .save-collection-workspace textarea, .save-collection-workspace select, .save-collection-workspace button, #save-collection-actions button")];
            const overlaps = controls.some((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
                && Math.min(trigger.right, rect.right) > Math.max(trigger.left, rect.left)
                && Math.min(trigger.bottom, rect.bottom) > Math.max(trigger.top, rect.top);
            });
            return trigger.width > 0 && trigger.left >= sidebar.right && trigger.top >= topbar.bottom && !overlaps;
          })).toBe(true);
        }
      };
      for (const collapsed of [false, true]) {
        if (collapsed) await page.getByTestId("button-toggle-sidebar").click();
        await assertClear();
      }
      expect(fixture.runtimeRequests).toEqual([]);
      await page.getByTestId("floating-ai-toggle").click();
      const panel = await expectOpenPanel(page);
      await panel.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
      await expect(panel).toBeHidden();
      await assertClear();
      expect(fixture.runtimeRequests).toHaveLength(1);
      expect(fixture.fixture.saves).toEqual([]);
      expect(fixture.fixture.matches).toBe(0);
      expect(fixture.state.searches).toBe(0);
      await checkFixture(page, fixture.fixture);
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test("layout repair L15 Saved mobile filters keep idle AI clear in " + theme, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    const fixture = await installFixture(page, baseURL, theme);
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Saved Imports", exact: true })).toBeVisible();
    const trigger = page.getByTestId("floating-ai-toggle");
    await expect(trigger).toBeVisible();
    await page.getByTestId("button-toggle-saved-advanced-filters").click();
    const input = page.getByTestId("input-saved-max-rows");
    await expect(input).toBeVisible();
    await input.scrollIntoViewIfNeeded();
    const assertClear = async () => expect.poll(() => page.evaluate(() => {
      const trigger = document.querySelector('[data-testid="floating-ai-toggle"]')!.getBoundingClientRect();
      const controls = [...document.querySelectorAll(".saved-workspace input, .saved-workspace select, .saved-workspace button")];
      return trigger.width > 0 && controls.every((element) => {
        const rect = element.getBoundingClientRect();
        return !rect.width || !rect.height || rect.top >= innerHeight || rect.bottom <= 0
          || Math.min(trigger.right, rect.right) <= Math.max(trigger.left, rect.left)
          || Math.min(trigger.bottom, rect.bottom) <= Math.max(trigger.top, rect.top);
      });
    })).toBe(true);
    await assertClear();
    await input.focus();
    await expect(trigger).toBeHidden();
    await input.blur();
    await expect(trigger).toBeVisible();
    await page.getByTestId("button-date-filter").click();
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(trigger).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeVisible();
    await assertClear();
    expect(fixture.runtimeRequests).toEqual([]);
    await trigger.click();
    const panel = await expectOpenPanel(page);
    await panel.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
    await expect(panel).toBeHidden();
    await assertClear();
    expect(fixture.runtimeRequests).toHaveLength(1);
    expect(fixture.state.searches).toBe(0);
    await checkFixture(page, fixture.fixture);
  });
}

test("AI launcher: idle stays cold and the first keyboard activation opens one accessible panel", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await openWorkspace(page);
  const trigger = page.getByTestId("floating-ai-toggle");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(dialogSelector)).toHaveCount(0);
  // This negative observation exceeds both old idle/fallback preload windows.
  await page.waitForTimeout(2_000);
  expect(fixture.runtimeRequests, "An unused launcher must not request its panel runtime").toEqual([]);
  expect(fixture.state.searches).toBe(0);

  await trigger.focus();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  const panel = await expectOpenPanel(page);
  await expect.poll(() => fixture.runtimeRequests.length).toBe(1);
  await expect.poll(() => panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.press(" ");
  await expectOpenPanel(page);
  expect(fixture.runtimeRequests.length, "Reopening reuses the loaded runtime").toBe(1);
  expect(fixture.state.searches).toBe(0);
  await checkFixture(page, fixture.fixture);
});

test("AI launcher: repeated activation during a held import is deduplicated", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  let releaseRuntime: () => void = () => {};
  const runtimeGate = new Promise<void>((resolve) => { releaseRuntime = resolve; });
  let held = 0;
  await page.context().route((url) => url.origin === fixture.origin && runtimeChunk.test(url.pathname), async (route) => {
    held++;
    await runtimeGate;
    await route.continue();
  });
  try {
    await openWorkspace(page);
    const trigger = page.getByTestId("floating-ai-toggle");
    await trigger.click();
    await expect.poll(() => held).toBe(1);
    await expect(trigger).toHaveAttribute("aria-busy", "true");
    await trigger.click();
    await trigger.press("Enter");
    expect(held).toBe(1);
    await expect(page.locator(dialogSelector)).toHaveCount(0);
    releaseRuntime();
    await expectOpenPanel(page);
    await expect(page.locator(dialogSelector)).toHaveCount(1);
    expect(fixture.runtimeRequests.length).toBe(1);
    await checkFixture(page, fixture.fixture);
  } finally { releaseRuntime(); }
});

test("AI launcher: navigation invalidates a pending open without discarding the loaded module", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  let releaseRuntime: () => void = () => {};
  const runtimeGate = new Promise<void>((resolve) => { releaseRuntime = resolve; });
  let held = 0;
  await page.context().route((url) => url.origin === fixture.origin && runtimeChunk.test(url.pathname), async (route) => {
    held++;
    await runtimeGate;
    await route.continue();
  });
  try {
    await openWorkspace(page);
    await page.getByTestId("floating-ai-toggle").click();
    await expect.poll(() => held).toBe(1);
    await navigateSaved(page);
    const loaded = page.waitForResponse((response) => isRuntimeUrl(response.url()) && response.ok());
    releaseRuntime();
    await loaded;
    const trigger = page.getByTestId("floating-ai-toggle");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(dialogSelector)).toHaveCount(0);
    // A new explicit gesture is required on the destination. The positive
    // reopen also proves the held module has settled, rather than hiding a
    // stale completion behind an immediate negative assertion.
    await trigger.click();
    await expectOpenPanel(page);
    expect(fixture.runtimeRequests.length).toBe(1);
    expect(fixture.state.searches).toBe(0);
    await checkFixture(page, fixture.fixture);
  } finally { releaseRuntime(); }
});

test("AI launcher: a failed runtime download reports a safe error and allows an explicit retry", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  let attempts = 0;
  await page.context().route((url) => url.origin === fixture.origin && runtimeChunk.test(url.pathname), async (route: Route) => {
    attempts++;
    if (attempts === 1) return route.abort("failed");
    return route.continue();
  });
  await openWorkspace(page);
  const trigger = page.getByTestId("floating-ai-toggle");
  const loadError = page.getByRole("status").filter({ hasText: "Bantuan AI tidak dapat dimuatkan." });
  await trigger.click();
  await expect(loadError).toBeVisible();
  await expect(trigger).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator(dialogSelector)).toHaveCount(0);
  expect(attempts).toBe(1);
  expect(fixture.state.searches).toBe(0);
  await trigger.click();
  await expectOpenPanel(page);
  expect(attempts).toBe(2);
  expect(new Set(fixture.runtimeRequests).size, "Retry uses a distinct build-owned module URL").toBe(2);
  await expect(loadError).toHaveCount(0);
  await checkFixture(page, fixture.fixture);
});

test("AI launcher: failed idle placement leaves Save Collection usable and retries a distinct module URL", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  const placementChunk = /^\/assets\/FloatingAIIdlePlacement\d*-[A-Za-z0-9_-]+\.js$/;
  const placementRequests: string[] = [];
  let failedPlacementUrl: string | undefined;
  await page.context().route((url) => url.origin === fixture.origin && placementChunk.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const moduleUrl = url.pathname + url.search;
    placementRequests.push(moduleUrl);
    failedPlacementUrl ??= moduleUrl;
    // Chromium may retry a failed preload at the same URL. Model an unavailable
    // chunk until the explicit recovery imports its distinct build-owned URL.
    if (moduleUrl === failedPlacementUrl) return route.abort("failed");
    return route.continue();
  });

  await page.goto("/collection/save", { waitUntil: "domcontentloaded" });
  const loadError = page.getByRole("alert").filter({ hasText: "Bantuan AI tidak dapat dimuatkan." });
  await expect(loadError).toBeVisible();
  expect(new Set(placementRequests).size, "The original module URL remains unavailable on browser retries").toBe(1);
  await expect(page.getByTestId("floating-ai-toggle")).toHaveCount(0);
  expect(fixture.runtimeRequests, "Failed placement must not load the panel runtime").toEqual([]);

  // Failure belongs only to the optional launcher: the real protected form
  // must still accept input, without a default-position icon covering it.
  await page.locator("#save-collection-superuser-nickname").click();
  await page.getByRole("button", { name: nickname, exact: true }).click();
  const customerName = page.locator("#save-collection-customer-name");
  await customerName.fill("Synthetic placement recovery");
  await expect(customerName).toHaveValue("Synthetic placement recovery");
  await expect(page.locator("#main-content")).toBeVisible();
  await loadError.getByRole("button", { name: "Cuba semula bantuan AI", exact: true }).click();
  const trigger = page.getByTestId("floating-ai-toggle");
  await expect(trigger).toBeVisible();
  await expect(loadError).toHaveCount(0);
  expect(new Set(placementRequests).size, "The retry must escape the failed native module URL").toBe(2);
  expect(placementRequests[placementRequests.length - 1]).not.toBe(failedPlacementUrl);
  expect(fixture.runtimeRequests, "Recovered placement remains independent of the panel runtime").toEqual([]);
  expect(fixture.state.searches).toBe(0);
  await trigger.click();
  await expectOpenPanel(page);
  expect(fixture.runtimeRequests).toHaveLength(1);
  await expect(customerName).toHaveValue("Synthetic placement recovery");
  await checkFixture(page, fixture.fixture);
});

test("AI launcher: minimizing keeps the active AI request and its single answer", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  fixture.state.holdSearch = true;
  try {
    await openWorkspace(page);
    await page.getByTestId("floating-ai-toggle").click();
    const panel = await expectOpenPanel(page);
    await panel.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true }).fill("Synthetic lookup");
    await panel.getByRole("button", { name: "Hantar soalan AI", exact: true }).click();
    await expect.poll(() => fixture.state.searches).toBe(1);
    await panel.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByTestId("floating-ai-toggle")).toHaveAttribute("aria-expanded", "false");
    fixture.releaseSearch();
    await expect.poll(() => fixture.state.completed).toBe(1);
    await expect(page.getByTestId("floating-ai-unread-badge")).toHaveText("1");
    await page.getByTestId("floating-ai-toggle").click();
    const reopened = await expectOpenPanel(page);
    const response = reopened.getByRole("article", { name: "Mesej pembantu AI", exact: true });
    await expect(response).toHaveCount(1);
    await expect(response).toHaveText(answer);
    await expect(reopened.getByRole("article", { name: "Mesej pengguna", exact: true })).toHaveCount(1);
    await expect(page.getByTestId("floating-ai-unread-badge")).toHaveCount(0);
    expect(fixture.state.queries).toEqual(["Synthetic lookup"]);
    expect(fixture.runtimeRequests.length).toBe(1);
    await checkFixture(page, fixture.fixture);
  } finally { fixture.releaseSearch(); }
});

test.describe("mobile first activation", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("AI launcher: first tap opens a mobile modal and minimizing restores the trigger", async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL);
    await openWorkspace(page);
    expect(fixture.runtimeRequests).toEqual([]);
    await page.getByTestId("floating-ai-toggle").tap();
    const panel = await expectOpenPanel(page);
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await panel.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).tap();
    await expect(panel).toBeHidden();
    await expect(page.getByTestId("floating-ai-toggle")).toBeVisible();
    expect(fixture.runtimeRequests.length).toBe(1);
    await checkFixture(page, fixture.fixture);
  });
});
