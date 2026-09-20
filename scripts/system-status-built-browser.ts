import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import express from "express";
import { chromium } from "playwright";
import { registerFrontendStatic } from "../server/internal/frontend-static";
import { createRuntimeConfigManager } from "../server/internal/runtime-config-manager";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Real production entry + actual document/maintenance middleware, synthetic
// account/status APIs only. No application bootstrap, .env, DB or real account.
const artifacts = path.resolve("artifacts/system-status-built-browser");
await mkdir(artifacts, { recursive: true });
let maintenance = false;
let authenticated = false;
let role = "user";
const fixtureUser = () => ({ id: "status-browser-synthetic", username: "status.fixture", role,
  fullName: "Synthetic Status Fixture", email: null, status: "active", mustChangePassword: false,
  passwordResetBySuperuser: false, isBanned: false, twoFactorPendingSetup: false,
  activatedAt: null, passwordChangedAt: null, lastLoginAt: null });
const manager = createRuntimeConfigManager({
  storage: { getMaintenanceState: async () => ({ maintenance, message: "", type: "hard", startTime: null, endTime: null }),
    getAppConfig: async () => { throw new Error("Not used by this isolated fixture."); } },
  secret: "isolated-status-fixture-only-not-a-session-key",
  defaults: { sessionTimeoutMinutes: 15, wsIdleMinutes: 15, aiTimeoutMs: 1000, searchResultLimit: 10, viewerRowsPerPage: 10 },
  maintenanceCacheTtlMs: 1, runtimeSettingsCacheTtlMs: 1,
});
const app = express();
app.use(manager.maintenanceGuard);
app.get("/api/me", (_req, res) => authenticated
  ? res.json({ ok: true, user: fixtureUser(), sessionExpiresAt: "2099-01-01T00:00:00.000Z" })
  : res.status(401).json({ message: "Unauthenticated fixture" }));
app.get("/api/maintenance-status", (_req, res) => res.json({ maintenance, message: "", type: "hard", startTime: null, endTime: null }));
app.get("/api/health/live", (_req, res) => res.json({ ready: true }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", ready: true }));
app.get("/api/csrf-token", (_req, res) => res.json({ csrfToken: "synthetic-status-only" }));
app.post("/api/telemetry/:kind", (_req, res) => res.sendStatus(204));
registerFrontendStatic(app);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
const checks: string[] = [];
const pageErrors: string[] = [];
const externalRequests: string[] = [];
let passed = false;
try {
  for (const account of ["anonymous", "user", "admin", "superuser"]) {
    authenticated = account !== "anonymous";
    role = account;
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
    if (authenticated) await context.addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        externalRequests.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    for (const route of ["/not-a-real-page", "/collection/not-a-real-page", "/404"]) {
      const response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 404);
      await page.getByRole("heading", { name: "Halaman Tidak Ditemui", exact: true }).waitFor();
      await page.getByRole("button", { name: authenticated ? "Kembali ke Dashboard" : "Kembali ke Log Masuk", exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, route);
      assert.equal(await page.locator("main").count(), 1);
      assert.equal(await page.locator("#boot-shell").count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const headingFontSize = await page.locator("h1").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      assert.ok(headingFontSize >= 30, "Actual lazy-loaded production status CSS must be present.");
      checks.push(`${account}: real built ${route} keeps HTTP404 and authenticated CTA without redirect`);
    }
    await page.screenshot({ path: path.join(artifacts, `${account}-404.png`), fullPage: true });
    if (!authenticated) {
      await page.getByRole("button", { name: "Kembali ke Log Masuk", exact: true }).click();
      await page.getByTestId("input-username").waitFor();
      assert.equal(new URL(page.url()).pathname, "/login");
      for (const route of ["/login", "/collection/records", "/collection/billing-principal", "/general-search"]) {
        const response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
        assert.equal(response?.status(), 200);
        await page.getByTestId("input-username").waitFor();
        assert.equal(await page.getByTestId("system-status-page").count(), 0);
        checks.push(`anonymous: real built ${route} keeps HTTP200 and login guard on direct refresh`);
      }
    }
    await context.close();
  }
  authenticated = false;
  maintenance = true;
  manager.invalidateMaintenanceCache();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(`${origin}/general-search`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 503);
  await page.locator('[data-state="maintenance"]').waitFor();
  assert.equal(new URL(page.url()).pathname, "/general-search");
  await page.screenshot({ path: path.join(artifacts, "maintenance-503.png"), fullPage: true });
  maintenance = false;
  manager.invalidateMaintenanceCache();
  await page.locator("[data-status-primary]").click();
  await page.locator('[data-state="restored"]').waitFor();
  assert.equal(new URL(page.url()).pathname, "/general-search");
  assert.equal(await page.locator("[data-status-primary]").getAttribute("href"), "/");
  await page.screenshot({ path: path.join(artifacts, "maintenance-restored.png"), fullPage: true });
  checks.push("real built maintenance: HTTP503 at original route, shared styled view, explicit checked recovery without auto-navigation");
  await page.close();
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(externalRequests, []);
  passed = true;
  console.log(`PASS ${checks.length} real built application routing/recovery checks (synthetic APIs, no database or production).`);
} finally {
  await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ passed, scope: "Actual built application and document middleware; synthetic API/account state only", checks, pageErrors, externalRequests }, null, 2));
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
