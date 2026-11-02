import { writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { initializeBrowserThemeFixture, type BrowserThemeFixtureOptions } from "../../scripts/lib/browser-theme-fixture.mjs";

// Real compiled SQR routes, styles, controls and Web Locks. Every API is an
// explicit fictional loopback response; no accounts or production data are used.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Theme = "light" | "dark";
const fixedNow = "2026-10-15T08:20:00.000Z";
const username = "theme.user.fixture";
const password = "Theme-fixture-login-123!";
const opposite = (theme: Theme): Theme => theme === "dark" ? "light" : "dark";

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme: Theme; legacyTheme?: Theme; systemTheme?: Theme; twoFactor?: boolean;
}) {
  expect(baseURL, "Use the real built loopback frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const user = {
    id: "theme-fixture-user", username, fullName: "Theme Fixture", email: null, role: "user",
    status: "active", isBanned: false, mustChangePassword: false, passwordResetBySuperuser: false,
    activatedAt: "2026-01-01T00:00:00.000Z", passwordChangedAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: fixedNow, twoFactorEnabled: options.twoFactor ?? false,
    twoFactorPendingSetup: false, twoFactorConfiguredAt: options.twoFactor ? fixedNow : null,
  };
  const fixture = {
    origin, authenticated: false, loginCalls: 0, logoutCalls: 0, verificationCalls: 0,
    requests: [] as string[], artworkRequests: [] as string[], unexpected: [] as string[], errors: [] as string[], pending: new Set<Promise<void>>(),
  };
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, json: body, headers: { "Cache-Control": "no-store" },
  });
  await page.clock.setFixedTime(new Date(fixedNow));
  await page.emulateMedia({ colorScheme: options.systemTheme ?? options.theme, reducedMotion: "reduce" });
  await page.addInitScript<BrowserThemeFixtureOptions>(initializeBrowserThemeFixture, {
    origin, mode: "preserve-choice", theme: options.theme, performanceMode: "high",
    ...(options.legacyTheme ? { legacyTheme: options.legacyTheme } : {}),
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().routeWebSocket("**/*", socket => {
    if (!fixture.authenticated) fixture.unexpected.push("WebSocket before authentication");
    socket.close();
  });
  const handle = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      fixture.unexpected.push(`Off-origin ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (fixture.requests.length >= 256) {
      fixture.unexpected.push("API request bound exceeded");
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (request.method() === "GET" && /^\/assets\/sqr-illustration-[A-Za-z0-9_-]+\.webp$/.test(url.pathname)) {
        if (fixture.artworkRequests.length >= 32) {
          fixture.unexpected.push("Artwork request bound exceeded");
          return route.abort();
        }
        fixture.artworkRequests.push(url.pathname);
      }
      if (["GET", "HEAD"].includes(request.method())) return route.continue();
      fixture.unexpected.push(`Unexpected static ${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const endpoint = `${request.method()} ${url.pathname}`;
    fixture.requests.push(endpoint);
    if (endpoint === "GET /api/health/connectivity") return route.fulfill({ status: 204,
      headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } });
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route, {
      maintenance: false, message: "Synthetic service available", type: "soft", startTime: null, endTime: null,
    });
    if (endpoint === "GET /api/me") return fixture.authenticated
      ? respond(route, { ok: true, user, sessionExpiresAt: "2036-01-01T00:00:00.000Z" })
      : respond(route, { ok: false, message: "No synthetic session" }, 401);
    if (endpoint === "POST /api/auth/login") {
      fixture.loginCalls++;
      expect(request.postDataJSON()).toMatchObject({ username, password });
      if (options.twoFactor) return respond(route, { ok: true, twoFactorRequired: true,
        challengeToken: "theme-fixture-challenge", username, role: "user", mustChangePassword: false,
        status: "active", user });
      fixture.authenticated = true;
      return route.fulfill({ json: { ok: true, username, role: "user", activityId: "theme-fixture-activity",
        mustChangePassword: false, status: "active", user, sessionExpiresAt: "2036-01-01T00:00:00.000Z" },
        headers: { "Cache-Control": "no-store", "Set-Cookie": "sqr_auth_hint=1; Path=/; SameSite=Lax" } });
    }
    if (endpoint === "POST /api/auth/verify-two-factor-login" && options.twoFactor) {
      fixture.verificationCalls++;
      expect(request.postDataJSON()).toEqual({ challengeToken: "theme-fixture-challenge", code: "123456" });
      return respond(route, { ok: false, message: "Kod pengesah tidak sah." }, 401);
    }
    if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) {
      return respond(route, { ok: true });
    }
    if (!fixture.authenticated) {
      fixture.unexpected.push(`Protected request before authentication: ${endpoint}`);
      return respond(route, { ok: false }, 403);
    }
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route, { role: "user", tabs: {
      home: true, import: false, saved: false, viewer: false, "general-search": false,
      "collection-report": false, analysis: false, dashboard: false, monitor: false,
      activity: false, "audit-logs": false, backup: false, settings: false, canViewSystemPerformance: false,
    } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0, totalPages: 1,
      hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route, { ok: true, nickname: null });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, {
      ok: true, status: "ONLINE", lastActivityTime: fixedNow,
    });
    if (endpoint === "POST /api/activity/logout") {
      fixture.logoutCalls++;
      fixture.authenticated = false;
      return route.fulfill({ json: { ok: true, success: true },
        headers: { "Cache-Control": "no-store", "Set-Cookie": "sqr_auth_hint=; Max-Age=0; Path=/; SameSite=Lax" } });
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected theme fixture request" }, 404);
  };
  await page.context().route("**/*", route => {
    const pending = handle(route).finally(() => fixture.pending.delete(pending));
    fixture.pending.add(pending);
    return pending;
  });
  page.on("pageerror", error => fixture.errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /content security policy|trustedtype|trusted type|violates.*directive/i.test(message.text())) {
      fixture.errors.push(message.text());
    }
  });
  return fixture;
}

