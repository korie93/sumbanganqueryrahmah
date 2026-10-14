import { expect, test, type Locator, type Page } from "@playwright/test";
import { checkFixture, installFixture as installSaveFixture, nickname } from "./helpers/save-collection-fixture";

// Static production frontend, synthetic loopback responses, no real accounts or
// data. The shared fixture rejects every off-origin/unexpected API request.
test.use({ serviceWorkers: "block" });
test.afterEach(async ({ page }) => {
  // Test-only listeners never persist beyond the current page/test.
  await page.evaluate(() => {
    const listeners = (window as unknown as Record<string, EventListener | undefined>);
    for (const key of ["__sqrSidebarMotionCounter"]) {
      if (listeners[key]) document.removeEventListener("animationstart", listeners[key]!, true);
      delete listeners[key];
    }
    document.querySelectorAll<SVGElement>(".sidebar-menu-icon-motion").forEach((icon) => icon.style.removeProperty("animation-play-state"));
  });
});

type Role = "admin" | "user" | "superuser";
const marker = ".sidebar-menu-icon-motion";
const menu = (page: Page) => page.locator("aside.workspace-sidebar");
const toggle = (page: Page) => page.getByTestId("button-toggle-sidebar");
const motionById: Record<string, string> = {
  home: "lift", "general-search": "inspect", "collection-report": "lift", workspace: "lift",
  import: "lift", saved: "lift", viewer: "inspect", insights: "lift", dashboard: "lift", activity: "lift",
  monitor: "inspect", analysis: "lift", "audit-logs": "lift", "settings-menu": "tilt", settings: "tilt", backup: "inspect",
};
const groupsByRole = (role: Role) => [
  { id: "workspace", items: ["import", "saved", "viewer"] },
  { id: "insights", items: ["dashboard", "activity", "monitor", "analysis", ...(role === "superuser" ? ["audit-logs"] : [])] },
  ...(role === "user" ? [] : [{ id: "settings-menu", items: ["settings", ...(role === "superuser" ? ["backup"] : [])] }]),
];

async function installFixture(page: Page, baseURL: string | undefined, role: Role = "superuser", theme: "light" | "dark" = "light", lowSpec = false) {
  const fixture = await installSaveFixture(page, baseURL, { role, theme });
  // Exercise both real production branches deterministically, independent of
  // the test runner's core count. This storage is isolated to each test context.
  await page.addInitScript((low) => localStorage.setItem("perf_mode", low ? "low" : "high"), lowSpec);
  page.on("console", (message) => {
    if (message.type() === "error") fixture.errors.push(`console: ${message.text()}`);
  });
  // Grant configurable pages in this synthetic fixture. The production client
  // still applies protected-role restrictions (e.g. user Settings/admin Backup).
  await page.context().route(`${new URL(baseURL!).origin}/api/settings/tab-visibility`, (route) =>
    route.fulfill({ status: 200, json: { role, tabs: Object.fromEntries(Object.keys(motionById).map((id) => [id, true])) },
      headers: { "Cache-Control": "no-store" } }));
  await page.context().route(`${new URL(baseURL!).origin}/api/search/columns`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ status: 200, json: ["Customer Name", "Card No"], headers: { "Cache-Control": "no-store" } });
  });
  // The unchanged superuser Settings hover prefetches its permitted Backup list.
  // Fulfill that real read contract, not arbitrary APIs or mutation requests.
  await page.context().route(`${new URL(baseURL!).origin}/api/backups**`, (route) => {
    if (role !== "superuser" || route.request().method() !== "GET"
      || new URL(route.request().url()).pathname !== "/api/backups") return route.fallback();
    return route.fulfill({ status: 200, json: { backups: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } },
      headers: { "Cache-Control": "no-store" } });
  });
  // Normal-mode hover/focus keeps the production Dashboard data prefetch on.
  // These six exact reads cover its defaults, using the current shared API
  // schemas (notably every unique hour is required by the peak-hours contract).
  const analyticsReads: Record<string, unknown> = {
    "/api/analytics/summary": {
      totalUsers: 0, activeSessions: 0, loginsToday: 0, totalDataRows: 0, totalImports: 0,
      bannedUsers: 0, collectionRecordVersionConflicts24h: 0, loginFailures24h: 0, backupActions24h: 0,
    },
    "/api/analytics/login-trends?days=7": [],
    "/api/analytics/top-users?pageSize=10": [],
    "/api/analytics/recent-login-activity?pageSize=8": [],
    "/api/analytics/peak-hours": Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
    "/api/analytics/role-distribution": [],
  };
  await page.context().route(`${new URL(baseURL!).origin}/api/analytics/**`, (route) => {
    const url = new URL(route.request().url());
    const endpoint = `${url.pathname}${url.search}`;
    if (route.request().method() !== "GET" || !Object.prototype.hasOwnProperty.call(analyticsReads, endpoint)) return route.fallback();
    return route.fulfill({ status: 200, json: analyticsReads[endpoint], headers: { "Cache-Control": "no-store" } });
  });
  return fixture;
}

