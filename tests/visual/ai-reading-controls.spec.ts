import { expect, test, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

type Surface = "full" | "floating";

async function openChat(page: Page, baseURL: string | undefined, surface: Surface, answer: string,
  options: { theme?: "light" | "dark"; width?: number } = {}) {
  const fixture = await installFixture(page, baseURL, {
    role: "superuser", aiEnabled: true, theme: options.theme ?? (surface === "full" ? "light" : "dark"),
  });
  await page.setViewportSize({ width: options.width ?? (surface === "full" ? 1366 : 375), height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem("perf_mode", "high");
  });
  await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
  } }));
  let requests = 0;
  await page.route((url) => url.pathname === "/api/ai/search", (route) => {
    requests++;
    return route.fulfill({ json: { ai_explanation: answer } });
  });
  await page.route((url) => url.origin === new URL(baseURL!).origin && ["/ai", "/viewer"].includes(url.pathname), async (route) => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    const response = await route.fetch(); const headers = response.headers();
    const policy = "script-src-attr 'none'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";
    await route.fulfill({ response, headers: { ...headers,
      "content-security-policy": headers["content-security-policy"] ? `${headers["content-security-policy"]}, ${policy}` : policy } });
  });
  const securityErrors: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|violates.*(?:directive|Trusted)|Trusted(?:HTML|Script(?:URL)?|Types)|trusted-types/i.test(message.text())) securityErrors.push(message.text());
  });
  await page.goto(surface === "full" ? "/ai" : "/viewer");
  if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
  const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
  const reset = root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true });
  await expect(input).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  return { fixture, root, input, log, send, reset, securityErrors, requests: () => requests };
}

