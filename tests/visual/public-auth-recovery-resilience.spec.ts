import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { createAuthV17Fixture, authV17FixtureIdentity } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture, type BrowserThemeFixtureOptions } from "../../scripts/lib/browser-theme-fixture.mjs";

// Real compiled controllers; only fictional APIs and an in-page clipboard double.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Theme = "light" | "dark";
type HttpFailure = { status: number; code: string; requestId?: string };
type Validation = { kind: "valid" | "late-valid" | "network" } | ({ kind: "http" } & HttpFailure);
type ClipboardWindow = Window & { __sqrCopiedReferences: string[]; __sqrClipboardDenied: boolean };
const resetPath = `/reset-password?token=${authV17FixtureIdentity.token}`;
const referenceId = "api-recovery-fixture-3b9f83c2";
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";

async function installFixture(page: Page, baseURL: string | undefined, theme: Theme) {
  expect(baseURL, "Use the isolated compiled frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture = createAuthV17Fixture(origin);
  const state: {
    validation: Validation;
    validationGate: Promise<void> | null;
    forgotFailure: HttpFailure | null;
    resetFailure: HttpFailure | null;
  } = { validation: { kind: "valid" }, validationGate: null, forgotFailure: null, resetFailure: null };
  const pending = new Set<Promise<void>>(), canceled = new WeakSet<Request>();
  const expectedErrors = new Map<string, Set<string>>(), errors: string[] = [];
  const allowRequestError = (pathname: string, message: string) => {
    const allowed = expectedErrors.get(pathname) ?? new Set<string>();
    allowed.add(message); expectedErrors.set(pathname, allowed);
  };
  await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", reducedMotion: "reduce" });
  await page.addInitScript<BrowserThemeFixtureOptions>(initializeBrowserThemeFixture,
    { origin, mode: "preserve-choice", theme, performanceMode: "high" });
  await page.addInitScript(expectedOrigin => {
    if (location.origin !== expectedOrigin) return;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    const fixtureWindow = window as unknown as ClipboardWindow;
    fixtureWindow.__sqrCopiedReferences = [];
    fixtureWindow.__sqrClipboardDenied = false;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      async writeText(value: string) {
        if (fixtureWindow.__sqrClipboardDenied) throw new DOMException("Synthetic permission denial", "NotAllowedError");
        fixtureWindow.__sqrCopiedReferences.push(value);
      },
    } });
  }, origin);
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => {
    if (/ERR_ABORTED|aborted|cancel/i.test(request.failure()?.errorText ?? "")) canceled.add(request);
  });
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text(), url = new URL(message.location().url || origin, origin);
    if (url.origin === origin && url.pathname === "/api/me" && text.includes("status of 401")) return;
    if (url.origin === origin && [...(expectedErrors.get(url.pathname) ?? [])].some(allowed => text.includes(allowed))) return;
    errors.push(text);
  });
  await page.context().routeWebSocket("**/*", socket => {
    errors.push("Public recovery must not open a protected WebSocket"); socket.close();
  });
  const respondFailure = (route: Route, failure: HttpFailure) => {
    const pathname = new URL(route.request().url()).pathname;
    allowRequestError(pathname, `status of ${failure.status}`);
    return route.fulfill({ status: failure.status,
      ...(failure.requestId ? { headers: { "x-request-id": failure.requestId } } : {}),
      json: { ok: false, message: "Synthetic server response.", error: { code: failure.code, message: "Synthetic server response." },
        ...(failure.requestId ? { requestId: failure.requestId } : {}) },
    });
  };
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
    if (url.pathname === "/api/auth/validate-password-reset-token" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ token: authV17FixtureIdentity.token });
      const response = state.validation, gate = state.validationGate;
      if (response.kind === "valid" && !gate) return fixture.route(route);
      fixture.state.counts.validate++;
      if (gate) {
        allowRequestError(url.pathname, "net::ERR_ABORTED");
        await gate;
      }
      if (response.kind === "network") {
        allowRequestError(url.pathname, "net::ERR_FAILED"); return route.abort("failed");
      }
      if (response.kind === "http") return respondFailure(route, response);
      try {
        return await route.fulfill({ json: { ok: true, reset: {
          username: response.kind === "late-valid" ? "late.unvalidated.fixture" : authV17FixtureIdentity.username,
          fullName: "UI Fixture", email: null, role: "user", expiresAt: "2099-01-01T00:00:00.000Z",
        } } });
      } catch (error) {
        // An intentionally delayed route may already be canceled by the real
        // AbortSignal. Only that known canceled request may suppress fulfillment.
        if (!gate || !canceled.has(request)) throw error;
      }
      return;
    }
    if (url.pathname === "/api/auth/request-password-reset" && request.method() === "POST" && state.forgotFailure) {
      expect(request.postDataJSON()).toEqual({ identifier: authV17FixtureIdentity.username });
      fixture.state.counts.forgot++; return respondFailure(route, state.forgotFailure);
    }
    if (url.pathname === "/api/auth/reset-password-with-token" && request.method() === "POST" && state.resetFailure) {
      expect(request.postDataJSON()).toEqual({ token: authV17FixtureIdentity.token,
        newPassword: authV17FixtureIdentity.password, confirmPassword: authV17FixtureIdentity.password });
      fixture.state.counts.reset++; return respondFailure(route, state.resetFailure);
    }
    return fixture.route(route);
  };
  await page.context().route("**/*", route => {
    const work = handle(route).finally(() => pending.delete(work)); pending.add(work); return work;
  });
  const settle = async () => { while (pending.size) await Promise.all(pending); };
  return { fixture, state, settle, async finish() {
    await settle(); await page.context().unrouteAll({ behavior: "wait" });
    expect(fixture.state.unexpected, "All APIs have explicit fictional contracts").toEqual([]);
    expect(errors, "No unexpected browser, CSP or Trusted Types errors").toEqual([]);
  } };
}

