import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type APIResponse, type Page, type Route } from "@playwright/test";
import type { AxeResults } from "axe-core";

// Real compiled routes and original same-origin artwork, fictional public HTTP only.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });
test.afterEach(async ({ page }) => {
  await finishFixture(page);
});
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const themeKey = "sqr-landing-next-theme";
const strictPolicy = "script-src 'self'; require-trusted-types-for 'script'; style-src-elem 'self'; style-src-attr 'none'";
type Theme = "light" | "dark";
type StorageFailure = "denied-getter" | "denied-read" | "quota-write";
type DeviceProfile = {
  performanceMode?: "low" | "high" | "auto"; cores?: number; memory?: number;
  saveData?: boolean; effectiveType?: string;
};
type Fixture = { unexpected: string[]; errors: string[]; cspErrors: string[]; assets: string[]; pending: Set<Promise<void>> };
const pendingRoutes = new WeakMap<Page, Set<Promise<void>>>();

async function finishFixture(page: Page) {
  const pending = pendingRoutes.get(page);
  // Keep interception registered until every response callback finishes. Removing
  // routes first lets Playwright auto-continue another callback's pending fetch.
  while (pending?.size) await Promise.all(pending);
  await page.unrouteAll({ behavior: "wait" });
  pendingRoutes.delete(page);
}

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: Theme; profile?: DeviceProfile; observer?: boolean; reducedMotion?: boolean; storageFailure?: StorageFailure;
  beforeCspFulfill?: (pathname: string, response: APIResponse) => Promise<void>;
} = {}): Promise<Fixture> {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture: Fixture = { unexpected: [], errors: [], cspErrors: [], assets: [], pending: new Set() };
  pendingRoutes.set(page, fixture.pending);
  page.on("pageerror", error => fixture.errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /content security policy|trustedtype|trusted type|violates.*directive/i.test(message.text())) fixture.cspErrors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: options.reducedMotion === false ? "no-preference" : "reduce" });
  await page.addInitScript(({ profile, observer, storageFailure, landingThemeKey }) => {
    if (profile.performanceMode === "auto") localStorage.removeItem("perf_mode");
    else localStorage.setItem("perf_mode", profile.performanceMode ?? "high");
    localStorage.setItem("theme", "light");
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => profile.cores ?? 8 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => profile.memory ?? 8 });
    Object.defineProperty(navigator, "connection", { configurable: true, value: {
      saveData: profile.saveData ?? false, effectiveType: profile.effectiveType ?? "4g",
      addEventListener() {}, removeEventListener() {},
    } });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    if (!observer) Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: undefined });
    if (storageFailure === "denied-getter") {
      Object.defineProperty(window, "localStorage", { configurable: true, get() {
        throw new DOMException("Synthetic storage access denied", "SecurityError");
      } });
    } else if (storageFailure === "denied-read") {
      const originalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function (this: Storage, key: string) {
        if (key === landingThemeKey) throw new DOMException("Synthetic storage read denied", "SecurityError");
        return originalGet.call(this, key);
      };
    } else if (storageFailure === "quota-write") {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (key === landingThemeKey) throw new DOMException("Synthetic storage quota reached", "QuotaExceededError");
        return originalSet.call(this, key, value);
      };
    }
  }, { profile: options.profile ?? {}, observer: options.observer !== false,
    storageFailure: options.storageFailure, landingThemeKey: themeKey });
  await page.context().routeWebSocket("**/*", socket => socket.close());
  const handleRoute = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { fixture.unexpected.push("off-origin request"); return route.abort(); }
    if (["script", "stylesheet", "image"].includes(request.resourceType())) fixture.assets.push(url.pathname);
    if (request.method() === "GET" && url.pathname === "/api/health/connectivity") return route.fulfill({ status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } });
    if (request.method() === "GET" && url.pathname === "/api/health") return route.fulfill({ json: { status: "ok", ready: true } });
    if (request.method() === "GET" && url.pathname === "/api/maintenance-status") return route.fulfill({ json: { maintenance: false } });
    if (request.method() === "GET" && url.pathname === "/api/me") return route.fulfill({ status: 401, json: { ok: false } });
    if (url.pathname.startsWith("/api/telemetry/") && ["GET", "POST"].includes(request.method())) return route.fulfill({ json: { ok: true } });
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) { fixture.unexpected.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if ((request.isNavigationRequest() && request.resourceType() === "document") || url.pathname.startsWith("/landing-next/")) {
      const response = await route.fetch(), headers = response.headers();
      if (options.beforeCspFulfill) await options.beforeCspFulfill(url.pathname, response);
      headers["content-security-policy"] = [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", ");
      return route.fulfill({ response, headers });
    }
    return route.continue();
  };
  await page.route("**/*", route => {
    const pending = handleRoute(route).finally(() => { fixture.pending.delete(pending); });
    fixture.pending.add(pending);
    return pending;
  });
  return fixture;
}

