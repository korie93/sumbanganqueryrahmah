import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";
import { startVisualBuiltServer } from "./test-visual-built.mjs";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Keep the established npm entry point while exercising the one public landing
// now used by every device. Only a loopback static build and synthetic APIs run.
const widths = [320, 360, 375, 390, 412, 430, 768, 1440];
const artifacts = path.resolve("artifacts/landing-v21-browser");
const axeSource = await fs.readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const strictPolicy = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";
const checks = [], failures = [];
const pass = value => { checks.push(value); console.log(`PASS ${value}`); };
await fs.mkdir(artifacts, { recursive: true });
const server = await startVisualBuiltServer(path.resolve(process.env.LANDING_V21_PUBLIC_DIR || "dist-local/public"));
let browser, page;

async function installFixture(context, profile = {}) {
  const pending = new Set();
  const pages = [];
  const assets = [];
  context.on("page", candidate => {
    pages.push(candidate);
    candidate.on("pageerror", error => failures.push(error.message));
    candidate.on("console", message => {
      if (message.type() === "error" && /content security policy|trustedtype|trusted type|violates.*directive/i.test(message.text())) failures.push(message.text());
    });
    candidate.on("request", request => assets.push(new URL(request.url()).pathname));
    candidate.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (response.status() >= 400 && !pathname.startsWith("/api/")) failures.push(`Asset ${response.status()} ${pathname}`);
    });
  });
  await context.addInitScript(({ performanceMode, cores, memory, saveData, effectiveType, origin }) => {
    // Context scripts also run in the initial about:blank document, whose
    // storage is unavailable. Seed only this fixture's own loopback documents.
    if (location.origin !== origin) return;
    if (performanceMode === "auto") localStorage.removeItem("perf_mode");
    else localStorage.setItem("perf_mode", performanceMode ?? "low");
    localStorage.setItem("theme", "light");
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => cores ?? 8 });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => memory ?? 8 });
    Object.defineProperty(navigator, "connection", { configurable: true, value: {
      saveData: saveData ?? false, effectiveType: effectiveType ?? "4g", addEventListener() {}, removeEventListener() {},
    } });
    window.__landingCspViolations = [];
    document.addEventListener("securitypolicyviolation", event => {
      window.__landingCspViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
    const observer = new MutationObserver(() => {
      if (!document.getElementById("root")?.childElementCount) return;
      window.__landingFirstAppCommit = performance.now();
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  }, { ...profile, origin: server.origin });
  await context.routeWebSocket("**/*", socket => socket.close());
  const handleRoute = async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== server.origin) { failures.push(`Off-origin ${url.origin}`); return route.abort(); }
    if (url.pathname === "/api/health/connectivity" && request.method() === "GET") return route.fulfill({ status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } });
    if (url.pathname === "/api/health" && request.method() === "GET") return route.fulfill({ json: { status: "ok", ready: true } });
    if (url.pathname === "/api/maintenance-status" && request.method() === "GET") return route.fulfill({ json: { maintenance: false } });
    if (url.pathname === "/api/me" && request.method() === "GET") return route.fulfill({ status: 401, json: { ok: false } });
    if (url.pathname.startsWith("/api/telemetry/") && ["GET", "POST"].includes(request.method())) return route.fulfill({ json: { ok: true } });
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
      failures.push(`Unexpected ${request.method()} ${url.pathname}`); return route.abort();
    }
    if ((request.isNavigationRequest() && request.resourceType() === "document") || url.pathname.startsWith("/landing-next/")) {
      const response = await route.fetch(), headers = response.headers();
      headers["content-security-policy"] = [headers["content-security-policy"], strictPolicy].filter(Boolean).join(", ");
      return route.fulfill({ response, headers });
    }
    return route.continue();
  };
  await context.route("**/*", route => {
    const request = handleRoute(route).finally(() => pending.delete(request));
    pending.add(request);
    return request;
  });
  return {
    assets,
    async finish() {
      // Draining before removing interception preserves overlapping fetch/fulfill
      // callbacks and their CSP headers during route and context cleanup.
      while (pending.size) await Promise.all(pending);
      await context.unrouteAll({ behavior: "wait" });
      for (const candidate of pages) {
        if (!candidate.isClosed()) assert.deepEqual(await candidate.evaluate(() => window.__landingCspViolations), [], "Strict CSP and Trusted Types");
      }
    },
  };
}

