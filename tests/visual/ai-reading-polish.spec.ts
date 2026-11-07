import { expect, test, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

declare global {
  interface Window {
    __aiPolishStatusMessages: string[];
    __aiPolishStatusObserver: MutationObserver;
  }
}

const answer = "Ringkasan sintetik\n\n- Kutipan RM 100.00\n- Baki RM 25.00\n1. Semak rekod\n2. Sahkan jumlah\n\n```txt\nrujukan 000123\n```\n```txt\njumlah 100.00\n```\n\n"
  + Array.from({ length: 60 }, (_, index) => `Baris ${index + 1}: Butiran sintetik untuk semakan ruang bacaan.`).join("\n")
  + "\nAkhir jawapan sintetik.";

async function openChat(page: Page, baseURL: string | undefined, surface: "full" | "floating", theme: "light" | "dark", width: number, height = 900) {
  await page.setViewportSize({ width, height });
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem("perf_mode", "low");
  });
  await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
  } }));
  await page.route((url) => url.pathname === "/api/ai/search", (route) => route.fulfill({ json: {
    ai_explanation: route.request().postDataJSON().query === "Ringkas" ? "Jawapan sintetik ringkas." : answer,
  } }));
  await page.goto(surface === "full" ? "/ai" : "/viewer");
  if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
  const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  await expect(input).toBeVisible();
  const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
  const reset = root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true });
  return { fixture, root, input, log, send, reset };
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const log = document.querySelector<HTMLElement>('[role="log"][aria-label="Perbualan AI SQR"]')!;
    const input = document.querySelector<HTMLTextAreaElement>("#ai-conversation-query")!;
    const card = document.querySelector<HTMLElement>(".ai-conversation-card")!;
    return { viewport: { width: innerWidth, height: innerHeight }, logHeight: log.clientHeight,
      logScrollHeight: log.scrollHeight, cardTop: card.getBoundingClientRect().top, cardBottom: card.getBoundingClientRect().bottom,
      inputHeight: input.getBoundingClientRect().height, inputBottom: input.getBoundingClientRect().bottom,
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
  });
}

