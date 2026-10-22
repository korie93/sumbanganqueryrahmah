import { expect, test, type Page } from "@playwright/test";
import {
  accountRow,
  assertAccountFixtureClean,
  installAccountManagementFixture,
  openAccountManagement,
} from "./helpers/account-management-fixture";

// Exact fictional responses on the existing strict loopback static runner.
// No backend, production account, database, real session or mail is used.
test.use({ serviceWorkers: "block" });
type Fixture = Awaited<ReturnType<typeof installAccountManagementFixture>>;
const accountPath = "/api/admin/users/synthetic-managed-1";
const editor = (page: Page) => page.getByRole("dialog", { name: "Edit Managed Account", exact: true });
const errorRegion = (page: Page) => editor(page).getByRole("alert", { name: "Account update error", exact: true });
const editButton = (page: Page, username = "maya.synthetic") => accountRow(page, username).getByRole("button", { name: `Edit ${username}`, exact: true });

async function openEditor(page: Page, username = "maya.synthetic") {
  await editButton(page, username).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).getByLabel("Full Name", { exact: true })).toBeFocused();
}

function checkExpectedResourceFailures(fixture: Fixture, statuses: number[], maximum = statuses.length) {
  expect(fixture.consoleErrors.length).toBeLessThanOrEqual(maximum);
  expect(fixture.consoleErrors.every((message) => statuses.some((status) => new RegExp(`^Failed to load resource:.*\\b${status}\\b`).test(message)))).toBe(true);
  fixture.consoleErrors.length = 0;
}

function assertExactMutationOrigin(urlValue: string, baseURL: string | undefined, path: string) {
  const url = new URL(urlValue);
  expect(url.origin).toBe(new URL(baseURL!).origin);
  expect(url.pathname).toBe(path);
  expect(url.search).toBe("");
}