for (const scenario of [
  { surface: "full", theme: "light", width: 1366 },
  { surface: "full", theme: "dark", width: 320 },
  { surface: "floating", theme: "dark", width: 375 },
  { surface: "floating", theme: "light", width: 320 },
] as const) {
  test(`AI reading controls reset ${scenario.surface}: ${scenario.theme} ${scenario.width}px confirms only drafts or active work`, async ({ page, baseURL }, testInfo) => {
    const chat = await openChat(page, baseURL, scenario.surface, "Jawapan sintetik telah selesai.", scenario);
    const dialog = page.getByRole("alertdialog", { name: "Mulakan sembang baharu?", exact: true });
    await chat.input.fill("Semakan sejarah siap"); await chat.send.click();
    await expect(chat.log).toContainText("Jawapan sintetik telah selesai."); await expect(chat.log).toHaveAttribute("aria-busy", "false");
    // Finished history alone resets directly; no unnecessary confirmation.
    await chat.reset.click(); await expect(chat.log.getByRole("article")).toHaveCount(0); await expect(dialog).toHaveCount(0);
    const draft = "Draf 000123 belum dihantar 🧾";
    await chat.input.fill(draft); await expect(chat.reset).toBeEnabled();
    await chat.reset.focus(); await chat.reset.press("Enter");
    await expect(dialog).toBeVisible(); await expect(dialog).toContainText("Draf dan perbualan semasa akan dikosongkan.");
    const escapeEvidence = await page.evaluateHandle((surface) => {
      const outer = document.querySelector(surface === "floating" ? '[data-floating-ai-dialog="true"][role="dialog"]' : "main");
      const confirmation = document.querySelector('[data-ai-reset-confirmation="true"][role="alertdialog"]');
      const snapshot = (phase: string, event?: KeyboardEvent) => ({
        phase,
        active: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null,
        activeReset: Boolean(document.activeElement?.closest('[data-ai-reset-confirmation="true"]')),
        target: event?.target instanceof Element ? event.target.getAttribute("aria-label") ?? event.target.tagName : null,
        targetReset: event?.target instanceof Element && Boolean(event.target.closest('[data-ai-reset-confirmation="true"]')),
        defaultPrevented: event?.defaultPrevented ?? false,
        outerConnected: Boolean(outer?.isConnected), outerHidden: Boolean(outer?.closest("[hidden]")),
        dialogConnected: Boolean(confirmation?.isConnected), dialogState: confirmation?.getAttribute("data-state") ?? null,
      });
      const records: ReturnType<typeof snapshot>[] = [];
      const capture = (event: KeyboardEvent) => { if (event.key === "Escape" && records.length < 8) records.push(snapshot("capture", event)); };
      const bubble = (event: KeyboardEvent) => { if (event.key === "Escape" && records.length < 8) records.push(snapshot("bubble", event)); };
      window.addEventListener("keydown", capture, true); window.addEventListener("keydown", bubble);
      return { records, snapshot, dispose: () => {
        window.removeEventListener("keydown", capture, true); window.removeEventListener("keydown", bubble);
      } };
    }, scenario.surface);
    try {
      // Visibility precedes Radix's natural autofocus and Escape-layer setup.
      await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    } finally {
      try {
        const evidence = await escapeEvidence.evaluate((probe) => {
          probe.dispose(); return { events: probe.records, after: probe.snapshot("after") };
        });
        console.log("AI_READING_RESET_ESCAPE=" + JSON.stringify({ ...scenario, ...evidence }));
      } finally { await escapeEvidence.dispose(); }
    }
    await expect(chat.input).toHaveValue(draft); await expect(chat.reset).toBeFocused();
    await chat.reset.click(); await expect(dialog).toBeVisible();
    const boxes = await dialog.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth };
    });
    expect(boxes.left).toBeGreaterThanOrEqual(0); expect(boxes.right).toBeLessThanOrEqual(boxes.width + 1);
    expect(boxes.top).toBeGreaterThanOrEqual(0); expect(boxes.bottom).toBeLessThanOrEqual(boxes.height + 1);
    expect(boxes.scroll).toBeLessThanOrEqual(boxes.width + 1);
    await dialog.screenshot({ path: testInfo.outputPath(`ai-reading-controls-reset-${scenario.surface}-${scenario.theme}-${scenario.width}.jpg`), type: "jpeg", quality: 70 });
    await dialog.getByRole("button", { name: "Batal", exact: true }).click(); await expect(dialog).toHaveCount(0);
    await expect(chat.input).toHaveValue(draft); await expect(chat.reset).toBeFocused();
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let accepted = () => {};
    const activeRequest = new Promise<void>((resolve) => { accepted = resolve; });
    let heldRequests = 0, requestFailed = () => false;
    await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
      heldRequests++; requestFailed = () => route.request().failure() !== null; accepted(); await held;
      if (route.request().failure()) return;
      try { await route.fulfill({ json: { ai_explanation: "Jawapan lapuk tidak boleh muncul selepas reset." } }); }
      catch (error) { if (!route.request().failure()) throw error; }
    });
    try {
      await chat.input.fill("Permintaan aktif sintetik"); await chat.send.click(); await activeRequest;
      await expect(chat.log).toHaveAttribute("aria-busy", "true");
      await chat.reset.click(); await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Batal", exact: true }).click();
      await expect(dialog).toHaveCount(0); await expect(chat.log).toHaveAttribute("aria-busy", "true");
      expect(requestFailed(), "Cancel confirmation must leave the existing request active").toBe(false);
      expect(heldRequests).toBe(1);
      await chat.reset.focus(); await chat.reset.press("Enter"); await expect(dialog).toBeVisible();
      const confirm = dialog.getByRole("button", { name: "Sembang Baharu", exact: true });
      await confirm.focus(); await confirm.press("Enter"); await expect(dialog).toHaveCount(0);
      await expect(chat.log.getByRole("article")).toHaveCount(0); await expect(chat.input).toHaveValue("");
      await expect(chat.log).toHaveAttribute("aria-busy", "false"); await expect(chat.input).toBeEnabled();
      release(); await page.waitForTimeout(2700);
      await expect(chat.log.getByRole("article")).toHaveCount(0);
      await expect(chat.log).not.toContainText("Jawapan lapuk"); expect(heldRequests).toBe(1);
      expect(chat.requests()).toBe(1); expect(chat.fixture.errors).toEqual([]);
      expect(chat.fixture.unexpected).toEqual([]); expect(chat.securityErrors).toEqual([]);
      console.log("AI_READING_RESET=" + JSON.stringify({ ...scenario, confirmedActiveReset: true,
        cancelledRequestKeptActive: true, staleReplyAbsent: true, historyRequests: chat.requests(), heldRequests }));
    } finally { release(); }
  });
}

