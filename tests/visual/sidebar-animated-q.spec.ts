import { expect, test, type Locator, type Page } from "@playwright/test";
import { checkFixture, installFixture, nickname, openSave } from "./helpers/save-collection-fixture";

test.use({ serviceWorkers: "block" });

const onlineFavicon = "/brand/favicon-online-v2-32.png";
const originalQ = "/brand/sidebar-q-static.png";

function toggle(page: Page) { return page.getByTestId("button-toggle-sidebar"); }
function artwork(page: Page) { return toggle(page).locator(".workspace-sidebar-toggle-logo"); }

async function readyRoleSave(page: Page, role: "admin" | "user" | "superuser") {
  if (role === "superuser") {
    const chooser = page.locator("#save-collection-superuser-nickname");
    await expect(chooser).toBeVisible();
    await expect(chooser).toBeEnabled();
    await chooser.click();
    await page.getByRole("button", { name: nickname, exact: true }).click();
  }
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
}

async function restingQ(page: Page) {
  await page.mouse.move(600, 150);
  await page.locator("#main-content").focus();
  await expect(artwork(page)).toHaveCSS("opacity", "1");
  await expect(toggle(page).locator(".workspace-sidebar-expand-icon")).toHaveCSS("opacity", "0");
}

async function decodedQ(page: Page) {
  const image = artwork(page).locator(".sidebar-q-static");
  await expect(image).toHaveAttribute("src", originalQ);
  await expect.poll(() => artwork(page).locator("img").evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
  )).toBe(true);
  await expect(artwork(page)).toHaveAttribute("data-ready", "true");
  await expect(artwork(page).locator(".sidebar-q-dot")).toHaveCount(4);
  await expect(artwork(page).locator(".sidebar-q-sheen")).toHaveCount(1);
}

async function cssAnimations(logo: Locator) {
  return logo.evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
    .map((animation) => ({ name: animation.animationName, state: animation.playState })));
}

async function unchangedFavicon(page: Page) {
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", onlineFavicon);
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute("href", "/brand/favicon-online-v2.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/brand/apple-touch-icon-180x180.png");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
}

for (const role of ["admin", "user", "superuser"] as const) {
  test(`desktop animated Q persists the same ${role} sidebar preference without changing navigation permissions`, async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { role });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/collection/save");
    await readyRoleSave(page, role);
    const button = toggle(page);
    const preferenceKey = `sqr:desktop-sidebar:v1:id:guidance-${role}`;
    const navigation = page.locator('aside.workspace-sidebar nav[aria-label="Primary navigation"]');
    const accessibleItems = await navigation.locator("button").evaluateAll((buttons) =>
      buttons.map((entry) => entry.getAttribute("aria-label")),
    );
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button.locator(".lucide-panel-left-close")).toBeVisible();
    await expect(artwork(page)).toHaveCount(0);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await decodedQ(page);
    await restingQ(page);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("collapsed");
    await unchangedFavicon(page);

    await page.reload();
    await readyRoleSave(page, role);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toHaveAccessibleName("Expand navigation");
    await decodedQ(page);
    await restingQ(page);
    const before = await button.boundingBox();
    // Pointer hover exposes the action but is never a separate activation step.
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(artwork(page)).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("expanded");
    await page.reload();
    await readyRoleSave(page, role);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    expect(before?.width).toBe(44);
    expect(await navigation.locator("button").evaluateAll((buttons) =>
      buttons.map((entry) => entry.getAttribute("aria-label")),
    )).toEqual(accessibleItems);
    await unchangedFavicon(page);
    await checkFixture(page, fixture);
  });
}

