import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture } from "./helpers/save-collection-fixture";

// Real production UI with synthetic, localhost-only HTTP. Reduced motion keeps
// the 15-pair setup bounded; no React state, message IDs or counters are injected.
test.use({ viewport: { width: 1366, height: 900 }, serviceWorkers: "block" });
test.setTimeout(90_000);

const reply = (index: number) => `Synthetic reply ${index}.`;

async function openChat(page: Page, baseURL: string | undefined) {
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true });
  const origin = new URL(baseURL!).origin;
  const held = new Map<number, { wait: Promise<void>; release: () => void }>();
  const state = { searches: 0, completed: [] as number[], aborted: [] as number[] };
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => route.request().method() === "GET"
    ? route.fulfill({ json: { role: "superuser", tabs: { home: true, saved: true, viewer: true, "collection-report": true } } })
    : route.fallback());
  await page.context().route(`${origin}/api/collection/source-configs`, (route) => route.request().method() === "GET"
    ? route.fulfill({ json: { ok: true, sourceConfigs: [] } }) : route.fallback());
  await page.context().route(`${origin}/api/ai/search`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const index = ++state.searches;
    const body = route.request().postDataJSON() as { query?: unknown };
    expect(body.query).toBe(`Synthetic question ${index}`);
    await held.get(index)?.wait;
    try {
      await route.fulfill({ json: { ai_explanation: reply(index) }, headers: { "Cache-Control": "no-store" } });
      state.completed.push(index);
    } catch (error) {
      // Reset legitimately aborts its in-flight fetch. Never hide other errors.
      if (!route.request().failure()) throw error;
      state.aborted.push(index);
    }
  });
  await page.goto("/viewer", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#viewer-dataset-title")).toHaveText("Data Viewer");
  const trigger = page.getByTestId("floating-ai-toggle");
  await trigger.click();
  const panel = page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
  const input = panel.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
  const log = panel.getByRole("log", { name: "Perbualan AI SQR", exact: true });
  const assistantMessages = log.getByRole("article", { name: "Mesej pembantu AI", exact: true });
  const badge = page.getByTestId("floating-ai-unread-badge");
  const hold = (index: number) => {
    let release: () => void = () => {};
    const wait = new Promise<void>((resolve) => { release = resolve; });
    held.set(index, { wait, release });
  };
  const send = async (index: number) => {
    await input.fill(`Synthetic question ${index}`);
    await panel.getByRole("button", { name: "Hantar soalan AI", exact: true }).click();
    await expect.poll(() => state.searches).toBe(index);
  };
  const finished = async (index: number) => {
    await expect(assistantMessages.last()).toHaveText(reply(index));
    await expect(log).toHaveAttribute("aria-busy", "false");
    await expect(input).toBeEnabled();
  };
  const minimize = () => panel.getByRole("button", { name: "Kecilkan panel AI SQR", exact: true }).click();
  await expect(input).toBeVisible();
  return { fixture, state, panel, input, log, assistantMessages, badge, trigger, hold, send, finished, minimize,
    release: (index: number) => held.get(index)?.release(),
    releaseAll: () => { for (const gate of held.values()) gate.release(); } };
}

test("AI unread cap: hidden replies still notify after 15 retained pairs, without false remount notifications", async ({ page, baseURL }) => {
  const chat = await openChat(page, baseURL);
  try {
    for (let index = 1; index <= 15; index++) { await chat.send(index); await chat.finished(index); }
    await expect(chat.log.getByRole("article")).toHaveCount(30);
    await expect(chat.assistantMessages).toHaveCount(15);
    await expect(chat.badge).toBeHidden();
    chat.hold(16); await chat.send(16); await chat.minimize(); chat.release(16);
    await expect(chat.badge, "A new reply must notify even when assistant count stays at 15").toHaveText("1");
    await expect(chat.badge).toBeVisible();
    await expect(chat.trigger).toHaveAccessibleDescription(/1 mesej AI belum dibaca/);
    await chat.trigger.click(); await chat.finished(16);
    await expect(chat.log.getByRole("article")).toHaveCount(30);
    await expect(chat.assistantMessages).toHaveCount(15);
    await expect(chat.log).not.toContainText(reply(1));
    await expect(chat.badge).toBeHidden();

    // Idle minimization unmounts AIChat; the retained context history must not
    // become unread merely because that presentation is mounted again.
    const firstInputId = await chat.input.getAttribute("id");
    await chat.minimize();
    await expect(page.locator(".ai-chat-container")).toHaveCount(0);
    await expect(chat.badge).toBeHidden();
    await chat.trigger.click(); await chat.finished(16);
    expect(await chat.input.getAttribute("id")).not.toBe(firstInputId);
    await expect(chat.badge).toBeHidden();
    await chat.minimize(); await expect(chat.badge).toBeHidden();
    await chat.trigger.click();

    chat.hold(17); await chat.send(17); await chat.minimize(); chat.release(17);
    await expect(chat.badge).toHaveText("1"); await expect(chat.badge).toBeVisible();
    await expect.poll(() => chat.state.completed.filter((index) => index === 17).length).toBe(1);
    // Subsequent presentation and resize effects must not count this ID twice.
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(chat.badge).toHaveText("1");
    await chat.trigger.click(); await chat.finished(17); await expect(chat.badge).toBeHidden();
    await chat.minimize(); await expect(chat.badge).toBeHidden();
    expect(chat.state.searches).toBe(17);
    console.log("AI_UNREAD_CAP=" + JSON.stringify({ pairsSent: 17, retainedMessages: 30, retainedAssistants: 15, hiddenReplies: 2 }));
    await checkFixture(page, chat.fixture);
  } finally { chat.releaseAll(); }
});

test("AI unread cap: reset rejects a held late reply and the next hidden reply notifies once", async ({ page, baseURL }) => {
  const chat = await openChat(page, baseURL);
  try {
    await chat.send(1); await chat.finished(1);
    chat.hold(2); await chat.send(2);
    await chat.panel.getByRole("button", { name: "Reset sesi AI SQR", exact: true }).click();
    const resetConfirmation = page.getByRole("alertdialog", { name: "Mulakan sembang baharu?", exact: true });
    await expect(resetConfirmation).toBeVisible();
    await expect(chat.panel.locator('[role="log"][aria-label="Perbualan AI SQR"]')).toHaveAttribute("aria-busy", "true");
    await resetConfirmation.getByRole("button", { name: "Sembang Baharu", exact: true }).click();
    await expect(resetConfirmation).toHaveCount(0);
    await expect(chat.log.getByRole("article")).toHaveCount(0);
    await expect(chat.input).toHaveValue(""); await expect(chat.input).toBeEnabled();
    await chat.minimize(); chat.release(2);
    await expect.poll(() => chat.state.completed.includes(2) || chat.state.aborted.includes(2)).toBe(true);
    await expect(chat.badge).toBeHidden();
    await chat.trigger.click();
    await expect(chat.log.getByRole("article")).toHaveCount(0);
    await expect(chat.log).not.toContainText(reply(2));
    chat.hold(3); await chat.send(3); await chat.minimize(); chat.release(3);
    await expect(chat.badge).toHaveText("1"); await expect(chat.badge).toBeVisible();
    await chat.trigger.click(); await chat.finished(3); await expect(chat.badge).toBeHidden();
    await expect(chat.log.getByRole("article")).toHaveCount(2);
    expect(chat.state.searches).toBe(3);
    await checkFixture(page, chat.fixture);
  } finally { chat.releaseAll(); }
});
