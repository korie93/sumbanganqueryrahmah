import { expect, test, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

declare global {
  interface Window {
    __setAiVisualViewport: (height: number, offsetTop?: number) => void;
  }
}

// Synthetic overlay geometry, not a native OS keyboard or native browser pan.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 844 } });
const cases = [
  { name: "portrait", width: 375, height: 844, visible: 464, top: 0, theme: "light", longDraft: false },
  { name: "panned", width: 375, height: 844, visible: 360, top: 160, theme: "dark", longDraft: false },
  { name: "short", width: 320, height: 640, visible: 220, top: 0, theme: "dark", longDraft: true },
  { name: "landscape", width: 844, height: 390, visible: 190, top: 0, theme: "light", longDraft: false },
] as const;
type KeyboardCase = { name: string; width: number; height: number; visible: number; top: number;
  theme: "light" | "dark"; longDraft: boolean };

async function openFloating(page: Page, baseURL: string | undefined, scenario: KeyboardCase) {
  await page.setViewportSize({ width: scenario.width, height: scenario.height });
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme: scenario.theme });
  await page.addInitScript(() => {
    const viewport = window.visualViewport;
    if (!viewport) throw new Error("VisualViewport is required for this isolated Chromium simulation");
    const state = { height: null as number | null, top: 0 };
    // Keep the real EventTarget and native width/scale. Only the overlay's
    // visible height and pan offset are simulated; layout viewport stays fixed.
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => state.height ?? window.innerHeight },
      offsetTop: { configurable: true, get: () => state.top },
    });
    window.__setAiVisualViewport = (height, offsetTop = 0) => {
      state.height = height; state.top = offsetTop;
      viewport.dispatchEvent(new Event("resize")); viewport.dispatchEvent(new Event("scroll"));
    };
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem("perf_mode", "low");
  });
  await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
  } }));
  let requests = 0;
  const answer = Array.from({ length: 80 }, (_, i) => `Baris ${i + 1}: semakan sintetik keyboard dan ruang bacaan 000123.`).join("\n")
    + "\nAI keyboard answer complete.";
  await page.route((url) => url.pathname === "/api/ai/search", (route) => {
    requests++;
    return route.fulfill({ json: { ai_explanation: answer } });
  });
  await page.goto("/viewer");
  await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
  await page.getByTestId("floating-ai-toggle").click();
  const root = page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  const send = root.getByRole("button", { name: "Hantar soalan AI", exact: true });
  const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  await expect(input).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await input.fill("Semakan keyboard sintetik"); await send.click();
  await expect(log).toContainText("AI keyboard answer complete."); await expect(input).toBeEnabled();
  const draft = scenario.longDraft
    ? Array.from({ length: 12 }, (_, i) => `Baris draf ${i + 1}: 000123.`).join("\n")
    : "Draf 000123 belum dihantar";
  await input.fill(draft); await input.focus();
  await settle(page);
  await log.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(2);
  if (scenario.name === "landscape") expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  return { fixture, root, input, send, log, draft, requestCount: () => requests };
}

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForTimeout(120);
}

async function keyboard(page: Page, height: number, top = 0) {
  await page.evaluate(({ height, top }) => window.__setAiVisualViewport(height, top), { height, top });
  await settle(page);
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-floating-ai-dialog="true"]')!;
    const log = panel.querySelector<HTMLElement>('[role="log"]')!;
    const input = panel.querySelector<HTMLTextAreaElement>("textarea")!;
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      layout: { width: innerWidth, height: innerHeight },
      visible: { top: visualViewport!.offsetTop, bottom: visualViewport!.offsetTop + visualViewport!.height, height: visualViewport!.height },
      panel: rect(panel), mode: panel.dataset.floatingAiPanelMode,
      header: rect(panel.querySelector("header")!), input: rect(input),
      send: rect(panel.querySelector('[aria-label="Hantar soalan AI"]')!), log: rect(log),
      gap: log.scrollHeight - log.scrollTop - log.clientHeight, scrollTop: log.scrollTop,
      draft: input.value, focused: document.activeElement === input,
      coarse: matchMedia("(pointer: coarse)").matches,
    };
  });
}