async function openLanding(page: Page, theme: Theme) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", theme);
  await expect(page.locator(".sqr-landing-next h1")).toHaveText("Search.Analyse.Monitor.");
  await page.evaluate(() => document.fonts.ready);
}
async function checkFixture(fixture: Fixture) {
  while (fixture.pending.size) await Promise.all(fixture.pending);
  expect(fixture.unexpected).toEqual([]); expect(fixture.errors).toEqual([]); expect(fixture.cspErrors).toEqual([]);
}
async function checkLayout(page: Page, width: number) {
  await expect(page.locator(".sqr-landing-next")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const hero = page.locator(".sqr-landing-next .hero h1");
  const metrics = await hero.evaluate(element => {
    const box = element.getBoundingClientRect(), css = getComputedStyle(element);
    return { left: box.left, right: box.right, width: box.width, height: box.height, fontFamily: css.fontFamily, opacity: css.opacity };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(0); expect(metrics.right).toBeLessThanOrEqual(width + 1);
  expect(metrics.height).toBeGreaterThan(80); expect(metrics.opacity).toBe("1"); expect(metrics.fontFamily).toMatch(/Archivo|Segoe UI|sans-serif/);
  const login = page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Log in", exact: true });
  await expect(login).toBeVisible(); await expect(login).toHaveAttribute("href", "/login");
  const box = (await login.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  await expect(page.locator(".sqr-landing-next main > section")).toHaveCount(9);
  const images = await page.locator(".sqr-landing-next img").evaluateAll(elements => elements.map(image => ({
    width: image.getAttribute("width"), height: image.getAttribute("height"), src: image.getAttribute("src"),
  })));
  expect(images.length).toBeGreaterThanOrEqual(7);
  for (const image of images) { expect(Number(image.width)).toBeGreaterThan(0); expect(Number(image.height)).toBeGreaterThan(0); expect(image.src).toMatch(/^\/(?:brand|landing-next)\//); }
}

for (const theme of ["light", "dark"] as const) {
  test(`Landing next desktop ${theme} at 1366 and 1440 preserves composition under strict CSP`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { theme });
    for (const width of [1366, 1440]) { await page.setViewportSize({ width, height: 900 }); await openLanding(page, theme); await checkLayout(page, width); }
    await checkFixture(fixture);
  });
}

test("Landing next tablet768 supports both themes without overflow", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await page.setViewportSize({ width: 768, height: 1024 });
  await openLanding(page, "light"); await checkLayout(page, 768);
  await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
  await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark"); await checkLayout(page, 768);
  await checkFixture(fixture);
});

for (const theme of ["light", "dark"] as const) {
  test(`Landing next mobile ${theme} at compact widths keeps text and login reachable`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { theme });
    for (const width of theme === "light" ? [320, 360, 390, 430] : [320, 390]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await openLanding(page, theme); await checkLayout(page, width);
      await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
    }
    await checkFixture(fixture);
  });
}

test("Landing next theme follows OS until explicit choice and never mutates the app theme", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { theme: "dark" });
  await openLanding(page, "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
  await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("perf_mode"))).toBe("high");
  await checkFixture(fixture);
});

