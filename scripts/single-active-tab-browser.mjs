import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";
import { waitForProtectedContractContent } from "./lib/ui-protected-route-readiness.mjs";
import { singleTabFixturePassword, singleTabFixtureUser, startSingleActiveTabFixture } from "./lib/single-active-tab-fixture.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const protectedSelector = ".sqr-workspace,[data-testid='collection-records-page'],[data-testid='input-search'],[data-testid='tab-single-import']";
const publicEndpoints = new Set([
  "GET /api/me", "GET /api/health", "GET /api/health/live", "GET /api/health/connectivity",
  "GET /api/maintenance-status", "GET /api/csrf-token", "POST /api/telemetry/web-vitals", "POST /api/telemetry/client-errors",
]);
const sensitive = (requests) => requests.filter((endpoint) => !publicEndpoints.has(endpoint));

async function instrumentPage(page, origin) {
  const state = { requests: [], sockets: [], pageErrors: [], external: [] };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) state.external.push(`${url.origin}${url.pathname}`);
    if (url.pathname.startsWith("/api/")) state.requests.push(`${request.method()} ${url.pathname}`);
  });
  page.on("websocket", (socket) => state.sockets.push(socket.url()));
  page.on("pageerror", (error) => state.pageErrors.push(error.message));
  // Observe transient mounts, not only the DOM's final blocked appearance.
  await page.addInitScript((selector) => {
    window.__singleTabProtectedMounted = false;
    const inspect = () => { if (document.querySelector(selector)) window.__singleTabProtectedMounted = true; };
    new MutationObserver(inspect).observe(document, { subtree: true, childList: true });
    document.addEventListener("DOMContentLoaded", inspect, { once: true });
  }, protectedSelector);
  return state;
}

async function expectOwner(page) {
  await expect(page.getByTestId("input-search")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".sqr-workspace")).toHaveCount(1);
  await expect(page.locator("[data-single-tab-status]")).toHaveCount(0);
}

async function expectBlocked(page, tracker) {
  await expect(page.locator('[data-single-tab-status="blocked"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Tab tambahan tidak dibenarkan.", exact: true })).toBeVisible();
  await expect(page.getByText("Akaun anda sudah dibuka di tab lain. Sila gunakan tab asal untuk terus bekerja.", { exact: true })).toBeVisible();
  await expect(page.getByText("Tab asal masih aktif", { exact: true })).toBeVisible();
  await expect(page.locator(protectedSelector)).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.__singleTabProtectedMounted), false, "Protected UI must never mount transiently in a blocked document");
  assert.deepEqual(sensitive(tracker.requests), [], "Blocked tab must not fetch Collection/Search/Viewer/Import/Activity/runtime data");
  assert.deepEqual(tracker.sockets, [], "Blocked tab must not subscribe to protected WebSocket traffic");
  assert.deepEqual(tracker.pageErrors, []);
}

async function expectPolishedLayout(page, width) {
  const layout = await page.evaluate(() => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    return {
      copy: bounds(".sqr-tab-copy"), art: bounds(".sqr-tab-art"),
      header: bounds(".sqr-tab-header"), surface: bounds(".sqr-tab-surface"),
      benefits: bounds(".sqr-tab-benefits"),
      aligned: [".sqr-tab-eyebrow", ".sqr-tab-copy h1", ".sqr-tab-lede", ".sqr-tab-rule", ".sqr-tab-message", ".sqr-tab-actions", ".sqr-tab-footnote"].map(bounds),
      buttons: [...document.querySelectorAll(".sqr-tab-actions button")].map((button) => {
        const { x, y, width, height } = button.getBoundingClientRect();
        return { x, y, width, height };
      }),
      benefitItems: [...document.querySelectorAll(".sqr-tab-benefits > span")].map((item) => item.getBoundingClientRect().width),
      illustration: bounds(".sqr-tab-window-second"), caption: bounds(".sqr-tab-art-caption span"),
    };
  });
  const near = (left, right, message) => assert.ok(Math.abs(left - right) <= 1, `${width}px: ${message}`);
  for (const element of layout.aligned) near(element.x, layout.aligned[0].x, "copy, status and actions share a left edge");
  for (const panel of [layout.header, layout.benefits]) {
    near(panel.x, layout.surface.x, "header/card/benefits share left edge");
    near(panel.right, layout.surface.right, "header/card/benefits share right edge");
  }
  assert.equal(layout.buttons.length, 2);
  for (const button of layout.buttons) assert.ok(button.height >= 48, `${width}px: action hit targets remain at least 48px tall`);
  near(layout.buttons[0].height, layout.buttons[1].height, "both actions have equal height");
  near(layout.buttons[0].width, layout.buttons[1].width, "both actions have equal width, including when stacked");
  assert.equal(layout.benefitItems.length, 2, "Only the two approved operational messages remain");
  if (width > 640) near(layout.benefitItems[0], layout.benefitItems[1], "benefit columns have equal width");
  if (width <= 1023) assert.ok(layout.art.y >= layout.copy.bottom - 1, `${width}px: tablet/phone copy precedes illustration, not a cramped split`);
  else {
    near(layout.art.y, layout.copy.y, "desktop columns align vertically");
    assert.ok(layout.art.x >= layout.copy.right - 1, "Desktop keeps the approved split composition");
  }
  assert.ok(layout.caption.y - layout.illustration.bottom >= 10, `${width}px: illustration caption never overlaps rotated browser card`);
}