async function captureVisible(page: Page, path: string) {
  const clip = await page.evaluate(() => ({ x: 0, y: visualViewport!.offsetTop, width: innerWidth,
    height: Math.min(visualViewport!.height, innerHeight - visualViewport!.offsetTop) }));
  await page.screenshot({ path, type: "jpeg", quality: 55, clip });
}

for (const scenario of cases) {
  test(`AI keyboard evidence ${scenario.name}: synthetic visible viewport measurements`, async ({ page, baseURL }, testInfo) => {
    const chat = await openFloating(page, baseURL, scenario);
    const before = await measure(page);
    await captureVisible(page, testInfo.outputPath(`ai-keyboard-${scenario.name}-closed.jpg`));
    await keyboard(page, scenario.visible, scenario.top);
    const opened = await measure(page);
    await captureVisible(page, testInfo.outputPath(`ai-keyboard-${scenario.name}-open.jpg`));
    console.log("AI_KEYBOARD_GEOMETRY=" + JSON.stringify({ scenario: scenario.name, model: "synthetic VisualViewport overlay", before, opened }));
    // Neutral evidence intentionally does not accept or reject new geometry.
    await expect(chat.input).toHaveValue(chat.draft); expect(chat.requestCount()).toBe(1);
    expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]);
  });
}

for (const scenario of cases.filter((item) => item.name !== "portrait")) {
  test(`AI keyboard behavior ${scenario.name}: controls and latest answer remain inside the visible band`, async ({ page, baseURL }) => {
    const chat = await openFloating(page, baseURL, scenario);
    await keyboard(page, scenario.visible, scenario.top);
    const opened = await measure(page);
    console.log("AI_KEYBOARD_BEHAVIOR=" + JSON.stringify({ scenario: scenario.name, opened }));
    for (const name of ["header", "input", "send"] as const) {
      const box = opened[name];
      expect(box.top, `${name} above visual viewport`).toBeGreaterThanOrEqual(opened.visible.top - 1);
      expect(box.bottom, `${name} below visual viewport`).toBeLessThanOrEqual(opened.visible.bottom + 1);
      expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(scenario.width + 1);
    }
    expect(opened.log.height).toBeGreaterThanOrEqual(24);
    await expect.poll(async () => (await measure(page)).gap).toBeLessThanOrEqual(2);
    await expect(chat.input).toHaveValue(chat.draft);
    await chat.log.evaluate((node) => { node.scrollTop = 0; });
    await expect(chat.root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
    const earlier = await chat.log.evaluate((node) => node.scrollTop);
    await keyboard(page, scenario.height);
    expect(await chat.log.evaluate((node) => node.scrollTop)).toBeLessThanOrEqual(earlier + 2);
    await expect(chat.input).toHaveValue(chat.draft);
    expect(chat.requestCount()).toBe(1);
    expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]);
  });
}

function controlsWithin(state: Awaited<ReturnType<typeof measure>>) {
  for (const name of ["header", "input", "send"] as const) {
    expect(state[name].top, `${name} above visible band`).toBeGreaterThanOrEqual(state.visible.top - 1);
    expect(state[name].bottom, `${name} below visible band`).toBeLessThanOrEqual(state.visible.bottom + 1);
    expect(state[name].left).toBeGreaterThanOrEqual(0);
    expect(state[name].right).toBeLessThanOrEqual(state.layout.width + 1);
  }
  expect(state.log.height).toBeGreaterThanOrEqual(24);
}