async function expectNoResetData(page: Page) {
  await expect(page.locator(".password-creation-form")).toHaveCount(0);
  await expect(page.locator(".public-auth-account-summary")).toHaveCount(0);
}

test("Reset verification timeout remains closed, ignores a late success and permits only manual retry", async ({ page, baseURL }) => {
  const { fixture, state, settle, finish } = await installFixture(page, baseURL, "dark");
  let releaseValidation: (() => void) | undefined;
  try {
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    state.validation = { kind: "late-valid" };
    state.validationGate = new Promise<void>(resolve => { releaseValidation = resolve; });
    await page.goto(resetPath, { waitUntil: "domcontentloaded" });
    await expect.poll(() => fixture.state.counts.validate).toBe(1);
    await expect(page.locator(".credential-recovery__content")).toHaveAttribute("aria-busy", "true");
    await expectNoResetData(page);
    // Keep fake time running during boot; this action also proves the boot
    // overlay has yielded before advancing the application's deadline.
    await page.getByRole("button", { name: "Bahasa Melayu", exact: true }).click();
    await page.clock.fastForward(15_001);
    await expect(page.getByRole("heading", { name: "Pautan belum dapat disahkan", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveText("Semakan pautan mengambil masa terlalu lama. Semak sambungan anda, kemudian cuba lagi.");
    await expect(page.getByRole("button", { name: "Cuba Lagi", exact: true })).toBeEnabled();
    await expectNoResetData(page);
    await expect(page.locator(".public-auth-request-reference")).toHaveCount(0);
    expect(fixture.state.counts.validate).toBe(1);
    releaseValidation?.(); state.validationGate = null; await settle();
    await expectNoResetData(page);
    await expect(page.getByRole("heading", { name: "Pautan belum dapat disahkan", exact: true })).toBeVisible();
    state.validation = { kind: "valid" };
    await page.getByRole("button", { name: "Cuba Lagi", exact: true }).click();
    await expect(page.locator("#reset-password-new-password")).toBeVisible();
    await expect(page.locator(".credential-recovery__username dd")).toHaveText(authV17FixtureIdentity.username);
    await expect(page.locator("body")).not.toContainText("late.unvalidated.fixture");
    expect(fixture.state.counts.validate).toBe(2); expect(fixture.state.counts.reset).toBe(0);
  } finally { releaseValidation?.(); state.validationGate = null; await finish(); }
});

test("Leaving during a pending verification clears its deadline and cannot restore account data", async ({ page, baseURL }) => {
  const { fixture, state, settle, finish } = await installFixture(page, baseURL, "light");
  let releaseValidation: (() => void) | undefined;
  try {
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    state.validation = { kind: "late-valid" };
    state.validationGate = new Promise<void>(resolve => { releaseValidation = resolve; });
    await page.goto(resetPath, { waitUntil: "domcontentloaded" });
    await expect.poll(() => fixture.state.counts.validate).toBe(1);
    await page.getByRole("button", { name: "Kembali ke log masuk", exact: true }).click();
    await expect(page.locator(".auth-v17-login")).toBeVisible();
    await page.clock.fastForward(60_000);
    releaseValidation?.(); state.validationGate = null; await settle();
    await expect(page.locator(".auth-v17-login")).toBeVisible();
    await expectNoResetData(page);
    await expect(page.getByRole("heading", { name: "Pautan belum dapat disahkan", exact: true })).toHaveCount(0);
    expect(fixture.state.counts.validate).toBe(1); expect(fixture.state.counts.reset).toBe(0);
  } finally { releaseValidation?.(); state.validationGate = null; await finish(); }
});

test("Expired and used reset links offer the appropriate primary recovery action", async ({ page, baseURL }) => {
  const { fixture, state, finish } = await installFixture(page, baseURL, "light");
  const primary = page.locator('.credential-recovery__content > button.public-auth-button-primary');
  try {
    state.validation = { kind: "http", status: 410, code: "TOKEN_EXPIRED" };
    await page.goto(resetPath, { waitUntil: "domcontentloaded" });
    await expect(primary).toHaveText("Minta pautan tetapan semula baharu");
    await expectNoResetData(page);
    await primary.click(); await expect(page.locator("#forgot-password-identifier")).toBeVisible();
    state.validation = { kind: "http", status: 410, code: "TOKEN_USED" };
    await page.goto(resetPath, { waitUntil: "domcontentloaded" });
    await expect(primary).toHaveText("Log masuk"); await expectNoResetData(page);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(primary).toHaveText("Sign in");
    await primary.click(); await expect(page.locator(".auth-v17-login")).toBeVisible();
    for (const [status, code] of [[400, "INVALID_TOKEN"], [403, "FORBIDDEN"]] as const) {
      state.validation = { kind: "http", status, code };
      await page.goto(resetPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Link unavailable", exact: true })).toBeVisible();
      await expectNoResetData(page);
    }
    expect(fixture.state.counts.reset).toBe(0); expect(fixture.state.counts.login).toBe(0);
  } finally { await finish(); }
});

for (const theme of ["light", "dark"] as const) {
  test(`Server verification reference copies only its safe ID and clears after recovery (${theme})`, async ({ page, baseURL }, testInfo) => {
    const { fixture, state, finish } = await installFixture(page, baseURL, theme);
    try {
      state.validation = { kind: "http", status: 500, code: "INTERNAL_SERVER_ERROR", requestId: referenceId };
      await page.goto(resetPath, { waitUntil: "domcontentloaded" });
      const reference = page.locator(".public-auth-request-reference");
      await expect(reference.locator(".public-auth-request-reference__value")).toHaveText(referenceId);
      await expectNoResetData(page);
      expect(await page.evaluate(() => (window as unknown as ClipboardWindow).__sqrCopiedReferences)).toEqual([]);
      const copy = reference.getByRole("button", { name: "Salin kod rujukan", exact: true });
      await copy.focus(); await copy.press("Enter");
      await expect(reference.getByRole("status")).toHaveText("Kod rujukan disalin.");
      expect(await page.evaluate(() => (window as unknown as ClipboardWindow).__sqrCopiedReferences)).toEqual([referenceId]);
      await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(reference.getByRole("button", { name: "Copy reference ID", exact: true })).toBeVisible();
      await expect(reference.getByRole("status")).toHaveText("Reference ID copied.");
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`server-reference-${theme}-${width}.png`), animations: "disabled", fullPage: true });
      }
      await expect(reference).not.toContainText(authV17FixtureIdentity.token);
      state.validation = { kind: "valid" };
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(page.locator("#reset-password-new-password")).toBeVisible();
      await expect(reference).toHaveCount(0);
      expect(fixture.state.counts.validate).toBe(2);
    } finally { await finish(); }
  });
}

