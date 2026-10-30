import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import type { AxeResults } from "axe-core";

// Real compiled routes and original same-origin artwork, fictional public HTTP only.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });
test.afterEach(async ({ page }) => {
  // Finish local CSP-response interception before Playwright closes the page.
  await page.unrouteAll({ behavior: "wait" });
});
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const themeKey = "sqr-landing-next-theme";
const strictPolicy = "script-src 'self'; require-trusted-types-for 'script'; style-src-elem 'self'; style-src-attr 'none'";
type Theme = "light" | "dark";
type Fixture = { unexpected: string[]; errors: string[]; cspErrors: string[]; assets: string[] };

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: Theme; lowSpec?: boolean; observer?: boolean; reducedMotion?: boolean;
} = {}): Promise<Fixture> {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture: Fixture = { unexpected: [], errors: [], cspErrors: [], assets: [] };
  page.on("pageerror", error => fixture.errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /content security policy|trustedtype|trusted type|violates.*directive/i.test(message.text())) fixture.cspErrors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: options.reducedMotion === false ? "no-preference" : "reduce" });
  await page.addInitScript(({ low, observer }) => {
    localStorage.setItem("perf_mode", low ? "low" : "high");
    localStorage.setItem("theme", "light");
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => low ? 2 : 8 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => low ? 2 : 8 });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    if (!observer) Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: undefined });
  }, { low: options.lowSpec === true, observer: options.observer !== false });
  await page.context().routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", async route => {
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
      headers["content-security-policy"] = [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", ");
      return route.fulfill({ response, headers });
    }
    return route.continue();
  });
  return fixture;
}

async function openLanding(page: Page, theme: Theme) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", theme);
  await expect(page.locator(".sqr-landing-next h1")).toHaveText("Search.Analyse.Monitor.");
  await page.evaluate(() => document.fonts.ready);
}
function checkFixture(fixture: Fixture) {
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
    checkFixture(fixture);
  });
}

test("Landing next tablet768 supports both themes without overflow", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await page.setViewportSize({ width: 768, height: 1024 });
  await openLanding(page, "light"); await checkLayout(page, 768);
  await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
  await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark"); await checkLayout(page, 768);
  checkFixture(fixture);
});

for (const theme of ["light", "dark"] as const) {
  test(`Landing next mobile ${theme} at compact widths keeps text and login reachable`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { theme });
    for (const width of theme === "light" ? [320, 360, 390, 430] : [320, 390]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await openLanding(page, theme); await checkLayout(page, width);
      await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
    }
    checkFixture(fixture);
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
  checkFixture(fixture);
});

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
  checkFixture(fixture);
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
  const detached = await figure.elementHandle(); expect(detached).not.toBeNull();
  await page.locator(".sqr-landing-next header .login").click();
  await expect(page.getByTestId("input-username")).toBeVisible();
  expect(await detached!.evaluate(element => {
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50 }));
    return element.style.getPropertyValue("--tx");
  })).toBe("");
  await detached!.dispose(); checkFixture(fixture);
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
    checkFixture(fixture);
  });
}

test("Landing next missing observers leaves all sections readable and anchor navigation works", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { observer: false, reducedMotion: false });
  await openLanding(page, "light");
  for (const id of ["about", "search", "analyse", "import", "monitor", "security", "start"]) {
    const heading = page.locator(`#${id} h2`); await heading.scrollIntoViewIfNeeded(); await expect(heading).toBeVisible(); await expect(heading).toHaveCSS("opacity", "1");
  }
  await page.locator(".sqr-landing-next .hero h1 a[href='#search']").click(); await expect(page.locator("#search")).toBeFocused();
  checkFixture(fixture);
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
  checkFixture(fixture);
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
  expect(decoded.filter(result => !result.decoded)).toEqual([]); expect(decoded).toHaveLength(32); checkFixture(fixture);
});

test("Landing next section anchors focus their target and update the accessible current index", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL); await page.setViewportSize({ width: 1440, height: 900 }); await openLanding(page, "light");
  const index = page.getByRole("navigation", { name: "Section index", exact: true });
  const search = index.getByRole("link", { name: "Search", exact: true }); await search.click();
  await expect(page.locator("#search")).toBeFocused(); await expect(page).toHaveURL(/#search$/); await expect(search).toHaveAttribute("aria-current", "location");
  await index.getByRole("link", { name: "Get started", exact: true }).click(); await expect(page.locator("#start")).toBeFocused();
  await page.getByRole("button", { name: "Back to top", exact: true }).click(); await expect(page).toHaveURL(/#top$/); await expect(page.locator("#top")).toBeFocused();
  checkFixture(fixture);
});

test("Landing next direct section URL survives lazy mount and refresh", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#security", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".sqr-landing-next")).toBeVisible();
  await expect(page.locator("#security h2")).toBeInViewport();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#security h2")).toBeInViewport();
  checkFixture(fixture);
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
    await phone.unrouteAll({ behavior: "wait" });
    checkFixture(fixture);
  } finally {
    await phone.unrouteAll({ behavior: "wait" });
    await context.close();
  }
});

test("Landing next low-spec boundary keeps the original page and never requests normal assets", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { lowSpec: true, theme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".sqr-landing")).toHaveClass(/low-spec/); await expect(page.locator(".sqr-landing-next")).toHaveCount(0);
  await expect(page.locator(".sqr-landing h1")).toHaveText("Operational data, structuredfor faster decisions.");
  await expect(page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
  await expect(page.locator(".sqr-landing")).toHaveCSS("color-scheme", "light");
  const normalAssets = () => fixture.assets.filter(asset => /(?:LandingNext|useLandingNextMotion|landing-next)/i.test(asset));
  expect(normalAssets()).toEqual([]);
  await page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name: "Sign In", exact: true }).click();
  await expect(page.getByTestId("input-username")).toBeVisible();
  await page.getByRole("button", { name: "Laman utama", exact: true }).click();
  await expect(page.locator(".sqr-landing")).toHaveClass(/low-spec/); expect(normalAssets()).toEqual([]);
  checkFixture(fixture);
});

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
    expect(violations).toEqual([]); checkFixture(fixture);
  });
}