async function checkFixture(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>) {
  while (fixture.pending.size) await Promise.all(fixture.pending);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function expectTheme(page: Page, theme: Theme) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  if (theme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(theme);
}

async function passwordLogin(page: Page) {
  await page.getByTestId("input-username").fill(username);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
}

async function expectContrast(locator: Locator, threshold = 4.5) {
  const ratio = await locator.evaluate(element => {
    const channels = (value: string) => value.match(/[\d.]+/g)?.map(Number) ?? [];
    const foreground = channels(getComputedStyle(element).color);
    let background: number[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = channels(getComputedStyle(node).backgroundColor);
      if (value.length >= 3 && (value.length === 3 || value[3] === 1)) { background = value; break; }
    }
    if (foreground.length < 3 || background.length < 3) throw new Error("Expected explicit solid text and surface colors");
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
      const normalized = value / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(ratio, "Computed text contrast against its real solid surface").toBeGreaterThanOrEqual(threshold);
}

for (const width of [320, 722, 1440]) {
  test(`Shared theme artwork uses the supplied dark asset without changing layout at ${width}px`, async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const measurements = [];
    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        // Explicit preference must win over the opposite OS theme even for the
        // pre-React image preload, without downloading the other illustration.
        const fixture = await installFixture(page, baseURL, { theme, systemTheme: opposite(theme) });
        await page.goto("/login", { waitUntil: "domcontentloaded" });
        const shell = page.locator(".auth-v17-login");
        await expect(shell).toHaveAttribute("data-theme", theme);
        await expectTheme(page, theme);
        await expect(page.getByTestId("input-username")).toBeVisible();
        await expect(page.getByTestId("input-password")).toBeVisible();
        await expect(page.getByTestId("button-login")).toBeEnabled();
        // The real health badge can resize the desktop brand row; measure only
        // after its synthetic response has reached the mounted layout.
        await expect(shell.locator(".auth-v17-status")).toHaveCount(1);
        await expect(page.locator('meta[name="sqr-login-image"]')).toHaveCount(2);
        const imagePath = await page.locator(`meta[name="sqr-login-image"][data-theme="${theme}"]`).getAttribute("content");
        const otherPath = await page.locator(`meta[name="sqr-login-image"][data-theme="${opposite(theme)}"]`).getAttribute("content");
        expect(imagePath).toMatch(theme === "dark"
          ? /^\/assets\/sqr-illustration-dark-[A-Za-z0-9_-]+\.webp$/
          : /^\/assets\/sqr-illustration-(?!dark-)[A-Za-z0-9_-]+\.webp$/);
        expect(otherPath).not.toBe(imagePath);
        const preload = page.locator(`link[rel="preload"][as="image"][href="${imagePath}"]`);
        await expect(preload).toHaveCount(1);
        await expect(preload).not.toHaveAttribute("crossorigin");
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        const artwork = await shell.locator(".auth-v17-art").evaluate(async element => {
          const style = getComputedStyle(element, "::before");
          const match = /^url\(["']?([^"')]+)["']?\)$/.exec(style.backgroundImage);
          if (!match) throw new Error("Expected the actual supplied illustration background");
          const image = new Image();
          image.src = match[1]!;
          await image.decode();
          return {
            path: new URL(image.src).pathname, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            filter: style.filter, blend: style.mixBlendMode,
            geometry: { width: style.width, height: style.height, top: style.top, right: style.right,
              bottom: style.bottom, left: style.left, size: style.backgroundSize,
              position: style.backgroundPosition, repeat: style.backgroundRepeat },
          };
        });
        expect(artwork.path).toBe(imagePath);
        expect(artwork.naturalWidth).toBeGreaterThan(0);
        expect(artwork.naturalHeight).toBeGreaterThan(0);
        if (theme === "dark") {
          expect(artwork.filter, "Preserve the supplied dark illustration's original colors").toBe("none");
          expect(artwork.blend).toBe("normal");
        }
        const boxes = await shell.evaluate(element => Object.fromEntries([
          ".auth-v17-brand-panel", ".auth-v17-logo", ".auth-v17-art", ".auth-v17-side", ".auth-v17-wrap",
          ".login-form", '[data-testid="input-username"]', '[data-testid="input-password"]', '[data-testid="button-login"]',
        ].map(selector => {
          const node = element.querySelector(selector);
          if (!node) throw new Error(`Missing login geometry target ${selector}`);
          const { x, y, width: boxWidth, height } = node.getBoundingClientRect();
          return [selector, { x, y, width: boxWidth, height }];
        })));
        measurements.push({ artwork, boxes });
        expect(fixture.artworkRequests.length).toBeGreaterThan(0);
        expect(fixture.artworkRequests).not.toContain(otherPath);
        expect(fixture.artworkRequests.every(path => path === imagePath)).toBe(true);
        expect(fixture.loginCalls).toBe(0);
        await page.screenshot({ path: testInfo.outputPath(`login-${theme}-artwork-${width}.png`), animations: "disabled" });
        await checkFixture(page, fixture);
      } finally {
        await context.close();
      }
    }
    const [light, dark] = measurements;
    expect(dark!.artwork.geometry).toEqual(light!.artwork.geometry);
    expect(Math.abs(dark!.artwork.naturalWidth / dark!.artwork.naturalHeight
      - light!.artwork.naturalWidth / light!.artwork.naturalHeight)).toBeLessThan(.003);
    for (const selector of Object.keys(light!.boxes)) {
      for (const dimension of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(dark!.boxes[selector]![dimension] - light!.boxes[selector]![dimension]),
          `${selector} ${dimension} stays unchanged between themes at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });
}

for (const selected of ["dark", "light"] as const) {
  test(`Shared theme ${selected} follows landing, login and workspace while the existing workspace toggle still wins`, async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const initial = opposite(selected);
    const fixture = await installFixture(page, baseURL, { theme: initial, legacyTheme: selected });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", initial);
    await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", selected);
    await expectTheme(page, selected);
    await page.locator('.sqr-landing-next header a[href="/login"]').click();
    await expect(page.locator(".auth-v17-login")).toHaveAttribute("data-theme", selected);
    await expect(page.locator(".auth-v17-login [data-brand-theme]")).toHaveAttribute("data-brand-theme", selected);
    await expectTheme(page, selected);
    await passwordLogin(page);
    await expect(page.getByTestId("home-dashboard")).toBeVisible();
    await expectTheme(page, selected);
    expect(fixture.loginCalls).toBe(1);
    const toggle = page.getByTestId("button-toggle-theme");
    await expect(toggle).toHaveAccessibleName(`Switch to ${initial} mode`);
    await toggle.click();
    await expectTheme(page, initial);
    await expect(toggle).toHaveAccessibleName(`Switch to ${selected} mode`);
    await page.getByTestId("button-user-menu").click();
    await page.getByTestId("button-logout").click();
    // The existing logout flow returns to the public landing page.
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", initial);
    await expectTheme(page, initial);
    expect(fixture.logoutCalls).toBe(1);
    await page.locator('.sqr-landing-next header a[href="/login"]').click();
    await expect(page.locator(".auth-v17-login")).toHaveAttribute("data-theme", initial);
    await expectTheme(page, initial);
    await page.locator(".auth-v17-topline > .auth-v17-back").click();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", initial);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", initial);
    await expectTheme(page, initial);
    await checkFixture(page, fixture);
  });
}

for (const width of [320, 1440]) {
  test(`Shared theme dark login keeps invalid fields and OTP readable at ${width}px`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { theme: "dark", legacyTheme: "light", twoFactor: true });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const shell = page.locator(".auth-v17-login");
    await expect(shell).toHaveAttribute("data-theme", "dark");
    await expectTheme(page, "dark");
    await expectContrast(shell.locator("h1"));
    await expectContrast(page.getByTestId("input-username"));
    await expectContrast(shell.locator(".auth-v17-subtitle"));
    await page.getByTestId("button-login").click();
    await expect(page.getByTestId("input-username")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("input-password")).toHaveAttribute("aria-invalid", "true");
    await expectContrast(page.locator("#login-username-error"));
    await expectContrast(page.locator("#login-password-error"));
    expect(fixture.loginCalls).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`login-dark-invalid-${width}.png`), animations: "disabled" });
    await passwordLogin(page);
    const otp = page.getByTestId("input-two-factor-code");
    await expect(otp).toBeVisible();
    await expect(shell).toHaveAttribute("data-theme", "dark");
    await otp.fill("12");
    await page.keyboard.press("Tab");
    await expect(otp).toHaveAttribute("aria-invalid", "true");
    await expectContrast(page.locator("#login-two-factor-error"));
    await expect(shell.locator(".auth-v17-otp__slot")).toHaveCount(6);
    for (const slot of await shell.locator(".auth-v17-otp__slot").all()) await expectContrast(slot);
    await otp.fill("123456");
    await expect(page.getByTestId("button-login")).toBeEnabled();
    await page.getByTestId("button-login").click();
    await expect(shell.locator('.public-auth-status-card--error[role="alert"]')).toBeVisible();
    await expectContrast(shell.locator('.public-auth-status-card--error[role="alert"]'));
    await expect(otp).toHaveValue("123456");
    expect(fixture.loginCalls).toBe(1);
    expect(fixture.verificationCalls).toBe(1);
    expect(fixture.authenticated).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`login-dark-otp-${width}.png`), animations: "disabled" });
    for (const control of await shell.locator("input, .login-submit, .auth-v17-lang").all()) {
      const box = await control.boundingBox();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    await checkFixture(page, fixture);
  });
}

test("Shared theme bootstrap and pending landing show only the current branded loader despite a stale legacy preference", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = await installFixture(page, baseURL, { theme: "dark", legacyTheme: "light" });
  const response = await page.request.get(fixture.origin);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html.length).toBeLessThan(65_536);
  const entry = /<script\b[^>]*type="module"[^>]*src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/.exec(html)?.[1];
  const landing = [...html.matchAll(/<meta[^>]*name="sqr-landing-script"[^>]*content="([^"]+)"[^>]*>/g)]
    .map(match => match[1]).find(path => /^\/assets\/Landing-[A-Za-z0-9_-]+\.js$/.test(path!));
  expect(entry).toBeTruthy();
  expect(landing).toBeTruthy();
  let releaseEntry = () => {}, releaseLanding = () => {};
  const entryGate = new Promise<void>(resolve => { releaseEntry = resolve; });
  const landingGate = new Promise<void>(resolve => { releaseLanding = resolve; });
  await page.route(fixture.origin + entry!, async route => { await entryGate; await route.continue(); });
  await page.route(fixture.origin + landing!, async route => { await landingGate; await route.continue(); });
  try {
    await page.goto("/", { waitUntil: "commit" });
    const boot = page.locator("#boot-shell");
    await expect(boot).toBeVisible();
    await expect(boot).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(boot.locator("img")).toHaveAttribute("src", /\/brand\//);
    await expect(boot).not.toContainText("Operational data, structured");
    await expect(boot).not.toContainText("SQR consolidates search");
    // The entry is deliberately held before DOMContentLoaded. Playwright's
    // screenshot font-readiness wait depends on that event, so capture the
    // browser's current surface directly without releasing the entry early.
    const session = await page.context().newCDPSession(page);
    try {
      const capture = await session.send("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false,
      });
      await writeFile(testInfo.outputPath("landing-current-boot.png"), Buffer.from(capture.data, "base64"));
    } finally {
      await session.detach();
    }
    releaseEntry();
    await page.waitForLoadState("domcontentloaded");
    await expect(boot).toHaveCount(0);
    const fallback = page.locator(".landing-route-fallback");
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(fallback.getByRole("heading", { name: "Loading SQR…", exact: true })).toBeVisible();
    await expectContrast(fallback.getByRole("heading"));
    await expect(fallback.locator("img")).toHaveAttribute("src", /\/brand\//);
    await expect(fallback).not.toContainText("Operational data, structured");
    await expect(fallback).not.toContainText("SQR consolidates search");
    await expect(fallback.locator('a[href="/login"]')).toHaveCount(0);
    await expectTheme(page, "dark");
    await page.screenshot({ path: testInfo.outputPath("landing-current-fallback.png"), animations: "disabled" });
    releaseLanding();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".sqr-landing-next h1")).toHaveText("Search.Analyse.Monitor.");
    await expect(fallback).toHaveCount(0);
    await expectTheme(page, "dark");
    await checkFixture(page, fixture);
  } finally {
    releaseEntry();
    releaseLanding();
  }
});
