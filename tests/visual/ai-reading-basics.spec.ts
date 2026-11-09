import { expect, test, type Locator, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

type Surface = "full" | "floating";
type Theme = "light" | "dark";

async function openChat(page: Page, baseURL: string | undefined, surface: Surface, theme: Theme, width: number, answer: string, cpu = 1) {
  expect(Buffer.byteLength(answer, "utf8")).toBeLessThanOrEqual(16000);
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme });
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((low) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem("perf_mode", low ? "low" : "high");
  }, cpu === 6);
  await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
  } }));
  let requests = 0;
  await page.route((url) => url.pathname === "/api/ai/search", (route) => {
    requests++; return route.fulfill({ json: { ai_explanation: answer } });
  });
  const origin = new URL(baseURL!).origin;
  await page.route((url) => url.origin === origin && ["/ai", "/viewer"].includes(url.pathname), async (route) => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    const response = await route.fetch(), headers = response.headers();
    const policy = "script-src-attr 'none'; trusted-types default sqr-ui dompurify; require-trusted-types-for 'script'";
    await route.fulfill({ response, headers: { ...headers,
      "content-security-policy": headers["content-security-policy"] ? `${headers["content-security-policy"]}, ${policy}` : policy } });
  });
  const securityErrors: string[] = [], cspEvents: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|violates.*(?:directive|Trusted)|Trusted(?:HTML|Script(?:URL)?|Types)|trusted-types/i.test(message.text())) securityErrors.push(message.text());
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.goto(surface === "full" ? "/ai" : "/viewer");
  if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
  const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
  await expect(input).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const cspProbe = await page.evaluateHandle(() => {
    const events: string[] = [];
    const handler = (event: SecurityPolicyViolationEvent) => events.push(`${event.effectiveDirective}:${event.blockedURI}`);
    document.addEventListener("securitypolicyviolation", handler);
    return { events, dispose: () => document.removeEventListener("securitypolicyviolation", handler) };
  });
  const verify = async () => {
    cspEvents.push(...await cspProbe.evaluate((probe) => probe.events));
    expect(cspEvents).toEqual([]); expect(securityErrors).toEqual([]);
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  };
  return { root, input, log, send, verify, requests: () => requests,
    dispose: async () => { await cspProbe.evaluate((probe) => probe.dispose()); await cspProbe.dispose(); await cdp.detach(); } };
}

const basicAnswer = [
  "Ringkasan **Kutipan bulan ini** untuk akaun 000123.",
  "- **Pelanggan pertama**: akaun 000123\n- Jumlah **RM 42.00** dan kad 0000000000000042",
  "1. **Semak resit** sebelum simpan.\n2. Rujukan **RECORD-000123** kekal.",
  '```txt\n**teks kod bukan tebal**\nconst account = "000123";\n```',
  "Nota HTML <em>teks HTML bukan pemformatan</em> tamat.",
  "Penanda akhir ** belum ditutup.",
].join("\n\n");

for (const surface of ["full", "floating"] as const) for (const theme of ["light", "dark"] as const) for (const width of [375, 1366]) {
  test(`AI reading basics bold ${surface} ${theme} ${width}px: inline emphasis preserves lists, code and identifiers under strict CSP`, async ({ page, baseURL }, testInfo) => {
    const chat = await openChat(page, baseURL, surface, theme, width, basicAnswer);
    try {
      await chat.input.fill("Semak akaun 000123 tanpa menukar data."); await chat.send.click();
      await expect(chat.log).toHaveAttribute("aria-busy", "false"); await expect(chat.log).toContainText("Penanda akhir");
      const assistant = chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true });
      await chat.log.focus(); await chat.log.press("Home"); await page.mouse.move(0, 0);
      await chat.root.screenshot({ path: testInfo.outputPath(`ai-reading-basics-bold-${surface}-${theme}-${width}.jpg`), type: "jpeg", quality: 65, animations: "disabled" });
      await expect(assistant.locator("strong")).toHaveText(["Kutipan bulan ini", "Pelanggan pertama", "RM 42.00", "Semak resit", "RECORD-000123"]);
      await expect(assistant.locator("p strong")).toHaveCount(1); await expect(assistant.locator("li strong")).toHaveCount(4);
      await expect(assistant.locator("ul")).toHaveCount(1); await expect(assistant.locator("ol")).toHaveCount(1);
      await expect(assistant.locator("pre code")).toHaveText('**teks kod bukan tebal**\nconst account = "000123";');
      await expect(assistant.locator("pre strong")).toHaveCount(0);
      await expect(assistant).toContainText("akaun 000123"); await expect(assistant).toContainText("kad 0000000000000042");
      await expect(assistant).toContainText("Nota HTML teks HTML bukan pemformatan tamat.");
      await expect(assistant).toContainText("Penanda akhir ** belum ditutup.");
      await expect(assistant.locator("script,style,img,svg,math,iframe,object,embed,link,meta,base,form,input,button,a,em")).toHaveCount(0);
      expect(await assistant.locator("*").evaluateAll((nodes) => nodes.some((node) => Array.from(node.attributes).some((attribute) => /^on/i.test(attribute.name))))).toBe(false);
      const strongStyle = await assistant.locator("strong").first().evaluate((node) => {
        const parent = node.parentElement!;
        return { weight: Number(getComputedStyle(node).fontWeight), parentWeight: Number(getComputedStyle(parent).fontWeight),
          color: getComputedStyle(node).color, parentColor: getComputedStyle(parent).color };
      });
      expect(strongStyle.weight).toBeGreaterThan(strongStyle.parentWeight); expect(strongStyle.color).toBe(strongStyle.parentColor);
      expect(chat.requests()).toBe(1); await chat.verify();
      console.log("AI_READING_BOLD=" + JSON.stringify({ surface, theme, width, strongCount: 5, strictCsp: true, ...strongStyle }));
    } finally { await chat.dispose(); }
  });
}