for (const [storageFailure, width] of [["denied-getter", 320], ["denied-read", 390], ["quota-write", 1440]] as const) {
  test(`Landing next ${storageFailure} preserves usable theme controls and OS fallback`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { theme: "dark", storageFailure });
    await page.setViewportSize({ width, height: 900 });
    await openLanding(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    // With unreadable/unwritable preferences, a fresh page falls back to the OS.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "light");
    await checkLayout(page, width);
    await checkFixture(fixture);
  });
}

test("Landing next mobile menu supports keyboard Escape anchors desktop reflow and enlarged text", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await page.setViewportSize({ width: 320, height: 740 }); await openLanding(page, "light");
  const toggle = page.getByRole("button", { name: "Menu", exact: true }), menu = page.getByRole("navigation", { name: "Mobile", exact: true });
  await expect(toggle).toHaveAttribute("aria-controls", "landing-next-mobile-menu");
  await toggle.focus(); await toggle.press("Enter"); await expect(toggle).toHaveAttribute("aria-expanded", "true"); await expect(menu).toBeVisible();
  await page.keyboard.press("Escape"); await expect(menu).toBeHidden(); await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.press("Enter"); await menu.getByRole("link", { name: "About", exact: true }).click();
  await expect(menu).toBeHidden(); await expect(page.locator("#about")).toBeFocused(); await expect(page).toHaveURL(/#about$/);
  await page.locator(".sqr-landing-next header").scrollIntoViewIfNeeded();
  await toggle.click(); await expect(menu).toBeVisible(); await page.setViewportSize({ width: 1440, height: 900 });
  await expect(menu).toBeHidden(); await expect(page.locator("#landing-next-menu-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  // Check the actual controls and text, since overflow:hidden alone can hide clipping.
  await page.locator(".sqr-landing-next header").scrollIntoViewIfNeeded();
  for (const selector of ["header .brand", "header .login", "header .theme-btn", ".hero h1 a", ".panel h2", ".facts dt", ".facts dd"]) {
    for (const element of await page.locator(`.sqr-landing-next ${selector}`).all()) {
      const box = (await element.boundingBox())!;
      expect(box.x, selector).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(321);
      expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth + 1), selector).toBe(true);
    }
  }
  await toggle.click();
  await expect(menu.getByRole("link", { name: "Security", exact: true })).toBeInViewport();
  await checkFixture(fixture);
});

test("Landing next motion follows visibility and reduced preference and cleans pointer enhancements on exit", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { reducedMotion: false });
  await page.setViewportSize({ width: 1440, height: 900 }); await openLanding(page, "light");
  await expect(page.locator(".radar-artwork")).toHaveAttribute("src", "/landing-next/radar-animated.svg");
  const figure = page.getByRole("button", { name: "Replay Search instrument animation", exact: true });
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
  await figure.hover({ position: { x: 20, y: 20 } });
  await expect.poll(() => figure.evaluate(element => element.style.getPropertyValue("--tx"))).not.toBe("");
  await figure.click(); await expect(figure).toHaveClass(/boost/);
  await expect(figure.locator("img")).toHaveAttribute("src", /-boost\.svg$/);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".sqr-landing-next")).toHaveClass(/motion-paused/);
  await expect(figure.locator("img")).toHaveAttribute("src", /-static\.svg$/);
  await expect(figure).not.toHaveClass(/boost/);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(figure.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(figure.locator("img")).toHaveAttribute("src", /-static\.svg$/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(figure.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
  await page.locator(".sqr-landing-next footer").scrollIntoViewIfNeeded();
  await expect(figure.locator("img")).toHaveAttribute("src", /-static\.svg$/);
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
  const detached = await figure.elementHandle(); expect(detached).not.toBeNull();
  await page.locator(".sqr-landing-next header .login").click();
  await expect(page.getByTestId("input-username")).toBeVisible();
  expect(await detached!.evaluate(element => {
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50 }));
    return element.style.getPropertyValue("--tx");
  })).toBe("");
  await detached!.dispose(); await checkFixture(fixture);
});