async function navigateModule(page, name, ready) {
  // Exercise the existing SPA navigation, not hard reloads or test-only routes.
  const search = page.getByTestId("input-quick-search");
  await search.fill("");
  await search.click();
  await page.getByTestId(`command-module-${name}`).click();
  await expect(page.locator(ready)).toBeVisible({ timeout: 20_000 });
}

export async function runSingleActiveTabBrowser() {
  const directory = path.join(root, "artifacts/single-active-tab-browser");
  await mkdir(directory, { recursive: true });
  const fixture = await startSingleActiveTabFixture();
  let browser;
  try {
    browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  } catch (error) {
    await fixture.close();
    throw error;
  }
  const checks = [];
  const failures = [];
  let currentPage;
  let passed = false;
  const pass = (label) => { checks.push(label); console.log(`[single-tab] PASS ${label}`); };
  const contexts = new Set();
  const trackers = new Map();
  async function context(options = {}) {
    fixture.reset();
    const next = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: "block", reducedMotion: "reduce", ...options });
    contexts.add(next);
    await next.route("**/*", (route) => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
    return next;
  }
  async function page(next) {
    const value = await next.newPage();
    currentPage = value;
    const tracker = await instrumentPage(value, fixture.origin);
    const list = trackers.get(next) ?? [];
    list.push(tracker); trackers.set(next, list);
    return { page: value, tracker };
  }
  async function closeContext(next) {
    await next.close(); contexts.delete(next);
    assert.deepEqual(fixture.state.unexpected, [], "Synthetic fixture must explicitly support every requested API");
    for (const tracker of trackers.get(next) ?? []) {
      assert.deepEqual(tracker.pageErrors, []);
      assert.deepEqual(tracker.external, []);
    }
    trackers.delete(next);
  }
  async function owner(next) {
    const result = await page(next);
    await result.page.goto(`${fixture.origin}/general-search`, { waitUntil: "domcontentloaded" });
    await expectOwner(result.page);
    return result;
  }
  try {
    // Core ownership and integration boundary, including a completely fresh SS.
    {
      const next = await context();
      const primary = await owner(next);
      await expect.poll(() => fixture.state.websocketConnections).toBe(1);
      const secondary = await page(next);
      for (const route of ["/collection/records", "/general-search", "/saved", "/viewer", "/import", "/monitor?section=activity"]) {
        secondary.tracker.requests = []; secondary.tracker.sockets = [];
        await secondary.page.goto(`${fixture.origin}${route}`, { waitUntil: "domcontentloaded" });
        await expectBlocked(secondary.page, secondary.tracker);
      }
      await secondary.page.getByRole("button", { name: "Semak Semula", exact: true }).click();
      await expectBlocked(secondary.page, secondary.tracker);
      await expectOwner(primary.page);
      pass("same account + same profile: every protected deep link is blocked before any protected mount/fetch/WebSocket; recheck cannot steal");

      await primary.page.getByTestId("input-search").fill("Synthetic");
      await primary.page.getByTestId("button-search").click();
      await expect(primary.page.getByTestId("button-view-0")).toBeVisible();
      await navigateModule(primary.page, "saved", "[data-testid='button-view-single-tab-synthetic-import']");
      await primary.page.getByTestId("button-view-single-tab-synthetic-import").click();
      await expect(primary.page.getByRole("cell", { name: "Synthetic Tab Customer", exact: true })).toBeVisible();
      await navigateModule(primary.page, "import", "[data-testid='tab-single-import']");
      await navigateModule(primary.page, "activity", "[data-testid='button-toggle-filters']");
      await navigateModule(primary.page, "collection-report", ".collection-section-nav");
      await primary.page.getByRole("button", { name: /View Rekod Collection/ }).click();
      await expect(primary.page.getByTestId("collection-records-page")).toBeVisible();
      await expect(secondary.page.locator('[data-single-tab-status="blocked"]')).toBeVisible();
      pass("original tab continues real SPA Search, Saved/Viewer, Import, Activity and Collection navigation while second tab is blocked");

      const logoutBefore = fixture.state.requests.filter((item) => /POST \/api\/(activity|auth)\/logout/.test(item)).length;
      await secondary.page.getByRole("button", { name: "Tutup Tab", exact: true }).click();
      if (!secondary.page.isClosed()) await secondary.page.close();
      assert.equal(fixture.state.requests.filter((item) => /POST \/api\/(activity|auth)\/logout/.test(item)).length, logoutBefore);
      await expect(primary.page.locator(".sqr-workspace")).toBeVisible();
      const waiting = await page(next);
      await waiting.page.goto(`${fixture.origin}/general-search`);
      await expectBlocked(waiting.page, waiting.tracker);
      await primary.page.close();
      await waiting.page.waitForTimeout(300);
      await expectBlocked(waiting.page, waiting.tracker);
      await waiting.page.getByRole("button", { name: "Semak Semula", exact: true }).click();
      await expectOwner(waiting.page);
      pass("Tutup Tab never logs out owner; closing owner never auto-mounts waiting tab; manual recheck then acquires real released lock");
      await closeContext(next);
    }

    // Different storage documents race a single browser-owned, atomic lock.
    {
      const next = await context();
      const left = await page(next); const right = await page(next);
      await Promise.all([left.page.goto(`${fixture.origin}/general-search`), right.page.goto(`${fixture.origin}/general-search`)]);
      for (let iteration = 0; iteration < 3; iteration++) {
        await expect.poll(async () => (await left.page.locator(".sqr-workspace").count()) + (await right.page.locator(".sqr-workspace").count())).toBe(1);
        await expect.poll(async () => (await left.page.locator('[data-single-tab-status="blocked"]').count()) + (await right.page.locator('[data-single-tab-status="blocked"]').count())).toBe(1);
        const held = await left.page.evaluate(async () => (await navigator.locks.query()).held.filter((lock) => lock.name === "sqr:active-tab:v1:single-tab-synthetic-account").length);
        assert.equal(held, 1);
        if (iteration < 2) await Promise.all([left.page.reload(), right.page.reload()]);
      }
      pass("simultaneous opening and two simultaneous refresh cycles retain exactly one protected owner and one browser Web Lock");
      await closeContext(next);
    }

    // Auth pending cannot hydrate an optimistic stored user into protected UI.
    {
      const next = await context();
      const pending = await page(next);
      await pending.page.addInitScript((user) => {
        sessionStorage.setItem("user", JSON.stringify(user));
        sessionStorage.setItem("username", user.username); sessionStorage.setItem("role", user.role);
        sessionStorage.setItem("sessionStoredAt", String(Date.now()));
        sessionStorage.setItem("sessionExpiresAt", String(Date.now() + 60 * 60_000));
      }, singleTabFixtureUser);
      const release = fixture.holdMe();
      try {
        await pending.page.goto(`${fixture.origin}/collection/records`, { waitUntil: "domcontentloaded" });
        await expect.poll(() => pending.tracker.requests.includes("GET /api/me")).toBe(true);
        assert.deepEqual(sensitive(pending.tracker.requests), []);
        assert.equal(await pending.page.evaluate(() => window.__singleTabProtectedMounted), false);
        assert.deepEqual(pending.tracker.sockets, []);
      } finally { release(); }
      await expect(pending.page.getByTestId("collection-records-page")).toBeVisible();
      pass("stored/hydrated identity and deep link do not bypass pending authoritative backend validation");
      await closeContext(next);
    }

    // Reproduce CI: the tab-checking main is not the Collection page to scan.
    {
      const next = await context();
      const pending = await page(next);
      let meCalls = 0;
      let release;
      const activation = new Promise((resolve) => { release = resolve; });
      await pending.page.route(`${fixture.origin}/api/me`, async (route) => {
        if (++meCalls === 2) await activation;
        await route.continue();
      });
      try {
        await pending.page.goto(`${fixture.origin}/collection/save`, { waitUntil: "domcontentloaded" });
        await expect(pending.page.locator('[data-single-tab-status="checking"]')).toBeVisible();
        await expect.poll(() => meCalls).toBe(2);
        await pending.page.locator("#boot-shell").waitFor({ state: "hidden" });
        await expect(pending.page.locator("main#main-content")).toHaveCount(1);
        await expect(pending.page.locator("h1,h2,h3,h4,h5,h6,[role='heading']")).toHaveCount(0);
        let ready = false;
        const readiness = waitForProtectedContractContent(pending.page).then(() => { ready = true; });
        void readiness.catch(() => {});
        // This deliberate controlled hold detects accepting the generic gate
        // main; it is not a sleep used to make production route readiness pass.
        await pending.page.waitForTimeout(100);
        assert.equal(ready, false, "Visual/a11y scanning must not start on the transient no-heading tab gate");
        assert.deepEqual(sensitive(pending.tracker.requests), []);
        assert.deepEqual(pending.tracker.sockets, []);
        release();
        await readiness;
        await expect(pending.page.locator(".collection-section-nav")).toBeVisible();
        assert.ok(await pending.page.locator("h1,h2,h3,h4,h5,h6,[role='heading']").count() > 0);
        const blocked = await page(next);
        await blocked.page.goto(`${fixture.origin}/collection/save`);
        await expectBlocked(blocked.page, blocked.tracker);
        await assert.rejects(waitForProtectedContractContent(blocked.page, 100), /Timeout/);
        pass("visual/a11y readiness ignores a no-heading tab-checking main, waits for real Collection content and rejects blocked tabs");
      } finally { release(); }
      await closeContext(next);
    }

    // A missing API capability must not silently fall back to storage.
    {
      const next = await context({ viewport: { width: 320, height: 760 } });
      const unsupported = await page(next);
      await unsupported.page.addInitScript(() => Object.defineProperty(navigator, "locks", { configurable: true, value: undefined }));
      await unsupported.page.goto(`${fixture.origin}/general-search`);
      await expect(unsupported.page.locator('[data-single-tab-status="unsupported"]')).toBeVisible();
      assert.deepEqual(sensitive(unsupported.tracker.requests), []);
      assert.deepEqual(unsupported.tracker.sockets, []);
      assert.equal(await unsupported.page.evaluate(() => window.__singleTabProtectedMounted), false);
      await expect(unsupported.page.getByRole("button", { name: "Semak Semula", exact: true })).toBeDisabled();
      await assert.rejects(waitForProtectedContractContent(unsupported.page, 100), /Timeout/);
      assert.equal(await unsupported.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await unsupported.page.screenshot({ path: path.join(directory, "unsupported-320.png"), fullPage: true });
      pass("unsupported Web Locks fail closed at 320px without a localStorage fallback or protected traffic");
      await closeContext(next);
    }

    // Blocked design, focus, light/dark, reduced motion and genuine Q asset.
    {
      const next = await context();
      await owner(next);
      let blocked;
      for (const theme of ["light", "dark"]) {
        if (blocked) await blocked.page.close();
        blocked = await page(next);
        await blocked.page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await blocked.page.addInitScript((value) => localStorage.setItem("theme", value), theme);
        for (const width of [320, 390, 640, 641, 722, 767, 768, 1023, 1024, 1440]) {
          await blocked.page.setViewportSize({ width, height: 960 });
          blocked.tracker.requests = []; blocked.tracker.sockets = [];
          await blocked.page.goto(`${fixture.origin}/general-search`);
          await expectBlocked(blocked.page, blocked.tracker);
          assert.equal(await blocked.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          // The public boot-shell h1 is removed on the next animation frame.
          // Assert the same final semantic contract without racing that cleanup.
          await expect(blocked.page.locator("main"), `${theme}/${width}px: exactly one main landmark`).toHaveCount(1);
          await expect(blocked.page.locator("h1"), `${theme}/${width}px: exactly one page heading`).toHaveCount(1);
          const logo = blocked.page.locator(".sqr-tab-brand-image");
          await expect(logo).toHaveAttribute("src", /\/brand\//);
          await expect.poll(() => logo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
          await expectPolishedLayout(blocked.page, width);
          if (width === 320 || width === 1440) {
            await blocked.page.addScriptTag({ content: axeSource });
            const violations = await blocked.page.evaluate(async () => (await window.axe.run(document, {
              runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
            })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })));
            assert.deepEqual(violations, [], `Blocked ${theme}/${width}px must pass axe WCAG A/AA`);
          }
          await blocked.page.screenshot({ path: path.join(directory, `blocked-${theme}-${width}.png`), fullPage: true });
        }
      }
      const retry = blocked.page.getByRole("button", { name: "Semak Semula", exact: true });
      await retry.focus(); await expect(retry).toBeFocused();
      await blocked.page.keyboard.press("Enter"); await expectBlocked(blocked.page, blocked.tracker);
      await blocked.page.keyboard.press("Tab");
      await expect(blocked.page.getByRole("button", { name: "Tutup Tab", exact: true })).toBeFocused();
      pass("blocked page fits 10 widths from 320–1440px in light/dark/reduced-motion, aligned equal-height actions, non-overlapping art, valid Q and keyboard controls");
      await closeContext(next);
    }

    // Backend identity changes while waiting must re-enter the ownership gate.
    {
      const next = await context();
      fixture.state.user = { ...singleTabFixtureUser, id: "single-tab-second-account", username: "single.tab.second" };
      await owner(next);
      const stale = await page(next);
      let meCalls = 0;
      await stale.page.route(`${fixture.origin}/api/me`, async (route) => {
        meCalls += 1;
        if (meCalls === 1) return route.fulfill({ json: { ok: true, user: singleTabFixtureUser, sessionExpiresAt: "2099-01-01T00:00:00.000Z" } });
        return route.continue();
      });
      await stale.page.goto(`${fixture.origin}/general-search`);
      await expectBlocked(stale.page, stale.tracker);
      assert.ok(meCalls >= 2, "Activation must revalidate authoritative identity after obtaining its original lock");
      pass("backend account switch between bootstrap and activation cannot mount new account under stale account ownership");
      await closeContext(next);
    }

    // A previously active document must not reuse the old account's query data.
    {
      const next = await context();
      const original = await owner(next);
      await navigateModule(original.page, "dashboard", "[data-testid='card-total-users']");
      await expect(original.page.getByTestId("card-total-users")).toContainText("1");
      await expect.poll(() => fixture.state.requests.includes("GET /api/analytics/summary")).toBe(true);
      await original.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      await expect(original.page.locator(".sqr-workspace")).toHaveCount(0);
      fixture.state.user = { ...singleTabFixtureUser, id: "single-tab-second-account", username: "single.tab.second", fullName: "Synthetic Second Operator" };
      const secondOwner = await owner(next);
      original.tracker.requests = []; original.tracker.sockets = [];
      await original.page.evaluate(() => {
        window.__singleTabProtectedMounted = false;
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      });
      await expectBlocked(original.page, original.tracker);
      await secondOwner.page.close();
      const analyticsBefore = fixture.state.requests.filter((endpoint) => endpoint === "GET /api/analytics/summary").length;
      await original.page.getByRole("button", { name: "Semak Semula", exact: true }).click();
      await expect(original.page.getByRole("button", { name: "Open profile menu for single.tab.second", exact: true })).toBeVisible();
      await expect(original.page.locator(".sqr-workspace")).toHaveCount(1);
      await navigateModule(original.page, "dashboard", "[data-testid='text-dashboard-title']");
      await expect.poll(() => fixture.state.requests.filter((endpoint) => endpoint === "GET /api/analytics/summary").length).toBeGreaterThan(analyticsBefore);
      pass("previous owner restored as a different account stays blocked until its own lock is free, then refetches instead of reusing the old protected query cache");
      await closeContext(next);
    }

    // Existing auth actions, real lifecycle messages and timer still unmount.
    {
      const next = await context();
      const active = await owner(next);
      const waiting = await page(next);
      await waiting.page.goto(`${fixture.origin}/general-search`);
      await expectBlocked(waiting.page, waiting.tracker);
      await active.page.close();
      fixture.state.authenticated = false;
      waiting.tracker.requests = [];
      await waiting.page.getByRole("button", { name: "Semak Semula", exact: true }).click();
      await expect.poll(() => waiting.tracker.requests.includes("GET /api/me")).toBe(true);
      await expect.poll(() => waiting.page.evaluate(async () => (await navigator.locks.query()).held.filter((lock) => lock.name?.startsWith("sqr:active-tab:v1:")).length)).toBe(0);
      await expect(waiting.page.locator(".sqr-workspace")).toHaveCount(0);
      assert.equal(await waiting.page.evaluate(() => window.__singleTabProtectedMounted), false);
      assert.deepEqual(sensitive(waiting.tracker.requests), []);
      assert.deepEqual(waiting.tracker.sockets, []);
      pass("expired/revoked backend identity on manual recheck releases acquired lock without ever mounting protected content");
      await closeContext(next);
    }
    {
      const next = await context();
      const original = await owner(next);
      const waiting = await page(next);
      await waiting.page.goto(`${fixture.origin}/general-search`);
      await expectBlocked(waiting.page, waiting.tracker);
      // Exercise the explicit persisted lifecycle handler, rather than claiming
      // a browser happened to put a lock-holding document in BFCache.
      await original.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      await expect(original.page.locator(".sqr-workspace")).toHaveCount(0);
      await waiting.page.getByRole("button", { name: "Semak Semula", exact: true }).click();
      await expectOwner(waiting.page);
      original.tracker.requests = []; original.tracker.sockets = [];
      await original.page.evaluate(() => {
        window.__singleTabProtectedMounted = false;
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      });
      await expectBlocked(original.page, original.tracker);
      pass("synthetic persisted pagehide/pageshow: restored document must reacquire ownership and cannot retain its protected subtree");
      await closeContext(next);
    }
    for (const reason of ["kicked", "idle_timeout", "banned", "logout"]) {
      const next = await context();
      const active = await owner(next);
      await expect.poll(() => fixture.state.websocketConnections).toBe(1);
      fixture.broadcast(reason);
      await expect(active.page.locator(".sqr-workspace")).toHaveCount(0);
      const held = await active.page.evaluate(async () => (await navigator.locks.query()).held.filter((lock) => lock.name?.startsWith("sqr:active-tab:v1:")).length);
      assert.equal(held, 0);
      if (reason === "banned") await expect(active.page.getByRole("heading", { name: /disekat/i })).toBeVisible();
      pass(`${reason}: existing synthetic server WebSocket lifecycle unmounts protected app and releases account lock`);
      await closeContext(next);
    }
    {
      const next = await context();
      const active = await owner(next);
      await active.page.getByTestId("button-user-menu").click();
      await active.page.getByTestId("button-logout").click();
      await expect(active.page.locator(".sqr-workspace")).toHaveCount(0);
      assert.equal(fixture.state.authenticated, false);
      await active.page.goto(`${fixture.origin}/login`);
      await active.page.getByTestId("input-username").fill(singleTabFixtureUser.username);
      await active.page.getByTestId("input-password").fill(singleTabFixturePassword);
      await active.page.getByTestId("button-login").click();
      await expect(active.page.locator(".sqr-workspace")).toBeVisible({ timeout: 20_000 });
      pass("real login/logout UI can release and reacquire account ownership without stale gate state");
      await closeContext(next);
    }
    {
      const next = await context();
      const active = await page(next);
      await active.page.clock.install();
      await active.page.goto(`${fixture.origin}/general-search`);
      await active.page.clock.runFor(1_000);
      await expectOwner(active.page);
      // Use the real default 30-minute policy rather than racing an async
      // settings response that changes the timeout after initial mount.
      await active.page.clock.fastForward(30 * 60_000 + 1_000);
      await expect(active.page.locator(".sqr-workspace")).toHaveCount(0);
      assert.ok(fixture.state.requests.includes("POST /api/activity/logout"));
      pass("existing client idle timeout still logs out and removes protected ownership (virtual browser time, no real wait)");
      await closeContext(next);
    }
    passed = true;
  } catch (error) {
    failures.push(error.message);
    if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(directory, "failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await writeFile(path.join(directory, "report.json"), JSON.stringify({ passed,
      scope: "Actual built frontend, native browser Web Locks and synthetic loopback HTTP/WebSocket only. No backend security or cross-device lease claim.", checks, failures, unexpected: fixture.state.unexpected }, null, 2));
    for (const next of contexts) await next.close();
    await browser.close();
    await fixture.close();
  }
  console.log(`PASS ${checks.length} single-active-tab browser checks`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runSingleActiveTabBrowser().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