async function ready(page: Page, role: Role = "superuser") {
  await page.goto("/collection/save");
  if (role === "superuser") {
    await page.locator("#save-collection-superuser-nickname").click();
    await page.getByRole("button", { name: nickname, exact: true }).click();
  }
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
  await page.mouse.move(600, 150);
  await page.locator("#main-content").focus();
}

async function resting(page: Page) {
  await page.mouse.move(600, 150);
  // PopoverContent uses asChild: the nav itself owns this class, not a nested nav.
  const panel = page.locator('.workspace-nav-flyout[role="navigation"]');
  if (await panel.count() && await panel.isVisible()) {
    // Clear icon focus inside the nonmodal panel, without an outside-focus
    // dismissal. Retain a programmatically focusable, non-Tab-stop container
    // until the isolated flyout unmounts; removing it here can blur the panel.
    await panel.evaluate((element: HTMLElement) => {
      element.tabIndex = -1;
      element.focus({ preventScroll: true });
    });
  } else await page.locator("#main-content").focus();
  await expect.poll(() => allMotion(page)).toEqual([]);
}

async function allMotion(page: Page) {
  return page.locator(marker).evaluateAll((icons) => icons.flatMap((icon) => icon.getAnimations()
    .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
    .map((animation) => ({ testId: icon.closest("button")?.getAttribute("data-testid"), name: animation.animationName,
      state: animation.playState, iterations: animation.effect?.getTiming().iterations,
      duration: animation.effect?.getTiming().duration, fill: animation.effect?.getTiming().fill }))));
}

async function geometry(page: Page, button: Locator) {
  return { button: await button.boundingBox(), sidebar: await menu(page).boundingBox(),
    main: await page.locator("#main-content").boundingBox() };
}

