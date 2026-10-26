import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSessionFixture, now } from "./helpers/save-collection-fixture";

// Exercise the real production Monitor and hook against exact synthetic reads.
// Compact presentation leaves secondary panels closed; unexpected endpoints,
// methods and off-origin traffic still fail the shared fixture's checks.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

async function installFixture(page: Page, baseURL: string | undefined, lowSpec = false) {
  const fixture = await installSessionFixture(page, baseURL, { role: "superuser", controlledClock: true });
  const origin = new URL(baseURL!).origin;
  const state = { health: 0, completed: 0, active: 0, maxActive: 0, holdNext: false, failNext: false, failed: 0 };
  let releaseHealth: () => void = () => {};
  await page.addInitScript((low) => {
    localStorage.setItem("perf_mode", low ? "low" : "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  }, lowSpec);
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, monitor: true } } });
  });
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { ok: true, sourceConfigs: [] } });
  });
  await page.context().route(`${origin}/internal/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || url.search || ![
      "/internal/system-health", "/internal/system-mode", "/internal/workers",
    ].includes(url.pathname)) {
      fixture.unexpected.push(`${request.method().slice(0, 10)} ${url.pathname.slice(0, 160)}`);
      return route.abort();
    }
    const updatedAt = Date.parse(now) + state.health * 1_000;
    if (url.pathname === "/internal/system-mode") return route.fulfill({ json: {
      mode: "NORMAL", throttleFactor: 1, rejectHeavyRoutes: false, dbProtection: false, preAllocatedMB: 0, updatedAt,
    } });
    if (url.pathname === "/internal/workers") return route.fulfill({ json: { count: 1, maxWorkers: 1, workers: [], updatedAt } });
    state.health++;
    state.active++;
    state.maxActive = Math.max(state.maxActive, state.active);
    try {
      if (state.holdNext) {
        state.holdNext = false;
        await new Promise<void>((resolve) => { releaseHealth = resolve; });
      }
      if (state.failNext) {
        state.failNext = false;
        state.failed++;
        await route.fulfill({ status: 503, json: { message: "Synthetic temporarily unavailable" } });
        state.completed++;
        return;
      }
      await route.fulfill({ json: {
        score: 99, mode: "NORMAL", cpuPercent: state.health, ramPercent: 24,
        p95LatencyMs: 10, errorRate: 0, dbLatencyMs: 2, aiLatencyMs: 0,
        eventLoopLagMs: 1, requestRate: 1, activeRequests: 0, queueLength: 0,
        workerCount: 1, maxWorkers: 1, dbProtection: false, slowQueryCount: 0, dbConnections: 1,
        aiFailRate: 0, status401Count: 0, status403Count: 0, status429Count: 0,
        localOpenCircuitCount: 0, clusterOpenCircuitCount: 0, bottleneckType: "NONE",
        rollupRefreshPendingCount: 0, rollupRefreshRunningCount: 0, rollupRefreshRetryCount: 0,
        rollupRefreshOldestPendingAgeMs: 0, activeAlertCount: 0, updatedAt,
      } });
      state.completed++;
    } finally { state.active--; }
  });
  // The shared fixture installed time one minute before `now`. Pause on the
  // still-blank page with ample lead, before any application timer is mounted.
  // A Date.now()+small-offset pause after bootstrap races slow CI execution.
  await page.clock.pauseAt(new Date(now));
  return { fixture, state, release: () => releaseHealth() };
}

async function openMonitor(page: Page, state: { health: number; completed: number; active: number }) {
  await page.goto("/monitor?section=monitor", { waitUntil: "domcontentloaded" });
  let ready = false;
  // Drive bootstrap frames/timers while real loopback responses settle. At
  // most four seconds of synthetic time pass, below the first 5s poll delay.
  for (let step = 0; step < 80; step++) {
    await page.clock.runFor(50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    ready = state.health > 0 && state.completed === state.health && state.active === 0
      && await page.getByTestId("text-monitor-title").isVisible()
      && await page.getByRole("button", { name: "Refresh", exact: true }).isVisible();
    if (ready) break;
  }
  expect(ready, "Monitor bootstrap must settle within the bounded clock-driving window").toBe(true);
  await expect(page.getByTestId("text-monitor-title")).toHaveText("System Performance");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
}

async function advancePoll(page: Page, state: { health: number; completed: number }, milliseconds: number) {
  const before = state.health;
  await page.clock.runFor(milliseconds);
  // The page clock is controlled; this bounded Node-side yield lets real
  // loopback fetch/body promises and React commits finish without advancing it.
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(JSON.stringify({ monitorPollingSynthetic: true, before, afterTimer: state.health, advancedMs: milliseconds }));
  await expect.poll(() => state.health).toBe(before + 1);
  await expect.poll(() => state.completed === state.health).toBe(true);
  // Let fetch-body parsing, the React commit and completion-owned timer setup
  // settle before the next simulated interval; do not reset the app scheduler.
  await page.clock.runFor(100);
}

async function setVisibility(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    // Synthetic document visibility belongs only to this isolated test page.
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value ? "hidden" : "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("Monitor polling: repeated normal polls, queued refresh and leaving the page preserve one request at a time", async ({ page, baseURL }) => {
  const { fixture, state, release } = await installFixture(page, baseURL);
  try {
    await openMonitor(page, state);
    await expect.poll(() => state.completed === state.health).toBe(true);
    expect(state.health).toBeGreaterThan(0);
    const initialHealthRequests = state.health;
    console.log(JSON.stringify({ monitorPollingSynthetic: true, initialHealthRequests }));
    for (let index = 0; index < 3; index++) {
      await page.clock.runFor(5_000);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect.poll(() => state.completed === state.health).toBe(true);
      await page.clock.runFor(100);
      console.log(JSON.stringify({ monitorPollingSynthetic: true, scheduledTicks: index + 1, healthRequests: state.health }));
    }
    expect(state.health, "Initial poll must be followed by every scheduled cycle").toBe(initialHealthRequests + 3);

    state.failNext = true;
    await advancePoll(page, state, 5_000);
    expect(state.failed).toBe(1);
    await advancePoll(page, state, 5_000);
    expect(state.failed, "A temporary failure must not stop the next scheduled recovery").toBe(1);

    state.holdNext = true;
    const beforeHeld = state.health;
    await page.clock.runFor(5_000);
    await expect.poll(() => state.health).toBe(beforeHeld + 1);
    await expect.poll(() => state.active).toBe(1);
    const refresh = page.getByRole("button", { name: "Refresh", exact: true });
    await refresh.press("Enter");
    await refresh.press("Enter");
    await page.clock.runFor(20_000);
    expect(state.health, "A held cycle must not overlap another health request").toBe(beforeHeld + 1);
    expect(state.maxActive).toBe(1);
    release();
    await expect.poll(() => state.health).toBe(beforeHeld + 2);
    await expect.poll(() => state.completed === state.health).toBe(true);
    await page.clock.runFor(100);
    await advancePoll(page, state, 5_000);

    await page.getByTestId("button-open-mobile-nav").press("Enter");
    await page.getByTestId("mobile-nav-group-workspace").press("Enter");
    await page.getByTestId("mobile-nav-saved").press("Enter");
    await expect(page.getByRole("heading", { name: "Saved Imports", exact: true })).toBeVisible();
    const afterUnmount = state.health;
    await page.clock.runFor(60_000);
    expect(state.health, "Unmount must remove the scheduled monitor poll").toBe(afterUnmount);
    expect(state.maxActive).toBe(1);
    await checkFixture(page, fixture);
  } finally {
    console.log(JSON.stringify({ monitorPollingSynthetic: true, finalHealthRequests: state.health,
      completed: state.completed, maxActive: state.maxActive }));
    release();
  }
});

test("Monitor polling: low-spec cadence slows while hidden and refreshes once when visible again", async ({ page, baseURL }) => {
  const { fixture, state, release } = await installFixture(page, baseURL, true);
  try {
    await openMonitor(page, state);
    await expect(page.locator("html")).toHaveClass(/low-spec/);
    await expect.poll(() => state.completed === state.health).toBe(true);
    await advancePoll(page, state, 10_000);
    await advancePoll(page, state, 10_000);
    await setVisibility(page, true);
    const beforeHidden = state.health;
    await page.clock.runFor(29_000);
    expect(state.health, "Hidden low-spec tab must wait for the 30-second interval").toBe(beforeHidden);
    await advancePoll(page, state, 1_000);
    await advancePoll(page, state, 30_000);
    const beforeVisible = state.health;
    await setVisibility(page, false);
    await expect.poll(() => state.health).toBe(beforeVisible + 1);
    await expect.poll(() => state.completed === state.health).toBe(true);
    await page.clock.runFor(100);
    await advancePoll(page, state, 10_000);
    expect(state.maxActive).toBe(1);
    await checkFixture(page, fixture);
  } finally { release(); }
});