async function openLanding(candidate, theme = "light") {
  await candidate.goto(server.origin, { waitUntil: "domcontentloaded" });
  await expect(candidate.locator(".sqr-landing-next")).toHaveAttribute("data-theme", theme);
  await expect(candidate.locator(".sqr-landing-next h1")).toHaveText("Search.Analyse.Monitor.");
  await expect(candidate.locator(".sqr-landing")).toHaveCount(0);
  await candidate.evaluate(() => document.fonts.ready);
}

async function checkLayout(candidate, width) {
  assert.equal(await candidate.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, `No horizontal overflow at ${width}px`);
  await expect(candidate.locator(".sqr-landing-next main > section")).toHaveCount(9);
  for (const selector of ["header .brand", "header .login", ".hero h1 a"]) {
    for (const element of await candidate.locator(`.sqr-landing-next ${selector}`).all()) {
      const box = await element.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `${selector} is readable at ${width}px`);
    }
  }
  await expect(candidate.locator(".sqr-landing-next header .login")).toHaveAttribute("href", "/login");
}

async function checkAccessibility(candidate) {
  await candidate.evaluate(axeSource);
  const violations = await candidate.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.filter(item => item.impact === "serious" || item.impact === "critical")
      .map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }));
  });
  assert.deepEqual(violations, [], "No serious or critical WCAG violations");
}

