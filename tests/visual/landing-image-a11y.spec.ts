import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";

// Exercise the actual built public page without an application server, user
// session, external service or production data. Do not replace its artwork.
test.use({ serviceWorkers: "block" });
const fullLogoPath = "/brand/sqr-full-logo-light.svg";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function installPublicFixture(page: Page, baseURL: string | undefined) {
  expect(baseURL, "Run against the isolated built frontend").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const unexpected: string[] = [];
  let releaseLogo!: () => void;
  let heldLogoRequests = 0;
  const logoGate = new Promise<void>((resolve) => { releaseLogo = resolve; });
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/*", async (route) => {
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
    if (url.pathname === fullLogoPath) {
      heldLogoRequests++;
      // The eager header shares this URL. Waiting only for DOMContentLoaded
      // below lets us measure the lazy footer before either image can decode.
      await logoGate;
    }
    return route.continue();
  });
  return { unexpected, releaseLogo, heldLogoRequests: () => heldLogoRequests };
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

for (const width of [1440, 390]) {
  test(`Landing footer reserves its lazy logo and exposes a named strengths group at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installPublicFixture(page, baseURL);
    const browserIssues: unknown[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const cdp = await page.context().newCDPSession(page);
    cdp.on("Audits.issueAdded", ({ issue }) => {
      // Installed Chrome may expose issue codes newer than bundled CDP typings.
      if (String(issue.code) === "LazyLoadImageIssue") browserIssues.push(issue.details);
    });
    try {
      // Enable before navigation: DevTools reports this issue during the first
      // layout, not necessarily after a later DOM inspection of the image.
      await cdp.send("Audits.enable");
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: /Operational data, structured/ })).toBeVisible();
      await expect.poll(fixture.heldLogoRequests).toBeGreaterThan(0);
      await page.evaluate(() => document.fonts.ready);

      const headerLogo = page.getByTestId("landing-brand-title").locator("img");
      const footerLogo = page.locator(".footer-brand .landing-brand-image");
      const previewIcon = page.locator(".preview-brand-icon img");
      await expect(headerLogo).toHaveAttribute("src", fullLogoPath);
      await expect(headerLogo).toHaveAttribute("width", "665");
      await expect(headerLogo).toHaveAttribute("height", "310");
      await expect(headerLogo).toHaveAttribute("loading", "eager");
      await expect(footerLogo).toHaveAttribute("src", fullLogoPath);
      await expect(footerLogo).toHaveAttribute("width", "665");
      await expect(footerLogo).toHaveAttribute("height", "310");
      await expect(footerLogo).toHaveAttribute("loading", "lazy");

      await footerLogo.scrollIntoViewIfNeeded();
      const before = await imageGeometry(footerLogo);
      expect(before.naturalWidth, "Measure before the held original SVG has loaded").toBe(0);
      expect(before.naturalHeight).toBe(0);
      expect(before.width).toBeGreaterThan(0);
      expect(before.height).toBe(64);
      expect(before.width / before.height).toBeCloseTo(665 / 310, 2);
      expect(before.aspectRatio, "An explicit CSS ratio avoids Chromium's lazy-image issue").toBe("665 / 310");

      fixture.releaseLogo();
      await expect.poll(() => footerLogo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await page.waitForLoadState("load");
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const after = await imageGeometry(footerLogo);
      expect(after.naturalWidth).toBe(665);
      expect(after.naturalHeight).toBe(310);
      for (const dimension of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(after[dimension] - before[dimension]), `Footer ${dimension} remains stable after image load`).toBeLessThanOrEqual(1);
      }

      // The footer-specific correction must not stretch the square Q preview
      // or change the existing eager/lazy artwork-loading decisions.
      await expect(previewIcon).toHaveAttribute("src", "/brand/sqr-q-mark-light.png");
      await expect(previewIcon).toHaveAttribute("width", "128");
      await expect(previewIcon).toHaveAttribute("height", "128");
      await expect(previewIcon).toHaveAttribute("loading", "lazy");
      expect((await imageGeometry(previewIcon)).aspectRatio).not.toBe("665 / 310");
      expect((await imageGeometry(headerLogo)).aspectRatio).not.toBe("665 / 310");

      const strengths = page.getByRole("group", { name: "Platform strengths", exact: true });
      await expect(strengths).toHaveCount(1);
      await expect(strengths).toHaveClass("hero-proof");
      await expect(strengths).toHaveAttribute("role", "group");
      await page.addScriptTag({ content: axeSource });
      const violations = await strengths.evaluate(async (element) => {
        const axe = (window as typeof window & {
          axe: { run: (root: Element, options: RunOptions) => Promise<AxeResults> };
        }).axe;
        const result = await axe.run(element, {
          runOnly: { type: "rule", values: ["aria-prohibited-attr"] },
          resultTypes: ["violations"],
        });
        return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }));
      });
      expect(violations).toEqual([]);
      expect(browserIssues, "No LazyLoadImageIssue is emitted during initial or decoded-image layout").toEqual([]);
      expect(fixture.unexpected).toEqual([]);
      expect(pageErrors).toEqual([]);
      await testInfo.attach("landing-image-layout.json", {
        body: JSON.stringify({ width, before, after, browserIssues, violations }, null, 2),
        contentType: "application/json",
      });
    } finally {
      // Never leave the shared eager/lazy SVG request hanging after an assertion
      // failure or block the context teardown on an unreleased fixture promise.
      fixture.releaseLogo();
      await cdp.detach();
    }
  });
}