for (const [label, selectors] of [
  ["header and hero", ["header .login", ".hero .actions a[href='/login']"]],
  ["Get started and footer", ["#start a[href='/login']", "footer a[href='/login']"]],
] as const) {
  test(`Landing next ${label} login links open the real form and the existing Home action restores landing`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL); await page.setViewportSize({ width: 1366, height: 900 });
    for (const selector of selectors) {
      await openLanding(page, "light"); const link = page.locator(`.sqr-landing-next ${selector}`);
      await expect(link).toHaveAttribute("href", "/login");
      const historyLength = await page.evaluate(() => history.length);
      await link.click(); await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByTestId("input-username")).toBeVisible(); await expect(page.getByTestId("input-password")).toBeVisible(); await expect(page.getByTestId("button-login")).toBeVisible();
      await expect(page.locator(".sqr-landing-next")).toHaveCount(0);
      expect(await page.evaluate(() => history.length)).toBe(historyLength); // Existing public router replaces entries.
      await page.getByRole("button", { name: "Laman utama", exact: true }).click();
      await expect(page).toHaveURL(/\/$/); await expect(page.locator(".sqr-landing-next h1")).toHaveText("Search.Analyse.Monitor.");
    }
    await checkFixture(fixture);
  });
}

test("Landing next missing observers leaves all sections readable and anchor navigation works", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { observer: false, reducedMotion: false });
  await openLanding(page, "light");
  for (const id of ["about", "search", "analyse", "import", "monitor", "security", "start"]) {
    const heading = page.locator(`#${id} h2`); await heading.scrollIntoViewIfNeeded(); await expect(heading).toBeVisible(); await expect(heading).toHaveCSS("opacity", "1");
  }
  await page.locator(".sqr-landing-next .hero h1 a[href='#search']").click(); await expect(page.locator("#search")).toBeFocused();
  await checkFixture(fixture);
});

test("Landing next reduced motion uses static supplied artwork and keeps replay controls safe", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL); await openLanding(page, "light");
  await expect(page.locator(".sqr-landing-next")).toHaveClass(/motion-paused/);
  await expect(page.locator(".radar-artwork")).toHaveAttribute("src", "/landing-next/radar-static.svg");
  for (const name of ["Search", "Analyse", "Import", "Monitor", "Security"]) {
    const replay = page.getByRole("button", { name: `Replay ${name} instrument animation`, exact: true });
    await replay.scrollIntoViewIfNeeded(); await replay.click(); await expect(replay).not.toHaveClass(/boost/);
    await expect(replay.locator("img")).toHaveAttribute("src", /-static\.svg$/);
    await expect.poll(() => replay.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  expect(fixture.assets.filter(asset => /\/landing-next\/.*-(?:animated|boost)\.svg$/.test(asset))).toEqual([]);
  await checkFixture(fixture);
});

test("Landing next every supplied image variant decodes as a real SVG", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL); await openLanding(page, "light");
  const names = ["radar-static.svg", "radar-animated.svg"];
  for (const name of ["search", "analyse", "import", "monitor", "security"]) {
    for (const theme of ["light", "dark"]) for (const state of ["static", "animated", "boost"]) names.push(`${name}-${theme}-${state}.svg`);
  }
  const decoded = await page.evaluate(async files => {
    const results = [];
    for (const file of files) {
      const image = new Image(); image.src = `/landing-next/${file}`;
      try { await image.decode(); results.push({ file, decoded: image.naturalWidth > 0 && image.naturalHeight > 0 }); }
      catch { results.push({ file, decoded: false }); }
    }
    return results;
  }, names);
  expect(decoded.filter(result => !result.decoded)).toEqual([]); expect(decoded).toHaveLength(32); await checkFixture(fixture);
});

test("Landing next section anchors focus their target and update the accessible current index", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL); await page.setViewportSize({ width: 1440, height: 900 }); await openLanding(page, "light");
  const index = page.getByRole("navigation", { name: "Section index", exact: true });
  const search = index.getByRole("link", { name: "Search", exact: true }); await search.click();
  await expect(page.locator("#search")).toBeFocused(); await expect(page).toHaveURL(/#search$/); await expect(search).toHaveAttribute("aria-current", "location");
  await index.getByRole("link", { name: "Get started", exact: true }).click(); await expect(page.locator("#start")).toBeFocused();
  await page.getByRole("button", { name: "Back to top", exact: true }).click(); await expect(page).toHaveURL(/#top$/); await expect(page.locator("#top")).toBeFocused();
  await checkFixture(fixture);
});

