import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  accountRow,
  assertAccountFixtureClean,
  installAccountManagementFixture,
  managedAccounts,
  openAccountManagement,
} from "./helpers/account-management-fixture";

// Actual confirmation components and callbacks, isolated to the existing strict
// synthetic static loopback fixture. No backend or production data is accessed.
test.use({ serviceWorkers: "block" });
const actions = [
  { kind: "reset", menu: "Send Reset Email", details: "Reset", title: "Send Password Reset Email", confirm: "Send Reset Email", username: "maya.synthetic", id: "synthetic-managed-1" },
  { kind: "ban", menu: "Ban", details: "Ban", title: "Ban Managed Account", confirm: "Ban", username: "maya.synthetic", id: "synthetic-managed-1" },
  { kind: "unban", menu: "Unban", details: "Unban", title: "Unban Managed Account", confirm: "Unban", username: "synthetic.user.04", id: "synthetic-managed-4" },
  { kind: "delete", menu: "Delete", details: "Delete", title: "Delete Managed Account", confirm: "Delete User", username: "maya.synthetic", id: "synthetic-managed-1" },
] as const;
type Action = typeof actions[number];
const confirmation = (page: Page, action: Action) => page.getByRole("alertdialog", { name: action.title, exact: true });
const moreButton = (page: Page, username: string) => accountRow(page, username).getByRole("button", { name: `More actions for ${username}`, exact: true });
const detailsButton = (page: Page, username: string) => accountRow(page, username).getByRole("button", { name: `Details for ${username}`, exact: true });

async function openFromMore(page: Page, action: Action, username: string = action.username) {
  await moreButton(page, username).click();
  await page.getByRole("menuitem", { name: action.menu, exact: true }).click();
  const dialog = confirmation(page, action);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  return dialog;
}