for (const surface of ["full", "floating"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1366]) {
      test(`AI reference composer ${surface} ${theme} ${width}px: pill input and unboxed send`, async ({ page, baseURL }, testInfo) => {
        const { fixture, root, input, send } = await openChat(page, baseURL, surface, theme, width);
        const row = root.locator(surface === "full" ? ".ai-composer-row" : ".ai-input-container");
        await expect(input).toHaveAttribute("rows", "1");
        await expect(input).toHaveAttribute("placeholder", "Taip mesej...");
        await expect(input).toHaveCSS("font-size", "16px");
        await expect(input).toHaveCSS("border-radius", "24px");
        const emptyHeight = (await input.boundingBox())!.height;
        expect(emptyHeight).toBeGreaterThanOrEqual(44); expect(emptyHeight).toBeLessThanOrEqual(48);
        await expect(send).toBeDisabled();
        await expect(send).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(send).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
        await input.blur();
        await row.screenshot({ path: testInfo.outputPath(`ai-reference-${surface}-${theme}-${width}-empty.jpg`), type: "jpeg", quality: 75 });
        const text = Array.from({ length: 5 }, (_, i) => `Baris ${i + 1}: contoh mesej.`).join("\n");
        await input.fill(text); await input.press("Control+End");
        await expect(send).toBeEnabled();
        const tall = (await input.boundingBox())!.height;
        expect(tall).toBeGreaterThan(emptyHeight + 60); expect(tall).toBeLessThanOrEqual(144);
        await expect(input).toHaveValue(text);
        const boxes = await row.evaluate((node) => {
          const input = node.querySelector("textarea")!.getBoundingClientRect();
          const button = node.querySelector('[data-ai-action="send"]')!.getBoundingClientRect();
          const icon = node.querySelector(".ai-send-icon")!.getBoundingClientRect();
          return { inputRight: input.right, inputBottom: input.bottom, buttonLeft: button.left, buttonBottom: button.bottom,
            buttonWidth: button.width, buttonHeight: button.height, iconWidth: icon.width, iconHeight: icon.height,
            scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth };
        });
        expect(boxes.buttonLeft - boxes.inputRight).toBeGreaterThanOrEqual(7);
        expect(Math.abs(boxes.buttonBottom - boxes.inputBottom)).toBeLessThanOrEqual(1);
        expect(boxes.buttonWidth).toBeGreaterThanOrEqual(44); expect(boxes.buttonHeight).toBeGreaterThanOrEqual(44);
        expect(boxes.iconWidth).toBe(26); expect(boxes.iconHeight).toBe(26);
        expect(boxes.scroll).toBeLessThanOrEqual(boxes.width + 1);
        await input.blur();
        await row.screenshot({ path: testInfo.outputPath(`ai-reference-${surface}-${theme}-${width}-multiline.jpg`), type: "jpeg", quality: 75 });
        // Separately verify overflow/caret behavior beyond the five-row visual
        // reference; the cropped comparison above represents exactly five rows.
        await input.fill(text.repeat(4)); await input.press("Control+End");
        expect((await input.boundingBox())!.height).toBeLessThanOrEqual(144);
        await expect.poll(() => input.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        await input.fill("");
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(emptyHeight + 1);
        expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
      });
    }
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 1920]) {
    // Neutral measurement/capture, intentionally identical for before and after.
    // Acceptance of the new behavior is asserted separately below.
    test(`AI reading polish evidence ${theme} ${width}px`, async ({ page, baseURL }, testInfo) => {
      const { fixture, root, input, log, send } = await openChat(page, baseURL, "full", theme, width, width === 1920 ? 1080 : 900);
      const empty = await geometry(page);
      await input.fill("Ringkas"); await send.click();
      await expect(log).toContainText("Jawapan sintetik ringkas."); await expect(input).toBeEnabled();
      const short = await geometry(page);
      await root.screenshot({ path: testInfo.outputPath(`ai-reading-polish-${theme}-${width}-short.jpg`), type: "jpeg", quality: 60 });
      await input.fill("Panjang"); await send.click();
      await expect(log).toContainText("Akhir jawapan sintetik."); await expect(input).toBeEnabled();
      const long = await geometry(page);
      await log.evaluate((node) => { node.scrollTop = 0; });
      await root.screenshot({ path: testInfo.outputPath(`ai-reading-polish-${theme}-${width}-long.jpg`), type: "jpeg", quality: 60 });
      await input.fill(Array.from({ length: 10 }, (_, i) => `Baris draf ${i + 1}`).join("\n"));
      const draft = await geometry(page);
      console.log("AI_READING_POLISH_GEOMETRY=" + JSON.stringify({ theme, width, empty, short, long, draft }));
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });
  }
}

