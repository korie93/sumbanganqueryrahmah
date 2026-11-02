import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { createAuthV17Fixture, authV17FixtureIdentity } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture, type BrowserThemeFixtureOptions } from "../../scripts/lib/browser-theme-fixture.mjs";

// Compile the real public routes; all accounts and API responses are fictional.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });
const resetPath = `/reset-password?token=${authV17FixtureIdentity.token}`;
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";

async function installFixture(page: Page, baseURL: string | undefined) {
  expect(baseURL, "Use the isolated compiled frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture = createAuthV17Fixture(origin);
  const state: { code: string; mutationGate: Promise<void> | null } = {
    code: "PASSWORD_CONFIRMATION_MISMATCH", mutationGate: null,
  };
  const errors: string[] = [], pending = new Set<Promise<void>>();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript<BrowserThemeFixtureOptions>(initializeBrowserThemeFixture,
    { origin, mode: "preserve-choice", theme: "light", performanceMode: "high" });
  await page.addInitScript(expectedOrigin => {
    if (location.origin !== expectedOrigin) return;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  }, origin);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const url = new URL(message.location().url || origin, origin), text = message.text();
    if (url.origin === origin && url.pathname === "/api/me" && text.includes("status of 401")) return;
    if (url.origin === origin && url.pathname === "/api/auth/reset-password-with-token" && text.includes("status of 400")) return;
    errors.push(text);
  });
  await page.context().routeWebSocket("**/*", socket => {
    errors.push("Public recovery must not open a protected WebSocket"); socket.close();
  });
  const handle = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { errors.push(`Off-origin ${url.origin}${url.pathname}`); return route.abort(); }
    if (url.pathname === "/api/maintenance-status" && request.method() === "GET") return route.fulfill({ json: { maintenance: false } });
    if (url.pathname.startsWith("/api/telemetry/") && ["GET", "POST"].includes(request.method())) return route.fulfill({ json: { ok: true } });
    if (request.isNavigationRequest() && request.resourceType() === "document") {
      const response = await route.fetch(), headers = response.headers();
      headers["content-security-policy"] = [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", ");
      return route.fulfill({ response, headers });
    }
    if (url.pathname === "/api/auth/reset-password-with-token" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ token: authV17FixtureIdentity.token,
        newPassword: authV17FixtureIdentity.password, confirmPassword: authV17FixtureIdentity.password });
      fixture.state.counts.reset++;
      const code = state.code, gate = state.mutationGate;
      if (gate) await gate;
      return route.fulfill({ status: 400, json: {
        ok: false, message: "Synthetic field rejection.", error: { code, message: "Synthetic field rejection." },
      } });
    }
    return fixture.route(route);
  };
  await page.context().route("**/*", route => {
    const work = handle(route).finally(() => pending.delete(work)); pending.add(work); return work;
  });
  return { fixture, state, async finish() {
    while (pending.size) await Promise.all(pending);
    await page.context().unrouteAll({ behavior: "wait" });
    expect(fixture.state.unexpected, "Every API has an explicit fictional contract").toEqual([]);
    expect(errors, "No unexpected browser, CSP or Trusted Types errors").toEqual([]);
  } };
}

async function expectAccessibleInvalid(field: Locator, errorId: string) {
  await expect(field).toBeEnabled();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("aria-describedby", new RegExp(`(?:^|\\s)${errorId}(?:\\s|$)`));
  await expect(field.page().locator(`#${errorId}`)).not.toHaveText("");
}

async function expectFullyInViewport(field: Locator) {
  await expect.poll(async () => field.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
  })).toBe(true);
}

async function fillMatchingPasswords(page: Page) {
  await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
  await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
}

async function nextPaint(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}

test("Forgot explicit invalid submits focus the identifier without an API request or unnecessary scrolling", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, finish } = await installFixture(page, baseURL);
  try {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1400 });
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      const identifier = page.locator("#forgot-password-identifier"), submit = page.locator('form button[type="submit"]');
      await identifier.fill("   ");
      const theme = page.locator(".auth-v17-theme");
      await theme.focus();
      await expect(identifier).toHaveAttribute("aria-invalid", "true");
      await nextPaint(page);
      await expect(theme).toBeFocused();
      for (const value of ["", "   ", "   "]) {
        await identifier.fill(value);
        await submit.focus();
        const before = await page.evaluate(() => scrollY);
        await submit.press("Enter");
        await expectAccessibleInvalid(identifier, "forgot-password-identifier-error");
        expect(await page.evaluate(() => scrollY)).toBe(before);
        expect(fixture.state.counts.forgot).toBe(0);
      }
      // A short window/keyboard viewport puts this compact form's first field
      // genuinely above the submit button's visible area on either layout.
      await page.setViewportSize({ width, height: 200 });
      await submit.scrollIntoViewIfNeeded();
      expect(await identifier.evaluate(element => element.getBoundingClientRect().bottom <= 0)).toBe(true);
      await submit.click();
      await expectAccessibleInvalid(identifier, "forgot-password-identifier-error");
      await expectFullyInViewport(identifier);
      expect(fixture.state.counts.forgot).toBe(0);
      await identifier.fill("corrected.fixture");
      await expect(identifier).toBeFocused();
      await expect(identifier).not.toHaveAttribute("aria-invalid", "true");
      await theme.focus(); await expect(theme).toBeFocused();
    }
  } finally { await finish(); }
});