test("AI reading controls reset floating: active confirmation survives a native viewport transition without losing the request", async ({ page, baseURL }) => {
  const chat = await openChat(page, baseURL, "floating", "Tiada respons awal diperlukan.", { theme: "light", width: 1366 });
  const dialog = page.getByRole("alertdialog", { name: "Mulakan sembang baharu?", exact: true });
  const query = "Permintaan sintetik kekal semasa saiz paparan berubah";
  const answer = "Jawapan tunggal sintetik selepas panel dibuka semula.";
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let accepted = () => {};
  const activeRequest = new Promise<void>((resolve) => { accepted = resolve; });
  let heldRequests = 0, requestFailed = () => false;
  await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
    heldRequests++; requestFailed = () => route.request().failure() !== null; accepted(); await held;
    if (route.request().failure()) return;
    try { await route.fulfill({ json: { ai_explanation: answer } }); }
    catch (error) { if (!route.request().failure()) throw error; }
  });
  try {
    await chat.input.fill(query); await chat.send.click(); await activeRequest;
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    await chat.reset.click(); await expect(dialog).toBeVisible();
    // Crossing the real 767px mobile breakpoint changes presentation, not ownership.
    // No height-only auto-minimize behavior is assumed or injected.
    await page.setViewportSize({ width: 375, height: 480 });
    await expect(chat.root).toHaveAttribute("aria-modal", "true");
    await expect(chat.root).toHaveAttribute("data-floating-ai-panel-mode", "fullscreen");
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    const bounds = await dialog.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    await expect(chat.root).toBeVisible(); await expect(chat.log).toHaveAttribute("aria-busy", "true");
    expect(requestFailed(), "Closing the inner confirmation must not cancel the AI request").toBe(false);
    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(chat.root).not.toHaveAttribute("aria-modal", "true");
    await chat.root.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
    await expect(chat.root).toBeHidden(); await expect(dialog).toHaveCount(0);
    expect(requestFailed(), "Minimizing the panel must leave the AI request active").toBe(false);
    await page.getByTestId("floating-ai-toggle").click(); await expect(chat.root).toBeVisible();
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    await expect(chat.log.getByRole("article", { name: "Mesej pengguna", exact: true })).toHaveCount(1);
    await expect(chat.log).toContainText(query);
    release(); await expect(chat.log).toHaveAttribute("aria-busy", "false");
    const assistant = chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true });
    await expect(assistant).toHaveCount(1); await expect(assistant).toHaveText(answer);
    expect(heldRequests).toBe(1); expect(chat.requests()).toBe(0);
    expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]); expect(chat.securityErrors).toEqual([]);
    console.log("AI_READING_RESET_VIEWPORT=" + JSON.stringify({ from: "1366x900", to: "375x480",
      innerEscapeOnly: true, requestPreserved: true, heldRequests, completions: 1 }));
  } finally { release(); }
});

