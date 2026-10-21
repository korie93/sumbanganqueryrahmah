import { expect, test, type Page } from "@playwright/test";
import {
  accountRow,
  accountWorkspace,
  assertAccountFixtureClean,
  installAccountManagementFixture,
  managedAccounts,
  openAccountManagement,
  selectAccountSection,
  type AccountFixtureRole,
} from "./helpers/account-management-fixture";

// Real Settings components and callbacks with exact fictional API contracts.
// The static loopback runner has no backend; unexpected requests are rejected.
test.use({ serviceWorkers: "block" });

type Fixture = Awaited<ReturnType<typeof installAccountManagementFixture>>;
const usersPath = "/api/admin/users";
const mayaPath = `${usersPath}/synthetic-managed-1`;
const lastRead = (fixture: Fixture, path = usersPath) => fixture.reads.filter((entry) => entry.path === path).slice(-1)[0]?.query;
const writesTo = (fixture: Fixture, path: string) => fixture.writes.filter((entry) => entry.path === path);

async function chooseMore(page: Page, label: string, username = "maya.synthetic") {
  await accountRow(page, username).getByRole("button", { name: `More actions for ${username}`, exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1280, 390, 320]) {
    test(`Account workspace defaults to managed accounts, with safe navigation at ${width}px ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installAccountManagementFixture(page, baseURL, { theme });
      await openAccountManagement(page);
      await expect(page.getByRole("heading", { level: 1, name: "Account Management", exact: true })).toHaveCount(1);
      await expect(page.getByRole("region", { name: "Account health summary", exact: true })).toBeVisible();
      const nav = accountWorkspace(page).getByRole("navigation", { name: "User Account Management", exact: true });
      await expect(nav.getByRole("button", { name: /^Managed Account(?:\s|$)/ })).toHaveAttribute("aria-current", "page");
      await expect(accountWorkspace(page).getByRole("heading", { name: "Create Closed Account", exact: true })).toHaveCount(0);
      await expect(managedAccounts(page).getByRole("searchbox", { name: "Search accounts", exact: true })).toBeVisible();
      await expect(managedAccounts(page).getByRole("button", { name: "Filter managed accounts", exact: true })).toHaveAttribute("aria-expanded", "false");
      await expect(managedAccounts(page).locator("#managed-accounts-role-filter")).toBeHidden();
      await expect(accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true })).toBeVisible();
      if (width < 768) {
        await expect(managedAccounts(page).getByRole("table")).toHaveCount(0);
        await expect(accountRow(page)).toHaveAttribute("role", "group");
      } else await expect(managedAccounts(page).getByRole("table")).toBeVisible();

      await accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true }).click();
      const details = page.getByRole("dialog", { name: "Account details", exact: true });
      await expect(details).toBeVisible();
      await expect(details.getByRole("region", { name: "Account details for maya.synthetic", exact: true })).toBeVisible();
      await expect(details.getByRole("list", { name: "Account timeline for maya.synthetic", exact: true })).toBeVisible();
      expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(details).toBeHidden();
      await expect(accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true })).toBeFocused();

      await selectAccountSection(page, "Create Closed Account");
      const create = accountWorkspace(page).getByRole("region", { name: "Create Closed Account", exact: true });
      await expect(create).toBeVisible();
      await expect(create.locator('input[type="password"]')).toHaveCount(0);
      await selectAccountSection(page, "Pending Password Reset Requests");
      const pending = page.getByRole("region", { name: "Pending Password Reset Requests", exact: true });
      await expect(pending).toBeVisible();
      await expect(pending.getByRole("button", { name: /approve|reject|reset email/i })).toHaveCount(0);
      await selectAccountSection(page, "Local Mail Outbox");
      const outbox = page.getByRole("region", { name: "Local Mail Outbox", exact: true });
      await expect(outbox.getByText("Local development mail outbox is disabled.", { exact: true })).toBeVisible();
      await expect(outbox.getByRole("button", { name: "Delete All", exact: true })).toBeDisabled();
      await selectAccountSection(page, "Managed Account");
      await expect(accountRow(page)).toBeVisible();
      expect(fixture.writes).toEqual([]);
      await assertAccountFixtureClean(page, fixture);
    });
  }
}

test("Managed queries, pagination and folded filters retain the existing server query contract", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  const managed = managedAccounts(page);
  await expect(managed.getByText("Showing 1-50 of 67 accounts", { exact: true })).toBeVisible();
  await managed.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => lastRead(fixture)?.page).toBe("2");
  await expect(managed.getByText("Showing 51-67 of 67 accounts", { exact: true })).toBeVisible();
  await managed.getByRole("searchbox", { name: "Search accounts", exact: true }).fill("  MAYA.SYNTHETIC  ");
  await expect.poll(() => lastRead(fixture)).toMatchObject({ page: "1", search: "maya.synthetic" });
  await expect(accountRow(page)).toBeVisible();
  await expect(managed.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await managed.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(managed.getByText("Showing 1-50 of 67 accounts", { exact: true })).toBeVisible();
  await managed.getByRole("combobox", { name: "Page size for accounts", exact: true }).selectOption("10");
  await expect.poll(() => lastRead(fixture)).toMatchObject({ page: "1", pageSize: "10" });
  const filter = managed.getByRole("button", { name: "Filter managed accounts", exact: true });
  await filter.focus();
  await filter.press("Enter");
  await expect(filter).toHaveAttribute("aria-expanded", "true");
  await expect(managed.getByRole("region", { name: "Managed account filters", exact: true })).toHaveAttribute("id", (await filter.getAttribute("aria-controls"))!);
  await managed.locator("#managed-accounts-role-filter").selectOption("admin");
  await managed.locator("#managed-accounts-status-filter").selectOption("active");
  await expect.poll(() => lastRead(fixture)).toMatchObject({ page: "1", pageSize: "10", role: "admin", status: "active" });
  await expect(accountRow(page)).toBeVisible();
  await filter.press("Enter");
  await expect(filter).toHaveAttribute("aria-expanded", "false");
  await expect(managed.getByRole("region", { name: "Active filters", exact: true })).toContainText("Role: Admin");
  await expect(managed.getByRole("searchbox", { name: "Search accounts", exact: true })).toBeVisible();
  const countBeforeRefresh = fixture.reads.filter((entry) => entry.path === usersPath).length;
  await managed.getByRole("button", { name: "Refresh managed accounts", exact: true }).click();
  await expect.poll(() => fixture.reads.filter((entry) => entry.path === usersPath).length).toBeGreaterThan(countBeforeRefresh);
  await expect.poll(() => lastRead(fixture)).toMatchObject({ page: "1", pageSize: "10", role: "admin", status: "active" });
  expect(fixture.writes).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

test("More keyboard menu restores focus and cancellation never writes", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  const more = accountRow(page).getByRole("button", { name: "More actions for maya.synthetic", exact: true });
  await more.focus();
  await more.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Send Reset Email", exact: true })).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "Resend Activation", exact: true })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  for (const [action, heading] of [["Send Reset Email", "Send Password Reset Email"], ["Ban", "Ban Managed Account"], ["Delete", "Delete Managed Account"]]) {
    await chooseMore(page, action!);
    const dialog = page.getByRole("alertdialog", { name: heading!, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();
    await chooseMore(page, action!);
    // The menu selection can finish before the deferred confirmation mounts
    // and receives keyboard focus. Wait for the same readiness as Cancel above.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();
    expect(fixture.writes).toEqual([]);
  }
  await assertAccountFixtureClean(page, fixture);
});

test("Details confirmation cancellation and Escape restore the original row trigger without writes", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  const opener = accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true });
  for (const [action, heading] of [["Reset", "Send Password Reset Email"], ["Ban", "Ban Managed Account"], ["Delete", "Delete Managed Account"]] as const) {
    for (const dismiss of ["Cancel", "Escape"] as const) {
      await opener.click();
      const details = page.getByRole("dialog", { name: "Account details", exact: true });
      await expect(details).toBeVisible();
      await details.getByRole("button", { name: action, exact: true }).click();
      await expect(details).toBeHidden();
      const confirmation = page.getByRole("alertdialog", { name: heading, exact: true });
      await expect(confirmation).toBeVisible();
      await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      if (dismiss === "Cancel") await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(confirmation).toBeHidden();
      await expect(opener).toBeFocused();
      expect(fixture.writes).toEqual([]);
    }
  }
  await assertAccountFixtureClean(page, fixture);
});

for (const width of [1280, 390]) {
  test(`Compact Account Settings menu preserves category access and logical focus at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installAccountManagementFixture(page, baseURL);
    await openAccountManagement(page);
    const launcher = page.getByTestId("button-open-settings-sections");
    await launcher.focus();
    await launcher.press("Enter");
    const menu = page.getByRole("dialog", { name: "Settings Menu", exact: true });
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: /^General(?:\s|$)/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "General", exact: true })).toBeVisible();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/section=general/);
    if (width >= 768) {
      const nav = page.getByRole("navigation", { name: "Settings Navigation", exact: true });
      await expect(nav.getByRole("button", { name: "General", exact: true })).toBeFocused();
      await nav.getByRole("button", { name: "Account Management", exact: true }).click();
    } else {
      await expect(launcher).toBeFocused();
      await launcher.press("Enter");
      await menu.getByRole("button", { name: /^Account Management(?:\s|$)/ }).click();
    }
    await expect(accountWorkspace(page)).toBeVisible();
    await expect(accountRow(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Account Management", exact: true })).toHaveCount(1);
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  });
}