test("Reset explicit local validation focuses the first invalid field and preserves policy and entered values", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, finish } = await installFixture(page, baseURL);
  try {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1400 });
      await page.goto(resetPath, { waitUntil: "domcontentloaded" });
      const password = page.locator("#reset-password-new-password"), confirm = page.locator("#reset-password-confirm-password");
      const submit = page.locator('form button[type="submit"]');
      await expect(password).toBeVisible();
      for (let attempt = 0; attempt < 2; attempt++) {
        await submit.focus(); const before = await page.evaluate(() => scrollY);
        await submit.press("Enter");
        await expectAccessibleInvalid(password, "reset-password-new-error");
        expect(await page.evaluate(() => scrollY)).toBe(before);
        expect(fixture.state.counts.reset).toBe(0);
      }
      await password.fill(authV17FixtureIdentity.password);
      await submit.click();
      await expectAccessibleInvalid(confirm, "reset-password-confirm-error");
      await expect(password).toHaveValue(authV17FixtureIdentity.password);
      await confirm.fill("FixtureMismatch1!");
      await submit.click();
      await expectAccessibleInvalid(confirm, "reset-password-confirm-error");
      await expect(password).toHaveValue(authV17FixtureIdentity.password);
      await expect(confirm).toHaveValue("FixtureMismatch1!");
      await expect(password).toHaveAttribute("type", "password");
      await expect(page.locator("[data-password-policy-status]")).toHaveAttribute("data-password-policy-status", "valid");
      expect(fixture.state.counts.reset).toBe(0);

      await password.fill("short"); await confirm.focus();
      await expect(password).toHaveAttribute("aria-invalid", "true");
      await nextPaint(page);
      await expect(confirm).toBeFocused();
      await confirm.fill("another mismatch"); await expect(confirm).toBeFocused();
      await page.locator(".credential-recovery__theme").focus();
      await expect(page.locator(".credential-recovery__theme")).toBeFocused();
      await page.setViewportSize({ width, height: 420 });
      await submit.scrollIntoViewIfNeeded();
      expect(await password.evaluate(element => element.getBoundingClientRect().bottom <= 0)).toBe(true);
      await submit.click();
      await expectAccessibleInvalid(password, "reset-password-new-error");
      await expectFullyInViewport(password);
      await expect(password).toHaveValue("short");
      await expect(confirm).toHaveValue("another mismatch");
      expect(fixture.state.counts.reset).toBe(0);
    }
  } finally { await finish(); }
});

test("Server password field errors focus the enabled invalid field after the pending request completes", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, state, finish } = await installFixture(page, baseURL);
  let release: (() => void) | undefined;
  try {
    for (const [code, target, errorId] of [
      ["PASSWORD_CONFIRMATION_MISMATCH", "#reset-password-confirm-password", "reset-password-confirm-error"],
      ["PASSWORD_MISSING_SYMBOL", "#reset-password-new-password", "reset-password-new-error"],
    ] as const) {
      state.code = code;
      await page.goto(resetPath, { waitUntil: "domcontentloaded" });
      await fillMatchingPasswords(page);
      state.mutationGate = new Promise<void>(resolve => { release = resolve; });
      const before = fixture.state.counts.reset;
      await page.locator('form button[type="submit"]').click();
      await expect.poll(() => fixture.state.counts.reset).toBe(before + 1);
      await expect(page.locator(target)).toBeDisabled();
      release?.(); state.mutationGate = null;
      await expectAccessibleInvalid(page.locator(target), errorId);
      await expect(page.locator(".credential-recovery__content")).not.toHaveAttribute("aria-busy", "true");
      await expect(page.locator("#reset-password-new-password")).toHaveValue(authV17FixtureIdentity.password);
      await expect(page.locator("#reset-password-confirm-password")).toHaveValue(authV17FixtureIdentity.password);
      expect(fixture.state.counts.reset).toBe(before + 1);
    }
  } finally { release?.(); state.mutationGate = null; await finish(); }
});

test("Server field feedback preserves a user's language or theme focus while awaiting the response", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, state, finish } = await installFixture(page, baseURL);
  let release: (() => void) | undefined;
  try {
    for (const width of [320, 1440]) {
      for (const control of ["language", "theme"] as const) {
        await page.setViewportSize({ width, height: 900 });
        state.code = control === "language" ? "PASSWORD_CONFIRMATION_MISMATCH" : "PASSWORD_MISSING_SYMBOL";
        await page.goto(resetPath, { waitUntil: "domcontentloaded" });
        await fillMatchingPasswords(page);
        state.mutationGate = new Promise<void>(resolve => { release = resolve; });
        const before = fixture.state.counts.reset;
        await page.locator('form button[type="submit"]').click();
        await expect.poll(() => fixture.state.counts.reset).toBe(before + 1);
        const preference = control === "language"
          ? page.getByRole("button", { name: "English", exact: true }) : page.locator(".credential-recovery__theme");
        await preference.click(); await expect(preference).toBeFocused();
        const chosenTheme = await page.locator("html").getAttribute("data-theme");
        release?.(); state.mutationGate = null;
        const invalid = page.locator(control === "language" ? "#reset-password-confirm-password" : "#reset-password-new-password");
        await expect(invalid).toBeEnabled(); await expect(invalid).toHaveAttribute("aria-invalid", "true");
        await nextPaint(page);
        await expect(preference).toBeFocused();
        await expect(page.locator("html")).toHaveAttribute("data-theme", chosenTheme!);
        if (control === "language") await expect(preference).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#reset-password-new-password")).toHaveValue(authV17FixtureIdentity.password);
        await expect(page.locator("#reset-password-confirm-password")).toHaveValue(authV17FixtureIdentity.password);
        expect(fixture.state.counts.reset).toBe(before + 1);
      }
    }
  } finally { release?.(); state.mutationGate = null; await finish(); }
});
