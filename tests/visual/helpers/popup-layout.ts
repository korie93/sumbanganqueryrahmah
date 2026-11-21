import { expect, type Locator } from "@playwright/test";

export async function expectPopupFits(popup: Locator) {
  await expect(popup).toBeVisible();
  await expect.poll(() => popup.evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    const problems: string[] = [];
    if (bounds.left < -1 || bounds.top < -1 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1) {
      problems.push("panel outside viewport");
    }
    if (panel.scrollWidth > panel.clientWidth + 1) problems.push("horizontal scrolling");
    for (const el of panel.querySelectorAll("button, input, a[href], [role=option], h2, p")) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) problems.push(el.tagName);
      if (el.matches("h2, p") && el.scrollWidth > el.clientWidth + 1) problems.push("clipped text");
    }
    return problems;
  })).toEqual([]);
}
