import { expect, test, type Page } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

type Surface = "full" | "floating";
async function openAI(page: Page, baseURL: string | undefined, surface: Surface, reduced = false, theme?: "light" | "dark") {
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme: theme ?? (surface === "full" ? "light" : "dark") });
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem("perf_mode", "low");
  });
  await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, ai: true, "collection-report": true },
  } }));
  await page.goto(surface === "full" ? "/ai" : "/viewer");
  if (surface === "floating") await page.getByTestId("floating-ai-toggle").click();
  const root = surface === "full" ? page.locator("main") : page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = root.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  await expect(input).toBeVisible();
  const log = root.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  const send = root.getByRole("button", { name: surface === "full" ? "Hantar" : "Hantar soalan AI", exact: true });
  return { fixture, root, input, log, send };
}

test("AI readable layout floating streaming code retains keyboard focus", async ({ page, baseURL }) => {
  const answer = "```text\n" + "synthetic_account = 0000123412341234; ".repeat(200) + "\n```";
  await page.route((url) => url.pathname === "/api/ai/search", (route) => route.fulfill({ json: { ai_explanation: answer } }));
  const { fixture, root, input, log, send } = await openAI(page, baseURL, "floating");
  await input.fill("Synthetic code keyboard check"); await send.click();
  const code = log.getByRole("region", { name: "Kod dalam jawapan AI", exact: true });
  await expect(code).toContainText("synthetic_account");
  await code.focus();
  const initialLength = (await code.innerText()).length;
  await expect.poll(async () => (await code.innerText()).length).toBeGreaterThan(initialLength + 100);
  await expect(code).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => code.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await root.getByRole("button", { name: "Hentikan AI SQR", exact: true }).click();
  await expect(input).toBeEnabled();
  expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

for (const surface of ["full", "floating"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1366]) {
      test(`AI readable layout ${surface} ${theme} ${width}px preserves text, controls and reset`, async ({ page, baseURL }) => {
        await page.setViewportSize({ width, height: 900 });
        const reference = "SYNTHETICREFERENCE".repeat(20);
        const answer = `Semakan sintetik.\n\nRujukan: ${reference}\n\nNombor akaun: 0000123412341234\n\n${Array.from({ length: 25 }, () => "Baris bacaan sintetik.").join("\n")}\n\nSemakan sintetik selesai.`;
        await page.route((url) => url.pathname === "/api/ai/search", (route) => route.fulfill({ json: { ai_explanation: answer } }));
        const { fixture, root, input, log, send } = await openAI(page, baseURL, surface, true, theme);
        await input.fill("Semak rujukan sintetik");
        await send.click();
        await expect(log).toContainText("Semakan sintetik selesai.");
        await expect(input).toBeEnabled();
        const message = surface === "full" ? log.locator(".ai-page-bubble").last() : log.locator(".ai-bubble-assistant").last();
        await expect(message).toHaveCSS("font-size", "16px");
        await expect(input).toHaveCSS("font-size", "16px");
        await expect(message).toContainText(reference);
        await expect(message).toContainText("0000123412341234");
        await log.focus();
        await expect(log).toBeFocused();
        await page.keyboard.press("End");
        await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        const reading = await log.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth, mask: getComputedStyle(node).maskImage }));
        expect(reading.scroll).toBeLessThanOrEqual(reading.client + 1);
        expect(reading.mask).toBe("none");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
        if (surface === "floating") {
          await input.blur();
          await expect.poll(async () => (await root.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(width < 768 ? 340 : 440);
          const box = (await root.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(901);
          expect(box.height).toBeGreaterThan(420);
        } else if (width >= 768) {
          expect((await log.boundingBox())!.height).toBeGreaterThanOrEqual(400);
        }
        await root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true }).click();
        await expect(log).not.toContainText(reference);
        await expect(input).toBeEnabled();
        if (surface === "floating") {
          await input.focus();
          await page.keyboard.press("Escape");
          await expect(root).toBeHidden();
          await expect(page.getByTestId("floating-ai-toggle")).toBeFocused();
        }
        expect(fixture.errors).toEqual([]);
        expect(fixture.unexpected).toEqual([]);
      });
    }
  }
}