test("desktop animated Q stops when reduced, expanded, offscreen or hidden and resumes without extra controls", async ({ page, baseURL }, testInfo) => {
  const fixture = await installFixture(page, baseURL, { theme: "dark" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openSave(page);
  await toggle(page).click();
  await decodedQ(page);
  await restingQ(page);
  const logo = artwork(page);
  await expect(logo).toHaveAttribute("data-motion", "playing");
  await expect.poll(async () => (await cssAnimations(logo)).filter((animation) => animation.state === "running").length).toBeGreaterThanOrEqual(5);
  await page.locator("aside.workspace-sidebar").screenshot({ path: testInfo.outputPath("sidebar-animated-q-resting-dark.png") });

  await toggle(page).hover();
  await expect(logo).toHaveCSS("opacity", "0");
  await expect(toggle(page).locator(".lucide-panel-left-open")).toHaveCSS("opacity", "1");
  await expect.poll(async () => (await cssAnimations(logo)).every((animation) => animation.state === "paused")).toBe(true);
  await restingQ(page);
  await expect.poll(async () => (await cssAnimations(logo)).some((animation) => animation.state === "running")).toBe(true);
  await toggle(page).focus();
  // Pressing Tab and Shift+Tab selects the button with genuine keyboard modality.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(toggle(page)).toBeFocused();
  await expect(logo).toHaveCSS("opacity", "0");
  await expect.poll(async () => (await cssAnimations(logo)).every((animation) => animation.state === "paused")).toBe(true);
  await page.keyboard.press("Enter");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(logo).toHaveCount(0);
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await decodedQ(page);
  await restingQ(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(logo).toHaveAttribute("data-motion", "reduced");
  expect(await cssAnimations(logo)).toEqual([]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(logo).toHaveAttribute("data-motion", "playing");

  // Exercise the real IntersectionObserver by moving the control outside the
  // viewport via CSSOM; do not replace the browser's observer with a fake.
  await toggle(page).evaluate((button) => { button.style.transform = "translateX(-2000px)"; });
  await expect(logo).toHaveAttribute("data-motion", "paused");
  await expect.poll(async () => (await cssAnimations(logo)).every((animation) => animation.state === "paused")).toBe(true);
  await toggle(page).evaluate((button) => { button.style.removeProperty("transform"); });
  await expect(logo).toHaveAttribute("data-motion", "playing");

  // Headless tab focus is not a reliable visibility boundary. This explicitly
  // tests the document-visibility guard and its listener, not OS tab switching.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(logo).toHaveAttribute("data-motion", "paused");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    Reflect.deleteProperty(document, "visibilityState");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(logo).toHaveAttribute("data-motion", "playing");
  await unchangedFavicon(page);
  await checkFixture(page, fixture);
});

test("desktop animated Q survives twenty toggles and the 1024 boundary without changing mobile", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSave(page);
  for (let index = 0; index < 20; index++) {
    await toggle(page).click();
    const expanded = index % 2 === 1;
    await expect(toggle(page)).toHaveAttribute("aria-expanded", String(expanded));
    await expect(artwork(page)).toHaveCount(expanded ? 0 : 1);
    await expect(page.getByTestId("button-toggle-sidebar")).toHaveCount(1);
  }
  await toggle(page).click();
  await decodedQ(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(toggle(page)).toBeVisible();
  await expect(artwork(page)).toHaveCount(1);
  await expect(page.getByTestId("button-open-mobile-nav")).toBeHidden();
  for (const width of [1023, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(toggle(page)).toBeHidden();
    await expect(artwork(page)).toHaveCount(0);
    const mobile = page.getByTestId("button-open-mobile-nav");
    await expect(mobile).toBeVisible();
    await expect(mobile.locator("svg.lucide-menu")).toBeVisible();
    await expect(mobile.locator("img, .sidebar-q-artwork, .sidebar-q-layers")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await decodedQ(page);
  await restingQ(page);
  await unchangedFavicon(page);
  await checkFixture(page, fixture);
});

test.describe("desktop animated Q touch and high-density accessibility", () => {
  test.use({ hasTouch: true, deviceScaleFactor: 2 });
  test("one touch expands immediately and 200 percent content zoom retains the hit target", async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSave(page);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await decodedQ(page);
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(artwork(page)).toHaveCount(0);
    await page.setViewportSize({ width: 2880, height: 1800 });
    // CSS content zoom is deterministic in headless Chromium. It is not a claim
    // about browser chrome zoom or a second physical display.
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await expect(toggle(page)).toHaveCSS("width", "44px");
    await expect(toggle(page)).toHaveCSS("height", "44px");
    expect((await toggle(page).boundingBox())?.width).toBe(88);
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await decodedQ(page);
    await expect(artwork(page)).toHaveCSS("width", "32px");
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await page.evaluate(() => { document.documentElement.style.removeProperty("zoom"); });
    await unchangedFavicon(page);
    await checkFixture(page, fixture);
  });
});

test("desktop animated Q uses local image layers under strict application CSP", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy|violates.*directive/i.test(message.text())) cspErrors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    return route.fulfill({ response, headers: {
      ...response.headers(),
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; script-src-attr 'none'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; style-src-attr 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openSave(page);
  await toggle(page).click();
  await decodedQ(page);
  await restingQ(page);
  await expect(artwork(page)).toHaveAttribute("data-motion", "playing");
  expect(await artwork(page).locator("img").evaluateAll((images) => images.every((image) =>
    image instanceof HTMLImageElement && new URL(image.src).origin === location.origin && new URL(image.src).pathname.startsWith("/brand/"),
  ))).toBe(true);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(artwork(page)).toHaveCount(0);
  await unchangedFavicon(page);
  expect(cspErrors).toEqual([]);
  await checkFixture(page, fixture);
});

test("desktop animated Q keeps the original static image and immediate action when an enhanced layer fails", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let failedLayers = 0;
  await page.route("**/brand/sidebar-q-dot-3.png", (route) => {
    failedLayers++;
    return route.fulfill({ status: 404, body: "Synthetic missing enhanced image" });
  });
  await openSave(page);
  await toggle(page).click();
  await restingQ(page);
  const logo = artwork(page), image = logo.locator(".sidebar-q-static");
  await expect(logo).toHaveAttribute("data-ready", "false");
  await expect(logo).toHaveAttribute("data-motion", "static");
  await expect(logo.locator(".sidebar-q-layers")).toHaveCount(0);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", originalQ);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 128)).toBe(true);
  expect(failedLayers).toBeGreaterThan(0);
  expect(await cssAnimations(logo)).toEqual([]);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(logo).toHaveCount(0);
  await unchangedFavicon(page);
  await checkFixture(page, fixture);
});
