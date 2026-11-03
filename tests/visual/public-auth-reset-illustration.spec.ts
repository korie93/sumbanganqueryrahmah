import { expect, test, type Page, type Route } from "@playwright/test";
import { createAuthV17Fixture, authV17FixtureIdentity } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture, type BrowserThemeFixtureOptions } from "../../scripts/lib/browser-theme-fixture.mjs";

// Real compiled public routes, with fictional accounts and loopback-only APIs.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

type Theme = "light" | "dark";
const tokenPath = `/reset-password?token=${authV17FixtureIdentity.token}`;
const imagePaths = {
  light: "/illustrations/reset-password-light.webp",
  dark: "/illustrations/reset-password-dark.webp",
} as const;
const imageSelector = ".credential-recovery__illustration-image";
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";

async function installFixture(page: Page, baseURL: string | undefined, theme: Theme) {
  expect(baseURL, "Use the isolated compiled frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).port).not.toBe("");
  const fixture = createAuthV17Fixture(origin);
  const state: { validation: "valid" | "invalid" | "unavailable"; activationValidations: number } = {
    validation: "valid", activationValidations: 0,
  };
  const errors: string[] = [], pending = new Set<Promise<void>>();
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
    const url = new URL(message.location().url || origin, origin), text = message.text();
    if (url.origin === origin && url.pathname === "/api/me" && text.includes("status of 401")) return;
    if (url.origin === origin && url.pathname === "/api/auth/validate-password-reset-token"
      && [400, 503].some(status => text.includes(`status of ${status}`))) return;
    errors.push(text);
  });
  await page.context().routeWebSocket("**/*", socket => {
    errors.push("Public recovery must not open a protected WebSocket"); socket.close();
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
    if (url.pathname === "/api/auth/validate-password-reset-token" && request.method() === "POST" && state.validation !== "valid") {
      expect(request.postDataJSON()).toEqual({ token: authV17FixtureIdentity.token });
      fixture.state.counts.validate++;
      const status = state.validation === "invalid" ? 400 : 503;
      const code = state.validation === "invalid" ? "INVALID_TOKEN" : "SERVICE_UNAVAILABLE";
      return route.fulfill({ status, json: { ok: false, message: "Synthetic validation rejection.",
        error: { code, message: "Synthetic validation rejection." } } });
    }
    if (url.pathname === "/api/auth/validate-activation-token" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ token: authV17FixtureIdentity.token });
      state.activationValidations++;
      return route.fulfill({ json: { ok: true, activation: {
        username: authV17FixtureIdentity.username, fullName: "UI Fixture", email: null,
        role: "user", expiresAt: "2099-01-01T00:00:00.000Z",
      } } });
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
    expect(errors, "No unexpected browser, CSP, Trusted Types or asset errors").toEqual([]);
  } };
}

async function expectIllustration(page: Page, theme: Theme) {
  await expect(page.locator(".credential-recovery")).toHaveClass(/(?:^|\s)credential-recovery--illustrated(?:\s|$)/);
  const wrapper = page.locator(".credential-recovery__illustration"), image = page.locator(imageSelector);
  await expect(wrapper).toHaveCount(1);
  await expect(wrapper).toHaveAttribute("aria-hidden", "true");
  await expect(image).toHaveCount(1);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", imagePaths[theme]);
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("aria-hidden", "true");
  await expect(image).toHaveAttribute("width", "640");
  await expect(image).toHaveAttribute("height", "640");
  await expect.poll(async () => image.evaluate(element => {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }), { message: "The selected local illustration decodes successfully" }).toBe(true);
  const properties = await image.evaluate(element => {
    const image = element as HTMLImageElement, box = image.getBoundingClientRect();
    return { source: new URL(image.currentSrc).pathname, naturalRatio: image.naturalWidth / image.naturalHeight,
      width: box.width, height: box.height, objectFit: getComputedStyle(image).objectFit, tabIndex: image.tabIndex };
  });
  expect(properties.source).toBe(imagePaths[theme]);
  expect(properties.naturalRatio).toBe(1);
  expect(properties.objectFit).toBe("contain");
  expect(properties.width).toBeGreaterThan(0);
  expect(Math.abs(properties.width - properties.height), "The illustration keeps its square frame").toBeLessThanOrEqual(1);
  expect(properties.tabIndex, "Decorative art adds no keyboard stop").toBe(-1);
}