test("Managed account inline failure does not steal deliberately focused Close while a save is pending", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const attempts: unknown[] = [];
  await page.route(`**${accountPath}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    assertExactMutationOrigin(route.request().url(), baseURL, accountPath);
    attempts.push(route.request().postDataJSON());
    await held;
    return route.fulfill({ status: 409, json: { message: "Synthetic held update failed." }, headers: { "Cache-Control": "no-store" } });
  });
  await openAccountManagement(page);
  await openEditor(page);
  const edit = editor(page);
  const payload = { fullName: "Synthetic focused Close draft" };
  try {
    await edit.getByLabel("Full Name", { exact: true }).fill(payload.fullName);
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => attempts.length).toBe(1);
    await expect(edit.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
    const close = edit.getByRole("button", { name: "Close", exact: true });
    await close.focus();
    await expect(close).toBeFocused();
    release();
    await expect(errorRegion(page)).toContainText("Synthetic held update failed.");
    await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(close).toBeFocused();
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
    await expect(edit.getByLabel("Full Name", { exact: true })).toHaveValue(payload.fullName);
    expect(attempts).toEqual([payload]);
    expect(fixture.writes).toEqual([]);
    checkExpectedResourceFailures(fixture, [409]);
    await assertAccountFixtureClean(page, fixture);
  } finally { release(); }
});

for (const kind of ["role", "status"] as const) {
  test(`Managed account ${kind} failure stays inline with the unchanged separate PATCH retry contract`, async ({ page, baseURL }) => {
    const fixture = await installAccountManagementFixture(page, baseURL);
    const path = `${accountPath}/${kind}`;
    const payload = kind === "role" ? { role: "manager" } : { status: "suspended", isBanned: true };
    const attempts: unknown[] = [];
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      assertExactMutationOrigin(route.request().url(), baseURL, path);
      attempts.push(route.request().postDataJSON());
      if (attempts.length === 1) return route.fulfill({ status: 409, json: { message: `Synthetic ${kind} update conflict.` }, headers: { "Cache-Control": "no-store" } });
      return route.fallback();
    });
    await openAccountManagement(page);
    await openEditor(page);
    const edit = editor(page);
    if (kind === "role") await edit.getByLabel("Role", { exact: true }).selectOption("manager");
    else {
      await edit.getByLabel("Account record status", { exact: true }).selectOption("suspended");
      await edit.getByLabel("Banned", { exact: true }).selectOption("true");
    }
    const save = edit.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect(errorRegion(page)).toHaveCount(1);
    await expect(errorRegion(page)).toContainText(`Synthetic ${kind} update conflict.`);
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
    await expect(save).toBeEnabled();
    await expect(save).toBeFocused();
    await expect(save).toHaveAccessibleDescription(new RegExp(`Unable to complete this update.*Synthetic ${kind} update conflict\\.`));
    if (kind === "role") await expect(edit.getByLabel("Role", { exact: true })).toHaveValue("manager");
    else {
      await expect(edit.getByLabel("Account record status", { exact: true })).toHaveValue("suspended");
      await expect(edit.getByLabel("Banned", { exact: true })).toHaveValue("true");
    }
    expect(attempts).toEqual([payload]);
    expect(fixture.writes).toEqual([]);
    const release = fixture.hold(`PATCH ${path}`);
    try {
      await save.click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      await expect(errorRegion(page)).toHaveCount(0);
      await expect(edit.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
      await expect(edit.getByRole("status")).toHaveText("Saving account changes...");
      release();
      await expect(edit).toBeHidden();
    } finally { fixture.releaseAll(); }
    expect(attempts).toEqual([payload, payload]);
    expect(fixture.writes).toEqual([{ method: "PATCH", path, payload }]);
    checkExpectedResourceFailures(fixture, [409]);
    await assertAccountFixtureClean(page, fixture);
  });
}

for (const destination of ["closed", "other account", "same account reopened"] as const) {
  test(`Late account update failure falls back to the original account toast when ${destination}`, async ({ page, baseURL }) => {
    const fixture = await installAccountManagementFixture(page, baseURL);
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    const attempts: unknown[] = [];
    await page.route(`**${accountPath}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      assertExactMutationOrigin(route.request().url(), baseURL, accountPath);
      attempts.push(route.request().postDataJSON());
      await held;
      return route.fulfill({ status: 409, json: { message: "Synthetic late update failed." }, headers: { "Cache-Control": "no-store" } });
    });
    await openAccountManagement(page);
    await openEditor(page);
    const edit = editor(page);
    const payload = { fullName: "Synthetic request from the old editor" };
    try {
      await edit.getByLabel("Full Name", { exact: true }).fill(payload.fullName);
      await edit.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => attempts.length).toBe(1);
      await expect(edit.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
      await edit.getByRole("button", { name: "Close", exact: true }).click();
      await expect(edit).toBeHidden();
      if (destination !== "closed") {
        const username = destination === "other account" ? "daniel.synthetic" : "maya.synthetic";
        // Global pending state is existing behavior. Do not require a disabled
        // input to receive autofocus until the original request has settled.
        await editButton(page, username).click();
        await expect(edit).toBeVisible();
        await expect(edit).toContainText(`Update account details for ${username}.`);
        await expect(errorRegion(page)).toHaveCount(0);
      }
      release();
      const toast = page.locator('[data-slot="toast"]');
      await expect(toast).toHaveCount(1);
      await expect(toast).toContainText("Update Failed");
      await expect(toast).toContainText("maya.synthetic: Synthetic late update failed.");
      if (destination === "closed") await expect(edit).toBeHidden();
      else {
        await expect(edit).toBeVisible();
        await expect(errorRegion(page)).toHaveCount(0);
        await expect(edit.getByLabel("Full Name", { exact: true })).toBeEnabled();
        await expect(edit.getByLabel("Full Name", { exact: true })).toHaveValue(destination === "other account" ? "Synthetic Daniel Rahman" : "Synthetic Maya Chen");
        await expect(edit.getByRole("status")).toHaveText("No changes to save.");
        await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      }
      expect(attempts).toEqual([payload]);
      expect(fixture.writes).toEqual([]);
      checkExpectedResourceFailures(fixture, [409]);
      await assertAccountFixtureClean(page, fixture);
    } finally { release(); }
  });
}

