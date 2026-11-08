import { expect, test } from "@playwright/test";
import { installFixture } from "./helpers/save-collection-fixture";

for (const theme of ["light", "dark"] as const) for (const width of [375, 1366]) {
  test(`AI header evidence ${theme} ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      localStorage.setItem("perf_mode", "low");
    });
    await page.route((url) => url.pathname === "/api/collection/source-configs", (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
    await page.route((url) => url.pathname === "/api/settings/tab-visibility", (route) => route.fulfill({ json: {
      role: "superuser", tabs: { home: true, viewer: true, ai: true },
    } }));
    await page.goto("/viewer");
    await page.getByTestId("floating-ai-toggle").click();
    const panel = page.locator('[data-floating-ai-dialog="true"][role="dialog"]');
    await expect(panel.getByText("Bantuan untuk koleksi dan rekod SQR.", { exact: true })).toBeVisible();
    const input = panel.getByRole("textbox", { name: "Taip soalan kepada AI SQR", exact: true });
    await expect(input).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await input.focus();
    await input.blur();
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await panel.screenshot({ path: testInfo.outputPath(`ai-header-${theme}-${width}.jpg`), type: "jpeg", quality: 65, animations: "disabled" });
    const result = await panel.evaluate((node) => {
      const header = node.querySelector("header")!;
      const description = header.querySelector("p")!;
      const chat = node.querySelector(".ai-chat-container")!;
      const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { header: rect(header), description: rect(description), panel: rect(node),
        headerBackground: getComputedStyle(header).backgroundColor,
        chatBackground: getComputedStyle(chat).backgroundColor,
        descriptionColor: getComputedStyle(description).color,
        headerText: getComputedStyle(header).color };
    });
    console.log("AI_HEADER_COLORS=" + JSON.stringify({ theme, width, ...result }));
    if (theme === "light") expect(result.headerBackground).toBe(result.chatBackground);
    expect(result.description.width).toBeGreaterThan(0);
    expect(result.header.width).toBeLessThanOrEqual(result.panel.width);
    expect(fixture.errors).toEqual([]); expect(fixture.unexpected).toEqual([]);
  });
}