for (const surface of ["full", "floating"] as const) {
  test(`AI reading polish status ${surface}: phase announcements stay separate from reveal text`, async ({ page, baseURL }) => {
    const { fixture, root, input, log, send } = await openChat(page, baseURL, surface, "dark", surface === "full" ? 1366 : 375);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const status = root.getByRole("status", { name: "Status AI SQR", exact: true });
    await expect(status).toBeEmpty();
    await status.evaluate((node) => {
      window.__aiPolishStatusMessages = [];
      window.__aiPolishStatusObserver = new MutationObserver(() => {
        const text = node.textContent?.trim() ?? "";
        const messages = window.__aiPolishStatusMessages;
        if (messages[messages.length - 1] !== text) messages.push(text);
      });
      window.__aiPolishStatusObserver.observe(node, { childList: true, subtree: true, characterData: true });
    });
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
      await held;
      await route.fulfill({ json: { ai_explanation: "A".repeat(4000) } });
    });
    try {
      await input.fill("Status sintetik"); await send.click();
      await expect(status).toContainText("AI sedang mencari maklumat");
      await expect(log).toHaveAttribute("aria-busy", "true");
      release();
      await expect(status).toContainText("AI sedang menaip jawapan");
      await expect(input).toBeEnabled({ timeout: 12000 });
      await expect(log).toHaveAttribute("aria-busy", "false");
      await expect(status).toBeEmpty();
      const messages = await page.evaluate(() => {
        window.__aiPolishStatusObserver.disconnect();
        return window.__aiPolishStatusMessages;
      });
      expect(messages.some((message) => message.includes("mencari maklumat"))).toBe(true);
      expect(messages.some((message) => message.includes("menaip jawapan"))).toBe(true);
      expect(messages.length).toBeLessThanOrEqual(8);
      expect(messages.join(" ")).not.toContain("AAAA");
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    } finally { release(); }
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const [height, scale] of [[600, 1], [450, 1], [900, 2]] as const) {
    test(`AI reading polish extremes ${theme} height${height} scale${scale}: composer stays reachable`, async ({ page, baseURL }) => {
      const { fixture, input, log, send } = await openChat(page, baseURL, "full", theme, 1366, height);
      if (scale !== 1) await page.evaluate((factor) => { document.documentElement.style.fontSize = `${16 * factor}px`; }, scale);
      await input.fill("Panjang"); await send.click();
      await expect(log).toContainText("Akhir jawapan sintetik."); await expect(input).toBeEnabled();
      await input.fill(Array.from({ length: 10 }, (_, i) => `Baris draf ${i}`).join("\n"));
      await input.focus();
      // Centre the editable box after caret focus, rather than relying on the
      // browser's minimal, fractional-pixel automatic scroll at a short viewport.
      await input.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
      await expect(input).toBeVisible(); await expect(input).toBeFocused();
      const bounds = await input.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1367);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
      console.log("AI_READING_POLISH_EXTREME=" + JSON.stringify(await geometry(page)));
      expect(await log.evaluate((node) => node.clientHeight)).toBeGreaterThan(80);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      if (height === 450) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(height);
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    });
  }
}

test("AI reading polish crowded full: queued retry preserves a readable log and five-row draft", async ({ page, baseURL }) => {
  const { fixture, root, input, log, send } = await openChat(page, baseURL, "full", "light", 1024, 600);
  await input.fill("Panjang"); await send.click();
  await expect(log).toContainText("Akhir jawapan sintetik."); await expect(input).toBeEnabled();
  let attempts = 0, release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: { message: "Synthetic temporary failure" } });
    if (attempts === 2) return route.fulfill({ headers: { "x-ai-gate-wait-ms": "2000" }, json: { processing: true } });
    await held;
    if (!route.request().failure()) await route.fulfill({ json: { ai_explanation: "Queue completed." } });
  });
  try {
    await input.fill("Pulih"); await send.click();
    const retry = root.getByRole("button", { name: "Cuba semula soalan terakhir", exact: true });
    await expect(retry).toBeVisible();
    const draft = Array.from({ length: 10 }, (_, i) => `Draf ${i}`).join("\n");
    await input.fill(draft); await retry.click();
    await expect(root.getByText("Jawapan mengambil masa lebih lama daripada biasa.", { exact: true })).toBeVisible();
    await expect(root.getByRole("status", { name: "Status AI SQR", exact: true })).not.toBeEmpty();
    await log.evaluate((node) => { node.scrollTop = 0; });
    await expect(root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
    console.log("AI_READING_POLISH_CROWDED=" + JSON.stringify(await geometry(page)));
    expect(await log.evaluate((node) => node.clientHeight)).toBeGreaterThan(80);
    await expect(input).toHaveValue(draft);
    release(); await expect(input).toBeEnabled({ timeout: 10000 });
    await expect(log).toContainText("Queue completed.");
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  } finally { release(); }
});