async function scrollEarlier(page: Page, log: Locator) {
  const before = await log.evaluate((node) => node.scrollTop), box = await log.boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.wheel(0, -620);
  await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBeLessThan(before - 100);
}

async function visibleAnchor(log: Locator) {
  return log.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const line = Array.from(node.querySelectorAll(".ai-markdown-paragraph > span")).find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return candidate.textContent?.includes("RECORD-") && box.top >= bounds.top + 4 && box.bottom <= bounds.bottom - 4;
    });
    if (!line) return null;
    return { text: line.textContent ?? "", offset: line.getBoundingClientRect().top - bounds.top, scrollTop: node.scrollTop };
  });
}

test("AI reading basics reveal full light 1366px: closed emphasis retains real nodes and native selection during further reveal", async ({ page, baseURL }) => {
  const answer = ["Laporan **KUTIPAN** akaun 000123.",
    ...Array.from({ length: 135 }, (_, index) => `Sambungan ${index + 1}: butiran sintetik memastikan perenggan terus berkembang tanpa mengganti teks terdahulu.`),
    "REVEAL-END 000123.",
  ].join("\n");
  const chat = await openChat(page, baseURL, "full", "light", 1366, answer);
  let identities: Awaited<ReturnType<Locator["evaluateHandle"]>> | undefined;
  try {
    await chat.input.fill("Semakan penegasan semasa jawapan berkembang"); await chat.send.click();
    const strong = chat.log.locator(".ai-markdown-paragraph strong").first();
    await expect(strong).toHaveText("KUTIPAN"); await expect(chat.log).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => chat.log.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(100);
    const logBox = await chat.log.boundingBox(); expect(logBox).not.toBeNull();
    const traceScroll = async (stage: string) => console.log("AI_READING_REVEAL_SCROLL=" + JSON.stringify({ stage,
      ...await chat.log.evaluate((node) => ({ top: node.scrollTop, height: node.scrollHeight,
        client: node.clientHeight, busy: node.getAttribute("aria-busy"),
        textLength: node.querySelector('[aria-label="Mesej pembantu AI"]')?.textContent?.length ?? 0 })) }));
    await page.mouse.move(logBox!.x + logBox!.width / 2, logBox!.y + logBox!.height / 2);
    await page.mouse.wheel(0, -100000);
    await traceScroll("first-wheel-dispatched");
    await expect(chat.root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
    await traceScroll("first-wheel-detached");
    await page.mouse.wheel(0, -100000);
    await traceScroll("second-wheel-dispatched");
    await expect.poll(() => chat.log.evaluate((node) => node.scrollTop)).toBeLessThanOrEqual(2);
    await traceScroll("second-wheel-settled");
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    identities = await strong.evaluateHandle((node) => ({ strong: node, line: node.closest("span"), paragraph: node.closest("p") }));
    const point = await strong.evaluate((node) => {
      const rect = node.getBoundingClientRect(), log = node.closest('[role="log"]')!.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, top: rect.top, bottom: rect.bottom, logTop: log.top, logBottom: log.bottom };
    });
    expect(point.top).toBeGreaterThanOrEqual(point.logTop); expect(point.bottom).toBeLessThanOrEqual(point.logBottom);
    await page.mouse.dblclick(point.x, point.y);
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe("KUTIPAN");
    const before = await chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true }).textContent();
    expect(before!.length).toBeLessThan(answer.length - 200);
    let current: Record<string, boolean | string> | undefined;
    await expect.poll(async () => {
      // Finalization may replace these nodes immediately after this evaluation.
      // Capture growth, busy state, identity and selection in the same sample.
      const sample = await identities!.evaluate((value: unknown, previous: number) => {
        const saved = value as { strong: Element; line: Element | null; paragraph: Element | null };
        const log = saved.paragraph?.closest('[role="log"]');
        return { busy: log?.getAttribute("aria-busy") === "true",
          grew: (log?.querySelector('[aria-label="Mesej pembantu AI"]')?.textContent?.length ?? 0) > previous + 200,
          strongConnected: saved.strong.isConnected, lineConnected: saved.line?.isConnected ?? false,
          paragraphConnected: saved.paragraph?.isConnected ?? false,
          sameStrong: saved.paragraph?.querySelector("strong") === saved.strong,
          sameLine: saved.strong.closest("span") === saved.line,
          selection: getSelection()?.toString() ?? "" };
      }, before!.length);
      if (sample.busy && sample.grew) current = sample;
      return sample.busy && sample.grew;
    }).toBe(true);
    expect(current).toEqual({ busy: true, grew: true, strongConnected: true, lineConnected: true, paragraphConnected: true,
      sameStrong: true, sameLine: true, selection: "KUTIPAN" });
    await expect(chat.log).toHaveAttribute("aria-busy", "false"); await expect(chat.log).toContainText("REVEAL-END 000123.");
    // Finalization may replace the transient article with history, as before.
    const final = chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true });
    await expect(final).toHaveCount(1); await expect(final.locator("strong")).toHaveText("KUTIPAN");
    expect(chat.requests()).toBe(1); await chat.verify();
    console.log("AI_READING_BOLD_REVEAL=" + JSON.stringify({ inProgressIdentity: current, finalSemanticBold: true, requests: chat.requests() }));
  } finally { await identities?.dispose(); await chat.dispose(); }
});

