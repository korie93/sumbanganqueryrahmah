import { expect } from "@playwright/test";

const menuTimeout = 5_000;

/** Exercise keyboard opening only after the trigger and portal are ready. */
export async function openKeyboardMenu(page, trigger, menu) {
  await trigger.focus();
  await expect(trigger, "Menu trigger should be keyboard focusable").toBeFocused({ timeout: menuTimeout });
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: menuTimeout });
  await expect(menu).toBeVisible({ timeout: menuTimeout });
  await expect.poll(
    () => menu.evaluate((element) => element.contains(document.activeElement)),
    { message: "Keyboard opening should move focus into the menu", timeout: menuTimeout },
  ).toBe(true);
  // Radix's focus scope can mount before its dismissable-layer effect registers
  // Escape. Observe post-mount paints rather than sending the key on visibility alone.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/** Wait for real dismissal and focus restoration, never force focus or retry Escape. */
export async function closeKeyboardMenu(page, trigger, menu) {
  await page.keyboard.press("Escape");
  await expect(trigger, "Escape should collapse the menu").toHaveAttribute("aria-expanded", "false", { timeout: menuTimeout });
  await expect(menu, "Escape should dismiss the menu").toBeHidden({ timeout: menuTimeout });
  await expect(trigger, "Escape should return focus to the menu trigger").toBeFocused({ timeout: menuTimeout });
}