test("AI keyboard behavior scroll: latest follows resize while earlier reading stays put", async ({ page, baseURL }) => {
  const chat = await openFloating(page, baseURL, cases[0]);
  await keyboard(page, 300); controlsWithin(await measure(page));
  await expect.poll(async () => (await measure(page)).gap).toBeLessThanOrEqual(2);
  await chat.log.evaluate((node) => { node.scrollTop = 0; });
  const jump = chat.root.getByRole("button", { name: "Ke mesej terkini", exact: true });
  await expect(jump).toBeVisible();
  await keyboard(page, 844);
  expect(await chat.log.evaluate((node) => node.scrollTop)).toBeLessThanOrEqual(2);
  await keyboard(page, 300);
  expect(await chat.log.evaluate((node) => node.scrollTop)).toBeLessThanOrEqual(2);
  await expect(jump).toBeVisible(); await expect(chat.input).toHaveValue(chat.draft);
  const anchor = chat.log.locator(".ai-markdown-paragraph > span").filter({ hasText: /^Baris 35:/ }).first();
  await anchor.evaluate((node) => {
    const log = node.closest<HTMLElement>('[role="log"]')!;
    log.scrollTop += node.getBoundingClientRect().top - log.getBoundingClientRect().top - 16;
  });
  await expect(jump).toBeVisible();
  const offset = () => anchor.evaluate((node) => node.getBoundingClientRect().top - node.closest('[role="log"]')!.getBoundingClientRect().top);
  const readingOffset = await offset();
  await keyboard(page, 844);
  expect(Math.abs(await offset() - readingOffset)).toBeLessThanOrEqual(2);
  await keyboard(page, 300);
  expect(Math.abs(await offset() - readingOffset)).toBeLessThanOrEqual(2);
  await jump.click(); await keyboard(page, 844);
  await expect.poll(async () => (await measure(page)).gap).toBeLessThanOrEqual(2);
  expect(chat.requestCount()).toBe(1); expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]);
});

test("AI keyboard behavior rotation: touch landscape preserves focus, draft and reading", async ({ page, baseURL }) => {
  const chat = await openFloating(page, baseURL, cases[0]);
  await keyboard(page, 300);
  await page.setViewportSize({ width: 844, height: 390 });
  await keyboard(page, 190);
  await page.evaluate(() => window.dispatchEvent(new Event("orientationchange"))); await settle(page);
  const landscape = await measure(page);
  console.log("AI_KEYBOARD_ROTATION_LANDSCAPE=" + JSON.stringify(landscape));
  controlsWithin(landscape); expect(landscape.coarse).toBe(true);
  await expect(chat.input).toBeFocused(); await expect(chat.input).toHaveValue(chat.draft);
  await expect.poll(async () => (await measure(page)).gap).toBeLessThanOrEqual(2);
  await chat.log.evaluate((node) => { node.scrollTop = 0; });
  await expect(chat.root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 844 }); await keyboard(page, 300);
  await page.evaluate(() => window.dispatchEvent(new Event("orientationchange"))); await settle(page);
  const portrait = await measure(page);
  console.log("AI_KEYBOARD_ROTATION_PORTRAIT=" + JSON.stringify(portrait));
  controlsWithin(portrait);
  expect(portrait.scrollTop).toBeLessThanOrEqual(2);
  await expect(chat.input).toBeFocused(); await expect(chat.input).toHaveValue(chat.draft);
  console.log("AI_KEYBOARD_ROTATION=" + JSON.stringify({ landscape, portrait }));
  expect(chat.requestCount()).toBe(1); expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]);
});

