import { expect, test, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";
import { appConfigResponseSchema } from "../../shared/api-contracts";

async function openAI(page: Page, baseURL: string | undefined, surface: "full" | "floating", config = { enabled: true }) {
  await page.setViewportSize({ width: surface === "full" ? 1366 : 375, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme: surface === "full" ? "light" : "dark" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem("perf_mode", "low");
  });
  await page.route((url) => url.pathname === "/api/app-config", (route) => route.fulfill({ json: appConfigResponseSchema.parse({
    systemName: "SQR", aiEnabled: config.enabled, aiTimeoutMs: 1000, heartbeatIntervalMinutes: 60,
    sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    semanticSearchEnabled: false, searchResultLimit: 250, importUploadLimitBytes: 10 * 1024 * 1024,
  }) }));
  await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
  } }));
  await page.goto(surface === "full" ? "/ai" : "/viewer");
  if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
  const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  await expect(input).toBeVisible();
  const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
  const retry = root.getByRole("button", { name: "Cuba semula soalan terakhir", exact: true });
  const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  return { fixture, root, input, send, retry, log };
}

for (const surface of ["full", "floating"] as const) {
  for (const failure of ["401", "403", "429", "retry-after", "gate"] as const) {
    test(`AI retry boundaries ${surface} ${failure}: preserves server restrictions`, async ({ page, baseURL }) => {
      let requests = 0;
      await page.route((url) => url.pathname === "/api/ai/search", (route) => {
        requests++;
        return route.fulfill({ status: failure === "retry-after" || failure === "gate" ? 503 : Number(failure),
          headers: failure === "retry-after" ? { "Retry-After": "60" } : {},
          json: { message: "Synthetic restricted response", ...(failure === "gate" ? { gate: { queueSize: 1, queueLimit: 1, queueWaitMs: 1000 } } : {}) } });
      });
      const { fixture, input, send, retry, log } = await openAI(page, baseURL, surface);
      await input.fill("Sekatan sintetik"); await send.click();
      await expect(log).toContainText("Synthetic restricted response");
      await expect(input).toBeEnabled(); await expect(retry).toHaveCount(0);
      expect(requests).toBe(1);
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });
  }

  test(`AI retry boundaries ${surface} timeout: settles and manually retries once`, async ({ page, baseURL }) => {
    let count = 0, release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
      count++;
      if (count === 1) { await held; if (route.request().failure()) return; }
      await route.fulfill({ json: { ai_explanation: "Timeout recovery complete." } });
    });
    try {
      const { fixture, input, send, retry, log } = await openAI(page, baseURL, surface);
      await input.fill("Timeout sintetik"); await send.click();
      await expect(retry).toBeVisible({ timeout: 5000 }); await expect(input).toBeEnabled();
      await expect(log).toContainText("AI tidak dapat memproses permintaan sekarang.");
      release(); await retry.click();
      await expect(log).toContainText("Timeout recovery complete.");
      await expect(input).toBeEnabled(); await expect(retry).toHaveCount(0);
      expect(count).toBe(2);
      await expect(log.getByRole("article", { name: "Mesej pengguna", exact: true })).toHaveCount(1);
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    } finally { release(); }
  });

  test(`AI retry boundaries ${surface} lifecycle: disabled, reset and unmount invalidate recovery`, async ({ page, baseURL }) => {
    let requests = 0;
    await page.route((url) => url.pathname === "/api/ai/search", (route) => {
      requests++;
      return route.fulfill({ status: 503, json: { message: "Synthetic temporary failure" } });
    });
    const config = { enabled: true };
    const { fixture, root, input, send, retry } = await openAI(page, baseURL, surface, config);
    await input.fill("Lama"); await send.click(); await expect(retry).toBeVisible();
    config.enabled = false;
    await page.evaluate(() => window.dispatchEvent(new Event("settings-updated")));
    // Shell-level disable unmounts AI. Wait for the replacement to commit,
    // rather than mistaking Suspense's hidden old tree for a completed disable.
    if (surface === "full") await expect(page.locator(".general-search-page")).toBeVisible();
    await expect(page.locator(surface === "full" ? "#ai-conversation-query" : '[data-floating-ai-dialog="true"] textarea')).toHaveCount(0);
    await expect(retry).toHaveCount(0);
    config.enabled = true;
    await page.evaluate(() => window.dispatchEvent(new Event("settings-updated")));
    if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
    await expect(input).toBeEnabled(); await expect(retry).toHaveCount(0);
    await input.fill("Reset"); await send.click(); await expect(retry).toBeVisible();
    await root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true }).click();
    await expect(retry).toHaveCount(0);
    await input.fill("Unmount"); await send.click(); await expect(retry).toBeVisible();
    if (surface === "full") {
      // SQR's authenticated shell owns navigation state; exercise its real
      // controls rather than treating URL history as a full application router.
      await page.getByTestId("nav-group-workspace").click();
      await page.getByTestId("flyout-nav-viewer").click();
      await expect(input).toHaveCount(0);
      await expect(page.locator("#viewer-dataset-title")).toBeVisible();
      await page.goto("/ai");
      await expect(input).toBeVisible();
    } else {
      await input.focus(); await page.keyboard.press("Escape"); await expect(root).toBeHidden();
      await page.getByTestId("floating-ai-toggle").click(); await expect(input).toBeVisible();
    }
    await expect(retry).toHaveCount(0); expect(requests).toBe(3);
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  });
}
