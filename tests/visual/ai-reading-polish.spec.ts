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
  test(`AI reading polish stability ${surface}: growing answer blocks retain their DOM while history stays usable`, async ({ page, baseURL }) => {
    const { fixture, root, input, log, send } = await openChat(page, baseURL, surface, surface === "full" ? "light" : "dark", surface === "full" ? 1366 : 375);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const cspErrors: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|violates.*(?:directive|Trusted)/i.test(message.text())) cspErrors.push(message.text());
    });
    // Keep substantial finalized history in place before the next answer and
    // user draft are rendered. All response data is synthetic and local.
    await input.fill("Panjang"); await send.click();
    await expect(log).toContainText("Akhir jawapan sintetik.");
    await expect(log).toHaveAttribute("aria-busy", "false");
    await input.fill("Draf dengan sejarah panjang 000123 🧾");
    await input.press("End"); await input.press("!");
    await expect(input).toHaveValue("Draf dengan sejarah panjang 000123 🧾!");
    await log.evaluate((node) => { node.scrollTop = 0; });
    await expect(root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
    const paragraphLines = ["Stability paragraph 000123 🧾", ...Array.from({ length: 24 }, (_, i) => `Baris stabil ${i + 1}: Teks sintetik panjang untuk memastikan baris terdahulu tidak diganti.`)];
    const listItems = Array.from({ length: 24 }, (_, i) => `Item stabil ${i + 1}: Kutipan sintetik RM 100.00 dan rujukan 000123 untuk semakan.`);
    const codeLines = Array.from({ length: 24 }, (_, i) => `  rekod_${i + 1} = "000123 🧾: teks sintetik panjang untuk semakan kestabilan kod";`);
    const repeatedParagraph = "Perenggan berulang 000789 🧾.";
    const repeatedItem = "Item berulang 000789.";
    const repeatedCode = "  kod berulang 000789 🧾";
    const safeLine = "Selamat 000456 🧾 selesai.";
    const tailLines = [...Array.from({ length: 18 }, (_, i) => `Ekor ${i + 1}: Butiran sintetik memastikan blok kod sempat bertambah sebelum jawapan lengkap.`), "Stability answer complete 🧾."];
    const stabilityAnswer = [
      paragraphLines.join("\n"), listItems.map((item) => `- ${item}`).join("\n"),
      ["```txt", ...codeLines, "```"].join("\n"),
      repeatedParagraph, repeatedParagraph,
      `- ${repeatedItem}\n- ${repeatedItem}`,
      `\`\`\`txt\n${repeatedCode}\n\`\`\``, `\`\`\`txt\n${repeatedCode}\n\`\`\``,
      'Selamat 000456 <img src="x" onerror="alert(1)"><svg onload="alert(2)"></svg>🧾 selesai.',
      tailLines.join("\n"),
    ].join("\n\n");
    let requests = 0;
    await page.route((url) => url.pathname === "/api/ai/search", (route) => {
      requests++;
      return route.fulfill({ json: { ai_explanation: stabilityAnswer } });
    });
    const telemetry = await log.evaluateHandle((node, expected) => {
      type Sample = { previous: Element | null; firstChild: Element | null; length: number; growthUpdates: number; replacements: number; childReplacements: number };
      const samples: Record<"paragraph" | "list" | "code", Sample> = {
        paragraph: { previous: null, firstChild: null, length: 0, growthUpdates: 0, replacements: 0, childReplacements: 0 },
        list: { previous: null, firstChild: null, length: 0, growthUpdates: 0, replacements: 0, childReplacements: 0 },
        code: { previous: null, firstChild: null, length: 0, growthUpdates: 0, replacements: 0, childReplacements: 0 },
      };
      const observer = new MutationObserver(() => {
        // Completion intentionally replaces the transient article with history.
        // Compare only real prefix growth before a kind's final content appears.
        if (node.getAttribute("aria-busy") !== "true") return;
        const paragraph = Array.from(node.querySelectorAll(".ai-markdown-paragraph"))
          .find((element) => element.textContent?.startsWith("Stability paragraph 000123"));
        const article = paragraph?.closest('[role="article"]');
        if (!article) return;
        const blocks = { paragraph, list: article.querySelector(".ai-markdown-list"), code: article.querySelector(".ai-markdown-code") };
        for (const kind of ["paragraph", "list", "code"] as const) {
          const block = blocks[kind];
          const length = block?.textContent?.length ?? 0;
          const sample = samples[kind];
          if (!block || length <= sample.length || length >= expected[kind].length) continue;
          const firstChild = kind === "paragraph" ? block.querySelector("span") : kind === "list" ? block.querySelector("li") : block.querySelector("code");
          if (sample.previous) {
            sample.growthUpdates++;
            if (sample.previous !== block) sample.replacements++;
            if (sample.firstChild !== firstChild) sample.childReplacements++;
          }
          sample.previous = block; sample.firstChild = firstChild; sample.length = length;
        }
      });
      observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-busy"] });
      return { samples, observer };
    }, { paragraph: paragraphLines.join(""), list: listItems.join(""), code: codeLines.join("\n") });
    try {
      await input.fill("Stability answer"); await send.click();
      await expect(log).toContainText("Stability answer complete 🧾.", { timeout: 15000 });
      await expect(log).toHaveAttribute("aria-busy", "false");
      const samples = await telemetry.evaluate(({ samples, observer }) => {
        observer.disconnect();
        return Object.fromEntries(Object.entries(samples).map(([kind, sample]) => [kind, {
          growthUpdates: sample.growthUpdates, replacements: sample.replacements, childReplacements: sample.childReplacements,
        }]));
      });
      console.log("AI_READING_STABILITY=" + JSON.stringify({ surface, samples }));
      for (const kind of ["paragraph", "list", "code"] as const) {
        expect(samples[kind]!.growthUpdates, `${kind}: observed actual incomplete growth`).toBeGreaterThanOrEqual(2);
        expect(samples[kind]!.replacements, `${kind}: preserve growing block`).toBe(0);
        expect(samples[kind]!.childReplacements, `${kind}: preserve first line/item/code`).toBe(0);
      }
      const finalized = log.getByRole("article", { name: "Mesej pembantu AI", exact: true }).last();
      const actualBlocks = await finalized.locator(".ai-markdown-paragraph, .ai-markdown-list, .ai-markdown-code")
        .evaluateAll((nodes) => nodes.map((node) => ({ tag: node.tagName.toLowerCase(), text: node.textContent })));
      expect(actualBlocks).toEqual([
        { tag: "p", text: paragraphLines.join("") }, { tag: "ul", text: listItems.join("") },
        { tag: "pre", text: codeLines.join("\n") },
        { tag: "p", text: repeatedParagraph }, { tag: "p", text: repeatedParagraph },
        { tag: "ul", text: repeatedItem + repeatedItem },
        { tag: "pre", text: repeatedCode }, { tag: "pre", text: repeatedCode },
        { tag: "p", text: safeLine }, { tag: "p", text: tailLines.join("") },
      ]);
      await expect(finalized.locator("li")).toHaveCount(26);
      await expect(finalized.locator("script, img, svg, iframe, object, embed, a, [onload], [onerror], [onclick]")).toHaveCount(0);
      const finalText = await finalized.textContent();
      expect(Array.from(finalText ?? "").some((character) => character.length === 1 && /[\uD800-\uDFFF]/.test(character))).toBe(false);
      expect(requests).toBe(1);
      await input.fill("Draf selepas jawapan panjang 🧾"); await input.press("End"); await input.press("!");
      await expect(input).toHaveValue("Draf selepas jawapan panjang 🧾!");
      await log.evaluate((node) => { node.scrollTop = 0; });
      const jump = root.getByRole("button", { name: "Ke mesej terkini", exact: true });
      await expect(jump).toBeVisible(); await jump.click();
      await expect.poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(2);
      await expect(input).toHaveValue("Draf selepas jawapan panjang 🧾!");
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]); expect(cspErrors).toEqual([]);
    } finally {
      await telemetry.evaluate(({ observer }) => observer.disconnect());
      await telemetry.dispose();
    }
  });
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
    const feedback = root.locator('[data-ai-feedback="true"]');
    await expect(feedback).toHaveCount(1);
    await expect(feedback).toContainText("AI request queued");
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

