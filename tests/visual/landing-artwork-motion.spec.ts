import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { expect, test } from "@playwright/test";

// Use the production security/static middleware, not a permissive image fixture.
// SVG image CSP violations are not reliably forwarded to the parent console.
test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });
const artworkDirectory = fileURLToPath(new URL("../../client/public/landing-next/", import.meta.url));
const names = ["radar-animated.svg", ...["search-dark", "analyse-light", "import-dark", "monitor-light", "security-dark"]
  .map(name => `${name}-animated.svg`)];

async function startArtworkFixture() {
  // Playwright injects DEBUG_COLORS into workers. It is a reporter setting,
  // not an application DEBUG_* option; omit only that key during config import.
  const reporterColors = process.env.DEBUG_COLORS;
  delete process.env.DEBUG_COLORS;
  const middleware = await (async () => {
    try {
      const security = await import("../../server/internal/local-http-security");
      const frontend = await import("../../server/internal/frontend-static");
      return { ...security, ...frontend };
    } finally {
      if (reporterColors !== undefined) process.env.DEBUG_COLORS = reporterColors;
    }
  })();
  const root = await mkdtemp(path.join(os.tmpdir(), "sqr-artwork-motion-"));
  let server: Server | undefined;
  try {
    await mkdir(path.join(root, "public/landing-next"), { recursive: true });
    for (const name of [...names, ...names.map(name => name.replace("-animated.svg", "-static.svg"))]) {
      await copyFile(path.join(artworkDirectory, name), path.join(root, "public/landing-next", name));
    }
    await copyFile(path.join(artworkDirectory, names[0]), path.join(root, "public/landing-next/unreviewed.svg"));
    for (const reduced of [false, true]) {
      await writeFile(path.join(root, "public", reduced ? "reduced.html" : "index.html"),
        '<!doctype html><html lang="en"><head><title>Artwork test</title></head><body>'
        + names.map(name => `<img alt="${name}" src="/landing-next/${reduced ? name.replace("-animated.svg", "-static.svg") : name}" width="180" height="180">`).join("")
        + "</body></html>");
    }
    const app = express();
    middleware.registerLocalHttpSecurityHeaders(app);
    middleware.registerFrontendStatic(app, { cwd: root, paths: ["public"], publicAppUrl: null });
    server = app.listen(0, "127.0.0.1");
    const listening = server;
    await new Promise<void>((resolve, reject) => { listening.once("listening", resolve); listening.once("error", reject); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected an isolated loopback address");
    return { origin: `http://127.0.0.1:${address.port}`, async close() {
      await new Promise<void>((resolve, reject) => {
        listening.close(error => error ? reject(error) : resolve());
        listening.closeAllConnections();
      });
      await rm(root, { recursive: true, force: true });
    } };
  } catch (error) {
    server?.closeAllConnections(); server?.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

for (const profile of [
  { name: "low", width: 390, cores: 2, memory: 2, cpu: 4 },
  { name: "medium", width: 768, cores: 4, memory: 4, cpu: 2 },
  { name: "high", width: 1440, cores: 8, memory: 8, cpu: 1 },
]) {
  test(`Landing artwork pixels animate under production CSP on ${profile.name} profile`, async ({ page }) => {
    const fixture = await startArtworkFixture();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.setViewportSize({ width: profile.width, height: 900 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.addInitScript(({ cores, memory }) => {
        Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => cores });
        Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => memory });
      }, profile);
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
      const svgResponse = await page.goto(`${fixture.origin}/landing-next/radar-animated.svg`);
      expect(svgResponse?.status()).toBe(200);
      await expect.poll(() => page.locator(".radar-beam").evaluate(element => getComputedStyle(element).animationName)).toBe("spin");
      const before = await page.locator(".radar-beam").evaluate(element => getComputedStyle(element).transform);
      await expect.poll(() => page.locator(".radar-beam").evaluate(element => getComputedStyle(element).transform)).not.toBe(before);
      await page.goto(fixture.origin);
      for (const name of names) {
        const image = page.getByAltText(name, { exact: true });
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete
          && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
        const first = await image.screenshot({ animations: "allow" });
        await expect.poll(async () => (await image.screenshot({ animations: "allow" })).equals(first), {
          message: `${name} must change rendered pixels, not merely load an animated filename`, timeout: 8_000,
          intervals: [250, 600, 1_200],
        }).toBe(false);
      }
      expect(errors).toEqual([]);
    } finally { await fixture.close(); }
  });
}

test("Landing artwork keeps reduced motion and unreviewed styles blocked", async ({ page }) => {
  const fixture = await startArtworkFixture();
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${fixture.origin}/landing-next/radar-animated.svg`);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.locator(".radar-beam")).toHaveCSS("animation-name", "none");
    // SQR selects the static asset for reduced motion. Match that real flow;
    // do not rely on Chromium's media emulation reaching SVG image documents.
    await page.goto(`${fixture.origin}/reduced.html`);
    const image = page.getByAltText(names[0], { exact: true });
    await expect(image).toHaveAttribute("src", "/landing-next/radar-static.svg");
    const first = await image.screenshot({ animations: "allow" });
    await page.waitForTimeout(350);
    expect((await image.screenshot({ animations: "allow" })).equals(first)).toBe(true);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const response = await page.goto(`${fixture.origin}/landing-next/unreviewed.svg`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-security-policy"]).not.toContain("unsafe-inline");
    // The same bytes at an unapproved path must retain the default strict CSP.
    await expect(page.locator(".radar-beam")).toHaveCSS("animation-name", "none");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  } finally { await fixture.close(); }
});
