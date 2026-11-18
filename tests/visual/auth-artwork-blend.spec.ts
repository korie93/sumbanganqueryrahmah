import { expect, test, type Page } from "@playwright/test";
import { createAuthV17Fixture } from "../../scripts/lib/auth-v17-browser-fixture.mjs";
import { initializeBrowserThemeFixture } from "../../scripts/lib/browser-theme-fixture.mjs";

test.use({ serviceWorkers: "block" });

// Compare the painted bitmap corners with the same panel behind them.
// Measuring the contained image avoids accidentally sampling its letterbox.
async function checkPaintedEdges(page: Page) {
  const image = page.locator('.auth-brand-artwork img[data-active="true"]');
  const clip = await image.evaluate((img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    const ratio = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const width = Math.floor(img.naturalWidth * ratio), height = Math.floor(img.naturalHeight * ratio);
    return { x: Math.ceil(rect.x + (rect.width - width) / 2), y: Math.ceil(rect.y + (rect.height - height) / 2), width, height };
  });
  const shot = { clip, scale: "css" as const, animations: "disabled" as const };
  const painted = await page.screenshot(shot);
  // The production CSP blocks Playwright's injected screenshot stylesheet.
  // Change only the active image's visibility so the panel retains its layout.
  const previous = await image.evaluate((img: HTMLImageElement) => {
    const value = img.style.visibility;
    const priority = img.style.getPropertyPriority("visibility");
    img.style.setProperty("visibility", "hidden", "important");
    return { value, priority };
  });
  let backdrop: Buffer;
  try {
    await expect(image).toHaveCSS("visibility", "hidden");
    backdrop = await page.screenshot(shot);
  } finally {
    await image.evaluate((img: HTMLImageElement, { value, priority }) => {
      img.style.setProperty("visibility", value, priority);
    }, previous);
  }
  const difference = await page.evaluate(async ([a, b]) => {
    async function pixels(encoded: string) {
      const blob = new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: "image/png" });
      const image = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0); image.close();
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    const [art, panel] = await Promise.all([pixels(a), pixels(b)]);
    let edge = 0, visiblePixels = 0;
    for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
      const i = 4 * (y * art.width + x);
      const delta = Math.max(...[0, 1, 2].map(c => Math.abs(art.data[i + c] - panel.data[i + c])));
      if ((x < 4 || x >= art.width - 4) && (y < 4 || y >= art.height - 4)) edge = Math.max(edge, delta);
      if (delta > 20) visiblePixels++;
    }
    return { edge, subject: visiblePixels / (art.width * art.height) };
  }, [painted.toString("base64"), backdrop.toString("base64")]);
  expect(difference.edge, "corner pixels should match the panel").toBeLessThanOrEqual(5);
  expect(difference.subject, "the illustration itself should still be visible").toBeGreaterThan(0.05);
}

async function fixture(page: Page, baseURL: string | undefined, theme: "light" | "dark") {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  const api = createAuthV17Fixture(origin); // Enforces loopback-only synthetic data.
  await page.addInitScript(initializeBrowserThemeFixture, {
    origin, mode: "preserve-choice" as const, theme, performanceMode: "low" as const,
  });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/api/maintenance-status") return route.fulfill({ json: { maintenance: false } });
    if (url.pathname.startsWith("/api/telemetry/")) return route.fulfill({ json: { ok: true } });
    return api.route(route);
  });
}

for (const path of ["/login", "/forgot-password"]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${path} artwork blends into its panel in ${theme} without layout overflow`, async ({ page, baseURL }) => {
      await fixture(page, baseURL, theme);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(path);
      const image = page.locator('.auth-brand-artwork img[data-active="true"]');
      await expect(image).toHaveAttribute("data-artwork-theme", theme);
      await expect(image).toHaveCSS("mix-blend-mode", theme === "dark" ? "lighten" : "multiply");
      await expect(page.locator(".auth-v17-brand-panel")).toHaveCSS("isolation", "isolate");
      for (const width of [320, 768, 1366, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator("h1")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width < 768) await expect(image).toBeHidden();
        else {
          await expect(image).toBeVisible();
          expect(await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
          await expect(image).toHaveCSS("object-fit", "contain");
          if (width === 1366) await checkPaintedEdges(page);
        }
      }
      expect(errors).toEqual([]);
    });
  }

  test(`${path} retains the decoded frame's blend while a dark image is delayed`, async ({ page, baseURL }) => {
    await fixture(page, baseURL, "light");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const cpu = await page.context().newCDPSession(page);
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    let release!: () => void;
    const pendingImage = new Promise<void>(resolve => { release = resolve; });
    await page.route(/(?:sqr-illustration-dark|reset-password-dark).*\.webp/, async route => {
      // Vite's ?import module must still load; delay only the actual bitmap.
      if (route.request().resourceType() !== "image") return route.fallback();
      await pendingImage;
      await route.continue();
    });
    try {
      await page.goto(path);
      const image = page.locator('.auth-brand-artwork img[data-active="true"]');
      await expect(image).toHaveAttribute("data-artwork-theme", "light");
      await expect(image).toHaveCSS("transform", "none");
      const before = await image.boundingBox();
      await page.locator(".auth-v17-theme").click();
      await expect(page.locator(".auth-v17")).toHaveAttribute("data-theme", "dark");
      await expect(image).toHaveAttribute("data-artwork-theme", "light");
      await expect(image).toHaveCSS("mix-blend-mode", "multiply");
      release();
      await expect(image).toHaveAttribute("data-artwork-theme", "dark");
      await expect(image).toHaveCSS("mix-blend-mode", "lighten");
      expect(await image.boundingBox()).toEqual(before);
      await page.locator(".auth-v17-theme").click();
      await expect(image).toHaveAttribute("data-artwork-theme", "light");
      await expect(image).toHaveCSS("mix-blend-mode", "multiply");
    } finally {
      release();
      await cpu.detach();
    }
  });
}