for (const surface of ["full", "floating"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`AI reading polish input ${surface} ${theme}: stable short typing still grows and shrinks when needed`, async ({ page, baseURL }) => {
      const width = theme === "light" ? 1366 : 375;
      const { fixture, input, log, send, reset } = await openChat(page, baseURL, surface, theme, width);
      const cspErrors: string[] = [];
      page.on("console", (message) => {
        if (/Content Security Policy|violates.*(?:directive|Trusted)/i.test(message.text())) cspErrors.push(message.text());
      });
      await page.evaluate(() => document.fonts.ready);
      await input.fill("A"); await input.press("End");
      // Initial font/width setup may legitimately measure an empty composer.
      // Observe only subsequent native keys that still fit the measured row.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const restingHeight = (await input.boundingBox())!.height;
      const telemetry = await input.evaluateHandle((node) => {
        const state = { styleMutations: 0, zeroHeightStates: 0 };
        const capture = (records: MutationRecord[]) => {
          for (const record of records) {
            state.styleMutations++;
            // oldValue preserves a transient state even when collapse and
            // restore happen in one synchronous pre-paint update.
            if (/(?:^|;)\s*height:\s*0px(?:;|$)/.test(record.oldValue ?? "")) state.zeroHeightStates++;
          }
        };
        const observer = new MutationObserver(capture);
        observer.observe(node, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
        return { state, observer, capture };
      });
      let shortTyping = { styleMutations: 0, zeroHeightStates: 0 };
      try {
        await input.pressSequentially("bcdefghij", { delay: 25 });
        await expect(input).toHaveValue("Abcdefghij"); await expect(input).toBeFocused();
        expect(Math.abs((await input.boundingBox())!.height - restingHeight)).toBeLessThanOrEqual(1);
        expect(await input.evaluate((node: HTMLTextAreaElement) => ({
          start: node.selectionStart, end: node.selectionEnd, scrollTop: node.scrollTop,
        }))).toEqual({ start: 10, end: 10, scrollTop: 0 });
        shortTyping = await telemetry.evaluate(({ state, observer, capture }) => {
          capture(observer.takeRecords()); observer.disconnect(); return { ...state };
        });

        const wrapping = "Wrapped input remains readable. ".repeat(14);
        await input.fill(wrapping);
        expect((await input.boundingBox())!.height).toBeGreaterThan(restingHeight + 20);
        await expect(input).toHaveValue(wrapping);
        // Actual key deletion crosses a line boundary and must shrink again.
        await input.fill("One\nTwo"); await input.press("Control+End");
        expect((await input.boundingBox())!.height).toBeGreaterThan(restingHeight + 10);
        for (let remaining = 4; remaining > 0; remaining--) await input.press("Backspace");
        await expect(input).toHaveValue("One");
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(restingHeight + 1);

        const multiline = Array.from({ length: 12 }, (_, i) => `Baris ${i + 1}: draf sintetik 000123.`).join("\n");
        await input.press("Control+A");
        // One insertion models multiline paste without accessing the clipboard.
        await page.keyboard.insertText(multiline);
        await expect(input).toHaveValue(multiline); await expect(input).toBeFocused();
        expect((await input.boundingBox())!.height).toBeLessThanOrEqual(144);
        expect((await input.boundingBox())!.height).toBeGreaterThan(restingHeight + 50);
        await expect(input).toHaveCSS("overflow-y", "auto");
        await input.press("Control+End");
        await expect.poll(() => input.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        expect(await input.evaluate((node: HTMLTextAreaElement) => node.selectionEnd)).toBe(multiline.length);

        // Equal string lengths can have different wrapping. Length-only caches
        // must not suppress either growth or shrink for replacements.
        const replacement = "i".repeat(64);
        await input.fill(replacement);
        const replacementHeight = (await input.boundingBox())!.height;
        await input.fill("\n".repeat(63) + "X");
        const newlinesHeight = (await input.boundingBox())!.height;
        expect(newlinesHeight).toBeGreaterThan(replacementHeight + 10);
        expect(newlinesHeight).toBeLessThanOrEqual(144);
        await input.fill(replacement);
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(replacementHeight + 1);

        const widthText = "Width test ".repeat(5);
        await input.fill(widthText);
        const wideHeight = (await input.boundingBox())!.height;
        await input.evaluate((node) => { node.style.maxWidth = "100px"; });
        await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(wideHeight + 10);
        await expect(input).toHaveValue(widthText);
        await input.evaluate((node) => { node.style.removeProperty("max-width"); });
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(wideHeight + 1);

        // Font metrics can change without changing the composer's outer width.
        // A native append must invalidate any prior single-row measurement.
        await input.fill("Font");
        const fontWidth = (await input.boundingBox())!.width;
        await input.evaluate((node) => { node.style.fontSize = "24px"; node.style.lineHeight = "36px"; });
        await input.pressSequentially("s"); await expect(input).toHaveValue("Fonts");
        expect(Math.abs((await input.boundingBox())!.width - fontWidth)).toBeLessThanOrEqual(1);
        expect((await input.boundingBox())!.height).toBeGreaterThan(restingHeight + 8);
        await input.evaluate((node) => {
          node.style.removeProperty("font-size"); node.style.removeProperty("line-height");
          node.ownerDocument.fonts.dispatchEvent(new Event("loadingdone"));
        });
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(restingHeight + 1);

        await input.fill(multiline); await input.press("Control+End");
        await input.evaluate((node) => { node.style.maxHeight = "72px"; });
        await input.pressSequentially("x");
        await expect(input).toHaveValue(multiline + "x");
        const cappedHeight = (await input.boundingBox())!.height;
        expect(cappedHeight).toBeGreaterThanOrEqual(71); expect(cappedHeight).toBeLessThanOrEqual(73);
        await input.evaluate((node) => { node.style.removeProperty("max-height"); });
        await input.pressSequentially("y");
        await expect(input).toHaveValue(multiline + "xy");
        expect((await input.boundingBox())!.height).toBeGreaterThan(cappedHeight + 20);
        expect((await input.boundingBox())!.height).toBeLessThanOrEqual(144);
        await expect(input).toHaveCSS("overflow-y", "auto");

        const unicodePrefix = "Rujukan 000123 ";
        const family = "👨‍👩‍👧‍👦";
        await input.fill(unicodePrefix + "🧾"); await input.press("Control+End");
        await page.keyboard.insertText(" " + family);
        await expect(input).toHaveValue(unicodePrefix + "🧾 " + family);
        // Replace a complete surrogate pair and delete the selected complete
        // ZWJ cluster, without assuming an OS-specific Backspace granularity.
        await input.evaluate((node: HTMLTextAreaElement, start) => node.setSelectionRange(start, start + 2), unicodePrefix.length);
        await page.keyboard.insertText("💼");
        await expect(input).toHaveValue(unicodePrefix + "💼 " + family);
        await input.evaluate((node: HTMLTextAreaElement, start) => node.setSelectionRange(start, node.value.length), (unicodePrefix + "💼 ").length);
        await input.press("Backspace"); await expect(input).toHaveValue(unicodePrefix + "💼 ");
        await input.press("Backspace"); await expect(input).toHaveValue(unicodePrefix + "💼");
        expect(await input.evaluate((node: HTMLTextAreaElement) => Array.from(node.value)
          .some((character) => character.length === 1 && /[\uD800-\uDFFF]/.test(character)))).toBe(false);

        await input.fill("");
        await expect(input).toHaveValue(""); await expect(send).toBeDisabled();
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(restingHeight + 1);
        await input.fill("Ringkas"); await send.click();
        await expect(log).toContainText("Jawapan sintetik ringkas."); await expect(input).toBeEnabled();
        await expect(input).toHaveValue("");
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(restingHeight + 1);
        await input.fill(multiline); await reset.click();
        await expect(input).toHaveValue("");
        await expect(log.getByRole("article")).toHaveCount(0);
        await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(restingHeight + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
        expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]); expect(cspErrors).toEqual([]);
        console.log("AI_INPUT_STABILITY=" + JSON.stringify({ surface, theme, width, restingHeight, shortTyping }));
        expect(shortTyping.zeroHeightStates, "short keys that fit must not collapse the measured composer").toBe(0);
      } finally {
        await telemetry.evaluate(({ observer }) => observer.disconnect());
        await telemetry.dispose();
      }
    });
  }
}