for (const surface of ["full", "floating"] as const) {
  test(`AI reading controls limit ${surface}: screen-reader announcement changes only at remaining-character bands`, async ({ page, baseURL }) => {
    const chat = await openChat(page, baseURL, surface, "Tiada permintaan AI diperlukan.");
    const announcement = chat.root.locator('[data-ai-limit-announcement="true"]');
    const counter = chat.root.locator('[data-ai-limit-counter="true"]');
    await expect(announcement).toHaveCount(1); await expect(announcement).toHaveAttribute("aria-live", "polite");
    await expect(counter).toHaveCount(0);
    await expect(announcement).toBeEmpty(); await expect(chat.input).toHaveAttribute("maxlength", "3000");
    const describedBy = await chat.input.getAttribute("aria-describedby"); expect(describedBy).toBeTruthy();
    const description = page.locator(`[id="${describedBy}"]`);
    await expect(description).toHaveText("Had soalan AI 3000 aksara.");
    await expect(description).not.toHaveAttribute("aria-live", /.+/);
    const telemetry = await announcement.evaluateHandle((node) => {
      const values: string[] = []; let previous = node.textContent ?? "";
      const capture = (records: MutationRecord[]) => {
        if (!records.length) return;
        const next = node.textContent ?? "";
        if (next !== previous) { previous = next; values.push(next); }
      };
      const observer = new MutationObserver(capture); observer.observe(node, { childList: true, characterData: true, subtree: true });
      return { values, snapshot: () => { capture(observer.takeRecords()); return [...values]; }, dispose: () => observer.disconnect() };
    });
    const band200 = "Baki soalan AI 200 aksara atau kurang.";
    const band50 = "Baki soalan AI 50 aksara atau kurang.";
    const band0 = "Had soalan AI telah dicapai.";
    try {
      await chat.input.fill("A".repeat(2799)); await expect(counter).toHaveCount(0); await expect(announcement).toBeEmpty();
      await chat.input.press("End"); await chat.input.press("a"); await expect(counter).toContainText("200"); await expect(announcement).toHaveText(band200);
      await expect(counter).toHaveAttribute("aria-hidden", "true");
      const at200 = await telemetry.evaluate((probe) => probe.snapshot());
      await chat.input.pressSequentially("abc"); await expect(counter).toContainText("197");
      await expect(announcement).toHaveText(band200); expect(await telemetry.evaluate((probe) => probe.snapshot())).toEqual(at200);
      await chat.input.fill("B".repeat(2950)); await expect(counter).toContainText("50"); await expect(announcement).toHaveText(band50);
      const at50 = await telemetry.evaluate((probe) => probe.snapshot());
      await chat.input.press("End"); await chat.input.pressSequentially("abc"); await expect(counter).toContainText("47");
      await expect(announcement).toHaveText(band50); expect(await telemetry.evaluate((probe) => probe.snapshot())).toEqual(at50);
      await chat.input.fill("C".repeat(3000)); await expect(counter).toContainText("0"); await expect(announcement).toHaveText(band0);
      const at0 = await telemetry.evaluate((probe) => probe.snapshot());
      await chat.input.press("End"); await chat.input.press("z"); await expect(chat.input).toHaveValue("C".repeat(3000));
      expect(await telemetry.evaluate((probe) => probe.snapshot())).toEqual(at0);
      await chat.input.fill("D".repeat(2975)); await expect(counter).toContainText("25"); await expect(announcement).toHaveText(band50);
      await chat.input.fill("E".repeat(2801)); await expect(counter).toContainText("199"); await expect(announcement).toHaveText(band200);
      await chat.input.fill(""); await expect(announcement).toBeEmpty(); await expect(chat.input).toHaveValue("");
      const observed = await telemetry.evaluate((probe) => probe.snapshot());
      expect(observed).toEqual([band200, band50, band0, band50, band200, ""]);
      expect(chat.requests()).toBe(0); expect(chat.fixture.errors).toEqual([]);
      expect(chat.fixture.unexpected).toEqual([]); expect(chat.securityErrors).toEqual([]);
      console.log("AI_READING_LIMIT=" + JSON.stringify({ surface, announcedTransitions: observed.length,
        repeatedKeysWithinBandAnnounced: 0, requests: chat.requests(), actualScreenReaderTested: false }));
    } finally { await telemetry.evaluate((probe) => probe.dispose()); await telemetry.dispose(); }
  });
}

