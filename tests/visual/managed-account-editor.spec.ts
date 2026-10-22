import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  accountRow,
  assertAccountFixtureClean,
  installAccountManagementFixture,
  openAccountManagement,
} from "./helpers/account-management-fixture";

// Actual editor and mutation callbacks on the existing strict synthetic static
// loopback fixture. No production, backend, real user or database is accessed.
test.use({ serviceWorkers: "block" });
const accountPath = "/api/admin/users/synthetic-managed-1";
const fields = ["Full Name", "Username", "Email", "Role", "Account record status", "Banned"];
const editor = (page: Page) => page.getByRole("dialog", { name: "Edit Managed Account", exact: true });
const editButton = (page: Page, username = "maya.synthetic") => accountRow(page, username).getByRole("button", { name: `Edit ${username}`, exact: true });
const detailsButton = (page: Page, username = "maya.synthetic") => accountRow(page, username).getByRole("button", { name: `Details for ${username}`, exact: true });

async function openEditor(page: Page, username = "maya.synthetic") {
  await editButton(page, username).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).getByLabel("Full Name", { exact: true })).toBeFocused();
}

async function assertTarget44(target: Locator) {
  const size = await target.boundingBox();
  expect(size).not.toBeNull();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(size!.width).toBeGreaterThanOrEqual(44);
}

async function assertEditorContained(page: Page) {
  const dimensions = await editor(page).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
      width: innerWidth, height: innerHeight, contentWidth: element.clientWidth, scrollWidth: element.scrollWidth };
  });
  expect(dimensions.x).toBeGreaterThanOrEqual(0);
  expect(dimensions.y).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.height);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.contentWidth + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 768, 1366]) {
    test(`Managed account editor aligns six fields and keeps safe keyboard dismissal at ${width}px ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 780 });
      const fixture = await installAccountManagementFixture(page, baseURL, { theme });
      await openAccountManagement(page);
      await openEditor(page);
      const edit = editor(page);
      await expect(edit.locator("input, select")).toHaveCount(6);
      for (const name of fields) {
        const field = edit.getByLabel(name, { exact: true });
        const geometry = await field.evaluate((element) => {
          const label = document.querySelector(`label[for="${element.id}"]`)!;
          const fieldRect = element.getBoundingClientRect();
          const labelRect = label.getBoundingClientRect();
          return { height: fieldRect.height, gap: fieldRect.top - labelRect.bottom,
            labelDisplay: getComputedStyle(label).display, fontSize: getComputedStyle(element).fontSize,
            fieldX: fieldRect.x, labelX: labelRect.x, minWidth: getComputedStyle(element.parentElement!).minWidth };
        });
        expect(geometry.height, `${name} height`).toBe(44);
        expect(geometry.gap, `${name} label gap`).toBeCloseTo(8, 1);
        expect(geometry.labelDisplay, `${name} block label`).toBe("block");
        expect(geometry.fontSize, `${name} responsive text`).toBe(width < 768 ? "16px" : "14px");
        expect(geometry.fieldX, `${name} left alignment`).toBeCloseTo(geometry.labelX, 1);
        expect(geometry.minWidth, `${name} shrink-safe wrapper`).toBe("0px");
      }
      await assertEditorContained(page);
      for (const name of ["Cancel", "Save", "Close"]) await assertTarget44(edit.getByRole("button", { name, exact: true }));
      const body = edit.locator("div.overflow-y-auto");
      await expect(body).toHaveCount(1);
      const scrollSize = await body.evaluate((element) => ({ height: element.clientHeight, scrollHeight: element.scrollHeight }));
      expect(scrollSize.height).toBeGreaterThan(0);
      expect(scrollSize.scrollHeight).toBeGreaterThanOrEqual(scrollSize.height);
      if (width === 320) expect(scrollSize.scrollHeight).toBeGreaterThan(scrollSize.height);
      await edit.getByLabel("Banned", { exact: true }).scrollIntoViewIfNeeded();
      await expect(edit.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
      await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
      await body.evaluate((element) => { element.scrollTop = 0; });
      await edit.getByLabel("Full Name", { exact: true }).focus();
      for (let index = 0; index < 11; index += 1) {
        await page.keyboard.press(index === 0 ? "Shift+Tab" : "Tab");
        expect(await edit.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
      await body.evaluate((element) => { element.scrollTop = 0; });
      await page.screenshot({ path: test.info().outputPath(`managed-account-editor-${width}-${theme}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(edit).toBeHidden();
      await expect(editButton(page)).toBeFocused();
      expect(fixture.writes).toEqual([]);

      // Details hands the original list opener through the Edit transition.
      await detailsButton(page).click();
      const details = page.getByRole("dialog", { name: "Account details", exact: true });
      await expect(details).toBeVisible();
      await details.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(details).toBeHidden();
      await expect(edit.getByLabel("Full Name", { exact: true })).toBeFocused();
      await edit.getByLabel("Full Name", { exact: true }).fill("Cancelled synthetic edit");
      await edit.getByLabel("Role", { exact: true }).selectOption("manager");
      await edit.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(edit).toBeHidden();
      await expect(detailsButton(page)).toBeFocused();
      await openEditor(page);
      await expect(edit.getByLabel("Full Name", { exact: true })).toHaveValue("Synthetic Maya Chen");
      await expect(edit.getByLabel("Role", { exact: true })).toHaveValue("admin");
      await edit.getByRole("button", { name: "Close", exact: true }).click();
      await expect(edit).toBeHidden();
      await expect(editButton(page)).toBeFocused();
      expect(fixture.writes).toEqual([]);
      await assertAccountFixtureClean(page, fixture);
    });
  }
}

