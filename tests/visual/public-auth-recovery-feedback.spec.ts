import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";
import { createAuthV17Fixture, authV17FixtureIdentity } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture, type BrowserThemeFixtureOptions } from "../../scripts/lib/browser-theme-fixture.mjs";

// Exercise the actual compiled recovery controllers with fictional loopback APIs.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Theme = "light" | "dark";
type ValidationResponse = { kind: "valid" | "network" | "malformed" }
  | { kind: "http"; status: number; code: string; retryAfterMs?: number };
const tokenPath = `/reset-password?token=${authV17FixtureIdentity.token}`;
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";

async function installFixture(page: Page, baseURL: string | undefined, theme: Theme) {
  expect(baseURL, "Use the isolated compiled frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture = createAuthV17Fixture(origin);
  const state: { validation: ValidationResponse; validationGate: Promise<void> | null; forgotGate: Promise<void> | null; forgotIdentifiers: string[] } = {
    validation: { kind: "valid" }, validationGate: null, forgotGate: null, forgotIdentifiers: [],
  };
  const errors: string[] = [], expectedHttpErrors = new Set<string>();
  const pending = new Set<Promise<void>>();
  await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", reducedMotion: "reduce" });
  await page.addInitScript<BrowserThemeFixtureOptions>(initializeBrowserThemeFixture,
    { origin, mode: "preserve-choice", theme, performanceMode: "high" });
  await page.addInitScript(expectedOrigin => {
    if (location.origin !== expectedOrigin) return;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  }, origin);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text(), url = new URL(message.location().url || origin, origin);
    if (url.origin === origin && url.pathname === "/api/me" && text.includes("status of 401")) return;
    if (url.origin === origin && url.pathname === "/api/auth/validate-password-reset-token"
      && [...expectedHttpErrors].some(expected => text.includes(expected))) return;
    errors.push(text);
  });
  await page.context().routeWebSocket("**/*", socket => {
    errors.push("Public recovery must not open a protected WebSocket");
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
    if (url.pathname === "/api/auth/request-password-reset" && request.method() === "POST") {
      const body = request.postDataJSON() as { identifier?: unknown };
      expect(typeof body.identifier).toBe("string");
      state.forgotIdentifiers.push(body.identifier as string);
      fixture.state.counts.forgot++;
      if (state.forgotGate) await state.forgotGate;
      return route.fulfill({ json: { ok: true, message: "If the account exists, its administrator will review the request." } });
    }
    if (url.pathname === "/api/auth/validate-password-reset-token" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ token: authV17FixtureIdentity.token });
      const response = state.validation;
      // Count even a paused/failed validation, without ever mounting account data.
      if (response.kind === "valid" && !state.validationGate) return fixture.route(route);
      fixture.state.counts.validate++;
      if (state.validationGate) await state.validationGate;
      if (response.kind === "network") {
        expectedHttpErrors.add("net::ERR_FAILED");
        return route.abort("failed");
      }
      if (response.kind === "malformed") return route.fulfill({ json: { ok: true, reset: { username: "unvalidated.fixture" } } });
      if (response.kind === "http") {
        expectedHttpErrors.add(`status of ${response.status}`);
        const message = response.status === 429 ? "Too many attempts. Try again in 1 seconds." : "The request was not accepted.";
        return route.fulfill({ status: response.status, json: {
          ok: false, message, error: { code: response.code, message },
          ...(response.retryAfterMs === undefined ? {} : { retryAfterMs: response.retryAfterMs }),
        } });
      }
      return route.fulfill({ json: { ok: true, reset: {
        username: authV17FixtureIdentity.username, fullName: "UI Fixture", email: null, role: "user", expiresAt: "2099-01-01T00:00:00.000Z",
      } } });
    }
    return fixture.route(route);
  };
  await page.context().route("**/*", route => {
    const work = handle(route).finally(() => pending.delete(work));
    pending.add(work);
    return work;
  });
  const settle = async () => {
    while (pending.size) await Promise.all(pending);
  };
  return {
    fixture, state, settle,
    async finish() {
      await settle();
      await page.context().unrouteAll({ behavior: "wait" });
      expect(fixture.state.unexpected, "All APIs have explicit fictional contracts").toEqual([]);
      expect(errors, "No unexpected browser, CSP, Trusted Types or request errors").toEqual([]);
    },
  };
}

async function expectNoPasswordOrMetadata(page: Page) {
  await expect(page.locator(".password-creation-form")).toHaveCount(0);
  await expect(page.locator(".public-auth-account-summary")).toHaveCount(0);
  await expect(page.locator("#reset-password-new-password")).toHaveCount(0);
}

