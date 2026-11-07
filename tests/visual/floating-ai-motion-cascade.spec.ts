import { expect, test } from "@playwright/test";
import { checkFixture, installFixture } from "./helpers/save-collection-fixture";

test("floating Q hover and notification transitions survive low-spec CSS and respect reduced motion", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "superuser", aiEnabled: true, theme: "dark" });
  const origin = new URL(baseURL!).origin;
  await page.context().route(`${origin}/api/settings/tab-visibility`, (route) => route.fulfill({ json: {
    role: "superuser", tabs: { home: true, saved: true, viewer: true, "collection-report": true },
  } }));
  await page.addInitScript(() => {
    localStorage.setItem("perf_mode", "high");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/viewer", { waitUntil: "domcontentloaded" });
  const slot = page.getByTestId("floating-ai-toggle").locator('[data-floating-ai-artwork="true"]');
  await expect(slot.locator(".sidebar-q-artwork")).toHaveAttribute("data-ready", "true");
  const durations = () => slot.evaluate((node) => ({
    hover: getComputedStyle(node).transitionDuration,
    dots: getComputedStyle(node.querySelector(".sidebar-q-dot-cluster")!).transitionDuration,
    badge: getComputedStyle(node.querySelector('[data-testid="floating-ai-unread-badge"]')!).transitionDuration.split(",")[0]!.trim(),
  }));
  for (const low of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle("low-spec", value), low);
    const measured = await durations();
    console.log("Q_MOTION_CASCADE=" + JSON.stringify({ low, reduced: false, measured }));
    expect(measured).toEqual({ hover: "0.22s", dots: "0.18s", badge: "0.18s" });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(durations).toEqual({ hover: "0s", dots: "0s", badge: "0s" });
  await expect(slot.locator(".sidebar-q-artwork")).toHaveAttribute("data-motion", "reduced");
  await checkFixture(page, fixture);
});