for (const destination of ["other account", "same account reopened"] as const) {
  test(`Late account update success does not close the ${destination} editor`, async ({ page, baseURL }) => {
    const fixture = await installAccountManagementFixture(page, baseURL);
    await openAccountManagement(page);
    await openEditor(page);
    const edit = editor(page);
    const payload = { fullName: "Synthetic completed old request" };
    const release = fixture.hold(`PATCH ${accountPath}`);
    try {
      await edit.getByLabel("Full Name", { exact: true }).fill(payload.fullName);
      await edit.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      await edit.getByRole("button", { name: "Close", exact: true }).click();
      await expect(edit).toBeHidden();
      const username = destination === "other account" ? "daniel.synthetic" : "maya.synthetic";
      await editButton(page, username).click();
      await expect(edit).toBeVisible();
      await expect(edit).toContainText(`Update account details for ${username}.`);
      release();
      await expect(page.locator('[data-slot="toast"]')).toContainText("Account Updated");
      await expect.poll(() => fixture.users[0]!.fullName).toBe(payload.fullName);
      await expect(edit.getByLabel("Full Name", { exact: true })).toBeEnabled();
      await expect(edit).toBeVisible();
      await expect(edit).toContainText(`Update account details for ${username}.`);
      await expect(errorRegion(page)).toHaveCount(0);
      await expect(edit.getByLabel("Full Name", { exact: true })).toHaveValue(destination === "other account" ? "Synthetic Daniel Rahman" : "Synthetic Maya Chen");
      await expect(edit.getByRole("status")).toHaveText("No changes to save.");
      expect(fixture.writes).toEqual([{ method: "PATCH", path: accountPath, payload }]);
      await assertAccountFixtureClean(page, fixture);
    } finally { fixture.releaseAll(); }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Long untrusted account errors and sanitized references remain keyboard-readable at 320x480 ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    const fixture = await installAccountManagementFixture(page, baseURL, { theme });
    const safeReference = "api-synthetic.inline-error-123";
    const references = [`  ${safeReference}  `, '<unsafe-reference onerror="execute()">'];
    const attempts: unknown[] = [];
    const maliciousText = '<img src="/synthetic-error-image" onerror="window.sqrSyntheticErrorExecuted=true"><script>window.sqrSyntheticErrorExecuted=true</script>';
    await page.route(`**${accountPath}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      assertExactMutationOrigin(route.request().url(), baseURL, accountPath);
      attempts.push(route.request().postDataJSON());
      const index = attempts.length - 1;
      expect(index).toBeLessThan(2);
      return route.fulfill({ status: 500, json: {
        message: `SYNTHETIC ERROR ${index + 1}: ${maliciousText} ${"W".repeat(2400)}`,
        requestId: references[index],
      }, headers: { "Cache-Control": "no-store" } });
    });
    await openAccountManagement(page);
    await openEditor(page);
    const edit = editor(page);
    await edit.getByLabel("Full Name", { exact: true }).fill("Synthetic long error draft");
    const save = edit.getByRole("button", { name: "Save", exact: true });
    for (let index = 0; index < references.length; index += 1) {
      await save.click();
      await expect.poll(() => attempts.length).toBe(index + 1);
      const alert = errorRegion(page);
      await expect(alert).toHaveCount(1);
      await expect(alert).toContainText(`SYNTHETIC ERROR ${index + 1}:`);
      await expect(alert).toContainText(maliciousText);
      await expect(alert.locator("img, script, iframe")).toHaveCount(0);
      expect(await page.evaluate(() => Reflect.get(window, "sqrSyntheticErrorExecuted") ?? false)).toBe(false);
      await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
      await expect(save).toBeEnabled();
      await expect(save).toHaveAccessibleDescription(/Unable to complete this update.*SYNTHETIC ERROR/);
      if (index === 0) {
        await expect(alert).toContainText(`Reference: ${safeReference}`);
        await expect(save).toHaveAccessibleDescription(/Reference: api-synthetic\.inline-error-123/);
      } else {
        await expect(alert).not.toContainText("Reference:");
        await expect(alert).not.toContainText(references[index]!);
      }
      const dimensions = await alert.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth,
        height: element.clientHeight, scrollHeight: element.scrollHeight, boxHeight: element.getBoundingClientRect().height }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
      expect(dimensions.boxHeight).toBeLessThanOrEqual(121);
      expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
      const fixed = [edit.getByRole("heading", { name: "Edit Managed Account", exact: true }),
        edit.getByRole("button", { name: "Close", exact: true }), edit.getByRole("button", { name: "Cancel", exact: true }), save];
      for (const element of fixed) {
        await expect(element).toBeInViewport();
        const box = await element.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(320);
        expect(box!.y + box!.height).toBeLessThanOrEqual(480);
      }
      const footerBefore = await save.boundingBox();
      await save.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(edit.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(alert).toBeFocused();
      await page.keyboard.press("PageDown");
      await expect.poll(() => alert.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(save).toBeInViewport();
      expect((await save.boundingBox())!.y).toBeCloseTo(footerBefore!.y, 1);
      expect(await edit.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`managed-account-error-long-${index + 1}-320-${theme}.png`), animations: "disabled" });
    }
    expect(attempts).toEqual([{ fullName: "Synthetic long error draft" }, { fullName: "Synthetic long error draft" }]);
    expect(fixture.writes).toEqual([]);
    checkExpectedResourceFailures(fixture, [500], 2);
    await assertAccountFixtureClean(page, fixture);
  });
}