test("Landing next direct section URL survives lazy mount and refresh", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#security", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".sqr-landing-next")).toBeVisible();
  await expect(page.locator("#security h2")).toBeInViewport();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#security h2")).toBeInViewport();
  await checkFixture(fixture);
});

test("Landing next cleanup drains overlapping CSP responses before removing interception", async ({ page, baseURL }) => {
  const paths = ["/landing-next/radar-static.svg", "/landing-next/search-dark-static.svg"];
  const gates = new Map(paths.map(path => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    return [path, { held, release }] as const;
  }));
  const originals = new Map<string, APIResponse>();
  const fixture = await installFixture(page, baseURL, { beforeCspFulfill: async (path, response) => {
    const gate = gates.get(path);
    if (!gate) return;
    originals.set(path, response);
    await gate.held;
  } });
  await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
  await checkFixture(fixture);
  const responses = paths.map(path => page.waitForResponse(response => new URL(response.url()).pathname === path));
  const decoded = page.evaluate(async urls => Promise.all(urls.map(async url => {
    const image = new Image(); image.src = url;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  })), paths);
  const completedRequests = Promise.allSettled([...responses, decoded]);
  let cleanup: Promise<void> | undefined;
  try {
    await expect.poll(() => originals.size).toBe(paths.length);
    cleanup = finishFixture(page);
    gates.get(paths[0])!.release();
    await expect.poll(() => fixture.pending.size).toBe(1);
    // A public interception update flushes any premature removal after the first
    // callback finishes, while the second real response is still held.
    await page.unroute("/__landing-next-unused-route-barrier__");
    gates.get(paths[1])!.release();
    await cleanup;
    for (const [index, response] of (await Promise.all(responses)).entries()) {
      const original = originals.get(paths[index])!;
      expect(original.status()).toBe(200);
      expect(response.status()).toBe(original.status());
      expect(await response.body()).toEqual(await original.body());
      const headers = original.headers();
      const semanticHeaders = Object.fromEntries(["content-type", "cache-control", "etag", "x-content-type-options"]
        .filter(name => headers[name] !== undefined).map(name => [name, headers[name]]));
      expect(response.headers()).toMatchObject({
        ...semanticHeaders,
        "content-security-policy": [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", "),
      });
    }
    expect(await decoded).toEqual([true, true]);
    await checkFixture(fixture);
  } finally {
    for (const gate of gates.values()) gate.release();
    try { await cleanup; }
    finally { await completedRequests; }
  }
});