async function checkMotion(candidate) {
  await candidate.emulateMedia({ reducedMotion: "no-preference" });
  await candidate.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(candidate.locator(".sqr-landing-next")).not.toHaveClass(/motion-paused/);
  await expect(candidate.locator(".radar-artwork")).toHaveAttribute("src", "/landing-next/radar-animated.svg");
  await expect(candidate.locator(".hero-tag i")).toHaveCSS("animation-name", "sqr-landing-next-blink");
  await expect(candidate.locator(".hero-tag i")).toHaveCSS("animation-duration", "2.2s");
  await expect(candidate.locator(".hero-tag i")).toHaveCSS("animation-play-state", "running");
  const replay = candidate.getByRole("button", { name: "Replay Search instrument animation", exact: true });
  await replay.scrollIntoViewIfNeeded();
  assert.ok(await replay.evaluate(element => getComputedStyle(element).transitionDuration.split(",").some(duration => Number.parseFloat(duration) > 0)), "Landing transitions stay enabled");
  await expect(replay.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
  await expect.poll(() => replay.locator("img").evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await replay.click(); await expect(replay.locator("img")).toHaveAttribute("src", /-boost\.svg$/);
  await candidate.emulateMedia({ reducedMotion: "reduce" });
  await expect(candidate.locator(".sqr-landing-next")).toHaveClass(/motion-paused/);
  await expect(candidate.locator(".hero-tag i")).toHaveCSS("animation-name", "none");
  await expect(replay.locator("img")).toHaveAttribute("src", /-static\.svg$/);
  await expect(replay).not.toHaveClass(/boost/);
  await candidate.emulateMedia({ reducedMotion: "no-preference" });
  await expect(replay.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
  await candidate.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(replay.locator("img")).toHaveAttribute("src", /-static\.svg$/);
  await candidate.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(replay.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
  await candidate.locator(".sqr-landing-next footer").scrollIntoViewIfNeeded();
  await expect(replay.locator("img")).toHaveAttribute("src", /-static\.svg$/);
  await replay.scrollIntoViewIfNeeded();
  await expect(replay.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
}

try {
  // The shared helper honors PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH and CHROME_PATH.
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
  const fixture = await installFixture(context, { performanceMode: "low", cores: 2, memory: 2, saveData: true, effectiveType: "2g" });
  try {
    page = await context.newPage();
    await page.goto(`${server.origin}/login`);
    await expect(page.getByTestId("input-username")).toBeVisible();
    const landingPaths = await page.locator('meta[name="sqr-landing-script"], meta[name="sqr-landing-style"]').evaluateAll(elements => elements.map(element => element.content));
    assert.ok(landingPaths.some(asset => asset.endsWith(".js")), "Built HTML advertises the landing entry");
    const landingOnly = asset => /^\/assets\/Landing(?:Next)?-/.test(asset) || asset.startsWith("/landing-next/");
    assert.deepEqual(fixture.assets.filter(landingOnly), [], "Direct login keeps the public landing out of its request graph");
    assert.deepEqual(await page.locator('link[rel="modulepreload"], link[rel="preload"]').evaluateAll(elements => elements.map(element => new URL(element.href).pathname).filter(asset => /^\/assets\/Landing(?:Next)?-/.test(asset))), []);
    const inputStyle = element => { const style = getComputedStyle(element); return { height: style.height, fontSize: style.fontSize, color: style.color, background: style.backgroundColor, border: style.borderRadius }; };
    const loginBefore = await page.getByTestId("input-username").evaluate(inputStyle);
    pass("direct login keeps landing code and artwork lazy");

    await openLanding(page);
    await expect(page.locator("html")).toHaveClass(/low-spec/);
    await expect(page.locator("#boot-shell")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const hints = await page.evaluate(() => [...document.querySelectorAll('meta[name="sqr-landing-script"], meta[name="sqr-landing-style"]')].map(meta => {
      const url = new URL(meta.content, location.href).href, script = meta.name === "sqr-landing-script";
      const hint = [...document.querySelectorAll(`link[rel="${script ? "modulepreload" : "preload"}"]`)].find(link => link.href === url);
      const resources = performance.getEntriesByName(url, "resource");
      return { path: meta.content, script, rel: hint?.rel, as: hint?.as, crossOrigin: hint?.crossOrigin, firstCommit: window.__landingFirstAppCommit, startTime: resources[0]?.startTime, fetchCount: resources.length };
    }));
    for (const hint of hints) {
      assert.match(hint.path, hint.script ? /^\/assets\/[A-Za-z0-9_-]+\.js$/ : /^\/assets\/[A-Za-z0-9_-]+\.css$/);
      assert.equal(hint.rel, hint.script ? "modulepreload" : "preload");
      if (!hint.script) assert.equal(hint.as, "style");
      assert.equal(hint.crossOrigin, "anonymous");
      assert.ok(Number.isFinite(hint.firstCommit) && Number.isFinite(hint.startTime) && hint.startTime < hint.firstCommit, `${hint.path} starts before React commits`);
      assert.equal(hint.fetchCount, 1, `${hint.path} reuses its preload`);
      assert.equal((await context.request.get(server.origin + hint.path)).status(), 200);
    }
    pass("anonymous root starts reusable landing resource hints before React rendering");
    assert.equal(JSON.parse(await page.locator("#sqr-application-schema").textContent())["@type"], "SoftwareApplication");
    await expect(page).toHaveTitle("SQR — Sumbangan Query Rahmah");
    for (const [selector, attribute] of [['meta[property="og:image"]', "content"], ['link[rel="apple-touch-icon"]', "href"]]) {
      const asset = await page.locator(selector).getAttribute(attribute);
      assert.equal((await context.request.get(server.origin + new URL(asset, server.origin).pathname)).status(), 200);
    }
    pass("public metadata and deployed brand assets");

    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await checkLayout(page, width);
      if (width <= 720) await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(artifacts, `landing-${width}.png`), fullPage: false, animations: "disabled" });
      if (width === 320 || width === 1440) {
        // Capture the complete content in bounded section images rather than a
        // single canvas spanning the entire nine-section document.
        for (const [index, section] of (await page.locator(".sqr-landing-next main > section").all()).entries()) {
          await section.screenshot({ path: path.join(artifacts, `landing-${width}-section-${String(index + 1).padStart(2, "0")}.png`), animations: "disabled" });
        }
      }
      pass(`new landing layout ${width}px`);
    }
    await page.setViewportSize({ width: 320, height: 740 });
    const menuButton = page.getByRole("button", { name: "Menu", exact: true });
    const menu = page.getByRole("navigation", { name: "Mobile", exact: true });
    await menuButton.focus(); await menuButton.press("Enter"); await expect(menu).toBeVisible();
    await page.keyboard.press("Escape"); await expect(menu).toBeHidden(); await expect(menuButton).toBeFocused();
    await menuButton.press("Enter"); await menu.getByRole("link", { name: "About", exact: true }).click();
    await expect(menu).toBeHidden(); await expect(page.locator("#about")).toBeFocused();
    await expect(page).toHaveURL(/#about$/);
    await page.locator(".sqr-landing-next header").scrollIntoViewIfNeeded();
    await menuButton.click(); await page.setViewportSize({ width: 1440, height: 900 }); await expect(menu).toBeHidden();
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await checkLayout(page, 320);
    for (const element of await page.locator(".sqr-landing-next .panel h2, .sqr-landing-next .facts dt, .sqr-landing-next .facts dd").all()) {
      const box = await element.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 321);
      assert.ok(await element.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    pass("320px keyboard menu, Escape, focused anchors, desktop reflow and enlarged text");

    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const id of ["about", "search", "analyse", "import", "monitor", "security", "start"]) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await expect(page.locator(`#${id} h2`)).toBeVisible();
    }
    await checkAccessibility(page);
    await page.locator(".sqr-landing-next header").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    assert.equal(await page.evaluate(() => localStorage.getItem("theme")), "light");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    await checkAccessibility(page);
    await checkMotion(page);
    pass("both themes and constrained-device CSS/SVG motion, live reduced motion, visibility and offscreen pausing");

    for (const selector of ["header .login", ".hero .actions a[href='/login']", "#start a[href='/login']", "footer a[href='/login']"]) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator(`.sqr-landing-next ${selector}`).click();
      await expect(page.getByTestId("input-username")).toBeVisible();
      await expect(page.getByTestId("input-password")).toBeVisible();
      await expect(page.getByTestId("button-login")).toBeVisible();
      await expect(page.locator(".sqr-landing-next")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("lang", "ms");
      await expect(page.locator("#sqr-application-schema")).toHaveCount(0);
      assert.deepEqual(await page.getByTestId("input-username").evaluate(inputStyle), loginBefore, "No landing CSS leakage into login");
      await page.getByRole("button", { name: "Laman utama", exact: true }).click();
      await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("#sqr-application-schema")).toHaveCount(1);
    }
    pass("all login links, real form, Home return, theme persistence, language/schema cleanup and CSS isolation under strict CSP");
  } finally {
    try { await fixture.finish(); } finally { await context.close(); }
  }

  for (const [label, profile, width] of [
    ["persisted low preference", { performanceMode: "low" }, 1440],
    ["two cores and two GB", { performanceMode: "auto", cores: 2, memory: 2 }, 390],
    ["four cores and four GB", { performanceMode: "auto", cores: 4, memory: 4 }, 1440],
    ["saveData and 2g", { performanceMode: "auto", saveData: true, effectiveType: "2g" }, 390],
    ["2g without saveData", { performanceMode: "auto", effectiveType: "2g" }, 390],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "no-preference", colorScheme: "light", serviceWorkers: "block" });
    const fixture = await installFixture(context, profile);
    try {
      page = await context.newPage(); await openLanding(page); await checkLayout(page, width);
      if (profile.performanceMode === "low" || profile.cores === 2 || profile.saveData) await expect(page.locator("html")).toHaveClass(/low-spec/);
      await checkMotion(page);
      pass(`${label} keeps the new animated landing at ${width}px`);
    } finally {
      try { await fixture.finish(); } finally { await context.close(); }
    }
  }

  const touchContext = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, colorScheme: "light", reducedMotion: "no-preference", serviceWorkers: "block" });
  const touchFixture = await installFixture(touchContext, { performanceMode: "low", cores: 2, memory: 2, saveData: true, effectiveType: "2g" });
  try {
    page = await touchContext.newPage(); await openLanding(page); await checkLayout(page, 320);
    await expect(page.locator(".radar-artwork")).toHaveAttribute("src", "/landing-next/radar-animated.svg");
    await page.getByRole("button", { name: "Menu", exact: true }).tap();
    await page.getByRole("navigation", { name: "Mobile", exact: true }).getByRole("link", { name: "Capabilities", exact: true }).tap();
    await expect(page.locator("#search")).toBeFocused();
    const replay = page.getByRole("button", { name: "Replay Search instrument animation", exact: true });
    await replay.scrollIntoViewIfNeeded(); await expect(replay.locator("img")).toHaveAttribute("src", /-animated\.svg$/);
    await replay.tap(); await expect(replay.locator("img")).toHaveAttribute("src", /-boost\.svg$/);
    assert.equal(await replay.evaluate(element => element.style.getPropertyValue("--tx")), "");
    await page.emulateMedia({ reducedMotion: "reduce" }); await expect(replay.locator("img")).toHaveAttribute("src", /-static\.svg$/);
    await page.locator(".sqr-landing-next header").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Toggle color theme", exact: true }).tap();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    await checkAccessibility(page);
    await page.locator(".sqr-landing-next header .login").tap(); await expect(page.getByTestId("input-username")).toBeVisible();
    await page.getByRole("button", { name: "Laman utama", exact: true }).tap();
    await expect(page.locator(".sqr-landing-next")).toHaveAttribute("data-theme", "dark");
    pass("320px touch menu, animated replay, live motion preference, theme, login and accessibility");
  } finally {
    try { await touchFixture.finish(); } finally { await touchContext.close(); }
  }
  assert.deepEqual(failures, [], "No page errors, unexpected APIs, failed or off-origin assets");
  await fs.writeFile(path.join(artifacts, "report.json"), JSON.stringify({ status: "PASS", checks, widths, failures }, null, 2));
  console.log(`LANDING_V21_BUILT_PASS (${checks.length} checks)`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: false }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