for (const surface of ["full", "floating"] as const) {
  test(`Impeccable AI ${surface} preserves reading position, keyboard focus and complete progressive answers`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width: surface === "full" ? 1366 : 375, height: 900 });
    const answer = Array.from({ length: 150 }, (_, index) => `Synthetic answer line ${index}.`).join("\n");
    await page.route((url) => url.pathname === "/api/ai/search", (route) => route.fulfill({ json: { ai_explanation: answer } }));
    const { fixture, root, input, log, send } = await openAI(page, baseURL, surface);
    await input.fill("Synthetic scroll verification"); await send.click();
    await expect.poll(() => log.evaluate((element) => element.scrollTop), { timeout: 5000 }).toBeGreaterThan(50);
    await log.hover(); await page.mouse.wheel(0, -3000);
    const jump = root.getByRole("button", { name: "Ke mesej terkini", exact: true });
    await expect(jump).toBeVisible(); await jump.focus();
    const before = await log.evaluate((element) => element.scrollTop);
    await page.waitForTimeout(160);
    expect(await log.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(before + 2);
    await expect(jump).toBeFocused();
    const screenshotPath = testInfo.outputPath(`ai-reading-${surface}.png`);
    await root.screenshot({ path: screenshotPath, animations: "disabled" });
    await testInfo.attach(`ai-reading-${surface}`, { path: screenshotPath, contentType: "image/png" });
    await jump.press("Enter");
    await expect(jump).toBeFocused();
    await expect.poll(() => log.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(2);
    await expect(input).toBeEnabled({ timeout: 6000 });
    expect(((await log.innerText()).match(/Synthetic answer line /g) ?? []).length).toBe(150);
    await page.keyboard.press("Tab"); await expect(input).toBeFocused();
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  });

  test(`Impeccable AI ${surface} honors reduced motion initially and when changed during a response`, async ({ page, baseURL }) => {
    const answer = "Synthetic reduced motion response. ".repeat(400);
    await page.route((url) => url.pathname === "/api/ai/search", (route) => route.fulfill({ json: { ai_explanation: answer } }));
    const { fixture, input, log, send } = await openAI(page, baseURL, surface, true);
    await input.fill("Synthetic reduced motion"); await send.click();
    await expect(input).toBeEnabled({ timeout: 2000 });
    expect(((await log.innerText()).match(/Synthetic reduced motion response\./g) ?? []).length).toBe(400);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await input.fill("Synthetic changed preference"); await send.click();
    await expect(input).toBeDisabled();
    const visibleAnswerParts = async () => ((await log.innerText()).match(/Synthetic reduced motion response\./g) ?? []).length;
    await expect.poll(visibleAnswerParts).toBeGreaterThan(400);
    expect(await visibleAnswerParts()).toBeLessThan(800);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(input).toBeEnabled({ timeout: 2000 });
    expect(((await log.innerText()).match(/Synthetic reduced motion response\./g) ?? []).length).toBe(800);
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  });

  test(`Impeccable AI ${surface} stops an old reveal, retains its visible prefix and accepts a fresh answer`, async ({ page, baseURL }) => {
    let requests = 0;
    const cancelledAnswer = "Cancelled answer chunk. ".repeat(500);
    await page.route((url) => url.pathname === "/api/ai/search", (route) => {
      requests += 1;
      return route.fulfill({ json: { ai_explanation: requests === 1 ? cancelledAnswer : "Fresh answer delivered." } });
    });
    const { fixture, root, input, log, send } = await openAI(page, baseURL, surface);
    await input.fill("First synthetic question"); await send.click();
    await expect(log).toContainText("Cancelled answer chunk.");
    const stop = root.getByRole("button", { name: "Hentikan AI SQR", exact: true });
    const clickEvidence = await stop.evaluateHandle((button) => {
      const evidence = { text: "", captured: false };
      const listener = () => {
        const articles = button.ownerDocument.querySelectorAll('[role="log"][aria-label="Perbualan AI SQR"] [role="article"][aria-label="Mesej pembantu AI"]');
        evidence.text = articles[articles.length - 1]?.textContent ?? ""; evidence.captured = true;
      };
      button.addEventListener("click", listener, { capture: true, once: true });
      return { evidence, dispose: () => button.removeEventListener("click", listener, true) };
    });
    try {
      await stop.click();
      const clicked = await clickEvidence.evaluate(({ evidence }) => ({ ...evidence }));
      expect(clicked.captured).toBe(true); expect(clicked.text.length).toBeGreaterThan(0);
      expect(clicked.text.length).toBeLessThan(cancelledAnswer.length);
      const assistants = log.getByRole("article", { name: "Mesej pembantu AI", exact: true });
      await expect(input).toBeEnabled(); await expect(log).toHaveAttribute("aria-busy", "false");
      await expect(assistants).toHaveCount(1); expect(await assistants.first().textContent()).toBe(clicked.text);
      await input.fill("Second synthetic question"); await send.click();
      await expect(input).toBeEnabled({ timeout: 6000 });
      await expect(log).toContainText("Fresh answer delivered.");
      await page.waitForTimeout(2600);
      await expect(assistants).toHaveCount(2); expect(await assistants.first().textContent()).toBe(clicked.text);
      await expect(assistants.last()).toHaveText("Fresh answer delivered.");
      await expect(log).not.toContainText(cancelledAnswer);
      await expect(log).toContainText("First synthetic question");
      await expect(log).toContainText("Second synthetic question");
      expect(requests).toBe(2);
      expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
    } finally { await clickEvidence.evaluate((probe) => probe.dispose()); await clickEvidence.dispose(); }
  });

  test(`Impeccable AI ${surface} retains queued retry and reset behavior`, async ({ page, baseURL }) => {
    let attempts = 0;
    await page.route((url) => url.pathname === "/api/ai/search", (route) => {
      attempts += 1;
      return route.fulfill({ json: attempts === 1 ? { processing: true } : { ai_explanation: "Retry answer delivered." } });
    });
    const { fixture, root, input, log, send } = await openAI(page, baseURL, surface);
    await input.fill("Synthetic queued question"); await send.click();
    await expect(log).toContainText("Retry answer delivered.", { timeout: 12000 });
    await expect(input).toBeEnabled(); expect(attempts).toBe(2);
    await root.getByRole("button", { name: surface === "full" ? "Sembang Baharu" : "Reset sesi AI SQR", exact: true }).click();
    await expect(log).not.toContainText("Retry answer delivered.");
    await expect(log).not.toContainText("Synthetic queued question");
    await expect(input).toBeEnabled();
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  });
}
