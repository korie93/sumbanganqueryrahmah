import { expect, test } from "@playwright/test";
import { AI_CANCEL_EVENT } from "../../client/src/lib/ai-chat";
import { installFixture } from "./helpers/save-collection-fixture";

for (const surface of ["full", "floating"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 375, 768, 1366]) {
      test(`AI composer ${surface} ${theme} ${width}px: growth, formatting and manual recovery`, async ({ page, baseURL }, testInfo) => {
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
        const answer = "Ringkasan sintetik 000123\n\n- Kutipan RM 100.00\n- Baki RM 25.00\n\n1. Semak rekod\n2. Sahkan jumlah\n\n```txt\n  rujukan 000123\n\tjumlah 100.00\n```";
        const requests: string[] = [];
        let mode: "answer" | "error" | "held" = "answer";
        let releaseRetry = () => {};
        const held = new Promise<void>((resolve) => { releaseRetry = resolve; });
        await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
          requests.push((route.request().postDataJSON() as { query: string }).query);
          const current = mode;
          if (current === "held") await held;
          if (current === "error") return route.fulfill({ status: 503, json: { message: "Synthetic temporary failure" } });
          await route.fulfill({ json: { ai_explanation: current === "held" ? "Pulih siap 000123." : answer } });
        });
        try {
          await page.goto(surface === "full" ? "/ai" : "/viewer");
          if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
          const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
          const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
          const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
          const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
          const retry = root.getByRole("button", { name: "Cuba semula soalan terakhir", exact: true });
          const stop = root.getByRole("button", { name: "Hentikan AI SQR", exact: true });
          const reset = root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true });
          await expect(input).toBeVisible();
          await expect(retry).toHaveCount(0);
          const initial = (await input.boundingBox())!.height;
          const session = await page.context().newCDPSession(page);
          const cpu = width === 320 ? 6 : width === 768 ? 4 : 1;
          await session.send("Emulation.setCPUThrottlingRate", { rate: cpu });
          const longQuery = Array.from({ length: 12 }, (_, i) => `Baris ${i + 1}: soalan sintetik untuk semakan.`).join("\n");
          await input.fill(longQuery);
          const metrics = await input.evaluate((node: HTMLTextAreaElement) => {
            const css = getComputedStyle(node);
            return { height: node.getBoundingClientRect().height, line: Number.parseFloat(css.lineHeight),
              decoration: Number.parseFloat(css.paddingTop) + Number.parseFloat(css.paddingBottom)
                + Number.parseFloat(css.borderTopWidth) + Number.parseFloat(css.borderBottomWidth),
              overflow: css.overflowY, scroll: node.scrollHeight, client: node.clientHeight };
          });
          expect(metrics.height).toBeGreaterThan(initial + 10);
          expect(metrics.height).toBeLessThanOrEqual(metrics.line * 5 + metrics.decoration + 2);
          expect(metrics.overflow).toBe("auto"); expect(metrics.scroll).toBeGreaterThan(metrics.client);
          await input.press("Control+End");
          await expect.poll(() => input.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
          if ((surface === "full" && width === 1366 && theme === "light") || (surface === "floating" && width === 375 && theme === "dark")) {
            await root.screenshot({ path: testInfo.outputPath(`ai-composer-${surface}-${theme}-${width}-typed.jpg`), type: "jpeg", quality: 60 });
          }
          await input.fill("");
          await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(initial + 2);
          if (width === 1366) {
            const wrapped = "Soalan sintetik untuk semakan ruang ".repeat(3);
            await input.fill(wrapped);
            const wideHeight = (await input.boundingBox())!.height;
            await input.evaluate((node) => { node.style.maxWidth = "160px"; });
            await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(wideHeight + 10);
            await expect(input).toHaveValue(wrapped);
            await input.evaluate((node) => { node.style.removeProperty("max-width"); });
            await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(wideHeight + 2);
          }
          await input.fill("Format"); await input.press("Control+Enter");
          await expect(log.locator("ul li")).toHaveCount(2, { timeout: 10000 });
          await expect(log.locator("ol li")).toHaveCount(2);
          await expect(log.locator("ul")).toHaveCSS("list-style-type", "disc");
          await expect(log.locator("ol")).toHaveCSS("list-style-type", "decimal");
          await expect(log.getByRole("region", { name: "Kod dalam jawapan AI" })).toContainText("rujukan 000123");
          await expect(input).toBeEnabled({ timeout: 10000 }); await expect(stop).toHaveCount(0);
          await expect(log.locator("pre code")).toHaveText("  rujukan 000123\n\tjumlah 100.00");
          const afterSend = (await input.boundingBox())!.height;
          // Both composers keep the reference's one-row resting height after
          // sending; multiline input grows independently of conversation state.
          const emptyRowsHeight = await input.evaluate((node: HTMLTextAreaElement) => {
            const css = getComputedStyle(node);
            return Math.max(Number.parseFloat(css.minHeight), node.rows * Number.parseFloat(css.lineHeight)
              + Number.parseFloat(css.paddingTop) + Number.parseFloat(css.paddingBottom)
              + Number.parseFloat(css.borderTopWidth) + Number.parseFloat(css.borderBottomWidth));
          });
          expect(afterSend).toBeLessThanOrEqual(emptyRowsHeight + 2);
          expect(afterSend).toBeLessThan(metrics.height);
          mode = "error";
          await input.fill("Pulih"); await send.click();
          await expect(retry).toBeVisible(); await expect(retry).toHaveText("");
          expect(await retry.locator("svg").count()).toBe(1);
          expect((await retry.boundingBox())!.width).toBeGreaterThanOrEqual(44);
          await input.fill("Draf baharu belum dihantar");
          mode = "held";
          await retry.focus(); await page.keyboard.press("Enter");
          await expect.poll(() => requests.length).toBe(3);
          await expect(stop).toBeVisible(); await expect(stop).toBeFocused();
          await input.dispatchEvent("keydown", { key: "Enter", ctrlKey: true, repeat: true });
          expect(requests).toEqual(["Format", "Pulih", "Pulih"]);
          await expect(input).toHaveValue("Draf baharu belum dihantar");
          releaseRetry();
          await expect(log).toContainText("Pulih siap 000123.");
          await expect(input).toBeEnabled({ timeout: 10000 });
          await expect(input).toHaveValue("Draf baharu belum dihantar");
          await expect(retry).toHaveCount(0);
          await expect(log.getByRole("article", { name: "Mesej pengguna", exact: true }).filter({ hasText: "Pulih" })).toHaveCount(1);
          await expect(log.getByRole("button")).toHaveCount(0);
          await expect(root.getByRole("button", { name: "Salin jawapan", exact: true })).toHaveCount(0);
          if ((surface === "full" && width === 1366 && theme === "light") || (surface === "floating" && width === 375 && theme === "dark")) {
            await root.screenshot({ path: testInfo.outputPath(`ai-composer-${surface}-${theme}-${width}-reply.jpg`), type: "jpeg", quality: 60 });
          }
          const geometry = await root.evaluate((node) => {
            const r = node.getBoundingClientRect(), q = node.querySelector("textarea")!.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, right: r.right, inputBottom: q.bottom,
              width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
          });
          expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
          expect(geometry.right).toBeLessThanOrEqual(width + 1);
          if (surface === "floating") { expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(901); }
          expect(geometry.inputBottom).toBeLessThanOrEqual(geometry.bottom + 1);
          await input.fill(longQuery); await reset.click();
          await expect(input).toHaveValue("");
          await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(initial + 2);
          mode = "error";
          await input.fill("Batal"); await send.click(); await expect(retry).toBeVisible();
          await page.evaluate((name) => window.dispatchEvent(new Event(name)), AI_CANCEL_EVENT);
          await expect(retry).toHaveCount(0);
          expect(requests).toEqual(["Format", "Pulih", "Pulih", "Batal"]);
          expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
          console.log("AI_COMPOSER_RESULT=" + JSON.stringify({ surface, theme, width, cpu, initial, maxHeight: metrics.height,
            afterSend, requestCount: requests.length, draftPreserved: true, noDuplicateUserMessage: true, cancelInvalidatesRetry: true }));
        } finally { releaseRetry(); }
      });
    }
  }
}