test("Landing next touch controls work on a compact phone without magnetic movement", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const phone = await context.newPage();
  try {
    const fixture = await installFixture(phone, baseURL);
    await openLanding(phone, "light");
    const menu = phone.getByRole("button", { name: "Menu", exact: true });
    await menu.tap();
    await phone.getByRole("navigation", { name: "Mobile", exact: true }).getByRole("link", { name: "Capabilities", exact: true }).tap();
    await expect(phone.locator("#search")).toBeFocused();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    const replay = phone.getByRole("button", { name: "Replay Search instrument animation", exact: true });
    await replay.tap();
    expect(await replay.evaluate(element => element.style.getPropertyValue("--tx"))).toBe("");
    await expect(replay.locator("img")).toHaveAttribute("src", /-static\.svg$/);
    await phone.locator("header").scrollIntoViewIfNeeded();
    await phone.getByRole("button", { name: "Toggle color theme", exact: true }).tap();
    await expect(phone.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    await phone.locator("header .login").tap();
    await expect(phone.getByTestId("input-username")).toBeVisible();
    await phone.getByRole("button", { name: "Laman utama", exact: true }).tap();
    await expect(phone.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    await checkFixture(fixture);
  } finally {
    try { await finishFixture(phone); }
    finally { await context.close(); }
  }
});

for (const [label, profile] of [
  ["persisted low performance preference", { performanceMode: "low" }],
  ["two CPU cores and two GB of memory", { performanceMode: "auto", cores: 2, memory: 2 }],
  ["four CPU cores and four GB of memory", { performanceMode: "auto", cores: 4, memory: 4 }],
  ["saveData on a 2g connection", { performanceMode: "auto", saveData: true, effectiveType: "2g" }],
  ["a 2g connection without saveData", { performanceMode: "auto", effectiveType: "2g" }],
  ["all constrained-device signals", { performanceMode: "low", cores: 2, memory: 2, saveData: true, effectiveType: "2g" }],
] satisfies Array<[string, DeviceProfile]>) {
  test(`Landing next ${label} preserves the full landing and motion`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { profile, theme: "dark", reducedMotion: false });
    const width = profile.cores === 4 || (profile.performanceMode === "low" && profile.cores === undefined) ? 1440 : 390;
    await page.setViewportSize({ width, height: 900 }); await openLanding(page, "dark");
    await checkLayout(page, width);
    await expect(page.locator(".sqr-landing")).toHaveCount(0);
    await expect(page.locator(".sqr-landing-next")).not.toHaveClass(/motion-paused/);
    await expect(page.locator(".radar-artwork")).toHaveAttribute("src", "/landing-next/radar-animated.svg");
    if (profile.performanceMode === "low" || (profile.cores ?? 8) <= 2 || (profile.memory ?? 8) <= 2 || profile.saveData) {
      await expect(page.locator("html")).toHaveClass(/low-spec/);
    }
    await expect(page.locator(".sqr-landing-next .hero-tag i")).toHaveCSS("animation-name", "sqr-landing-next-blink");
    await expect(page.locator(".sqr-landing-next .hero-tag i")).toHaveCSS("animation-duration", "2.2s");
    await expect(page.locator(".sqr-landing-next .hero-tag i")).toHaveCSS("animation-play-state", "running");
    const replay = page.getByRole("button", { name: "Replay Search instrument animation", exact: true });
    await replay.scrollIntoViewIfNeeded();
    expect(await replay.evaluate(element => getComputedStyle(element).transitionDuration.split(",").some(duration => Number.parseFloat(duration) > 0))).toBe(true);
    await expect(replay.locator("img")).toHaveAttribute("src", "/landing-next/search-dark-animated.svg");
    await expect.poll(() => replay.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await replay.click(); await expect(replay.locator("img")).toHaveAttribute("src", "/landing-next/search-dark-boost.svg");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".sqr-landing-next")).toHaveClass(/motion-paused/);
    await expect(page.locator(".sqr-landing-next .hero-tag i")).toHaveCSS("animation-name", "none");
    await expect(replay.locator("img")).toHaveAttribute("src", "/landing-next/search-dark-static.svg");
    await expect(replay).not.toHaveClass(/boost/);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(replay.locator("img")).toHaveAttribute("src", "/landing-next/search-dark-animated.svg");
    await page.locator(".sqr-landing-next header .login").click();
    await expect(page.getByTestId("input-username")).toBeVisible();
    await page.getByRole("button", { name: "Laman utama", exact: true }).click();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".radar-artwork")).toHaveAttribute("src", "/landing-next/radar-animated.svg");
    expect(await page.evaluate(() => localStorage.getItem("perf_mode"))).toBe(profile.performanceMode === "auto" ? null : profile.performanceMode ?? "high");
    await checkFixture(fixture);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Landing next ${theme} accessibility has no serious or critical violations`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { theme }); await page.setViewportSize({ width: 1440, height: 900 }); await openLanding(page, theme);
    for (const id of ["about", "search", "analyse", "import", "monitor", "security", "start"]) await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.evaluate(axeSource);
    const violations = await page.locator(".sqr-landing-next").evaluate(async element => {
      const result = await (window as typeof window & { axe: { run: (root: Element, options: unknown) => Promise<AxeResults> } }).axe.run(element, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"],
      });
      return result.violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }));
    });
    expect(violations).toEqual([]); await checkFixture(fixture);
  });
}