async function expectNonOverlappingLayout(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(selector => {
    const rect = (query: string) => {
      const element = document.querySelector(query);
      if (!element) throw new Error(`Missing layout anchor: ${query}`);
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    return { aside: rect(".credential-recovery__context"), main: rect(".credential-recovery__main"),
      image: rect(selector), viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  }, imageSelector);
  expect(geometry.scrollWidth, "No horizontal page overflow").toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.image.left).toBeGreaterThanOrEqual(geometry.aside.left - 1);
  expect(geometry.image.right).toBeLessThanOrEqual(geometry.aside.right + 1);
  expect(geometry.image.top).toBeGreaterThanOrEqual(geometry.aside.top - 1);
  expect(geometry.image.bottom).toBeLessThanOrEqual(geometry.aside.bottom + 1);
  const overlapWidth = Math.min(geometry.image.right, geometry.main.right) - Math.max(geometry.image.left, geometry.main.left);
  const overlapHeight = Math.min(geometry.image.bottom, geometry.main.bottom) - Math.max(geometry.image.top, geometry.main.top);
  expect(overlapWidth <= 1 || overlapHeight <= 1, "Art remains outside the form and controls").toBe(true);
}

async function documentGeometry(page: Page) {
  return page.evaluate(() => [".credential-recovery__illustration", ".credential-recovery__controls",
    ".credential-recovery__form-wrap", ".public-auth-account-summary", "#reset-password-new-password",
    "#reset-password-confirm-password"].map(selector => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing theme-stability anchor: ${selector}`);
      const box = element.getBoundingClientRect();
      return { selector, x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
    }));
}

async function expectNoPasswordOrAccount(page: Page) {
  await expect(page.locator(".password-creation-form")).toHaveCount(0);
  await expect(page.locator(".public-auth-account-summary")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(authV17FixtureIdentity.username);
  await expect(page.locator("body")).not.toContainText(authV17FixtureIdentity.password);
  await expect(page.locator("body")).not.toContainText(authV17FixtureIdentity.token);
}

for (const theme of ["light", "dark"] as const) {
  test(`Reset illustration follows the selected ${theme} theme at phone, tablet and desktop widths`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    const { fixture, finish } = await installFixture(page, baseURL, theme);
    try {
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
        await expect(page.locator("#reset-password-new-password")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectIllustration(page, theme);
        await expectNonOverlappingLayout(page);
        await expect(page.locator(".credential-recovery__username dd")).toHaveText(authV17FixtureIdentity.username);
        await page.screenshot({ path: testInfo.outputPath(`reset-illustration-${theme}-${width}.png`), animations: "disabled", fullPage: true });
        await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
        await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
        await expect(page.locator('[data-password-policy-status]')).toHaveAttribute("data-password-policy-status", "valid");
        await expect(page.locator('form button[type="submit"]')).toBeEnabled();
        expect(fixture.state.counts.reset, "Layout checks never mutate a password").toBe(0);
      }
    } finally { await finish(); }
  });
}

test("Swapping reset illustrations preserves entered credentials, validated account details and layout", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, finish } = await installFixture(page, baseURL, "light");
  try {
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
      await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
      await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
      await expectIllustration(page, "light");
      await page.evaluate(() => document.fonts.ready);
      const before = await documentGeometry(page);
      for (const theme of ["dark", "light"] as const) {
        const toggle = page.locator(".credential-recovery__theme");
        await toggle.click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectIllustration(page, theme);
        await expect(toggle).toBeFocused();
        await expect(page.locator("#reset-password-new-password")).toHaveValue(authV17FixtureIdentity.password);
        await expect(page.locator("#reset-password-confirm-password")).toHaveValue(authV17FixtureIdentity.password);
        await expect(page.locator("#reset-password-new-password")).toHaveAttribute("type", "password");
        await expect(page.locator(".credential-recovery__username dd")).toHaveText(authV17FixtureIdentity.username);
        const after = await documentGeometry(page);
        for (let index = 0; index < before.length; index++) {
          expect(after[index].selector).toBe(before[index].selector);
          for (const axis of ["x", "y", "width", "height"] as const) {
            expect(Math.abs(after[index][axis] - before[index][axis]), `${before[index].selector}/${axis} stays stable after theme swap`).toBeLessThanOrEqual(2);
          }
        }
        await expectNonOverlappingLayout(page);
        expect(fixture.state.counts.reset).toBe(0);
      }
    }
  } finally { await finish(); }
});

test("Reset art stays decorative in invalid, retry and success states without changing Activation", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, state, finish } = await installFixture(page, baseURL, "light");
  try {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const validation of ["invalid", "unavailable"] as const) {
        state.validation = validation;
        await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: validation === "invalid" ? "Pautan tidak tersedia" : "Pautan belum dapat disahkan", exact: true })).toBeVisible();
        await expectNoPasswordOrAccount(page);
        await expectIllustration(page, "light");
        await expectNonOverlappingLayout(page);
      }
      state.validation = "valid";
      await page.getByRole("button", { name: "Cuba Lagi", exact: true }).click();
      await page.locator("#reset-password-new-password").fill(authV17FixtureIdentity.password);
      await page.locator("#reset-password-confirm-password").fill(authV17FixtureIdentity.password);
      const before = fixture.state.counts.reset;
      await page.locator('form button[type="submit"]').click();
      await expect(page.locator('.public-auth-status-card--success[role="status"]')).toBeVisible();
      await expectNoPasswordOrAccount(page);
      await expectIllustration(page, "light");
      await expectNonOverlappingLayout(page);
      expect(fixture.state.counts.reset).toBe(before + 1);

      const activationBefore = state.activationValidations;
      await page.goto(`/activate-account?token=${authV17FixtureIdentity.token}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#activate-account-new-password")).toBeVisible();
      await expect(page.locator(".credential-recovery")).not.toHaveClass(/(?:^|\s)credential-recovery--illustrated(?:\s|$)/);
      await expect(page.locator(".credential-recovery__illustration")).toHaveCount(0);
      await expect(page.locator(imageSelector)).toHaveCount(0);
      await expect(page.locator(".credential-recovery__username dd")).toHaveText(authV17FixtureIdentity.username);
      expect(state.activationValidations).toBe(activationBefore + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  } finally { await finish(); }
});

async function expectForgotIllustration(page: Page, theme: Theme) {
  await expect(page.locator(".auth-v17")).toHaveClass(/(?:^|\s)auth-v17-recovery-artwork(?:\s|$)/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const art = page.locator(".auth-v17-art.auth-v17-art--recovery");
  const image = page.locator("img.auth-v17-recovery-illustration");
  await expect(art).toHaveAttribute("aria-hidden", "true");
  await expect(image).toHaveCount(1);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", imagePaths[theme]);
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("aria-hidden", "true");
  await expect(image).toHaveAttribute("width", "640");
  await expect(image).toHaveAttribute("height", "640");
  await expect.poll(async () => image.evaluate(element => {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }), { message: "Forgot loads the selected local recovery illustration" }).toBe(true);
  const imageState = await image.evaluate(element => {
    const image = element as HTMLImageElement, box = image.getBoundingClientRect();
    return { source: new URL(image.currentSrc).pathname, naturalRatio: image.naturalWidth / image.naturalHeight,
      width: box.width, height: box.height, objectFit: getComputedStyle(image).objectFit, tabIndex: image.tabIndex };
  });
  expect(imageState.source).toBe(imagePaths[theme]);
  expect(imageState.naturalRatio).toBe(1);
  expect(imageState.objectFit).toBe("contain");
  expect(imageState.width).toBeGreaterThan(0);
  expect(imageState.height).toBeGreaterThan(0);
  expect(imageState.tabIndex, "Decorative art adds no keyboard stop").toBe(-1);
  const oldArtHidden = await art.evaluate(element => {
    const pseudo = getComputedStyle(element, "::before");
    return pseudo.display === "none" || pseudo.content === "none" || pseudo.backgroundImage === "none";
  });
  expect(oldArtHidden, "Forgot replaces the previous artwork without painting both").toBe(true);

  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing Forgot layout anchor: ${selector}`);
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return { image: rect(".auth-v17-recovery-illustration"), panel: rect(".auth-v17-brand-panel"),
      logo: rect(".auth-v17-logo"), form: rect(".auth-v17-side"),
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(geometry.scrollWidth, "Forgot has no horizontal page overflow").toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.image.left).toBeGreaterThanOrEqual(geometry.panel.left - 1);
  expect(geometry.image.right).toBeLessThanOrEqual(geometry.panel.right + 1);
  expect(geometry.image.top).toBeGreaterThanOrEqual(geometry.panel.top - 1);
  expect(geometry.image.bottom).toBeLessThanOrEqual(geometry.panel.bottom + 1);
  for (const [name, protectedArea] of [["logo", geometry.logo], ["form", geometry.form]] as const) {
    const overlapWidth = Math.min(geometry.image.right, protectedArea.right) - Math.max(geometry.image.left, protectedArea.left);
    const overlapHeight = Math.min(geometry.image.bottom, protectedArea.bottom) - Math.max(geometry.image.top, protectedArea.top);
    expect(overlapWidth <= 1 || overlapHeight <= 1, `Forgot illustration stays outside the ${name}`).toBe(true);
  }
}

async function forgotDocumentGeometry(page: Page) {
  return page.evaluate(() => [".auth-v17-recovery-illustration", ".auth-v17-topline", "#auth-v17-title",
    "#forgot-password-identifier"].map(selector => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing Forgot theme-stability anchor: ${selector}`);
      const box = element.getBoundingClientRect();
      return { selector, x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
    }));
}

