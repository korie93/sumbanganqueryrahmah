import { expect, test } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

declare global {
  interface Window {
    __aiCopyCalls: number;
  }
}

for (const surface of ["full", "floating"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 375, 1366]) {
      test(`AI compact ${surface} ${theme} ${width}px: layout, stop, keyboard and no copy controls`, async ({ page, baseURL }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme });
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
          localStorage.setItem("perf_mode", "low");
          window.__aiCopyCalls = 0;
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {
            window.__aiCopyCalls += 1;
          } } });
        });
        await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
        await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
          role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
        } }));
        const shortAnswer = "Rekod sintetik.\nNombor akaun: 0000123412341234\nJumlah: RM 220.00";
        const longAnswer = Array.from({ length: 40 }, (_, i) => `Baris ${i + 1}: Butiran sintetik untuk semakan ruang bacaan.`).join("\n") + "\nAkhir jawapan sintetik.";
        let releaseFirst = () => {};
        const held = new Promise<void>((resolve) => { releaseFirst = resolve; });
        const requests: string[] = [];
        await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
          requests.push((route.request().postDataJSON() as { query: string }).query);
          if (requests.length === 1) await held;
          await route.fulfill({ json: { ai_explanation: requests.length === 1 ? shortAnswer : longAnswer } });
        });
        try {
          await page.goto(surface === "full" ? "/ai" : "/viewer");
          if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
          const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
          const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
          const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
          const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
          const stop = root.getByRole("button", { name: "Hentikan AI SQR", exact: true });
          const copies = root.getByRole("button", { name: "Salin jawapan", exact: true });
          await expect(input).toBeVisible(); await expect(send).toBeDisabled(); await expect(stop).toHaveCount(0);
          await expect(root.getByText("AI idle.", { exact: true })).toHaveCount(0);
          await expect(copies).toHaveCount(0);
          await expect(root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true })).toHaveCount(0);
          if (surface === "full" || width > 340) await expect.poll(async () => (await log.boundingBox())?.height ?? 1000).toBeLessThan(110);
          const emptyHeight = (await root.boundingBox())!.height;
          if (surface === "floating" && width > 340) expect(emptyHeight).toBeLessThan(380);
          await input.fill("   "); await expect(send).toBeDisabled(); await input.press("Control+Enter");
          expect(requests).toEqual([]);
          await input.fill("Soalan sintetik");
          await input.dispatchEvent("keydown", { key: "Enter", ctrlKey: true, isComposing: true });
          await input.dispatchEvent("keydown", { key: "Enter", ctrlKey: true, repeat: true });
          expect(requests).toEqual([]);
          await input.press("Enter"); await expect(input).toHaveValue("Soalan sintetik\n");
          await input.press("Control+Enter");
          await expect.poll(() => requests.length).toBe(1);
          await expect(stop).toBeVisible(); await expect(stop).toHaveText("");
          expect(await stop.locator("svg").count()).toBe(1);
          const stopBox = (await stop.boundingBox())!; expect(stopBox.width).toBeGreaterThanOrEqual(44); expect(stopBox.height).toBeGreaterThanOrEqual(44);
          if (width !== 320) await root.screenshot({ path: testInfo.outputPath(`ai-compact-${surface}-${theme}-${width}-stop.jpg`), type: "jpeg", quality: 55 });
          await expect(copies).toHaveCount(0); releaseFirst();
          await expect(input).toBeEnabled({ timeout: 10000 });
          await expect(log).toContainText("0000123412341234"); await expect(stop).toHaveCount(0);
          const reset = root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true });
          await expect(reset).toHaveText("");
          await reset.focus();
          await expect(page.getByRole("tooltip", { name: "Sembang Baharu", exact: true })).toBeVisible();
          await input.focus();
          expect(await reset.locator("svg").count()).toBe(1);
          await expect(copies).toHaveCount(0);
          await expect(log.getByRole("button")).toHaveCount(0);
          await expect(log.locator(".ai-message-tools")).toHaveCount(0);
          if (surface === "full") {
            await expect(input).toHaveCSS("resize", "none");
            const bounds = await root.locator(".ai-conversation-card").boundingBox();
            expect(bounds!.width).toBeLessThanOrEqual(896);
          }
          const shortHeight = (await root.boundingBox())!.height;
          expect(shortHeight).toBeGreaterThanOrEqual(emptyHeight);
          const shortLogHeight = (await log.boundingBox())!.height;
          if (surface === "full") expect(shortLogHeight).toBeLessThan(340);
          if (surface === "floating" && width > 340) {
            const cap = await root.evaluate((node) => Number.parseFloat(node.parentElement!.style.getPropertyValue("--floating-ai-panel-height")));
            expect(shortHeight).toBeLessThan(cap - 8);
          }
          console.log("AI_COMPACT_HEIGHTS " + JSON.stringify({ surface, theme, width, emptyHeight, shortHeight, shortLogHeight }));
          // The answer remains selectable through the browser's native text selection.
          const selected = await log.evaluate((node) => {
            const bubble = node.querySelector(".ai-bubble-assistant, .ai-page-message-row.mr-auto .ai-page-bubble")!;
            const selection = window.getSelection()!, range = document.createRange();
            range.selectNodeContents(bubble); selection.removeAllRanges(); selection.addRange(range);
            const text = selection.toString(); selection.removeAllRanges(); return text;
          });
          expect(selected).toContain("0000123412341234");
          if (width !== 320) await root.screenshot({ path: testInfo.outputPath(`ai-compact-${surface}-${theme}-${width}-reply.jpg`), type: "jpeg", quality: 55 });
          await input.fill("Panjang sintetik"); await input.press("Meta+Enter");
          await expect(log).toContainText("Akhir jawapan sintetik."); await expect(input).toBeEnabled({ timeout: 10000 });
          expect(requests).toEqual(["Soalan sintetik", "Panjang sintetik"]);
          await expect(copies).toHaveCount(0);
          await expect(log.getByRole("button")).toHaveCount(0);
          await expect(log.locator(".ai-message-tools")).toHaveCount(0);
          await log.evaluate((node) => { node.scrollTop = 0; });
          const jump = root.getByRole("button", { name: "Ke mesej terkini", exact: true });
          await expect(jump).toBeVisible();
          await expect(jump).toHaveText("");
          await jump.focus();
          await expect(page.getByRole("tooltip", { name: "Ke mesej terkini", exact: true })).toBeVisible();
          await log.focus();
          expect(await jump.locator("svg").count()).toBe(1);
          await log.focus(); await page.keyboard.press("End");
          await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
          const geometry = await root.evaluate((node) => {
            const log = node.querySelector('[role="log"]')!;
            const input = node.querySelector("textarea")!;
            const r = node.getBoundingClientRect(), q = input.getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, inputRight: q.right,
              inputBottom: q.bottom, scroll: log.scrollHeight, client: log.clientHeight,
              documentWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
          });
          expect(geometry.scroll).toBeGreaterThan(geometry.client);
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.documentWidth + 1);
          if (surface === "floating") {
            expect(geometry.y).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(901);
            expect(geometry.inputBottom).toBeLessThanOrEqual(geometry.bottom);
          }
          await root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true }).click();
          await expect(copies).toHaveCount(0); await expect(send).toBeDisabled();
          expect(await page.evaluate(() => window.__aiCopyCalls)).toBe(0);
          if (surface === "full" || width > 340) await expect.poll(async () => (await log.boundingBox())?.height ?? 1000).toBeLessThan(110);
          expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
        } finally { releaseFirst(); }
      });
    }
  }
}