test("AI reading basics active light 1366px cpu4: completion while hidden preserves the earlier visible anchor across idle unmount", async ({ page, baseURL }) => {
  const answer = Array.from({ length: 90 }, (_, index) => `RECORD-${String(index + 1).padStart(3, "0")} akaun 000123: catatan sintetik untuk semakan kedudukan bacaan.`).join("\n");
  const chat = await openChat(page, baseURL, "floating", "light", 1366, answer, 4);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let accepted = () => {};
  const activeRequest = new Promise<void>((resolve) => { accepted = resolve; });
  let heldRequests = 0, requestFailed = () => false;
  try {
    await chat.input.fill("Sejarah sintetik untuk dibaca"); await chat.send.click();
    await expect(chat.log).toContainText("RECORD-090"); await expect(chat.log).toHaveAttribute("aria-busy", "false");
    await scrollEarlier(page, chat.log);
    const before = await visibleAnchor(chat.log); expect(before).not.toBeNull();
    await page.route((url) => url.pathname === "/api/ai/search", async (route) => {
      heldRequests++; requestFailed = () => route.request().failure() !== null; accepted(); await held;
      if (route.request().failure()) return;
      try { await route.fulfill({ json: { ai_explanation: "HIDDEN-COMPLETE 000123: jawapan kedua selesai tepat sekali." } }); }
      catch (error) { if (!route.request().failure()) throw error; }
    });
    await chat.input.fill("Permintaan kedua yang selesai semasa panel kecil"); await chat.send.click(); await activeRequest;
    await expect(chat.log).toHaveAttribute("aria-busy", "true");
    await chat.root.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
    await expect(chat.root).toHaveCount(1); await expect(chat.root).toBeHidden();
    expect(requestFailed(), "Minimize must preserve the held request").toBe(false);
    release(); await expect(chat.root).toHaveCount(0);
    expect(requestFailed(), "Hidden completion must settle without cancellation").toBe(false);
    await page.getByTestId("floating-ai-toggle").click(); await expect(chat.log).toBeVisible();
    const anchor = chat.log.locator(".ai-markdown-paragraph > span").filter({ hasText: before!.text });
    await expect(anchor).toHaveCount(1);
    const offset = () => anchor.evaluate((node) => node.getBoundingClientRect().top - node.closest('[role="log"]')!.getBoundingClientRect().top);
    console.log("AI_READING_ACTIVE_BOOKMARK_EVIDENCE=" + JSON.stringify({ before, afterOffset: await offset() }));
    await expect.poll(async () => Math.abs(await offset() - before!.offset), { message: "Hidden completion must not replace the saved visible reading anchor" }).toBeLessThanOrEqual(3);
    await expect(chat.log).toHaveAttribute("aria-busy", "false");
    await expect(chat.log.getByRole("article", { name: "Mesej pengguna", exact: true })).toHaveCount(2);
    await expect(chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true })).toHaveCount(2);
    await expect(chat.log).toContainText("HIDDEN-COMPLETE 000123: jawapan kedua selesai tepat sekali.");
    expect(heldRequests).toBe(1); expect(chat.requests()).toBe(1); await chat.verify();
    console.log("AI_READING_ACTIVE_BOOKMARK=" + JSON.stringify({ cpu: 4, heldRequests, completedRequests: chat.requests() + heldRequests,
      activePanelRetained: true, idleUnmountObserved: true, visibleAnchorPreserved: true }));
  } finally { release(); await chat.dispose(); }
});