async function settleNavigationGeometry(button: Locator) {
  // Keep the existing sidebar-width and flyout-entry transitions enabled. Wait
  // for those finite ancestor effects before measuring whether ICON hover adds
  // a layout shift; otherwise the comparison samples an unrelated entry zoom.
  await button.evaluate(async (element) => {
    const nodes = new Set<Element>();
    for (const start of [element, document.querySelector(".workspace-sidebar"), document.querySelector("#main-content")]) {
      for (let node = start; node; node = node.parentElement) nodes.add(node);
    }
    const animations = [...nodes].flatMap((node) => node.getAnimations())
      .filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function expectGesture(page: Page, button: Locator, id: string, kind: "hover" | "focus" = "hover", capture = false) {
  await resting(page);
  const icon = button.locator(marker);
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("data-sidebar-icon-motion", motionById[id]!);
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await settleNavigationGeometry(button);
  const before = await geometry(page, button);
  // Pause the target's play-state BEFORE interaction so a 220ms compositor
  // animation cannot finish before a throttled animationstart listener runs.
  // Name, duration, iteration count and existence still come only from real
  // production hover/focus CSS; this cannot create a missing animation.
  await icon.evaluate((element: SVGElement) => element.style.setProperty("animation-play-state", "paused", "important"));
  if (kind === "hover") await button.hover();
  else {
    // Set real keyboard modality before moving focus to the existing button.
    await page.keyboard.press("Tab");
    await button.focus();
    expect(await button.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  }
  await expect.poll(() => allMotion(page)).toEqual([{
    testId: await button.getAttribute("data-testid"), name: `sidebar-icon-${motionById[id]}`,
    state: "paused", iterations: 1, duration: 220, fill: "none",
  }]);
  await icon.evaluate((element) => {
    const animation = element.getAnimations().find((entry) => entry instanceof CSSAnimation);
    if (!animation) throw new Error("Interaction did not create the expected native CSS animation");
    animation.currentTime = Number(animation.effect?.getTiming().duration) * 0.45;
  });
  expect(await icon.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  expect(await geometry(page, button)).toEqual(before);
  if (capture) {
    // Diagnostic evidence of the actual CSS at its sampled 45% pose; these are
    // not snapshot baselines, timing measurements or changed production media.
    await test.info().attach(`sidebar-gesture-${id}`, { body: await page.screenshot(), contentType: "image/png" });
  }
  await resting(page);
  await expect(icon).toHaveCSS("transform", "none");
  await expect(icon).toHaveCSS("animation-name", "none");
  await icon.evaluate((element: SVGElement) => element.style.removeProperty("animation-play-state"));
}

for (const { role, lowSpec } of [
  { role: "superuser", lowSpec: false }, { role: "admin", lowSpec: false },
  { role: "user", lowSpec: false }, { role: "superuser", lowSpec: true },
] as const) {
  // Independent contexts bound each CI case without extending its timeout or
  // dropping any icon, permission or interaction assertion from either state.
  for (const collapsed of [false, true]) {
    test(`all ${role} desktop menu and flyout icons animate only the target, ${collapsed ? "collapsed" : "expanded"} (${lowSpec ? "low-spec" : "normal"})`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const fixture = await installFixture(page, baseURL, role, role === "admin" ? "dark" : "light", lowSpec);
      await ready(page, role);
      if (lowSpec) await expect(page.locator("html")).toHaveClass(/low-spec/);
      else await expect(page.locator("html")).not.toHaveClass(/low-spec/);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const groups = groupsByRole(role);
      const direct = ["home", "general-search", "collection-report"];
      await expect(menu(page).locator(marker)).toHaveCount(direct.length + groups.length);
      if (collapsed) await toggle(page).click();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", String(!collapsed));
      for (const id of direct) await expectGesture(page, page.getByTestId(`nav-${id}`), id, "hover", role === "superuser" && !lowSpec && !collapsed && id !== "collection-report");
      for (const group of groups) {
        // Existing group activation expands the sidebar before opening flyouts.
        if (collapsed && await toggle(page).getAttribute("aria-expanded") === "true") await toggle(page).click();
        const trigger = page.getByTestId(`nav-group-${group.id}`);
        await expectGesture(page, trigger, group.id, "hover", role === "superuser" && !lowSpec && !collapsed && group.id === "settings-menu");
        await trigger.click();
        await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
        const panel = page.getByTestId(`desktop-flyout-${group.id}`);
        await expect(panel).toBeVisible();
        await expect(panel.locator(marker)).toHaveCount(group.items.length);
        for (const id of group.items) await expectGesture(page, panel.getByTestId(`flyout-nav-${id}`), id, "hover", role === "superuser" && !lowSpec && !collapsed && id === "viewer");
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
        await expect(trigger).toBeFocused();
      }
      await expect(page.getByTestId("flyout-nav-backup")).toHaveCount(0);
      await expect(page.getByTestId("flyout-nav-audit-logs")).toHaveCount(0);
      if (role === "user") await expect(page.getByTestId("nav-group-settings-menu")).toHaveCount(0);
      await checkFixture(page, fixture);
    });
  }
}

test("keyboard focus animates native controls without delaying Enter, Space or flyout Escape", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await ready(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const group = page.getByTestId("nav-group-workspace");
  await expectGesture(page, group, "workspace", "focus");
  await group.focus();
  await page.keyboard.press("ArrowRight");
  const panel = page.getByTestId("desktop-flyout-workspace");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("flyout-nav-import")).toBeFocused();
  await expectGesture(page, panel.getByTestId("flyout-nav-viewer"), "viewer", "focus");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(group).toBeFocused();
  await group.press("Space");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  const search = page.getByTestId("nav-general-search");
  await expectGesture(page, search, "general-search", "focus");
  await search.focus();
  await search.press("Enter");
  await expect(page).toHaveURL(/\/general-search$/);
  await expect(page.getByTestId("input-search")).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await checkFixture(page, fixture);
});

test("native hover gestures finish while the pointer stays still, then replay only on re-entry", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL);
  await ready(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const target = page.getByTestId("nav-collection-report");
  const icon = target.locator(marker);
  await icon.evaluate((element) => {
    const listener: EventListener = (event) => {
      if (event.target === element) element.setAttribute("data-test-starts", String(Number(element.getAttribute("data-test-starts") ?? "0") + 1));
    };
    (window as unknown as Record<string, EventListener>).__sqrSidebarMotionCounter = listener;
    document.addEventListener("animationstart", listener, true);
  });
  for (const count of [1, 2]) {
    await target.hover();
    await expect(icon).toHaveAttribute("data-test-starts", String(count));
    await expect(icon).toHaveCSS("animation-iteration-count", "1");
    await expect(icon).toHaveCSS("animation-fill-mode", "none");
    await expect.poll(async () => (await allMotion(page)).filter(({ state }) => state === "running").length).toBe(0);
    await expect(icon).toHaveCSS("transform", "none");
    await expect(icon).toHaveAttribute("data-test-starts", String(count));
    await resting(page);
  }
  await checkFixture(page, fixture);
});

test("reduced motion and disabled native controls never animate", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL, "admin", "dark", true);
  await ready(page, "admin");
  await expect(page.locator("html")).toHaveClass(/low-spec/);
  const collection = page.getByTestId("nav-collection-report");
  await collection.hover();
  await expect(collection.locator(marker)).toHaveCSS("animation-name", "none");
  expect(await allMotion(page)).toEqual([]);
  await collection.focus();
  await page.keyboard.press("Tab");
  await collection.focus();
  await expect(collection.locator(marker)).toHaveCSS("animation-name", "none");
  await resting(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const home = page.getByTestId("nav-home");
  await home.evaluate((element: HTMLButtonElement) => { element.disabled = true; });
  await home.hover();
  await expect(home.locator(marker)).toHaveCSS("animation-name", "none");
  await home.evaluate((element: HTMLButtonElement) => { element.disabled = false; element.setAttribute("aria-disabled", "true"); });
  await resting(page);
  await home.hover();
  await expect(home.locator(marker)).toHaveCSS("animation-name", "none");
  await home.evaluate((element) => element.removeAttribute("aria-disabled"));
  await resting(page);
  await checkFixture(page, fixture);
});

for (const width of [390, 1023]) {
  test(`mobile/tablet ${width}px navigation stays static and keeps its normal keyboard drawer`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, "admin", "light", true);
    await ready(page, "admin");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(menu(page)).toBeHidden();
    const launch = page.getByTestId("button-open-mobile-nav");
    await launch.click();
    const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(marker)).toHaveCount(0);
    const group = page.getByTestId("mobile-nav-group-workspace");
    await group.hover();
    expect(await allMotion(page)).toEqual([]);
    await group.click();
    await expect(page.getByTestId("mobile-submenu-workspace")).toBeVisible();
    await page.getByTestId("mobile-nav-import").hover();
    expect(await allMotion(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mobile-submenu-workspace")).toBeHidden();
    await expect(group).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(launch).toBeFocused();
    await checkFixture(page, fixture);
  });
}

