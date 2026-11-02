import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";
import { createAuthV17Fixture, authV17FixtureIdentity } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture, type BrowserThemeFixtureOptions } from "../../scripts/lib/browser-theme-fixture.mjs";

// Native compiled routes and existing controllers; only fictional loopback APIs.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });
type Theme = "light" | "dark";
const opposite = (theme: Theme): Theme => theme === "dark" ? "light" : "dark";
const actionName = (theme: Theme, locale: "ms" | "en") => locale === "en"
  ? `Switch to ${opposite(theme)} mode` : `Tukar ke tema ${theme === "dark" ? "cerah" : "gelap"}`;
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";

async function installFixture(page: Page, baseURL: string | undefined, theme: Theme) {
  expect(baseURL, "Use the actual isolated built frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture = createAuthV17Fixture(origin);
  const gated = fixture.state;
  const errors: string[] = [];
  const pending = new Set<Promise<void>>();
  await page.emulateMedia({ colorScheme: opposite(theme), reducedMotion: "reduce" });
  await page.addInitScript<BrowserThemeFixtureOptions>(initializeBrowserThemeFixture, { origin, mode: "preserve-choice", theme, performanceMode: "high" });
  await page.addInitScript((expectedOrigin) => {
    if (location.origin !== expectedOrigin) return;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  }, origin);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text(), url = new URL(message.location().url || origin, origin);
    const expectedStatus = url.pathname === "/api/me" ? "401"
      : url.pathname === "/api/auth/request-password-reset" ? "429" : null;
    // These two explicit fixture outcomes are part of the public journey.
    if (url.origin === origin && expectedStatus && text.includes(`status of ${expectedStatus}`)) return;
    errors.push(text);
  });
  await page.context().routeWebSocket("**/*", socket => {
    errors.push("A public auth page must not open a protected WebSocket");
    socket.close();
  });
  const handle = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { errors.push(`Off-origin ${url.origin}${url.pathname}`); return route.abort(); }
    if (url.pathname === "/api/maintenance-status" && request.method() === "GET") {
      return route.fulfill({ json: { maintenance: false } });
    }
    if (url.pathname.startsWith("/api/telemetry/") && ["GET", "POST"].includes(request.method())) {
      return route.fulfill({ json: { ok: true } });
    }
    if (request.isNavigationRequest() && request.resourceType() === "document") {
      const response = await route.fetch(), headers = response.headers();
      headers["content-security-policy"] = [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", ");
      return route.fulfill({ response, headers });
    }
    return fixture.route(route);
  };
  await page.context().route("**/*", route => {
    const work = handle(route).finally(() => pending.delete(work));
    pending.add(work);
    return work;
  });
  return {
    fixture, gated,
    async finish() {
      while (pending.size) await Promise.all(pending);
      await page.context().unrouteAll({ behavior: "wait" });
      expect(fixture.state.unexpected, "Every API has an explicit fictional contract").toEqual([]);
      expect(errors, "No page errors, CSP/Trusted Types errors or unexpected console failures").toEqual([]);
    },
  };
}

