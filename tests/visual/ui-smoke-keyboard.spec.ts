import { expect, test, type Page } from "@playwright/test";
import { closeKeyboardMenu, openKeyboardMenu } from "../../scripts/lib/ui-keyboard-menu.mjs";

async function installMenu(page: Page, behavior: "delayed" | "missing-focus" | "stuck-open") {
  // Deliberately synthetic lifecycle cases: no application, account or backend.
  await page.setContent('<button id="trigger" aria-expanded="false">Open</button><div id="menu" hidden><button id="item">Item</button></div>');
  await page.evaluate((mode) => {
    const trigger = document.querySelector<HTMLButtonElement>("#trigger")!;
    const menu = document.querySelector<HTMLElement>("#menu")!;
    const item = document.querySelector<HTMLButtonElement>("#item")!;
    trigger.addEventListener("click", () => {
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      item.focus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (mode === "stuck-open") {
        trigger.focus(); // Focus alone must not make a failed dismissal pass.
        return;
      }
      trigger.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      if (mode === "delayed") window.setTimeout(() => trigger.focus(), 350);
    });
  }, behavior);
  return { trigger: page.locator("#trigger"), menu: page.locator("#menu") };
}

test("keyboard smoke observes delayed focus restoration beyond the former 100 ms sleep", async ({ page }) => {
  const { trigger, menu } = await installMenu(page, "delayed");
  await openKeyboardMenu(page, trigger, menu);
  await closeKeyboardMenu(page, trigger, menu);
  await expect(trigger).toBeFocused();
});

test("keyboard smoke rejects missing focus restoration without forcing focus", async ({ page }) => {
  const { trigger, menu } = await installMenu(page, "missing-focus");
  await openKeyboardMenu(page, trigger, menu);
  await expect(closeKeyboardMenu(page, trigger, menu)).rejects.toThrow("Escape should return focus to the menu trigger");
  await expect(trigger).not.toBeFocused();
});

test("keyboard smoke rejects an undismissed menu even when its trigger is focused", async ({ page }) => {
  const { trigger, menu } = await installMenu(page, "stuck-open");
  await openKeyboardMenu(page, trigger, menu);
  await expect(closeKeyboardMenu(page, trigger, menu)).rejects.toThrow("Escape should collapse the menu");
  await expect(menu).toBeVisible();
});