for (const rate of [4, 6]) {
  test(`desktop icon gestures stay enabled with ${rate}x CPU throttling and preserve immediate native actions`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fixture = await installFixture(page, baseURL, "admin", "light", true);
    await ready(page, "admin");
    await expect(page.locator("html")).toHaveClass(/low-spec/);
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate });
    try {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      // Observe a real unpaused gesture under throttling first. Finishing while
      // the pointer stays on the button proves no idle/permanent loop is added.
      const collection = page.getByTestId("nav-collection-report");
      const icon = collection.locator(marker);
      await icon.evaluate((element) => {
        const listener: EventListener = (event) => {
          if (event.target === element) element.setAttribute("data-test-starts", "1");
        };
        (window as unknown as Record<string, EventListener>).__sqrSidebarMotionCounter = listener;
        document.addEventListener("animationstart", listener, true);
      });
      await collection.hover();
      await expect(icon).toHaveAttribute("data-test-starts", "1");
      await expect(icon).toHaveCSS("animation-iteration-count", "1");
      await expect(icon).toHaveCSS("animation-fill-mode", "none");
      await expect.poll(async () => (await allMotion(page)).filter(({ state }) => state === "running").length).toBe(0);
      await expect(icon).toHaveCSS("transform", "none");
      await resting(page);
      await expectGesture(page, page.getByTestId("nav-home"), "home");
      const group = page.getByTestId("nav-group-workspace");
      await expectGesture(page, group, "workspace", "focus");
      await group.focus();
      await group.press("Enter");
      await expect(page.getByTestId("desktop-flyout-workspace")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(group).toBeFocused();
      await page.getByTestId("nav-general-search").click();
      await expect(page).toHaveURL(/\/general-search$/);
      await expect(page.getByTestId("input-search")).toBeVisible();
      await checkFixture(page, fixture);
    } finally {
      await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await session.detach();
    }
  });
}