async function assertContained(page: Page, dialog: Locator) {
  const dimensions = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
  });
  expect(dimensions.x).toBeGreaterThanOrEqual(0);
  expect(dimensions.y).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.viewportHeight);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function assertActions44(dialog: Locator) {
  const sizes = await dialog.getByRole("button").evaluateAll((buttons) => buttons.map((button) => {
    const { width, height } = button.getBoundingClientRect();
    return { width, height };
  }));
  expect(sizes).toHaveLength(2);
  expect(sizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 768, 1366]) {
    test(`Account confirmations have bounded typography and safe keyboard dismissal at ${width}px ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installAccountManagementFixture(page, baseURL, { theme });
      await openAccountManagement(page);
      for (const action of actions) {
        const dialog = await openFromMore(page, action);
        await expect(dialog.getByRole("heading", { name: action.title, exact: true })).toHaveCount(1);
        const impact = dialog.getByRole("list", { name: "Action impact", exact: true });
        await expect(impact.getByRole("listitem")).toHaveCount(3);
        await expect(dialog).toContainText(action.username);
        await assertActions44(dialog);
        await assertContained(page, dialog);
        for (const element of [dialog.getByRole("heading", { name: action.title, exact: true }), impact]) {
          expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        }
        const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
        const confirm = dialog.getByRole("button", { name: action.confirm, exact: true });
        // Radix AlertDialog intentionally opens on the non-destructive action.
        await expect(cancel).toBeFocused();
        for (const key of ["Shift+Tab", "Tab", "Tab", "Tab"]) {
          await page.keyboard.press(key);
          expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
        }
        await cancel.focus();
        const layout = await cancel.evaluate((node) => ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom }));
        const confirmLayout = await confirm.boundingBox();
        if (width === 320) expect(layout.top - (confirmLayout!.y + confirmLayout!.height)).toBeCloseTo(8, 1);
        await page.screenshot({ path: test.info().outputPath(`account-confirmation-${action.kind}-${width}-${theme}.png`), animations: "disabled" });
        await cancel.click();
        await expect(dialog).toBeHidden();
        await expect(moreButton(page, action.username)).toBeFocused();
        await openFromMore(page, action);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(moreButton(page, action.username)).toBeFocused();
        expect(fixture.writes).toEqual([]);
      }
      await assertAccountFixtureClean(page, fixture);
    });
  }
}

test("Account confirmation dismissal returns the original Details opener without writing", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  for (const action of actions.filter((entry) => entry.kind !== "unban")) {
    for (const dismiss of ["Cancel", "Escape"] as const) {
      const opener = detailsButton(page, action.username);
      await opener.click();
      const details = page.getByRole("dialog", { name: "Account details", exact: true });
      await expect(details).toBeVisible();
      await details.getByRole("button", { name: action.details, exact: true }).click();
      await expect(details).toBeHidden();
      const dialog = confirmation(page, action);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      if (dismiss === "Cancel") await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      expect(fixture.writes).toEqual([]);
    }
  }
  await assertAccountFixtureClean(page, fixture);
});

for (const theme of ["light", "dark"] as const) {
  test(`Account confirmations scroll internally with long usernames and fixed actions at 320x480 ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    const fixture = await installAccountManagementFixture(page, baseURL, { theme });
    const username = "w".repeat(32);
    const bannedUsername = "m".repeat(32);
    expect(username).toHaveLength(32);
    expect(bannedUsername).toHaveLength(32);
    fixture.users[0]!.username = username;
    fixture.users[3]!.username = bannedUsername;
    await page.goto("/settings?section=account-management");
    await expect(accountRow(page, username)).toBeVisible();
    for (const action of actions) {
      const targetName = action.kind === "unban" ? bannedUsername : username;
      const dialog = await openFromMore(page, action, targetName);
      await expect(dialog).toContainText(targetName);
      await assertContained(page, dialog);
      await assertActions44(dialog);
      const bodyName = action.kind === "reset" ? "Password reset action details"
        : action.kind === "delete" ? "Delete account action details" : `${action.menu} account action details`;
      const body = dialog.getByRole("region", { name: bodyName, exact: true });
      await expect(body).toHaveCount(1);
      await expect(body).toHaveAttribute("tabindex", "0");
      const scroll = await body.evaluate((element) => ({ height: element.clientHeight, scrollHeight: element.scrollHeight }));
      expect(scroll.height).toBeGreaterThan(0);
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.height);
      for (const child of [body, dialog.getByRole("heading", { name: action.title, exact: true }), dialog.locator("p")]) {
        expect(await child.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
      const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
      const confirm = dialog.getByRole("button", { name: action.confirm, exact: true });
      await expect(cancel).toBeInViewport();
      await expect(confirm).toBeInViewport();
      const footerBefore = await cancel.boundingBox();
      // The scrolling details must be keyboard reachable; a programmatic scroll
      // alone cannot demonstrate that users can read the complete action impact.
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(body).toBeFocused();
      await page.keyboard.press("PageDown");
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(cancel).toBeInViewport();
      await expect(confirm).toBeInViewport();
      expect((await cancel.boundingBox())!.y).toBeCloseTo(footerBefore!.y, 1);
      await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(cancel).toBeInViewport();
      await expect(confirm).toBeInViewport();
      const footerAfter = await cancel.boundingBox();
      expect(footerAfter!.y).toBeCloseTo(footerBefore!.y, 1);
      await page.screenshot({ path: test.info().outputPath(`account-confirmation-${action.kind}-short-longname-${theme}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(moreButton(page, targetName)).toBeFocused();
    }
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  });
}

test("Reset confirmation retains one POST null while its existing per-account request lock is pending", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  const action = actions[0];
  const path = `/api/admin/users/${action.id}/reset-password`;
  const release = fixture.hold(`POST ${path}`);
  try {
    let dialog = await openFromMore(page, action);
    await dialog.getByRole("button", { name: action.confirm, exact: true }).click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    await expect(dialog).toBeHidden();
    dialog = await openFromMore(page, action);
    await dialog.getByRole("button", { name: action.confirm, exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(fixture.writes).toEqual([{ method: "POST", path, payload: null }]);
    release();
    await expect(page.getByText("Password Reset Email Sent", { exact: true }).first()).toBeVisible();
    await expect(managedAccounts(page).getByRole("button", { name: "Refresh managed accounts", exact: true })).toBeEnabled();
    expect(fixture.writes).toEqual([{ method: "POST", path, payload: null }]);
    await assertAccountFixtureClean(page, fixture);
  } finally { fixture.releaseAll(); }
});

for (const action of actions.filter((entry) => entry.kind === "ban" || entry.kind === "unban")) {
  test(`${action.menu} confirmation retains its explicit PATCH isBanned contract`, async ({ page, baseURL }) => {
    const fixture = await installAccountManagementFixture(page, baseURL);
    await openAccountManagement(page);
    const dialog = await openFromMore(page, action);
    await dialog.getByRole("button", { name: action.confirm, exact: true }).click();
    const path = `/api/admin/users/${action.id}/status`;
    const isBanned = action.kind === "ban";
    await expect.poll(() => fixture.writes).toEqual([{ method: "PATCH", path, payload: { isBanned } }]);
    await expect(dialog).toBeHidden();
    await expect(page.getByText(isBanned ? "Account Banned" : "Account Unbanned", { exact: true }).first()).toBeVisible();
    await expect.poll(() => fixture.users.find((user) => user.id === action.id)?.isBanned).toBe(isBanned);
    // Ban/unban has no existing pending lock: do not invent one in a styling test.
    expect(fixture.writes).toEqual([{ method: "PATCH", path, payload: { isBanned } }]);
    await assertAccountFixtureClean(page, fixture);
  });
}

test("Delete confirmation retains DELETE null and its existing pending row guard", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  const action = actions[3];
  const path = `/api/admin/users/${action.id}`;
  const release = fixture.hold(`DELETE ${path}`);
  try {
    const dialog = await openFromMore(page, action);
    await dialog.getByRole("button", { name: action.confirm, exact: true }).click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    await expect(dialog).toBeHidden();
    await moreButton(page, action.username).click();
    await expect(page.getByRole("menuitem", { name: "Deleting...", exact: true })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    expect(fixture.writes).toEqual([{ method: "DELETE", path, payload: null }]);
    release();
    await expect(accountRow(page, action.username)).toHaveCount(0);
    expect(fixture.writes).toEqual([{ method: "DELETE", path, payload: null }]);
    await assertAccountFixtureClean(page, fixture);
  } finally { fixture.releaseAll(); }
});