for (const width of [1280, 390]) {
  test(`Enabled account pagination remains pointer-accessible beside the synthetic AI launcher at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    // Render the actual launcher only. No chat activation, prompt, AI request or
    // real AI service is allowed by the exact loopback fixture.
    const fixture = await installAccountManagementFixture(page, baseURL, { aiEnabled: true });
    await openAccountManagement(page);
    await expect(page.getByTestId("floating-ai-toggle")).toBeVisible();
    const next = managedAccounts(page).getByRole("button", { name: "Next", exact: true });
    await expect(next).toBeEnabled();
    await next.scrollIntoViewIfNeeded();
    await expect.poll(() => next.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const points = [[rect.left + 3, rect.top + 3], [rect.right - 3, rect.top + 3],
        [rect.left + 3, rect.bottom - 3], [rect.right - 3, rect.bottom - 3],
        [rect.left + rect.width / 2, rect.top + rect.height / 2]];
      return points.flatMap(([x, y]) => {
        const hit = document.elementFromPoint(x!, y!);
        return hit && button.contains(hit) ? [] : [hit?.getAttribute("aria-label") || hit?.tagName || "outside viewport"];
      });
    }), "The enabled Next button, including its corners, is not covered by the floating launcher").toEqual([]);
    await next.click();
    await expect.poll(() => lastRead(fixture)?.page).toBe("2");
    await expect(managedAccounts(page).getByText("Showing 51-67 of 67 accounts", { exact: true })).toBeVisible();
    expect(fixture.requests.some((entry) => /\/api\/(?:ai|chat|semantic)/.test(entry))).toBe(false);
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  });
}

test("Details and Edit invoke real callbacks; profile save and cancelled role edit retain distinct contracts", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  await accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true }).click();
  await page.getByRole("dialog", { name: "Account details", exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Managed Account", exact: true });
  await expect(edit).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Account details", exact: true })).toBeHidden();
  await expect(edit.getByLabel("Full Name", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(edit).toBeHidden();
  await expect(accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true })).toBeFocused();
  await accountRow(page).getByRole("button", { name: "Edit maya.synthetic", exact: true }).click();
  await expect(edit.getByLabel("Full Name", { exact: true })).toBeFocused();
  await edit.getByLabel("Full Name", { exact: true }).fill("Synthetic Maya Updated");
  const release = fixture.hold(`PATCH ${mayaPath}`);
  try {
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => writesTo(fixture, mayaPath).length).toBe(1);
    await expect(edit.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
    await edit.getByRole("button", { name: "Saving...", exact: true }).dispatchEvent("click");
    expect(writesTo(fixture, mayaPath)).toEqual([{ method: "PATCH", path: mayaPath, payload: { fullName: "Synthetic Maya Updated" } }]);
    release();
    await expect(edit).toBeHidden();
    await expect(accountRow(page)).toContainText("Synthetic Maya Updated");
  } finally { fixture.releaseAll(); }
  await accountRow(page).getByRole("button", { name: "Edit maya.synthetic", exact: true }).click();
  await edit.getByLabel("Role", { exact: true }).selectOption("manager");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(fixture.writes).toHaveLength(1);
  await accountRow(page).getByRole("button", { name: "Edit maya.synthetic", exact: true }).click();
  await expect(edit.getByLabel("Role", { exact: true })).toHaveValue("admin");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await assertAccountFixtureClean(page, fixture);
});

test("Confirmed reset and delete keep existing in-flight duplicate guards; ban is explicit", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  const resetPath = `${mayaPath}/reset-password`;
  const releaseReset = fixture.hold(`POST ${resetPath}`);
  try {
    await chooseMore(page, "Send Reset Email");
    await page.getByRole("alertdialog", { name: "Send Password Reset Email", exact: true }).getByRole("button", { name: "Send Reset Email", exact: true }).click();
    await expect.poll(() => writesTo(fixture, resetPath).length).toBe(1);
    await chooseMore(page, "Send Reset Email");
    await page.getByRole("alertdialog", { name: "Send Password Reset Email", exact: true }).getByRole("button", { name: "Send Reset Email", exact: true }).click();
    expect(writesTo(fixture, resetPath)).toEqual([{ method: "POST", path: resetPath, payload: null }]);
    releaseReset();
    await expect(page.getByText("Password Reset Email Sent", { exact: true }).first()).toBeVisible();
    await expect(managedAccounts(page).getByRole("button", { name: "Refresh managed accounts", exact: true })).toBeEnabled();
  } finally { fixture.releaseAll(); }
  await chooseMore(page, "Ban");
  await page.getByRole("alertdialog", { name: "Ban Managed Account", exact: true }).getByRole("button", { name: "Ban", exact: true }).click();
  await expect.poll(() => writesTo(fixture, `${mayaPath}/status`)).toEqual([{ method: "PATCH", path: `${mayaPath}/status`, payload: { isBanned: true } }]);
  await expect(accountRow(page)).toContainText("Banned");
  const releaseDelete = fixture.hold(`DELETE ${mayaPath}`);
  try {
    await chooseMore(page, "Delete");
    await page.getByRole("alertdialog", { name: "Delete Managed Account", exact: true }).getByRole("button", { name: "Delete User", exact: true }).click();
    await expect.poll(() => writesTo(fixture, mayaPath).length).toBe(1);
    await accountRow(page).getByRole("button", { name: "More actions for maya.synthetic", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Deleting...", exact: true })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    expect(writesTo(fixture, mayaPath)).toEqual([{ method: "DELETE", path: mayaPath, payload: null }]);
    releaseDelete();
    await expect(accountRow(page)).toHaveCount(0);
    expect(fixture.writes).toHaveLength(3);
  } finally { fixture.releaseAll(); }
  await assertAccountFixtureClean(page, fixture);
});

test("Activation eligibility is preserved and resending uses only the existing endpoint once in flight", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  const path = `${usersPath}/synthetic-managed-2/resend-activation`;
  const release = fixture.hold(`POST ${path}`);
  try {
    await chooseMore(page, "Resend Activation", "daniel.synthetic");
    await expect.poll(() => writesTo(fixture, path).length).toBe(1);
    await chooseMore(page, "Resend Activation", "daniel.synthetic");
    expect(writesTo(fixture, path)).toEqual([{ method: "POST", path, payload: null }]);
    release();
    await expect(page.getByText("Activation Reissued", { exact: true }).first()).toBeVisible();
    expect(fixture.writes).toHaveLength(1);
  } finally { fixture.releaseAll(); }
  await assertAccountFixtureClean(page, fixture);
});

test("Create validates accessibly before one activation-only synthetic account write", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  await selectAccountSection(page, "Create Closed Account");
  const create = page.getByRole("region", { name: "Create Closed Account", exact: true });
  const username = create.getByLabel("Username", { exact: true });
  const email = create.getByLabel("Email", { exact: true });
  await create.getByRole("button", { name: "Create Closed Account", exact: true }).click();
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(create.locator("#create-closed-account-username-error")).toBeVisible();
  await expect(create.locator("#create-closed-account-email-error")).toBeVisible();
  await expect(username).toHaveAttribute("aria-describedby", /create-closed-account-username-error/);
  await expect(email).toHaveAttribute("aria-describedby", /create-closed-account-email-error/);
  expect(fixture.writes).toEqual([]);
  await username.fill("  synthetic.created  ");
  await email.fill("  synthetic.created@example.test  ");
  await create.getByLabel(/Full name/).fill("  Synthetic Created Account  ");
  await expect(create.getByRole("combobox", { name: "Role", exact: true }).locator("option")).toHaveText(["User", "Manager", "Admin"]);
  const release = fixture.hold(`POST ${usersPath}`);
  try {
    await create.getByRole("button", { name: "Create Closed Account", exact: true }).click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    const creating = create.getByRole("button", { name: "Creating...", exact: true });
    await expect(creating).toBeDisabled();
    await creating.dispatchEvent("click");
    expect(fixture.writes).toEqual([{ method: "POST", path: usersPath, payload: {
      username: "synthetic.created", email: "synthetic.created@example.test", fullName: "Synthetic Created Account", role: "user",
    } }]);
    release();
    await expect(username).toHaveValue("");
    await expect(email).toHaveValue("");
    expect(fixture.users.find((entry) => entry.username === "synthetic.created")?.status).toBe("pending_activation");
  } finally { fixture.releaseAll(); }
  await assertAccountFixtureClean(page, fixture);
});

test("Pending resets remain read-only, their search/status queries are real, and disabled outbox cannot delete", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openAccountManagement(page);
  await selectAccountSection(page, "Pending Password Reset Requests");
  const pending = page.getByRole("region", { name: "Pending Password Reset Requests", exact: true });
  await expect(pending.getByText(/read.only|review only/i)).toBeVisible();
  await pending.getByRole("searchbox", { name: "Search by user", exact: true }).fill("maya.synthetic");
  await expect.poll(() => lastRead(fixture, "/api/admin/password-reset-requests")).toMatchObject({ page: "1", search: "maya.synthetic" });
  await pending.getByRole("button", { name: "Filter", exact: true }).click();
  await pending.getByRole("combobox", { name: "Status", exact: true }).selectOption("active");
  await expect.poll(() => lastRead(fixture, "/api/admin/password-reset-requests")).toMatchObject({ status: "active" });
  await expect(pending.getByRole("button", { name: /approve|reject|send reset|delete/i })).toHaveCount(0);
  await selectAccountSection(page, "Local Mail Outbox");
  const outbox = page.getByRole("region", { name: "Local Mail Outbox", exact: true });
  await expect(outbox.getByText("Local development mail outbox is disabled.", { exact: true })).toBeVisible();
  await expect(outbox.getByRole("button", { name: "Delete All", exact: true })).toBeDisabled();
  await outbox.getByRole("button", { name: "Delete All", exact: true }).dispatchEvent("click");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await outbox.getByRole("searchbox", { name: "Search by email", exact: true }).fill("synthetic@example.test");
  await expect.poll(() => lastRead(fixture, "/api/admin/dev-mail-outbox")).toMatchObject({ searchEmail: "synthetic@example.test" });
  await outbox.getByRole("button", { name: "Filter", exact: true }).click();
  await outbox.getByRole("searchbox", { name: "Search by subject", exact: true }).fill("activation");
  await outbox.getByRole("combobox", { name: "Sort by date", exact: true }).selectOption("asc");
  await expect.poll(() => lastRead(fixture, "/api/admin/dev-mail-outbox")).toMatchObject({ searchEmail: "synthetic@example.test", searchSubject: "activation", sortDirection: "asc" });
  expect(fixture.writes).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

for (const role of ["admin", "manager", "user"] as AccountFixtureRole[]) {
  test(`${role} cannot load Account Management APIs even when Settings is granted`, async ({ page, baseURL }) => {
    const fixture = await installAccountManagementFixture(page, baseURL, { role, settings: true });
    await page.goto("/settings?section=account-management");
    if (role === "admin") await expect(page.getByRole("navigation", { name: "Settings Navigation", exact: true })).toBeVisible();
    else await expect(page.getByTestId("home-dashboard")).toBeVisible();
    await expect(accountWorkspace(page)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "User Account Management", exact: true })).toHaveCount(0);
    expect(fixture.requests.filter((entry) => entry.includes("/api/admin/"))).toEqual([]);
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  });
}
