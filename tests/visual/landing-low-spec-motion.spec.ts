import { realpath, stat } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { LANDING_ARTWORK_STYLE_HASHES } from "../../server/internal/landing-artwork-csp";

test.use({ serviceWorkers: "block" });
test.describe.configure({ retries: 0 });

async function startBuiltLandingFixture() {
  const publicRoot = await realpath(process.env.VISUAL_CI_PUBLIC_ROOT
    ?? fileURLToPath(new URL("../../dist-local/public/", import.meta.url)));
  expect((await stat(path.join(publicRoot, "index.html"))).isFile()).toBe(true);
  // Omit only Playwright's reporter option while strict application config loads.
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
  const unexpected: string[] = [];
  const artworkPolicies = new Map<string, string>();
  const app = express();
  let requests = 0;
  middleware.registerLocalHttpSecurityHeaders(app);
  app.use((req, res, next) => {
    if (++requests > 256) {
      unexpected.push("request limit exceeded");
      req.resume();
      return void res.status(503).end();
    }
    res.once("finish", () => {
      if (req.path.startsWith("/landing-next/")) {
        artworkPolicies.set(req.path, String(res.getHeader("Content-Security-Policy") ?? ""));
      }
    });
    if (/^\/api(?:\/|$)/i.test(req.path)) res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET" && req.path === "/api/health/connectivity") {
      return void res.status(204).setHeader("X-SQR-Connectivity", "ok").end();
    }
    if (req.method === "GET" && req.path === "/api/health") {
      return void res.json({ status: "ok", ready: true });
    }
    if (req.method === "GET" && req.path === "/api/maintenance-status") {
      return void res.json({ maintenance: false });
    }
    if (req.method === "GET" && req.path === "/api/me") return void res.status(401).json({ ok: false });
    if (req.method === "POST" && req.path === "/api/telemetry/web-vitals") {
      req.resume();
      return void res.json({ ok: true });
    }
    if (/^\/(?:api|internal|ws|socket\.io)(?:\/|$)/i.test(req.path)
      || !["GET", "HEAD"].includes(req.method)) {
      unexpected.push(`${req.method} ${req.path}`);
      req.resume();
      return void res.status(403).json({ ok: false });
    }
    next();
  });
  // Serve the real compiled app and CSS; do not replace its HTML with image demos
  // or append a second hashless CSP to its SVG responses.
  middleware.registerFrontendStatic(app, { cwd: publicRoot, paths: ["."], publicAppUrl: null });
  const server: Server = app.listen(0, "127.0.0.1");
  server.on("upgrade", (_request, socket) => {
    unexpected.push("WebSocket upgrade");
    socket.destroy();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected an isolated loopback address");
    return {
      origin: `http://127.0.0.1:${address.port}`, unexpected, artworkPolicies,
      async close() {
        await new Promise<void>((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
          server.closeAllConnections();
        });
      },
    };
  } catch (error) {
    server.closeAllConnections();
    server.close();
    throw error;
  }
}