for (const theme of ["light", "dark"] as const) {
  for (const [surface, widths] of [["full", [320, 768, 1024, 1366, 1920]], ["floating", [375]]] as const) {
    for (const width of widths) {
      test(`AI reading polish behavior ${surface} ${theme} ${width}px`, async ({ page, baseURL }, testInfo) => {
        const { fixture, root, input, log, send, reset } = await openChat(page, baseURL, surface, theme, width);
        const cpu = width === 320 ? 6 : width === 768 ? 4 : 1;
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
        const emptyHeight = (await log.boundingBox())!.height;
        await input.fill("Ringkas"); await send.click();
        await expect(log).toContainText("Jawapan sintetik ringkas."); await expect(input).toBeEnabled();
        expect((await log.boundingBox())!.height).toBeLessThan(240);
        expect(emptyHeight).toBeLessThan(160);
        if (surface === "full" && width === 1366) {
          await reset.hover();
          await expect(page.getByRole("tooltip", { name: "Sembang Baharu", exact: true })).toBeVisible();
          await input.hover();
          // Radix installs its hoverable-content grace polygon on pointerleave;
          // continue a real pointer path after that event instead of teleporting
          // once and leaving the pointer stationary before the listener mounts.
          const inputBox = (await input.boundingBox())!;
          await page.mouse.move(inputBox.x + 20, inputBox.y + inputBox.height / 2, { steps: 5 });
          await expect(page.getByRole("tooltip", { name: "Sembang Baharu", exact: true })).toHaveCount(0);
        }
        await reset.focus();
        await expect(page.getByRole("tooltip", { name: "Sembang Baharu", exact: true })).toBeVisible();
        if ((surface === "full" && theme === "light" && width === 1366) || (surface === "floating" && theme === "dark" && width === 375)) {
          await page.screenshot({ path: testInfo.outputPath(`ai-reading-polish-${surface}-${theme}-${width}-tooltip.jpg`), type: "jpeg", quality: 60 });
        }
        if (surface === "full") await page.keyboard.press("Escape");
        await input.focus();
        await input.fill("Panjang"); await send.focus();
        await expect(page.getByRole("tooltip").filter({ hasText: "Hantar" })).toBeVisible();
        if (surface === "full") await page.keyboard.press("Escape");
        await send.click();
        await expect(log).toContainText("Akhir jawapan sintetik."); await expect(input).toBeEnabled();
        await expect(log).toHaveAttribute("aria-busy", "false");
        await expect(root.getByRole("status", { name: "Status AI SQR", exact: true })).toBeEmpty();
        for (const selector of ["ul + ol", "pre + pre"]) {
          const gap = await log.locator(selector).first().evaluate((node) => Number.parseFloat(getComputedStyle(node).marginTop));
          expect(gap).toBeGreaterThanOrEqual(11);
          expect(gap).toBeLessThanOrEqual(13);
        }
        if (surface === "full" && width >= 1024) {
          const actual = await geometry(page);
          expect(actual.logHeight).toBeGreaterThan(470);
          expect(actual.inputBottom).toBeLessThanOrEqual(actual.viewport.height);
          await input.fill(Array.from({ length: 10 }, (_, i) => `Baris ${i}`).join("\n"));
          const grown = await geometry(page);
          expect(grown.inputHeight).toBeGreaterThan(actual.inputHeight + 40);
          expect(grown.logHeight).toBeLessThan(actual.logHeight);
          expect(grown.cardBottom).toBeLessThanOrEqual(grown.viewport.height + 1);
        }
        await log.evaluate((node) => { node.scrollTop = 0; });
        const jump = root.getByRole("button", { name: "Ke mesej terkini", exact: true });
        await expect(jump).toBeVisible(); await jump.focus();
        await expect(page.getByRole("tooltip", { name: "Ke mesej terkini", exact: true })).toBeVisible();
        if (surface === "full") await page.keyboard.press("Escape");
        await log.focus();
        await expect(root.getByText("AI idle.", { exact: true })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
        expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
      });
    }
  }
}