test("Clipboard denial leaves a truthful manual-copy instruction on a recovery request error", async ({ page, baseURL }) => {
  const { fixture, state, finish } = await installFixture(page, baseURL, "dark");
  try {
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    state.forgotFailure = { status: 500, code: "INTERNAL_ERROR", requestId: referenceId };
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { (window as unknown as ClipboardWindow).__sqrClipboardDenied = true; });
    await page.locator("#forgot-password-identifier").fill(authV17FixtureIdentity.username);
    await page.locator('form button[type="submit"]').click();
    const reference = page.locator(".public-auth-request-reference");
    const submit = page.locator('form button[type="submit"]');
    const alert = page.locator('.public-auth-status-card--error[role="alert"]');
    await expect(submit).toHaveText("Cuba hantar semula");
    await expect(alert).toHaveText("Synthetic server response.");
    await expect(page.locator("#forgot-password-identifier")).toHaveValue(authV17FixtureIdentity.username);
    await expect(reference.locator(".public-auth-request-reference__value")).toHaveText(referenceId);
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(submit).toHaveText("Try sending again");
    await expect(alert).toHaveText("Synthetic server response.");
    await expect(reference.locator(".public-auth-request-reference__value")).toHaveText(referenceId);
    await page.clock.fastForward(60_000);
    expect(fixture.state.counts.forgot).toBe(1);
    await page.getByRole("button", { name: "Bahasa Melayu", exact: true }).click();
    await expect(submit).toHaveText("Cuba hantar semula");
    await expect(alert).toHaveText("Synthetic server response.");
    await expect(reference.locator(".public-auth-request-reference__value")).toHaveText(referenceId);
    await reference.getByRole("button", { name: "Salin kod rujukan", exact: true }).click();
    await expect(reference.getByRole("status")).toHaveText("Kod rujukan tidak dapat disalin. Pilih dan salin kod ini secara manual.");
    expect(await page.evaluate(() => (window as unknown as ClipboardWindow).__sqrCopiedReferences)).toEqual([]);
    await expect(reference).not.toContainText(authV17FixtureIdentity.username);
    expect(fixture.state.counts.forgot).toBe(1);
  } finally { await finish(); }
});