async function settleArtwork(page: Page, image: Locator, variant: "animated" | "static") {
  await image.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", new RegExp(`-${variant}\\.svg$`));
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete
    && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await image.evaluate(async element => {
    // Transparent artwork can overlap sibling text as well as ancestor reveals.
    // Native SVG image documents are not part of this DOM subtree: their actual
    // artwork loops remain running and must supply the changing pixels.
    const container = element.closest(".hero, .panel") ?? element;
    const animations = new Set(container.getAnimations({ subtree: true }));
    for (let node: Element | null = element; node; node = node.parentElement) {
      for (const animation of node.getAnimations()) animations.add(animation);
    }
    await Promise.all([...animations]
      .filter(animation => animation.playState === "running" && animation.effect
        && Number.isFinite(animation.effect.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {})));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function assertArtworkPixels(page: Page, image: Locator, moving: boolean) {
  await settleArtwork(page, image, moving ? "animated" : "static");
  const box = await image.boundingBox();
  expect(box).not.toBeNull();
  // These independent hero loops can overlap the radar's transparent image box.
  // Mask only their small boxes, leaving the actual artwork visible and running.
  const options = { animations: "allow" as const,
    mask: [page.locator(".hero-tag i"), page.locator(".hero .cue")] };
  const first = await image.screenshot(options);
  if (moving) {
    await expect.poll(async () => (await image.screenshot(options)).equals(first), {
      message: "The real low-spec landing artwork must change rendered pixels", timeout: 6_000,
      intervals: [250, 600, 1_200],
    }).toBe(false);
  } else {
    await page.waitForTimeout(350);
    expect((await image.screenshot(options)).equals(first)).toBe(true);
  }
  const after = await image.boundingBox();
  expect(after).not.toBeNull();
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(after![key] - box![key]), "Artwork geometry must stay fixed during the pixel comparison").toBeLessThan(0.5);
  }
}

for (const profile of [
  { name: "forced low mode on capable hardware", mode: "low", cores: 8, memory: 8, width: 1440, cpu: 4 },
  { name: "automatic low mode on two-core two-GB hardware", mode: "auto", cores: 2, memory: 2, width: 390, cpu: 6 },
]) {
  test(`Whole SQR landing motion survives ${profile.name} and resumes after reduced motion`, async ({ page }) => {
    test.setTimeout(60_000);
    const startedAt = Date.now();
    const fixture = await startBuiltLandingFixture();
    const errors: string[] = [];
    let session: CDPSession | undefined;
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (!request.url().startsWith("data:") && !request.url().startsWith("blob:")
        && new URL(request.url()).origin !== fixture.origin) fixture.unexpected.push("off-origin request");
    });
    try {
      await page.context().routeWebSocket("**/*", socket => {
        fixture.unexpected.push("WebSocket request");
        socket.close();
      });
      session = await page.context().newCDPSession(page);
      await page.setViewportSize({ width: profile.width, height: 900 });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
      await page.addInitScript(({ mode, cores, memory }) => {
        if (mode === "low") localStorage.setItem("perf_mode", "low");
        else localStorage.removeItem("perf_mode");
        localStorage.setItem("theme", "dark");
        Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => cores });
        Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => memory });
        // The isolated loopback fixture is healthy even when its namespace has no external NIC.
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      }, profile);
      await session.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
      await page.goto(fixture.origin, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".sqr-landing-next h1")).toHaveText("Search.Analyse.Monitor.");
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect(page.locator("html")).toHaveClass(/low-spec/);
      await expect(page.locator("body")).toHaveClass(/low-spec/);
      await expect(page.locator(".sqr-landing-next")).not.toHaveClass(/motion-paused/);
      expect(await page.evaluate(() => ({ hidden: document.hidden,
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        mode: localStorage.getItem("perf_mode") }))).toEqual({ hidden: false, reduced: false,
        mode: profile.mode === "low" ? "low" : null });
      const artwork = [
        { name: "radar", image: page.locator(".radar-artwork") },
        { name: "search", image: page.locator("#search .instrument-image") },
      ];
      const reportPhase = (name: string, phase: string) => {
        console.log("LOW_SPEC_PHASE=" + JSON.stringify({ profile: profile.name, artwork: name, phase,
          elapsedMs: Date.now() - startedAt }));
      };
      const assertPolicy = async (image: Locator) => {
        const source = await image.getAttribute("src");
        expect(source).toBeTruthy();
        const requestPath = new URL(source!, fixture.origin).pathname;
        const hash = LANDING_ARTWORK_STYLE_HASHES[requestPath.slice(1)];
        expect(hash).toBeTruthy();
        const policy = fixture.artworkPolicies.get(requestPath);
        expect(policy).toContain(hash);
        expect(policy).not.toContain("unsafe-inline");
        expect(policy).toContain("style-src-attr 'none'");
      };
      // Keep each image in view through all phases. Repeated hero/section scrolls
      // add unrelated observer, reveal and image-source work on constrained CPUs.
      for (const { name, image } of artwork) {
        reportPhase(name, "normal");
        await assertArtworkPixels(page, image, true);
        await assertPolicy(image);
        reportPhase(name, "reduced");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page.locator(".sqr-landing-next")).toHaveClass(/motion-paused/);
        await assertArtworkPixels(page, image, false);
        await assertPolicy(image);
        reportPhase(name, "resumed");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await expect(page.locator(".sqr-landing-next")).not.toHaveClass(/motion-paused/);
        await assertArtworkPixels(page, image, true);
        await assertPolicy(image);
      }
      await expect(page.locator("html")).toHaveClass(/low-spec/);
      await expect(page.locator("body")).toHaveClass(/low-spec/);
      expect(errors).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
    } finally {
      await session?.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {});
      await page.close().catch(() => {});
      await fixture.close();
    }
  });
}