for (const scenario of [{ theme: "light", width: 1366, cpu: 4 }, { theme: "dark", width: 375, cpu: 6 }] as const) {
  test(`AI reading basics bookmark ${scenario.theme} ${scenario.width}px cpu${scenario.cpu}: idle reopen restores the visible line while bottom-follow and reset stay correct`, async ({ page, baseURL }, testInfo) => {
    const answer = Array.from({ length: 90 }, (_, index) => `RECORD-${String(index + 1).padStart(3, "0")} akaun 000123: catatan sintetik untuk semakan kedudukan bacaan.`).join("\n");
    const chat = await openChat(page, baseURL, "floating", scenario.theme, scenario.width, answer, scenario.cpu);
    const minimize = chat.root.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true });
    const toggle = page.getByTestId("floating-ai-toggle");
    const gap = () => chat.log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
    const reopenIdle = async () => {
      await minimize.click(); await expect(chat.root).toHaveCount(0);
      await toggle.click(); await expect(chat.log).toBeVisible(); await expect(chat.log).toHaveAttribute("aria-busy", "false");
    };
    try {
      await chat.input.fill("Semakan kedudukan bacaan pertama"); await chat.send.click();
      await expect(chat.log).toContainText("RECORD-090"); await expect(chat.log).toHaveAttribute("aria-busy", "false");
      await expect.poll(gap).toBeLessThanOrEqual(2); await scrollEarlier(page, chat.log);
      await expect(chat.root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
      const before = await visibleAnchor(chat.log); expect(before, "Native wheel must expose an earlier fully visible line").not.toBeNull();
      await chat.root.screenshot({ path: testInfo.outputPath(`ai-reading-basics-bookmark-${scenario.theme}-${scenario.width}-cpu${scenario.cpu}-before.jpg`), type: "jpeg", quality: 65, animations: "disabled" });
      await reopenIdle();
      await chat.root.screenshot({ path: testInfo.outputPath(`ai-reading-basics-bookmark-${scenario.theme}-${scenario.width}-cpu${scenario.cpu}-after.jpg`), type: "jpeg", quality: 65, animations: "disabled" });
      const anchor = chat.log.locator(".ai-markdown-paragraph > span").filter({ hasText: before!.text });
      await expect(anchor).toHaveCount(1);
      const offset = () => anchor.evaluate((node) => node.getBoundingClientRect().top - node.closest('[role="log"]')!.getBoundingClientRect().top);
      console.log("AI_READING_BOOKMARK_EVIDENCE=" + JSON.stringify({ ...scenario, before, afterOffset: await offset() }));
      await expect.poll(async () => Math.abs(await offset() - before!.offset), { message: "Idle remount must preserve the actual visible line and its offset" }).toBeLessThanOrEqual(3);
      await expect(chat.root.getByRole("button", { name: "Ke mesej terkini", exact: true })).toBeVisible();
      await chat.log.focus(); await chat.log.press("End"); await expect.poll(gap).toBeLessThanOrEqual(2);
      await reopenIdle(); await expect.poll(gap).toBeLessThanOrEqual(2);
      await scrollEarlier(page, chat.log);
      await chat.root.getByRole("button", { name: "Reset sesi AI SQR", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0); await expect(chat.log.getByRole("article")).toHaveCount(0);
      await reopenIdle(); await expect(chat.log.getByRole("article")).toHaveCount(0);
      await chat.input.fill("Perbualan baharu selepas reset"); await chat.send.click();
      await expect(chat.log).toContainText("RECORD-090"); await expect(chat.log).toHaveAttribute("aria-busy", "false");
      await expect.poll(gap).toBeLessThanOrEqual(2); await reopenIdle(); await expect.poll(gap).toBeLessThanOrEqual(2);
      await expect(chat.log.getByRole("article", { name: "Mesej pengguna", exact: true })).toHaveCount(1);
      await expect(chat.log.getByRole("article", { name: "Mesej pembantu AI", exact: true })).toHaveCount(1);
      expect(chat.requests()).toBe(2); await chat.verify();
      console.log("AI_READING_BOOKMARK=" + JSON.stringify({ ...scenario, visibleAnchorPreserved: true, idleUnmountObserved: true,
        bottomFollowPreserved: true, resetClearedBookmark: true, requests: chat.requests() }));
    } finally { await chat.dispose(); }
  });
}