async function expectTheme(page: Page, theme: Theme, surface: string) {
  await expect(page.locator(surface)).toHaveAttribute("data-theme", theme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(theme === "dark");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(theme);
}

async function checkLayoutAndAccessibility(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const toggle = page.locator("button.auth-v17-theme");
  await expect(toggle).toHaveAttribute("type", "button");
  const box = await toggle.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const back = await page.locator(".auth-v17-topline > .auth-v17-back").boundingBox();
  const languages = await page.locator(".auth-v17-lang").boundingBox();
  expect(back && languages).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(back!.x + back!.width);
  expect(box!.x + box!.width).toBeLessThanOrEqual(languages!.x + 1);
  expect(languages!.x + languages!.width).toBeLessThanOrEqual(width);
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: (root: Document, options: RunOptions) => Promise<AxeResults> } }).axe;
    return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
      .violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }));
  });
  expect(violations, `${width}px WCAG A/AA`).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`Public auth theme controls preserve login fields and keyboard actions (${theme})`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const { fixture, finish } = await installFixture(page, baseURL, theme);
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expectTheme(page, theme, ".auth-v17-login");
      const toggle = page.locator("button.auth-v17-theme");
      await expect(toggle).toHaveAccessibleName(actionName(theme, "ms"));
      for (const width of [320, 1440]) {
        await checkLayoutAndAccessibility(page, width);
        await page.screenshot({ path: testInfo.outputPath(`login-${theme}-${width}.png`), animations: "disabled", fullPage: true });
      }
      const username = page.getByTestId("input-username"), password = page.getByTestId("input-password");
      await username.fill(authV17FixtureIdentity.username);
      await password.fill(authV17FixtureIdentity.password);
      await page.getByTestId("button-toggle-password").click();
      await expect(password).toHaveAttribute("type", "text");
      await toggle.focus(); await toggle.press("Enter");
      await expectTheme(page, opposite(theme), ".auth-v17-login");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAccessibleName(actionName(opposite(theme), "ms"));
      await expect(username).toHaveValue(authV17FixtureIdentity.username);
      await expect(password).toHaveValue(authV17FixtureIdentity.password);
      await expect(password).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(toggle).toHaveAccessibleName(actionName(opposite(theme), "en"));
      await toggle.focus(); await toggle.press("Space");
      await expectTheme(page, theme, ".auth-v17-login");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAccessibleName(actionName(theme, "en"));
      await expect(username).toHaveValue(authV17FixtureIdentity.username);
      await expect(password).toHaveValue(authV17FixtureIdentity.password);
      await expect(password).toHaveAttribute("type", "text");
      expect(fixture.state.counts.login).toBe(0);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectTheme(page, theme, ".auth-v17-login");
      await expect(toggle).toHaveAccessibleName(actionName(theme, "en"));
      expect(fixture.state.counts.login).toBe(0);
    } finally { await finish(); }
  });

  test(`Public auth theme controls retain forgot-request state and route preference (${theme})`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const { fixture, gated, finish } = await installFixture(page, baseURL, theme);
    let releaseRequest: (() => void) | undefined;
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Lupa kata laluan?", exact: true }).click();
      await expectTheme(page, theme, ".auth-v17-forgot");
      for (const width of [320, 1440]) {
        await checkLayoutAndAccessibility(page, width);
        await page.screenshot({ path: testInfo.outputPath(`forgot-${theme}-${width}.png`), animations: "disabled", fullPage: true });
      }
      await page.setViewportSize({ width: 320, height: 900 });
      const identifier = page.locator("#forgot-password-identifier"), toggle = page.locator("button.auth-v17-theme");
      await identifier.fill(authV17FixtureIdentity.username);
      await toggle.focus(); await toggle.press("Enter");
      await expectTheme(page, opposite(theme), ".auth-v17-forgot");
      await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
      await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(toggle).toHaveAccessibleName(actionName(opposite(theme), "en"));
      await toggle.focus(); await toggle.press("Space");
      await expectTheme(page, theme, ".auth-v17-forgot");
      await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
      expect(fixture.state.counts.forgot).toBe(0);
      gated.forgotGate = new Promise<void>(resolve => { releaseRequest = resolve; });
      try {
        await page.locator('form button[type="submit"]').click();
        await expect.poll(() => fixture.state.counts.forgot).toBe(1);
        await expect(identifier).toBeDisabled();
        await expect(page.locator(".auth-v17-content")).toHaveAttribute("aria-busy", "true");
        await toggle.click();
        await expectTheme(page, opposite(theme), ".auth-v17-forgot");
        await page.getByRole("button", { name: "Bahasa Melayu", exact: true }).click();
        await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
        expect(fixture.state.counts.forgot).toBe(1);
      } finally { releaseRequest?.(); gated.forgotGate = null; }
      const success = page.locator('.public-auth-status-card--success[role="status"]');
      await expect(success).toBeVisible();
      await page.getByRole("button", { name: "English", exact: true }).click();
      await toggle.click();
      await expectTheme(page, theme, ".auth-v17-forgot");
      await expect(success).toContainText("If the account exists");
      expect(fixture.state.counts.forgot).toBe(1);
      fixture.state.forgot = "limited";
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await expectTheme(page, theme, ".auth-v17-forgot");
      await identifier.fill(authV17FixtureIdentity.username);
      await page.locator('form button[type="submit"]').click();
      const alert = page.locator('[role="alert"]').first();
      await expect(alert).toBeVisible();
      await expect.poll(() => fixture.state.counts.forgot).toBe(2);
      await toggle.click();
      await page.getByRole("button", { name: "Bahasa Melayu", exact: true }).click();
      await expectTheme(page, opposite(theme), ".auth-v17-forgot");
      await expect(alert).toBeVisible();
      await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
      expect(fixture.state.counts.forgot).toBe(2);
      await page.getByRole("button", { name: "Kembali ke log masuk", exact: true }).click();
      await expectTheme(page, opposite(theme), ".auth-v17-login");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectTheme(page, opposite(theme), ".auth-v17-login");
      expect(fixture.state.counts.login).toBe(0);
    } finally { releaseRequest?.(); gated.forgotGate = null; await finish(); }
  });
}
