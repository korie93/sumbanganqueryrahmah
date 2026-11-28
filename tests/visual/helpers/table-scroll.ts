import { expect, type Locator } from "@playwright/test";

export async function pageDownAndWaitForScrollEnd(scrollport: Locator) {
  // Home can interrupt a native PageDown while the viewport is still moving.
  const motion = await scrollport.evaluateHandle((node) => {
    const state = { ended: false };
    node.addEventListener("scrollend", () => { state.ended = true; }, { once: true });
    return state;
  });
  try {
    await scrollport.press("PageDown");
    await expect.poll(() => motion.evaluate((state) => state.ended), {
      message: "PageDown should finish scrolling the focused table",
    }).toBe(true);
  } finally {
    await motion.dispose();
  }
}

export async function expectColumnNavigation(navigation: Locator, scrollport: Locator) {
  const first = navigation.getByRole("button", { name: "Jump to first column" });
  const last = navigation.getByRole("button", { name: "Jump to last column" });
  const progress = navigation.getByRole("progressbar");
  const scrollLeft = () => scrollport.evaluate((node) => node.scrollLeft);

  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Scroll columns left" })).toBeDisabled();
  await expect(progress).toHaveText("0%");
  await navigation.getByRole("button", { name: "Scroll columns right" }).click();
  await expect.poll(scrollLeft).toBeGreaterThan(0);

  // One step can reach the end. Exercise the jump from a known starting edge.
  await first.click();
  await expect(progress).toHaveText("0%");
  await last.click();
  await expect(progress).toHaveText("100%");
  await expect(last).toBeDisabled();
  await first.click();
  await expect.poll(scrollLeft).toBe(0);
  await expect(progress).toHaveText("0%");
}