const mutationCases = [
  { name: "profile", path: accountPath, payload: { fullName: "Synthetic Maya Updated", username: "maya.updated", email: "maya.updated@example.test" } },
  { name: "role", path: `${accountPath}/role`, payload: { role: "manager" } },
  { name: "status and ban", path: `${accountPath}/status`, payload: { status: "suspended", isBanned: true } },
] as const;

for (const mutation of mutationCases) {
  test(`Managed account ${mutation.name} save preserves its separate exact PATCH and pending guard`, async ({ page, baseURL }) => {
    const fixture = await installAccountManagementFixture(page, baseURL);
    await openAccountManagement(page);
    await openEditor(page);
    const edit = editor(page);
    if (mutation.name === "profile") {
      await edit.getByLabel("Full Name", { exact: true }).fill("  Synthetic Maya Updated  ");
      await edit.getByLabel("Username", { exact: true }).fill("  MAYA.UPDATED  ");
      await edit.getByLabel("Email", { exact: true }).fill("  MAYA.UPDATED@EXAMPLE.TEST  ");
    } else if (mutation.name === "role") await edit.getByLabel("Role", { exact: true }).selectOption("manager");
    else {
      await edit.getByLabel("Account record status", { exact: true }).selectOption("suspended");
      await edit.getByLabel("Banned", { exact: true }).selectOption("true");
    }
    const release = fixture.hold(`PATCH ${mutation.path}`);
    try {
      await edit.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      const expected = [{ method: "PATCH", path: mutation.path, payload: mutation.payload }];
      expect(fixture.writes).toEqual(expected);
      const saving = edit.getByRole("button", { name: "Saving...", exact: true });
      await expect(saving).toBeDisabled();
      await expect(edit.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
      for (const name of fields) await expect(edit.getByLabel(name, { exact: true })).toBeDisabled();
      // Close remains available while a request is pending: this presentation
      // change must not introduce a new escape/close lock or Enter submission.
      await expect(edit.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
      await saving.dispatchEvent("click");
      expect(fixture.writes).toEqual(expected);
      release();
      await expect(edit).toBeHidden();
      const username = mutation.name === "profile" ? "maya.updated" : "maya.synthetic";
      await expect(accountRow(page, username)).toBeVisible();
      expect(fixture.writes).toEqual(expected);
      await openEditor(page, username);
      if (mutation.name === "profile") {
        await expect(edit.getByLabel("Full Name", { exact: true })).toHaveValue("Synthetic Maya Updated");
        await expect(edit.getByLabel("Username", { exact: true })).toHaveValue("maya.updated");
        await expect(edit.getByLabel("Email", { exact: true })).toHaveValue("maya.updated@example.test");
        await expect(edit.getByLabel("Role", { exact: true })).toHaveValue("admin");
      } else if (mutation.name === "role") await expect(edit.getByLabel("Role", { exact: true })).toHaveValue("manager");
      else {
        await expect(edit.getByLabel("Account record status", { exact: true })).toHaveValue("suspended");
        await expect(edit.getByLabel("Banned", { exact: true })).toHaveValue("true");
      }
      await edit.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(fixture.writes).toEqual(expected);
      await assertAccountFixtureClean(page, fixture);
    } finally { fixture.releaseAll(); }
  });
}

test("Managed account editor wraps a maximum-length username at 320px without expanding the dialog", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const fixture = await installAccountManagementFixture(page, baseURL, { theme: "dark" });
  const username = "w".repeat(32);
  expect(username).toHaveLength(32);
  fixture.users[0]!.username = username;
  // The base helper deliberately waits for maya.synthetic, so wait for this
  // deliberately renamed fictional account through its own exact row selector.
  await page.goto("/settings?section=account-management");
  await expect(accountRow(page, username)).toBeVisible();
  await openEditor(page, username);
  await expect(editor(page)).toContainText(`Update account details for ${username}.`);
  const description = editor(page).getByText(`Update account details for ${username}.`, { exact: true });
  expect(await description.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await assertEditorContained(page);
  await assertTarget44(editor(page).getByRole("button", { name: "Close", exact: true }));
  await page.screenshot({ path: test.info().outputPath("managed-account-editor-long-username-320-dark.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeHidden();
  await expect(editButton(page, username)).toBeFocused();
  expect(fixture.writes).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

test("Managed account editor keeps its header and actions reachable at 320x480", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  await openEditor(page);
  const edit = editor(page);
  const body = edit.locator("div.overflow-y-auto");
  const size = await body.evaluate((element) => ({ visible: element.clientHeight, total: element.scrollHeight }));
  expect(size.visible).toBeGreaterThan(0);
  expect(size.total).toBeGreaterThan(size.visible);
  await assertEditorContained(page);
  await expect(edit.getByRole("heading", { name: "Edit Managed Account", exact: true })).toBeInViewport();
  for (const name of ["Close", "Cancel", "Save"]) await expect(edit.getByRole("button", { name, exact: true })).toBeInViewport();
  await edit.getByLabel("Banned", { exact: true }).focus();
  await expect(edit.getByLabel("Banned", { exact: true })).toBeFocused();
  await expect(edit.getByLabel("Banned", { exact: true })).toBeInViewport();
  await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("managed-account-editor-short-height-320-light.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(edit).toBeHidden();
  await expect(editButton(page)).toBeFocused();
  expect(fixture.writes).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

test("Managed account editor enables Save only for a meaningful valid change and disables it after revert", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  await openEditor(page);
  const edit = editor(page);
  const save = edit.getByRole("button", { name: "Save", exact: true });
  const feedback = edit.getByRole("status");
  await expect(save).toBeDisabled();
  await expect(save).toHaveAccessibleDescription("No changes to save.");
  await expect(feedback).toHaveAttribute("aria-live", "polite");
  await expect(feedback).toHaveAttribute("aria-atomic", "true");
  await save.dispatchEvent("click");
  expect(fixture.writes).toEqual([]);
  await edit.getByLabel("Full Name", { exact: true }).fill("Synthetic changed name");
  await expect(save).toBeEnabled();
  await expect(feedback).toHaveText("Changes ready to save.");
  await edit.getByLabel("Full Name", { exact: true }).fill("  Synthetic Maya Chen  ");
  await edit.getByLabel("Username", { exact: true }).fill("  MAYA.SYNTHETIC  ");
  await edit.getByLabel("Email", { exact: true }).fill("  MAYA.SYNTHETIC@EXAMPLE.TEST  ");
  await expect(save).toBeDisabled();
  await expect(feedback).toHaveText("No changes to save.");
  await edit.getByLabel("Role", { exact: true }).selectOption("manager");
  await expect(save).toBeEnabled();
  await edit.getByLabel("Role", { exact: true }).selectOption("admin");
  await expect(save).toBeDisabled();
  await edit.getByLabel("Username", { exact: true }).press("Enter");
  expect(fixture.writes).toEqual([]);
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(editButton(page)).toBeFocused();
  await assertAccountFixtureClean(page, fixture);
});

test("Managed account editor associates inline username and email errors without issuing writes", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const fixture = await installAccountManagementFixture(page, baseURL, { theme: "dark" });
  await openAccountManagement(page);
  await openEditor(page);
  const edit = editor(page);
  const username = edit.getByLabel("Username", { exact: true });
  const email = edit.getByLabel("Email", { exact: true });
  const save = edit.getByRole("button", { name: "Save", exact: true });
  await username.fill("bad space");
  await email.fill("not-an-email");
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(username).toHaveAttribute("aria-describedby", "managed-user-username-error");
  await expect(username).toHaveAccessibleDescription("Use 3–32 letters, numbers, dots, hyphens or underscores.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", "managed-user-email-error");
  await expect(email).toHaveAccessibleDescription("Enter a valid email address, such as name@example.com.");
  await expect(save).toBeDisabled();
  await expect(save).toHaveAccessibleDescription("Check the highlighted fields before saving.");
  await edit.getByLabel("Role", { exact: true }).selectOption("manager");
  await expect(save).toBeDisabled();
  await save.dispatchEvent("click");
  expect(fixture.writes).toEqual([]);
  await assertEditorContained(page);
  await page.screenshot({ path: test.info().outputPath("managed-account-editor-inline-errors-320-dark.png"), animations: "disabled" });
  await username.fill("maya.synthetic");
  await email.fill("maya.synthetic@example.test");
  await expect(username).toHaveAttribute("aria-invalid", "false");
  await expect(email).toHaveAttribute("aria-invalid", "false");
  expect(await username.getAttribute("aria-describedby")).toBeNull();
  expect(await email.getAttribute("aria-describedby")).toBeNull();
  await expect(edit.locator("#managed-user-username-error, #managed-user-email-error")).toHaveCount(0);
  await expect(save).toBeEnabled();
  await edit.getByLabel("Role", { exact: true }).selectOption("admin");
  await expect(save).toBeDisabled();
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(fixture.writes).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

test("Managed account editor clears optional active-account name and email with only explicit null profile fields", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  await openEditor(page);
  const edit = editor(page);
  await edit.getByLabel("Full Name", { exact: true }).fill("");
  await edit.getByLabel("Email", { exact: true }).fill("");
  await expect(edit.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).toBeHidden();
  expect(fixture.writes).toEqual([{ method: "PATCH", path: accountPath, payload: { fullName: null, email: null } }]);
  await openEditor(page);
  await expect(edit.getByLabel("Full Name", { exact: true })).toHaveValue("");
  await expect(edit.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await assertAccountFixtureClean(page, fixture);
});

test("Managed account editor prevents changed pending-activation email from being cleared", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  await openEditor(page, "daniel.synthetic");
  const edit = editor(page);
  const email = edit.getByLabel("Email", { exact: true });
  const save = edit.getByRole("button", { name: "Save", exact: true });
  await email.fill("");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Pending accounts require an email address for activation.");
  await expect(save).toBeDisabled();
  await edit.getByLabel("Account record status", { exact: true }).selectOption("active");
  await expect(save).toBeDisabled();
  await save.dispatchEvent("click");
  expect(fixture.writes).toEqual([]);
  await email.fill("daniel.synthetic@example.test");
  await expect(email).toHaveAttribute("aria-invalid", "false");
  await expect(save).toBeEnabled();
  await edit.getByLabel("Account record status", { exact: true }).selectOption("pending_activation");
  await expect(save).toBeDisabled();
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(fixture.writes).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

test("Managed account editor keeps untouched invalid legacy identity out of a role-only mutation", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  const username = "Legacy User!";
  fixture.users[0]!.username = username;
  fixture.users[0]!.email = "legacy-address";
  await page.goto("/settings?section=account-management");
  await expect(accountRow(page, username)).toBeVisible();
  await openEditor(page, username);
  const edit = editor(page);
  await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(edit.getByLabel("Username", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await expect(edit.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await edit.getByLabel("Username", { exact: true }).fill("  LEGACY USER!  ");
  await edit.getByLabel("Role", { exact: true }).selectOption("manager");
  await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).toBeHidden();
  expect(fixture.writes).toEqual([{ method: "PATCH", path: `${accountPath}/role`, payload: { role: "manager" } }]);
  expect(fixture.users[0]!.username).toBe(username);
  expect(fixture.users[0]!.email).toBe("legacy-address");
  await assertAccountFixtureClean(page, fixture);
});

for (const status of [500, 409]) {
  test(`Managed account editor retains the valid draft after HTTP ${status} and retries only on an explicit save`, async ({ page, baseURL }) => {
    const fixture = await installAccountManagementFixture(page, baseURL);
    const attempts: unknown[] = [];
    await page.route(`**${accountPath}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const url = new URL(route.request().url());
      expect(url.origin).toBe(new URL(baseURL!).origin);
      expect(url.pathname).toBe(accountPath);
      expect(url.search).toBe("");
      attempts.push(route.request().postDataJSON());
      if (attempts.length === 1) return route.fulfill({ status, json: { message: "Synthetic account update could not be completed." }, headers: { "Cache-Control": "no-store" } });
      return route.fallback();
    });
    await openAccountManagement(page);
    await openEditor(page);
    const edit = editor(page);
    const payload = { fullName: "Synthetic retained name", username: "maya.retained", email: "maya.retained@example.test" };
    await edit.getByLabel("Full Name", { exact: true }).fill(payload.fullName);
    await edit.getByLabel("Username", { exact: true }).fill(payload.username);
    await edit.getByLabel("Email", { exact: true }).fill(payload.email);
    const save = edit.getByRole("button", { name: "Save", exact: true });
    await save.click();
    const error = edit.getByRole("alert", { name: "Account update error", exact: true });
    await expect(error).toHaveCount(1);
    await expect(error).toContainText("Synthetic account update could not be completed.");
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
    await expect(edit).toBeVisible();
    await expect(edit.getByLabel("Full Name", { exact: true })).toHaveValue(payload.fullName);
    await expect(edit.getByLabel("Username", { exact: true })).toHaveValue(payload.username);
    await expect(edit.getByLabel("Email", { exact: true })).toHaveValue(payload.email);
    await expect(save).toBeEnabled();
    await expect(save).toBeFocused();
    await expect(save).toHaveAttribute("aria-describedby", "managed-user-save-error-details");
    await expect(save).toHaveAccessibleDescription(/Unable to complete this update.*Synthetic account update could not be completed\./);
    expect(attempts).toEqual([payload]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.users[0]!.username).toBe("maya.synthetic");
    await page.screenshot({ path: test.info().outputPath(`managed-account-editor-retained-draft-http-${status}.png`), animations: "disabled" });
    const release = fixture.hold(`PATCH ${accountPath}`);
    try {
      await save.click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      await expect(error).toHaveCount(0);
      await expect(edit.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
      await expect(edit.getByRole("status")).toHaveText("Saving account changes...");
      expect(attempts).toEqual([payload, payload]);
      release();
      await expect(edit).toBeHidden();
    } finally { fixture.releaseAll(); }
    await expect(accountRow(page, payload.username)).toBeVisible();
    expect(attempts).toEqual([payload, payload]);
    expect(fixture.writes).toEqual([{ method: "PATCH", path: accountPath, payload }]);
    // Exactly one deliberate HTTP failure is expected; do not hide application
    // errors or tolerate unrelated resource failures in the strict fixture.
    expect(fixture.consoleErrors.length).toBeLessThanOrEqual(1);
    expect(fixture.consoleErrors.every((message) => new RegExp(`^Failed to load resource:.*\\b${status}\\b`).test(message))).toBe(true);
    fixture.consoleErrors.length = 0;
    await assertAccountFixtureClean(page, fixture);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Managed account editor keeps inline errors and fixed feedback reachable at 320x480 ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    const fixture = await installAccountManagementFixture(page, baseURL, { theme });
    await openAccountManagement(page);
    await openEditor(page);
    const edit = editor(page);
    const username = edit.getByLabel("Username", { exact: true });
    const email = edit.getByLabel("Email", { exact: true });
    await username.fill("bad space");
    await email.fill("not-an-email");
    await expect(username).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    const feedback = edit.getByRole("status");
    await expect(feedback).toHaveText("Check the highlighted fields before saving.");
    const fixedElements = [
      edit.getByRole("heading", { name: "Edit Managed Account", exact: true }),
      edit.getByRole("button", { name: "Close", exact: true }),
      feedback,
      edit.getByRole("button", { name: "Cancel", exact: true }),
      edit.getByRole("button", { name: "Save", exact: true }),
    ];
    const assertFixedElementsVisible = async () => {
      for (const element of fixedElements) {
        await expect(element).toBeInViewport();
        const box = await element.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(320);
        expect(box!.y + box!.height).toBeLessThanOrEqual(480);
      }
    };
    await assertFixedElementsVisible();
    await assertEditorContained(page);
    for (const [field, errorId] of [[username, "managed-user-username-error"], [email, "managed-user-email-error"]] as const) {
      await field.focus();
      await expect(field).toBeFocused();
      await expect(field).toBeInViewport();
      const error = edit.locator(`#${errorId}`);
      await error.scrollIntoViewIfNeeded();
      await expect(error).toBeInViewport();
      await expect(field).toBeFocused();
      await assertFixedElementsVisible();
    }
    await edit.getByLabel("Banned", { exact: true }).focus();
    await expect(edit.getByLabel("Banned", { exact: true })).toBeFocused();
    await expect(edit.getByLabel("Banned", { exact: true })).toBeInViewport();
    await assertFixedElementsVisible();
    await expect(edit.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    const body = edit.locator("div.overflow-y-auto");
    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath(`managed-account-editor-inline-errors-short-320-${theme}.png`), animations: "disabled" });
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(edit).toBeHidden();
    await expect(editButton(page)).toBeFocused();
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  });
}