async function checkLayoutAndAccessibility(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: (root: Document, options: RunOptions) => Promise<AxeResults> } }).axe;
    return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
      .violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }));
  });
  expect(violations, `${width}px WCAG A/AA`).toEqual([]);
}

async function recoveryGeometry(page: Page) {
  return page.evaluate(() => {
    const position = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing recovery anchor: ${selector}`);
      const box = element.getBoundingClientRect();
      // Compare document positions: focusing a field may legitimately scroll a
      // phone viewport, while the toolbar/title must retain their layout rail.
      return { x: box.left + scrollX, y: box.top + scrollY, width: box.width };
    };
    return {
      toolbar: position(".credential-recovery__controls"),
      title: position("#credential-recovery-title"),
    };
  });
}

async function expectStableRecoveryGeometry(page: Page, expected: Awaited<ReturnType<typeof recoveryGeometry>>) {
  const actual = await recoveryGeometry(page);
  for (const anchor of ["toolbar", "title"] as const) {
    for (const dimension of ["x", "y", "width"] as const) {
      expect(Math.abs(actual[anchor][dimension] - expected[anchor][dimension]), `${anchor}/${dimension} remains stable`).toBeLessThanOrEqual(2);
    }
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`Reset validation recovers manually from connection/server/contract failures (${theme})`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    const { fixture, state, finish } = await installFixture(page, baseURL, theme);
    try {
      for (const response of [{ kind: "network" }, { kind: "http", status: 503, code: "SERVICE_UNAVAILABLE" }, { kind: "malformed" }] as const) {
        state.validation = response;
        const before = fixture.state.counts.validate;
        await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Pautan belum dapat disahkan", exact: true })).toBeVisible();
        await expectNoPasswordOrMetadata(page);
        await expect(page.locator(".credential-recovery__context-copy p")).toHaveText("Pemulihan akaun melalui pautan peribadi.");
        await expect(page.getByRole("button", { name: "Minta pautan tetapan semula baharu", exact: true })).toHaveCount(0);
        expect(fixture.state.counts.validate).toBe(before + 1);
        const retry = page.getByRole("button", { name: "Cuba Lagi", exact: true });
        await expect(retry).toBeEnabled();
        if (response.kind === "network") {
          for (const width of [320, 1440]) {
            await checkLayoutAndAccessibility(page, width);
            await page.screenshot({ path: testInfo.outputPath(`reset-retry-${theme}-${width}.png`), animations: "disabled", fullPage: true });
          }
        }
        state.validation = { kind: "valid" };
        await retry.focus(); await retry.press("Enter");
        await expect(page.locator("#reset-password-new-password")).toBeVisible();
        await expect(page.locator("#reset-password-new-password")).toBeFocused();
        await expect(page.locator(".credential-recovery__username dd")).toHaveText(authV17FixtureIdentity.username);
        await expect(page.locator(".credential-recovery__context-copy p")).toHaveText("Pemulihan akaun melalui pautan peribadi.");
        expect(fixture.state.counts.validate).toBe(before + 2);
        expect(fixture.state.counts.reset).toBe(0);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      }
    } finally { await finish(); }
  });

  test(`Recovery identifier can be corrected with keyboard without automatic submission (${theme})`, async ({ page, baseURL }, testInfo) => {
    const { fixture, state, finish } = await installFixture(page, baseURL, theme);
    try {
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Permintaan Tetapan Semula Kata Laluan", exact: true })).toBeVisible();
      const identifier = page.locator("#forgot-password-identifier");
      await identifier.fill(authV17FixtureIdentity.username);
      await page.locator('form button[type="submit"]').click();
      const success = page.locator('.public-auth-status-card--success[role="status"]');
      await expect(success).toContainText("Jika akaun wujud");
      await expect(success).toContainText("selepas permintaan diluluskan");
      await expect(page.getByRole("heading", { name: "Permintaan diterima", exact: true })).toBeVisible();
      await expect(page.locator(".auth-v17-subtitle")).toHaveText("Emel tetapan semula hanya dihantar selepas kelulusan superuser.");
      await expect(success).toBeFocused();
      await expect(identifier).toHaveCount(0);
      expect(state.forgotIdentifiers).toEqual([authV17FixtureIdentity.username]);
      for (const width of [320, 1440]) {
        await checkLayoutAndAccessibility(page, width);
        await page.screenshot({ path: testInfo.outputPath(`forgot-submitted-${theme}-${width}.png`), animations: "disabled", fullPage: true });
      }
      await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(success).toContainText("If the account exists");
      await expect(page.getByRole("heading", { name: "Request received", exact: true })).toBeVisible();
      await expect(page.locator(".auth-v17-subtitle")).toHaveText("A reset email is only sent after superuser approval.");
      const edit = page.getByRole("button", { name: "Use a different username/email", exact: true });
      await edit.focus(); await edit.press("Enter");
      await expect(identifier).toBeVisible();
      await expect(identifier).toBeFocused();
      await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
      await expect(success).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Request a password reset", exact: true })).toBeVisible();
      await expect(page.locator(".auth-v17-subtitle")).toContainText("Enter your username or email.");
      expect(fixture.state.counts.forgot).toBe(1);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute("aria-pressed", "true");
      await identifier.fill("corrected.fixture@example.invalid");
      await identifier.press("Enter");
      await expect(success).toContainText("If the account exists");
      await expect(page.getByRole("heading", { name: "Request received", exact: true })).toBeVisible();
      expect(state.forgotIdentifiers).toEqual([authV17FixtureIdentity.username, "corrected.fixture@example.invalid"]);
      await page.getByRole("button", { name: "Bahasa Melayu", exact: true }).click();
      const editMalay = page.getByRole("button", { name: "Gunakan username/emel lain", exact: true });
      await editMalay.focus(); await editMalay.press("Space");
      await expect(identifier).toBeFocused();
      await expect(identifier).toHaveValue("corrected.fixture@example.invalid");
      await expect(page.getByRole("heading", { name: "Permintaan Tetapan Semula Kata Laluan", exact: true })).toBeVisible();
      expect(fixture.state.counts.forgot).toBe(2);
    } finally { await finish(); }
  });

  test(`Recovery pending feedback preserves preference focus and stable reset geometry (${theme})`, async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const { fixture, state, finish } = await installFixture(page, baseURL, theme);
    let releaseForgot: (() => void) | undefined;
    let releaseValidation: (() => void) | undefined;
    let releaseReset: (() => void) | undefined;
    try {
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await page.locator("#forgot-password-identifier").fill(authV17FixtureIdentity.username);
      state.forgotGate = new Promise<void>(resolve => { releaseForgot = resolve; });
      await page.locator('form button[type="submit"]').click();
      await expect.poll(() => fixture.state.counts.forgot).toBe(1);
      const english = page.getByRole("button", { name: "English", exact: true });
      await english.click();
      await expect(english).toBeFocused();
      releaseForgot?.(); state.forgotGate = null;
      await expect(page.locator('.public-auth-status-card--success[role="status"]')).toContainText("If the account exists");
      await expect(page.getByRole("heading", { name: "Request received", exact: true })).toBeVisible();
      await expect(english).toBeFocused();

      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        state.validation = { kind: "http", status: 503, code: "SERVICE_UNAVAILABLE" };
        await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const anchors = await recoveryGeometry(page);

        const beforeValidation = fixture.state.counts.validate;
        state.validation = { kind: "valid" };
        state.validationGate = new Promise<void>(resolve => { releaseValidation = resolve; });
        await page.getByRole("button", { name: "Try again", exact: true }).click();
        await expect.poll(() => fixture.state.counts.validate).toBe(beforeValidation + 1);
        await expect(page.locator(".credential-recovery__content")).toHaveAttribute("aria-busy", "true");
        await expectNoPasswordOrMetadata(page);
        await expectStableRecoveryGeometry(page, anchors);
        await english.click();
        releaseValidation?.(); state.validationGate = null;
        await expect(page.locator("#reset-password-new-password")).toBeVisible();
        await expect(english).toBeFocused();
        await expectStableRecoveryGeometry(page, anchors);

        await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
        await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
        fixture.state.resetGate = new Promise<void>(resolve => { releaseReset = resolve; });
        const beforeReset = fixture.state.counts.reset;
        await page.locator('form button[type="submit"]').click();
        await expect.poll(() => fixture.state.counts.reset).toBe(beforeReset + 1);
        const themeToggle = page.locator(".credential-recovery__theme");
        await themeToggle.click();
        await expect(themeToggle).toBeFocused();
        releaseReset?.(); fixture.state.resetGate = null;
        await expect(page.locator('.public-auth-status-card--success[role="status"]')).toBeVisible();
        await expect(themeToggle).toBeFocused();
        await expectStableRecoveryGeometry(page, anchors);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
    } finally {
      releaseForgot?.(); state.forgotGate = null;
      releaseValidation?.(); state.validationGate = null;
      releaseReset?.(); fixture.state.resetGate = null;
      await finish();
    }
  });
}

test("Authoritative token and access rejections cannot reveal the reset form", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, state, finish } = await installFixture(page, baseURL, "light");
  try {
    for (const [status, code] of [[400, "INVALID_TOKEN"], [410, "TOKEN_EXPIRED"], [409, "ACCOUNT_UNAVAILABLE"], [401, "TOKEN_REQUIRED"], [403, "FORBIDDEN"]] as const) {
      state.validation = { kind: "http", status, code };
      const before = fixture.state.counts.validate;
      await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Pautan tidak tersedia", exact: true })).toBeVisible();
      await expectNoPasswordOrMetadata(page);
      await expect(page.getByRole("button", { name: "Cuba Lagi", exact: true })).toHaveCount(0);
      await expect(page.locator(".credential-recovery__description")).toHaveText("Pautan ini tidak boleh digunakan. Minta pautan baharu untuk meneruskan.");
      await expect(page.locator(".credential-recovery__context-copy p")).toHaveText("Pemulihan akaun melalui pautan peribadi.");
      await expect(page.locator('.credential-recovery__content > button.public-auth-button-primary')).toBeVisible();
      expect(fixture.state.counts.validate).toBe(before + 1);
    }
  } finally { await finish(); }
});

test("Rate-limited validation waits for the server delay and requires an explicit retry", async ({ page, baseURL }) => {
  const { fixture, state, finish } = await installFixture(page, baseURL, "dark");
  try {
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    state.validation = { kind: "http", status: 429, code: "AUTH_RATE_LIMITED", retryAfterMs: 30_000 };
    await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
    const retry = page.locator('.credential-recovery__content > button.public-auth-button-primary');
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveText("Tunggu sebentar");
    await expectNoPasswordOrMetadata(page);
    await expect(page.getByRole("alert")).toBeVisible();
    expect(fixture.state.counts.validate).toBe(1);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(retry).toHaveText("Please wait");
    state.validation = { kind: "valid" };
    // Keep the clock running through navigation so the boot shell can complete
    // its animation-frame cleanup; advance the server delay without real sleeps.
    await page.clock.fastForward(10_000);
    await expect(retry).toBeDisabled();
    expect(fixture.state.counts.validate).toBe(1);
    await page.clock.fastForward(30_000);
    await expect(retry).toBeEnabled();
    await expect(retry).toHaveText("Try again");
    expect(fixture.state.counts.validate).toBe(1);
    await retry.click();
    await expect(page.locator("#reset-password-new-password")).toBeVisible();
    await expect(page.locator("#reset-password-new-password")).toBeFocused();
    expect(fixture.state.counts.validate).toBe(2);
  } finally { await finish(); }
});

test("Leaving while a retry is pending prevents late validation from revealing account data", async ({ page, baseURL }) => {
  const { fixture, state, settle, finish } = await installFixture(page, baseURL, "light");
  let releaseValidation: (() => void) | undefined;
  try {
    state.validation = { kind: "http", status: 503, code: "SERVICE_UNAVAILABLE" };
    await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Cuba Lagi", exact: true })).toBeEnabled();
    state.validation = { kind: "valid" };
    state.validationGate = new Promise<void>(resolve => { releaseValidation = resolve; });
    await page.getByRole("button", { name: "Cuba Lagi", exact: true }).click();
    await expect.poll(() => fixture.state.counts.validate).toBe(2);
    await expectNoPasswordOrMetadata(page);
    await page.getByRole("button", { name: "Kembali ke log masuk", exact: true }).click();
    await expect(page.locator(".auth-v17-login")).toBeVisible();
    releaseValidation?.(); state.validationGate = null;
    await settle();
    await expect(page.locator(".auth-v17-login")).toBeVisible();
    await expectNoPasswordOrMetadata(page);
    expect(fixture.state.counts.reset).toBe(0);
  } finally { releaseValidation?.(); state.validationGate = null; await finish(); }
});

test("Successful reset offers primary sign-in navigation without repeating its security context", async ({ page, baseURL }) => {
  const { fixture, finish } = await installFixture(page, baseURL, "dark");
  try {
    await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#reset-password-new-password")).toBeVisible();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.locator(".credential-recovery__context-copy p")).toHaveText("Account recovery through a private link.");
    await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
    await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole("heading", { name: "Password updated", exact: true })).toBeVisible();
    await expect(page.locator(".credential-recovery__description")).toHaveText("Sign in to continue using SQR with your new password.");
    await expect(page.locator(".credential-recovery__context-copy p")).toHaveText("Account recovery through a private link.");
    await expect(page.locator('.public-auth-status-card--success[role="status"]')).toContainText("Your password has been reset");
    await expect(page.locator('.public-auth-status-card--success[role="status"]')).toBeFocused();
    await expectNoPasswordOrMetadata(page);
    expect(fixture.state.counts.validate).toBe(1);
    expect(fixture.state.counts.reset).toBe(1);
    const signIn = page.locator('.credential-recovery__content > button.public-auth-button-primary');
    await expect(signIn).toHaveAccessibleName("Sign in");
    await signIn.click();
    await expect(page.locator(".auth-v17-login")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(fixture.state.counts.login).toBe(0);
  } finally { await finish(); }
});
