import { expect, type Locator } from "@playwright/test";

export async function expectPaddedActions(group: Locator) {
  const actions = group.locator("button, a[href]");
  await expect(actions).toHaveCount(3);
  for (const action of await actions.all()) {
    const metrics = await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const content = range.getBoundingClientRect();
      const icon = element.querySelector("svg");
      const text = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      let iconGap = null;
      if (icon && text) {
        range.selectNodeContents(text);
        iconGap = range.getBoundingClientRect().left - icon.getBoundingClientRect().right;
      }
      return {
        label: element.textContent?.trim(),
        inset: Math.min(content.left - bounds.left, bounds.right - content.right),
        height: bounds.height,
        iconGap,
      };
    });
    expect(metrics.inset, metrics.label).toBeGreaterThanOrEqual(8);
    expect(metrics.height, metrics.label).toBeGreaterThanOrEqual(36);
    if (metrics.iconGap !== null) {
      expect(metrics.iconGap, metrics.label).toBeGreaterThanOrEqual(4);
      expect(metrics.iconGap, metrics.label).toBeLessThanOrEqual(12);
    }
  }
}
