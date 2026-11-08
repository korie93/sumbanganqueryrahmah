import { expect, test, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

type Surface = "full" | "floating";
const longAnswer = Array.from({ length: 90 }, (_, i) => `Baris ${i + 1}: Semakan sintetik bagi ruang bacaan AI.`).join("\n") + "\nJawapan sintetik selesai.";

async function openChat(page: Page, baseURL: string | undefined, surface: Surface, theme: "light" | "dark", width: number) {
  await page.setViewportSize({ width, height: 900 });
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem("perf_mode", "low");
  });
  await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
  } }));
  let queueRequests = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
    if (route.request().postDataJSON().query === "Giliran") {
      queueRequests++;
      if (queueRequests === 1) return route.fulfill({ headers: { "x-ai-gate-wait-ms": "1200" }, json: { processing: true } });
      await held;
      if (route.request().failure()) return;
    }
    await route.fulfill({ json: { ai_explanation: longAnswer } });
  });
  await page.goto(surface === "full" ? "/ai" : "/viewer");
  if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
  const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  await expect(input).toBeVisible();
  const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
  const reset = root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true });
  return { fixture, root, input, log, send, reset, release };
}

for (const surface of ["full", "floating"] as const) for (const theme of ["light", "dark"] as const) {
  const width = theme === "light" ? 1366 : 375;
  test(`AI space evidence ${surface} ${theme} ${width}px`, async ({ page, baseURL }, testInfo) => {
    const { fixture, root, input, log, send, reset, release } = await openChat(page, baseURL, surface, theme, width);
    const capture = async (state: string) => {
      await page.mouse.move(0, 0); await input.blur();
      await root.screenshot({ path: testInfo.outputPath(`ai-space-${surface}-${theme}-${width}-${state}.jpg`), type: "jpeg", quality: 65, animations: "disabled" });
      console.log("AI_SPACE_GEOMETRY=" + JSON.stringify(await root.evaluate((node, state) => {
        const input = node.querySelector("textarea")!.getBoundingClientRect();
        const log = node.querySelector('[role="log"]')!.getBoundingClientRect();
        const header = node.querySelector("header")?.getBoundingClientRect();
        return { state, inputY: input.y, logHeight: log.height, headerHeight: header?.height ?? null };
      }, state)));
    };
    try {
      await capture("empty");
      await input.fill("Giliran"); await send.click();
      await expect(root.getByRole("status", { name: "Status AI SQR", exact: true })).toContainText(/queued/);
      await expect(root.getByRole("status", { name: "AI SQR sedang menyediakan jawapan...", exact: true })).toBeVisible();
      await capture("queue");
      await root.getByRole("button", { name: "Hentikan AI SQR", exact: true }).click();
      await reset.click();
      await input.fill("Bacaan"); await send.click();
      await expect(log).toContainText("Jawapan sintetik selesai."); await expect(input).toBeEnabled();
      await log.evaluate((node) => { node.scrollTop = 0; });
      await expect(root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
      await capture("reading");
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    } finally { release(); }
  });
}

for (const surface of ["full", "floating"] as const) for (const theme of ["light", "dark"] as const) for (const width of [320, 375, 768, 1366]) {
  test(`AI space behavior ${surface} ${theme} ${width}px`, async ({ page, baseURL }) => {
    const { fixture, root, input, log, send, reset, release } = await openChat(page, baseURL, surface, theme, width);
    try {
      const description = surface === "floating" ? root.locator("header p") : null;
      if (surface === "floating") {
        const mode = await root.getAttribute("data-floating-ai-panel-mode");
        expect((await root.locator("header").boundingBox())!.height).toBe(width >= 768 ? 48 : mode === "fullscreen" ? 64 : 56);
        await expect(description!).toBeVisible();
        await expect(root).toHaveAccessibleDescription("Bantuan untuk koleksi dan rekod SQR.");
      }
      await input.fill("Giliran"); await send.click();
      const feedback = root.locator('[data-ai-feedback="true"]');
      await expect(feedback).toHaveCount(1); await expect(feedback).toContainText(/queued/);
      await expect(feedback).not.toContainText("AI sedang memproses data...");
      const announcement = root.getByRole("status", { name: "Status AI SQR", exact: true });
      await expect(announcement).toHaveCount(1); await expect(announcement).toContainText(/queued/);
      await expect(root.locator(".ai-notice:not(.ai-notice-error)")).toHaveCount(0);
      await expect(root.getByRole("status", { name: "AI SQR sedang menyediakan jawapan...", exact: true })).toBeVisible();
      if (surface === "floating") {
        if (width >= 768) await expect(description!).toHaveClass(/sr-only/);
        else await expect(description!).not.toHaveClass(/sr-only/);
        await expect(root).toHaveAccessibleDescription("Bantuan untuk koleksi dan rekod SQR.");
      }
      await root.getByRole("button", { name: "Hentikan AI SQR", exact: true }).click();
      await reset.click();
      await input.fill("Bacaan"); await send.click();
      await expect(log).toContainText("Jawapan sintetik selesai."); await expect(input).toBeEnabled();
      await expect(feedback).toHaveCount(0);
      await expect(root.getByText("AI idle.", { exact: true })).toHaveCount(0);
      if (width === 375 || width === 1366) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: width === 375 ? 6 : 4 });
      }
      const before = { input: (await input.boundingBox())!, log: (await log.boundingBox())! };
      await log.evaluate((node) => { node.scrollTop = 0; });
      const jump = root.getByRole("button", { name: "Ke mesej terkini", exact: true });
      await expect(jump).toBeVisible(); await expect(jump).toHaveText("");
      await expect(log.getByRole("button")).toHaveCount(0);
      expect(await jump.evaluate((node) => node.closest(".ai-jump-to-latest")?.parentElement === document.getElementById(node.getAttribute("aria-controls")!)?.parentElement)).toBe(true);
      expect(Math.abs((await input.boundingBox())!.y - before.input.y)).toBeLessThanOrEqual(1);
      expect(Math.abs((await log.boundingBox())!.height - before.log.height)).toBeLessThanOrEqual(1);
      const arrow = (await jump.boundingBox())!, viewport = (await log.boundingBox())!;
      expect(arrow.x).toBeGreaterThanOrEqual(viewport.x); expect(arrow.x + arrow.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1);
      expect(arrow.y).toBeGreaterThanOrEqual(viewport.y); expect(arrow.y + arrow.height).toBeLessThanOrEqual(viewport.y + viewport.height);
      await jump.focus(); await jump.press("Enter"); await expect(jump).toBeFocused();
      await expect.poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(2);
      const lastLine = log.locator(".ai-bubble-assistant span, .ai-page-message-row .ai-page-bubble span").last();
      expect((await lastLine.boundingBox())!.y + (await lastLine.boundingBox())!.height).toBeLessThanOrEqual((await jump.boundingBox())!.y - 4);
      await page.keyboard.press("Tab"); await expect(input).toBeFocused();
      await expect(jump).toHaveCount(0);
      await input.fill(Array.from({ length: 5 }, (_, i) => `Draf baris ${i + 1}`).join("\n"));
      expect((await input.boundingBox())!.height).toBeLessThanOrEqual(144);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await reset.click(); await expect(input).toHaveValue("");
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    } finally { release(); }
  });
}
