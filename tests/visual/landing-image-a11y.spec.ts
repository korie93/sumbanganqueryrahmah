import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";

// Exercise the actual built page and its original artwork through synthetic
// public APIs only, including devices with persisted low performance settings.
test.use({ serviceWorkers: "block" });
const lazyArtworkPath = "/landing-next/search-dark-static.svg";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const strictScriptPolicy = "script-src 'self'; require-trusted-types-for 'script'";

async function installPublicFixture(page: Page, baseURL: string | undefined) {
  expect(baseURL, "Run against the isolated built frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "low");
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 2 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 2 });
  });
  const unexpected: string[] = [];
  const pending = new Set<Promise<void>>();
  let releaseArtwork!: () => void;
  let heldArtworkRequests = 0;
  const artworkGate = new Promise<void>((resolve) => { releaseArtwork = resolve; });
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  const handleRoute = async (route: Route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      unexpected.push("off-origin request");
      return route.abort();
    }
    if (request.method() === "GET" && url.pathname === "/api/health/connectivity") {
      return route.fulfill({ status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } });
    }
    if (request.method() === "GET" && url.pathname === "/api/health") {
      return route.fulfill({ json: { status: "ok", ready: true } });
    }
    if (request.method() === "GET" && url.pathname === "/api/maintenance-status") {
      return route.fulfill({ json: { maintenance: false } });
    }
    if (request.method() === "GET" && url.pathname === "/api/me") {
      return route.fulfill({ status: 401, json: { ok: false } });
    }
    if (url.pathname.startsWith("/api/telemetry/") && ["GET", "POST"].includes(request.method())) {
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (request.isNavigationRequest() && request.resourceType() === "document") {
      const response = await route.fetch();
      const headers = response.headers();
      headers["content-security-policy"] = [headers["content-security-policy"], strictScriptPolicy]
        .filter(Boolean).join(", ");
      return route.fulfill({ response, headers });
    }
    if (url.pathname === lazyArtworkPath) {
      heldArtworkRequests++;
      await artworkGate;
    }
    return route.continue();
  };
  await page.route("**/*", route => {
    const request = handleRoute(route).finally(() => { pending.delete(request); });
    pending.add(request);
    return request;
  });
  return {
    unexpected, releaseArtwork, heldArtworkRequests: () => heldArtworkRequests,
    async finish() {
      releaseArtwork();
      // Preserve interception until every fetch/fulfill callback has completed.
      while (pending.size) await Promise.all(pending);
      await page.unrouteAll({ behavior: "wait" });
    },
  };
}

async function imageGeometry(image: Locator) {
  return image.evaluate((element: HTMLImageElement) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.x, y: box.y, width: box.width, height: box.height,
      naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight,
      aspectRatio: getComputedStyle(element).aspectRatio,
    };
  });
}

for (const width of [1440, 390, 320]) {
  test(`Landing reserves lazy instrument artwork and exposes accessible assurances at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installPublicFixture(page, baseURL);
    const browserIssues: unknown[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    cdp.on("Audits.issueAdded", ({ issue }) => {
      if (String(issue.code) === "LazyLoadImageIssue") browserIssues.push(issue.details);
    });
    try {
      await cdp.send("Audits.enable");
      const navigation = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(await navigation?.headerValue("content-security-policy")).toContain(strictScriptPolicy);
      await page.locator("html.app-ready").waitFor({ state: "attached" });
      await expect(page.locator("html")).toHaveClass(/low-spec/);
      await expect(page.locator(".sqr-landing-next").getByRole("heading", { level: 1 })).toHaveText("Search.Analyse.Monitor.");
      await expect(page.locator(".sqr-landing")).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);

      const headerLogo = page.locator(".sqr-landing-next header .brand img");
      const replay = page.getByRole("button", { name: "Replay Search instrument animation", exact: true });
      const artwork = replay.locator("img");
      await expect(headerLogo).toHaveAttribute("src", "/brand/sidebar-q-static.png");
      await expect(headerLogo).toHaveAttribute("width", "30");
      await expect(headerLogo).toHaveAttribute("height", "30");
      await expect(artwork).toHaveAttribute("src", lazyArtworkPath);
      await expect(artwork).toHaveAttribute("width", "120");
      await expect(artwork).toHaveAttribute("height", "120");
      await expect(artwork).toHaveAttribute("loading", "lazy");
      await expect(artwork).toHaveAttribute("alt", "");
      await expect(artwork).toHaveAttribute("aria-hidden", "true");

      await replay.scrollIntoViewIfNeeded();
      await expect.poll(fixture.heldArtworkRequests).toBeGreaterThan(0);
      const before = await imageGeometry(artwork);
      expect(before.naturalWidth, "Measure before the held original SVG loads").toBe(0);
      expect(before.naturalHeight).toBe(0);
      expect(before.width).toBeGreaterThan(0);
      expect(before.height).toBeGreaterThan(0);
      expect(before.width / before.height).toBeCloseTo(1, 2);
      await expect(replay).toHaveCSS("aspect-ratio", "1 / 1");

      fixture.releaseArtwork();
      await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const after = await imageGeometry(artwork);
      expect(after.naturalWidth).toBeGreaterThan(0);
      expect(after.naturalHeight).toBeGreaterThan(0);
      expect(after.naturalWidth / after.naturalHeight).toBeCloseTo(1, 2);
      for (const dimension of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(after[dimension] - before[dimension]), `Artwork ${dimension} stays stable after decoding`).toBeLessThanOrEqual(1);
      }
      expect((await imageGeometry(headerLogo)).width).toBe(30);
      const assurances = page.locator(".sqr-landing-next .assure");
      await expect(assurances).toHaveRole("list");
      await expect(assurances.getByRole("listitem")).toHaveText(["Internal platform", "Registered users only", "Ongoing security audits"]);
      const specifications = page.getByRole("list", { name: "Search specifications", exact: true });
      await expect(specifications.getByRole("listitem")).toHaveCount(3);

      // The automation context executes axe without an inline DOM script sink.
      await page.evaluate(axeSource);
      const violations = await page.locator(".sqr-landing-next").evaluate(async (element) => {
        const axe = (window as typeof window & {
          axe: { run: (root: Element, options: RunOptions) => Promise<AxeResults> };
        }).axe;
        const result = await axe.run(element, {
          runOnly: { type: "rule", values: ["aria-prohibited-attr"] }, resultTypes: ["violations"],
        });
        return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }));
      });
      expect(violations).toEqual([]);
      expect(browserIssues, "No LazyLoadImageIssue during initial or decoded-image layout").toEqual([]);
      expect(fixture.unexpected).toEqual([]);
      expect(pageErrors).toEqual([]);
      await testInfo.attach("landing-image-layout.json", {
        body: JSON.stringify({ width, before, after, browserIssues, violations }, null, 2), contentType: "application/json",
      });
    } finally {
      try { await fixture.finish(); }
      finally { await cdp.detach(); }
    }
  });
}