test("Missing or unsafe references are not fabricated for network or server failures", async ({ page, baseURL }) => {
  const { state, finish } = await installFixture(page, baseURL, "light");
  try {
    for (const response of [{ kind: "network" },
      { kind: "http", status: 500, code: "INTERNAL_SERVER_ERROR" },
      { kind: "http", status: 500, code: "INTERNAL_SERVER_ERROR", requestId: `https://invalid.example/reset?token=${authV17FixtureIdentity.token}` }] as const) {
      state.validation = response;
      await page.goto(resetPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Pautan belum dapat disahkan", exact: true })).toBeVisible();
      await expect(page.locator(".public-auth-request-reference")).toHaveCount(0);
      await expectNoResetData(page);
      expect(await page.evaluate(() => (window as unknown as ClipboardWindow).__sqrCopiedReferences)).toEqual([]);
    }
  } finally { await finish(); }
});

test("A password mutation server error can copy its reference without copying entered credentials", async ({ page, baseURL }) => {
  const { fixture, state, finish } = await installFixture(page, baseURL, "light");
  try {
    state.resetFailure = { status: 500, code: "INTERNAL_SERVER_ERROR", requestId: referenceId };
    await page.goto(resetPath, { waitUntil: "domcontentloaded" });
    await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
    await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
    await page.locator('form button[type="submit"]').click();
    const reference = page.locator(".public-auth-request-reference");
    await expect(reference.locator(".public-auth-request-reference__value")).toHaveText(referenceId);
    await reference.getByRole("button", { name: "Salin kod rujukan", exact: true }).click();
    await expect(reference.getByRole("status")).toHaveText("Kod rujukan disalin.");
    expect(await page.evaluate(() => (window as unknown as ClipboardWindow).__sqrCopiedReferences)).toEqual([referenceId]);
    await expect(reference).not.toContainText(authV17FixtureIdentity.password);
    await expect(reference).not.toContainText(authV17FixtureIdentity.token);
    expect(fixture.state.counts.reset).toBe(1);
  } finally { await finish(); }
});

test("A token used or expired during submission clears validated data and offers the authoritative action", async ({ page, baseURL }) => {
  const { fixture, state, finish } = await installFixture(page, baseURL, "dark");
  const primary = page.locator('.credential-recovery__content > button.public-auth-button-primary');
  try {
    for (const [code, action] of [["TOKEN_USED", "Log masuk"], ["TOKEN_EXPIRED", "Minta pautan tetapan semula baharu"]] as const) {
      state.resetFailure = { status: 410, code };
      const before = fixture.state.counts.reset;
      await page.goto(resetPath, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".credential-recovery__username dd")).toHaveText(authV17FixtureIdentity.username);
      await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
      await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
      await page.locator('form button[type="submit"]').click();
      await expect(page.getByRole("heading", {
        name: code === "TOKEN_USED" ? "Pautan telah digunakan" : "Pautan tidak tersedia", exact: true,
      })).toBeFocused();
      await expectNoResetData(page);
      await expect(primary).toHaveText(action);
      await expect(page.locator("body")).not.toContainText(authV17FixtureIdentity.password);
      await expect(page.locator("body")).not.toContainText(authV17FixtureIdentity.username);
      await expect(page.locator(".public-auth-request-reference")).toHaveCount(0);
      expect(fixture.state.counts.reset).toBe(before + 1);
    }
  } finally { await finish(); }
});