test("AI keyboard behavior safe: synthetic home inset and landscape cutouts keep controls reachable", async ({ page, baseURL }, testInfo) => {
  const chat = await openFloating(page, baseURL, cases[2]);
  await page.evaluate(() => document.documentElement.style.setProperty("--safe-area-inset-bottom", "34px"));
  await keyboard(page, 220);
  const short = await measure(page);
  await captureVisible(page, testInfo.outputPath("ai-keyboard-safe-short.jpg"));
  console.log("AI_KEYBOARD_SAFE_SHORT=" + JSON.stringify(short)); controlsWithin(short);
  expect(short.input.bottom).toBeLessThanOrEqual(short.visible.bottom - 34 + 1);
  expect(short.send.bottom).toBeLessThanOrEqual(short.visible.bottom - 34 + 1);
  // The simulated inset changes on rotation: horizontal cutouts remain while
  // the keyboard covers the lower home-indicator region in this second model.
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "0px");
    document.documentElement.style.setProperty("--safe-area-inset-left", "44px");
    document.documentElement.style.setProperty("--safe-area-inset-right", "44px");
  });
  await page.setViewportSize({ width: 844, height: 390 }); await keyboard(page, 190);
  await page.evaluate(() => window.dispatchEvent(new Event("orientationchange"))); await settle(page);
  const landscape = await measure(page);
  await captureVisible(page, testInfo.outputPath("ai-keyboard-safe-landscape.jpg"));
  console.log("AI_KEYBOARD_SAFE_LANDSCAPE=" + JSON.stringify(landscape)); controlsWithin(landscape);
  for (const name of ["input", "send"] as const) {
    expect(landscape[name].left).toBeGreaterThanOrEqual(43);
    expect(landscape[name].right).toBeLessThanOrEqual(801);
  }
  for (const box of await chat.root.locator("header button").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right };
  }))) { expect(box.left).toBeGreaterThanOrEqual(43); expect(box.right).toBeLessThanOrEqual(801); }
  await expect(chat.input).toHaveValue(chat.draft);
  expect(chat.requestCount()).toBe(1); expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]);
});

test("AI keyboard behavior composer: a tighter cap keeps a two-line draft scrollable", async ({ page, baseURL }) => {
  const chat = await openFloating(page, baseURL, cases[0]);
  await keyboard(page, 300);
  await chat.input.fill("One\nTwo");
  await expect(chat.input).toHaveCSS("overflow-y", "hidden");
  await keyboard(page, 220);
  expect(await chat.input.evaluate((node) => node.scrollHeight > node.clientHeight + 1)).toBe(true);
  await expect(chat.input).toHaveCSS("overflow-y", "auto");
  await expect(chat.input).toBeFocused();
  await chat.input.press("Control+Home");
  expect(await chat.input.evaluate((node) => (node as HTMLTextAreaElement).selectionStart)).toBe(0);
  await chat.input.press("Control+End");
  const composer = await chat.input.evaluate((node) => {
    const input = node as HTMLTextAreaElement;
    return { height: input.clientHeight, scrollHeight: input.scrollHeight, scrollTop: input.scrollTop,
      start: input.selectionStart, end: input.selectionEnd, overflow: getComputedStyle(input).overflowY,
      focused: document.activeElement === input };
  });
  console.log("AI_KEYBOARD_COMPOSER=" + JSON.stringify(composer));
  expect(composer.end).toBe(7);
  await expect.poll(() => chat.input.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(chat.input).toHaveValue("One\nTwo");
  await keyboard(page, 300);
  await expect(chat.input).toHaveCSS("overflow-y", "hidden");
  await expect.poll(() => chat.input.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(chat.input).toHaveValue("One\nTwo");
  expect(chat.requestCount()).toBe(1);
  expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]);
});

test.describe("AI keyboard fine-pointer desktop", () => {
  test.use({ hasTouch: false, isMobile: false });
  test("AI keyboard behavior desktop: unobscured fine-pointer layout remains docked", async ({ page, baseURL }) => {
    const scenario: KeyboardCase = { name: "desktop", width: 1366, height: 900, visible: 900, top: 0, theme: "light", longDraft: false };
    const chat = await openFloating(page, baseURL, scenario);
    const before = await measure(page);
    await keyboard(page, 900);
    const after = await measure(page); controlsWithin(after);
    expect(after.coarse).toBe(false); expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
    expect(before.mode).toBe("dock"); expect(after.mode).toBe("dock");
    for (const property of ["left", "top", "width", "height"] as const) {
      expect(Math.abs(after.panel[property] - before.panel[property])).toBeLessThanOrEqual(1);
    }
    await expect(chat.input).toHaveValue(chat.draft); expect(chat.requestCount()).toBe(1);
    expect(chat.fixture.errors).toEqual([]); expect(chat.fixture.unexpected).toEqual([]);
  });
});
