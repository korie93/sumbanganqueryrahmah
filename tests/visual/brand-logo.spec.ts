import { expect, test, type Locator, type Page } from "@playwright/test";
import { installFixture, openSave, checkFixture } from "./helpers/save-collection-fixture";

test.use({ serviceWorkers: "block" });

async function loadedLogo(image: Locator, source: string, ratio: number) {
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", source);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const box = await image.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(16);
  expect(Math.abs(box!.width / box!.height - ratio)).toBeLessThan(0.02);
  await expect(image).toHaveCSS("object-fit", "contain");
}

async function metadata(page: Page) {
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/favicon.svg");
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute("href", "/brand/favicon.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/brand/apple-touch-icon-180x180.png");
}

test("brand migration supplied favicon and device icons decode without request interception", async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
  // Playwright intentionally aborts /favicon.ico requests whenever routing is enabled.
  // Use a static image document with no route handlers, app scripts or backend calls.
  await page.goto("/brand/favicon.svg");
  for (const [source, size] of [
    ["/brand/favicon.svg", 64],
    ["/brand/favicon.ico", 64],
    ["/brand/apple-touch-icon-180x180.png", 180],
    ["/brand/icon-192x192.png", 192],
    ["/brand/icon-512x512.png", 512],
  ] as const) {
    const dimensions = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    }, source);
    expect(dimensions, source).toEqual({ width: size, height: size });
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`brand migration password-change Q fills its unframed slot (${theme})`, async ({ page, baseURL }, testInfo) => {
    const fixture = await installFixture(page, baseURL, { theme });
    // Enter through the real workspace: Navbar applies the selected root theme.
    // The forced-password screen then inherits that theme without a second controller.
    await openSave(page);
    await expect.poll(() => page.locator("html").evaluate(el => el.classList.contains("dark"))).toBe(theme === "dark");
    await page.route("**/api/me", (route) => route.fulfill({ json: {
      ok: true, sessionExpiresAt: "2036-01-01T00:00:00.000Z", user: {
        id: "guidance-admin", username: "guidance.admin", fullName: "Synthetic Collection Operator",
        email: "guidance@example.test",
        role: "admin", status: "active", mustChangePassword: true, passwordResetBySuperuser: true,
        isBanned: false, twoFactorEnabled: false, twoFactorPendingSetup: false,
        activatedAt: null, passwordChangedAt: null, lastLoginAt: null,
      },
    } }));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("force-password-change")));
    await expect(page.getByRole("heading", { name: "Tukar Kata Laluan", exact: true })).toBeVisible();
    await expect(page.getByText("Pertukaran kata laluan diwajibkan untuk guidance.admin sebelum sistem boleh digunakan sepenuhnya.", { exact: true })).toBeVisible();
    const frame = page.locator(".public-auth-layout__brand-icon");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const img = frame.locator("img:visible");
      await loadedLogo(img, `/brand/sqr-q-mark-${theme}.png`, 1);
      await expect(frame.locator("img")).toHaveCount(2);
      await expect(img).toHaveCount(1);
      await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(frame).toHaveCSS("border-width", "0px");
      await expect(frame).toHaveCSS("padding", "0px");
      const outer = await frame.boundingBox(), inner = await img.boundingBox();
      expect(inner!.width).toBeCloseTo(outer!.width, 1);
      expect(inner!.height).toBeCloseTo(outer!.height, 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`password-change-${theme}-${width}.png`), fullPage: true });
    }
    await checkFixture(page, fixture);
  });

  test(`brand migration public logo and favicon across SPA routes (${theme})`, async ({ page, baseURL }, testInfo) => {
    expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
    const errors: string[] = [];
    const notFoundUrl = new URL("/not-a-brand-page", baseURL!).href;
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    await page.context().routeWebSocket("**/*", (socket) => socket.close());
    await page.context().route("**/*", (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(baseURL!).origin) { errors.push("off-origin"); return route.abort(); }
      if (url.pathname === "/api/health") return route.fulfill({ json: { status: "ok", ready: true } });
      if (url.pathname === "/api/maintenance-status") return route.fulfill({ json: { maintenance: false } });
      if (url.pathname === "/api/me") return route.fulfill({ status: 401, json: { ok: false } });
      if (url.pathname.startsWith("/api/telemetry/")) return route.fulfill({ json: { ok: true } });
      if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
        errors.push(`${request.method()} ${url.pathname}`); return route.abort();
      }
      return route.continue();
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      const request = response.request();
      // This test deliberately opens the real 404 page. Only its exact main
      // document may return 404; missing images/scripts and other errors still fail.
      const expectedNotFoundDocument = response.status() === 404
        && response.url() === notFoundUrl
        && request.isNavigationRequest()
        && request.resourceType() === "document"
        && request.frame() === page.mainFrame();
      if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith("/api/") && !expectedNotFoundDocument) {
        errors.push(`${request.resourceType()} ${response.status()} ${new URL(response.url()).pathname}`);
      }
    });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const brand = page.getByTestId("landing-brand-title");
      await expect(brand).toHaveAccessibleName("SQR — home");
      await loadedLogo(brand.locator("img"), "/brand/sqr-full-logo-light.svg", 665 / 310);
      if (width === 1440) {
        await loadedLogo(page.locator(".preview-brand-icon img"), "/brand/sqr-q-mark-light.png", 1);
      }
      await metadata(page);
      await page.locator('.nav-actions a[href="/login"]').click();
      await expect(page.getByTestId("input-username")).toBeVisible();
      await loadedLogo(page.locator(".auth-v17-brand img"), "/brand/sqr-full-logo-light.svg", 665 / 310);
      await metadata(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`login-${theme}-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Laman utama", exact: true }).click();
      await expect(brand).toBeVisible();
      await metadata(page);
    }
    await page.goto("/forgot-password");
    await loadedLogo(page.locator(".auth-v17-brand img"), "/brand/sqr-full-logo-light.svg", 665 / 310);
    await metadata(page);
    const notFoundResponse = await page.goto(notFoundUrl);
    expect(notFoundResponse?.status()).toBe(404);
    expect(notFoundResponse?.headers()["content-type"]).toContain("text/html");
    await loadedLogo(page.locator(".sqr-status__brand img"), "/brand/sqr-q-mark-dark.png", 1);
    await metadata(page);
    expect(errors).toEqual([]);
  });

  test(`brand migration workspace selects the supplied Q for its surface theme (${theme})`, async ({ page, baseURL }, testInfo) => {
    const fixture = await installFixture(page, baseURL, { theme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSave(page);
    const brand = page.locator(".workspace-brand-mark .sqr-brand-logo");
    await expect(brand).toHaveAttribute("data-brand-variant", "icon");
    await expect(brand.locator("img:visible")).toHaveCount(1);
    await loadedLogo(brand.locator("img:visible"), `/brand/sqr-q-mark-${theme}.png`, 1);
    await expect(brand.locator("img")).toHaveCount(2);
    await expect(brand).toHaveAttribute("data-brand-theme", "auto");
    const frame = page.locator(".workspace-brand-mark");
    await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(frame).toHaveCSS("border-width", "0px");
    await expect(brand.locator("img:visible")).toHaveCSS("width", "32px");
    await expect(brand.locator("img:visible")).toHaveCSS("height", "32px");
    await expect(brand).toHaveAttribute("aria-hidden", "true");
    await metadata(page);
    await page.screenshot({ path: testInfo.outputPath(`workspace-${theme}.png`), fullPage: true });
    await page.getByTestId("button-toggle-theme").click();
    const next = theme === "light" ? "dark" : "light";
    await loadedLogo(brand.locator("img:visible"), `/brand/sqr-q-mark-${next}.png`, 1);
    await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.getByTestId("button-toggle-sidebar").click();
    await expect(page.getByRole("button", { name: "Expand navigation", exact: true })).toBeVisible();
    // The established collapsed rail reserves this slot for its expand control.
    // Do not alter navigation layout solely to introduce a second compact logo.
    await expect(brand).toBeHidden();
    await page.getByTestId("button-toggle-sidebar").click();
    await loadedLogo(brand.locator("img:visible"), `/brand/sqr-q-mark-${next}.png`, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await checkFixture(page, fixture);
  });
}