test("Forgot recovery illustration follows both palettes without losing form state", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const { fixture, finish } = await installFixture(page, baseURL, "light");
  try {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      const identifier = page.locator("#forgot-password-identifier");
      await identifier.fill(authV17FixtureIdentity.username);
      await expectForgotIllustration(page, "light");
      const before = await forgotDocumentGeometry(page);
      for (const theme of ["dark", "light"] as const) {
        const toggle = page.locator(".auth-v17-theme");
        await toggle.click();
        await expectForgotIllustration(page, theme);
        await expect(toggle).toBeFocused();
        await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
        await expect(identifier).toBeEnabled();
        await expect(page.locator('form button[type="submit"]')).toBeEnabled();
        const after = await forgotDocumentGeometry(page);
        for (let index = 0; index < before.length; index++) {
          expect(after[index].selector).toBe(before[index].selector);
          for (const axis of ["x", "y", "width", "height"] as const) {
            expect(Math.abs(after[index][axis] - before[index][axis]), `${before[index].selector}/${axis} stays stable after theme swap`).toBeLessThanOrEqual(2);
          }
        }
        expect(fixture.state.counts.forgot, "Changing artwork must not submit a reset request").toBe(0);
        await page.screenshot({ path: testInfo.outputPath(`forgot-illustration-${theme}-${width}.png`), animations: "disabled", fullPage: true });
      }
    }
  } finally { await finish(); }
});

