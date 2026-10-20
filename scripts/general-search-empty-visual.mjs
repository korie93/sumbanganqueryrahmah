import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { startGeneralSearchEmptyFixture } from "./lib/general-search-empty-fixture.mjs";

// Reproducible same-browser, same-viewport, same-panel-width source comparison.
// All API data is synthetic; the existing application is not changed for preview.
const output = path.resolve("artifacts/enterprise-empty/visual");
await mkdir(output, { recursive: true });
const fixture = await startGeneralSearchEmptyFixture();
let browser;
const evidence = [];
try {
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME_PATH || undefined });
  for (const theme of ["light", "dark"]) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, deviceScaleFactor: 1,
        colorScheme: theme, reducedMotion: "reduce", serviceWorkers: "block" });
      const issues = [];
      await context.routeWebSocket("**/*", (socket) => socket.close());
      await context.route("**/*", (route) => {
        assert.equal(new URL(route.request().url()).origin, fixture.origin, "No off-origin traffic is allowed");
        return route.continue();
      });
      await context.addInitScript((theme) => {
        localStorage.setItem("theme", theme);
        localStorage.setItem("perf_mode", "high");
      }, theme);
      const page = await context.newPage();
      page.on("pageerror", (error) => issues.push(error.message));
      page.on("console", (message) => {
        if (/Content Security Policy|Refused to|TrustedHTML/.test(message.text())) issues.push(message.text());
      });
      await page.goto(`${fixture.origin}/general-search`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("input-search").fill("123456789012");
      await page.getByTestId("button-search").click();
      const panel = page.getByTestId("general-search-empty");
      await panel.waitFor({ state: "visible" });
      const box = await panel.boundingBox();
      assert.ok(box);
      const name = `${theme}-${width}`;
      await panel.screenshot({ path: path.join(output, `${name}-implementation.png`) });
      await page.screenshot({ path: path.join(output, `${name}-app.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Page must not overflow");
      const reference = await context.newPage();
      await reference.goto(`${fixture.origin}/__reference?theme=${theme}&width=${box.width}`, { waitUntil: "load" });
      const source = reference.locator(".sqr-empty");
      const sourceBox = await source.boundingBox();
      await source.screenshot({ path: path.join(output, `${name}-source.png`) });
      evidence.push({ theme, viewport: { width, height: 960 }, density: 1, implementation: box,
        source: sourceBox, issues });
      assert.deepEqual(issues, [], "Actual built application must work under strict production-like CSP");
      await context.close();
    }
  }
  assert.deepEqual(fixture.state.unexpected, []);
  await writeFile(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  process.stdout.write(`Captured ${evidence.length} matched source/implementation pairs under strict CSP in ${output}\n`);
} finally {
  await browser?.close();
  await fixture.close();
}