for (const surface of ["full", "floating"] as const) {
  test(`AI reading controls stop ${surface}: explicit Stop keeps the visible partial answer once`, async ({ page, baseURL }) => {
    const answer = "Jawapan sintetik 000123 kekal boleh dibaca. ".repeat(350);
    expect(Buffer.byteLength(answer, "utf8")).toBeLessThanOrEqual(16000);
    const chat = await openChat(page, baseURL, surface, answer);
    await chat.input.fill("Semakan Stop sintetik"); await chat.send.click();
    const assistant = chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true });
    const stop = chat.root.getByRole("button", { name: "Hentikan AI SQR", exact: true });
    await expect.poll(async () => (await assistant.last().textContent())?.length ?? 0).toBeGreaterThan(120);
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    const clickEvidence = await stop.evaluateHandle((button) => {
      const evidence = { text: "", captured: false };
      const listener = () => {
        const root = button.closest('[data-floating-ai-dialog="true"]') ?? document.querySelector("main");
        const messages = root?.querySelectorAll('[role="log"] [aria-label="Mesej pembantu AI"]');
        evidence.text = messages?.item(messages.length - 1)?.textContent ?? "";
        evidence.captured = true;
      };
      button.addEventListener("click", listener, { capture: true, once: true });
      return { evidence, dispose: () => button.removeEventListener("click", listener, true) };
    });
    try {
      await stop.click();
      const clicked = await clickEvidence.evaluate(({ evidence }) => ({ ...evidence }));
      expect(clicked.captured).toBe(true); expect(clicked.text.length).toBeGreaterThan(0);
      expect(clicked.text.length).toBeLessThan(answer.length);
      await expect(chat.log).toHaveAttribute("aria-busy", "false"); await expect(chat.input).toBeEnabled();
      await expect(assistant).toHaveCount(1); await expect(assistant).toHaveText(clicked.text);
      await expect(chat.root.locator('[data-ai-action="stop"]')).toHaveCount(0);
      // Exceed the production reveal's 2400ms ceiling to expose late writes.
      await page.waitForTimeout(2700);
      await expect(assistant).toHaveCount(1); await expect(assistant).toHaveText(clicked.text);
      expect(chat.requests()).toBe(1); expect(chat.fixture.errors).toEqual([]);
      expect(chat.fixture.unexpected).toEqual([]); expect(chat.securityErrors).toEqual([]);
      console.log("AI_READING_STOP=" + JSON.stringify({ surface, retainedCharacters: clicked.text.length,
        fullCharacters: answer.length, finalizedAssistantMessages: 1, requests: chat.requests(), lateWriteWindowMs: 2700 }));
    } finally { await clickEvidence.evaluate(({ dispose }) => dispose()); await clickEvidence.dispose(); }
  });

  test(`AI reading controls selection ${surface}: selecting transcript text pauses follow during reveal`, async ({ page, baseURL }) => {
    const answer = Array.from({ length: 150 }, (_, index) => `Baris ${index + 1}: RECORD 000123 ialah teks sintetik untuk dipilih semasa jawapan bertambah.`).join("\n");
    expect(Buffer.byteLength(answer, "utf8")).toBeLessThanOrEqual(16000);
    const chat = await openChat(page, baseURL, surface, answer);
    await chat.input.fill("Semakan pilihan teks sintetik"); await chat.send.click();
    const assistant = chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true });
    await expect.poll(() => chat.log.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(100);
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    const jump = chat.root.getByRole("button", { name: "Ke mesej terkini", exact: true });
    await expect(jump).toHaveCount(0);
    const followingTop = await chat.log.evaluate((node) => node.scrollTop);
    await expect.poll(() => chat.log.evaluate((node) => node.scrollTop)).toBeGreaterThan(followingTop);
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    const clickProbe = await chat.log.evaluateHandle((node) => {
      const evidence = { captured: false, word: "", inside: false, scrollTop: 0, gap: 0, busy: "", jumpPresent: false, x: 0, y: 0 };
      const listener = (event: Event) => {
        if (!(event instanceof MouseEvent) || event.detail !== 2) return;
        // The live reply can move after the aiming measurement. Read the word
        // under the real second mousedown before native default selection runs.
        const caret = node.ownerDocument.caretRangeFromPoint(event.clientX, event.clientY);
        const textNode = caret?.startContainer;
        const inside = Boolean(textNode && node.contains(textNode) && textNode.nodeType === Node.TEXT_NODE);
        const text = inside ? textNode!.textContent ?? "" : "";
        const offset = caret?.startOffset ?? -1;
        const token = [...text.matchAll(/[A-Za-z0-9]+/g)].find((match) => {
          const start = match.index ?? 0;
          return offset >= start && offset <= start + match[0].length;
        });
        const root = node.closest('[data-floating-ai-dialog="true"]') ?? node.ownerDocument.querySelector("main");
        Object.assign(evidence, { captured: true, word: token?.[0] ?? "", inside, scrollTop: node.scrollTop,
          gap: node.scrollHeight - node.scrollTop - node.clientHeight, busy: node.getAttribute("aria-busy") ?? "",
          jumpPresent: Boolean(root?.querySelector('[aria-label="Ke mesej terkini"]')), x: event.clientX, y: event.clientY });
      };
      node.addEventListener("mousedown", listener, true);
      return { evidence, dispose: () => node.removeEventListener("mousedown", listener, true) };
    });
    try {
    // Measure a complete visible word, then use an actual double-click to select
    // it. No selection range or application state is injected by the fixture.
    const point = await chat.log.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      const spans = Array.from(node.querySelectorAll<HTMLElement>(".ai-markdown-paragraph > span"));
      const span = spans.find((candidate) => {
        const box = candidate.getBoundingClientRect();
        return candidate.textContent?.includes("RECORD") && box.top >= bounds.top + 12 && box.bottom <= bounds.bottom - 12;
      });
      if (!span) throw new Error("No complete visible selectable text line");
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let textNode: Node | null = walker.nextNode();
      while (textNode && !textNode.textContent?.includes("RECORD")) textNode = walker.nextNode();
      if (!textNode) throw new Error("No visible RECORD text node");
      const start = textNode.textContent!.indexOf("RECORD");
      const range = document.createRange(); range.setStart(textNode, start); range.setEnd(textNode, start + 6);
      const box = range.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await page.mouse.dblclick(point.x, point.y);
    const clicked = await clickProbe.evaluate(({ evidence }) => ({ ...evidence }));
    console.log("AI_READING_SELECTION_CLICK=" + JSON.stringify({ surface, aim: point, eventTime: clicked }));
    expect(clicked.captured).toBe(true); expect(clicked.inside).toBe(true); expect(clicked.word).toMatch(/^[A-Za-z0-9]+$/);
    expect(clicked.busy).toBe("true"); expect(clicked.gap).toBeLessThanOrEqual(48); expect(clicked.jumpPresent).toBe(false);
    const selected = await chat.log.evaluate((node) => {
      const selection = window.getSelection();
      return { text: selection?.toString() ?? "", inside: Boolean(selection?.anchorNode && selection.focusNode
        && node.contains(selection.anchorNode) && node.contains(selection.focusNode)), scrollTop: node.scrollTop };
    });
    expect(selected.text).toBe(clicked.word); expect(selected.inside).toBe(true);
    const lengthAtSelection = (await assistant.last().textContent())?.length ?? 0;
    await expect.poll(async () => (await assistant.last().textContent())?.length ?? 0).toBeGreaterThan(lengthAtSelection + 80);
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    const during = await chat.log.evaluate((node) => ({ text: window.getSelection()?.toString() ?? "", scrollTop: node.scrollTop }));
    expect(during.text).toBe(selected.text);
    expect(Math.abs(during.scrollTop - selected.scrollTop)).toBeLessThanOrEqual(2);
    await expect(jump).toBeVisible(); await jump.click();
    await expect(chat.log).toHaveAttribute("aria-busy", "false");
    await expect.poll(() => chat.log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(2);
    expect(chat.requests()).toBe(1); expect(chat.fixture.errors).toEqual([]);
    expect(chat.fixture.unexpected).toEqual([]); expect(chat.securityErrors).toEqual([]);
    console.log("AI_READING_SELECTION=" + JSON.stringify({ surface, selection: selected.text,
      scrollTopBefore: selected.scrollTop, scrollTopDuring: during.scrollTop, requests: chat.requests() }));
    } finally { await clickProbe.evaluate(({ dispose }) => dispose()); await clickProbe.dispose(); }
  });
}