test("Forgot request confirmation retains themed illustration and generic workflow", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const { fixture, finish } = await installFixture(page, baseURL, "light");
  try {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Bahasa Melayu", exact: true }).click();
      const identifier = page.locator("#forgot-password-identifier");
      await identifier.fill(authV17FixtureIdentity.username);
      const before = fixture.state.counts.forgot;
      await page.locator('form button[type="submit"]').click();
      const status = page.locator('.public-auth-status-card--success[role="status"]');
      await expect(status).toBeFocused();
      await expect(status).toContainText("Jika akaun wujud");
      await expect(status).toContainText("permintaan anda telah dihantar untuk semakan");
      await expect(page.getByRole("heading", { name: "Permintaan diterima", exact: true })).toBeVisible();
      await expect(page.locator(".auth-v17-subtitle")).toHaveText("Emel tetapan semula hanya dihantar selepas kelulusan superuser.");
      await expect(identifier).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(authV17FixtureIdentity.username);
      await expectForgotIllustration(page, "light");

      await page.locator(".auth-v17-theme").click();
      await expectForgotIllustration(page, "dark");
      await expect(status).toContainText("Jika akaun wujud");
      await page.getByRole("button", { name: "English", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Request received", exact: true })).toBeVisible();
      await expect(page.locator(".auth-v17-subtitle")).toHaveText("A reset email is only sent after superuser approval.");
      await expect(status).toContainText("If the account exists");
      expect(fixture.state.counts.forgot).toBe(before + 1);
      const edit = page.getByRole("button", { name: "Use a different username/email", exact: true });
      await edit.focus(); await edit.press("Enter");
      await expect(identifier).toBeFocused();
      await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
      await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
      await expect(status).toHaveCount(0);
      await expectForgotIllustration(page, "dark");
      await page.locator(".auth-v17-theme").click();
      await expectForgotIllustration(page, "light");
      await expect(identifier).toHaveValue(authV17FixtureIdentity.username);
      expect(fixture.state.counts.forgot).toBe(before + 1);

      await page.locator('form button[type="submit"]').click();
      await expect(status).toBeFocused();
      expect(fixture.state.counts.forgot).toBe(before + 2);
      const backToLogin = page.getByRole("button", { name: "Back to sign in", exact: true });
      await expect(backToLogin).toHaveAttribute("type", "button");
      await backToLogin.focus();
      await backToLogin.press("Enter");
      await expect(page.locator(".auth-v17-login")).toBeVisible();
      await expect(page.locator(".auth-v17")).not.toHaveClass(/(?:^|\s)auth-v17-recovery-artwork(?:\s|$)/);
      await expect(page.locator(".auth-v17-recovery-illustration")).toHaveCount(0);
      const loginArt = page.locator(".auth-v17-art");
      await expect(loginArt).toHaveCount(1);
      expect(await loginArt.evaluate(element => {
        const style = getComputedStyle(element, "::before");
        return style.display !== "none" && style.content !== "none" && style.backgroundImage !== "none";
      }), "Login retains its original artwork").toBe(true);
      expect(fixture.state.counts.login).toBe(0);
      expect(fixture.state.counts.forgot).toBe(before + 2);
    }
  } finally { await finish(); }
});
