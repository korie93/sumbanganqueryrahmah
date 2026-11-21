import { expect, test, type Page } from "@playwright/test";
import { checkFixture, installFixture, now } from "./helpers/save-collection-fixture";
import { expectPopupFits } from "./helpers/popup-layout";
import {
  assertAccountFixtureClean, installAccountManagementFixture, openAccountManagement, selectAccountSection,
} from "./helpers/account-management-fixture";

test.use({ serviceWorkers: "block" });

const savedFile = {
  id: "popup-file", name: "Synthetic " + "A".repeat(58),
  filename: "Audit_" + "1234567890".repeat(7) + ".xlsx",
  createdAt: now, createdBy: "synthetic.operator", rowCount: 8, sourceSizeBytes: 1024, isDeleted: false,
};

test.describe("Local Mail Outbox", () => {
  // The Playwright service-worker blocking shim cannot run in the opaque email iframe.
  test.use({ serviceWorkers: "allow" });
  test("Popup layout: a long mail recipient stays inside preview and delete dialogs", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    const fixture = await installAccountManagementFixture(page, baseURL, { theme: "dark" });
    const to = "office." + "s".repeat(48) + "@example.test";
    const previewUrl = "/synthetic-mail-preview";
    await page.route((url) => url.origin === baseURL && url.pathname === "/api/admin/dev-mail-outbox", (route) => route.fulfill({
      json: { ok: true, enabled: true, previews: [{ id: "synthetic-mail", to, subject: "Synthetic email", createdAt: now, previewUrl }],
        pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } },
    }));
    await page.route(`${baseURL}${previewUrl}`, (route) => route.fulfill({ contentType: "text/html", body: "<p>Synthetic email</p>" }));
    await openAccountManagement(page);
    await selectAccountSection(page, "Local Mail Outbox");
    const outbox = page.getByRole("region", { name: "Local Mail Outbox", exact: true });
    await outbox.getByRole("button", { name: "Open", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "Local Email Preview" });
    await expectPopupFits(preview);
    await expect(preview).toHaveAccessibleDescription("Synthetic email for " + to);
    await expect(preview.locator("iframe[sandbox]")).not.toHaveAttribute("sandbox", /allow-scripts/);
    await expect(preview.frameLocator("iframe").getByText("Synthetic email", { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(preview).toBeHidden();
    await outbox.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expectPopupFits(confirm);
    await expect(confirm.getByText(to, { exact: true })).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toBeHidden();
    // Chromium can report Playwright's init scripts being refused inside this particular sandboxed document.
    const sandboxMessage = `Blocked script execution in '${baseURL}${previewUrl}' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.`;
    await assertAccountFixtureClean(page, {
      ...fixture,
      consoleErrors: fixture.consoleErrors.filter((message) => message !== sandboxMessage),
    });
  });
});

async function openSaved(page: Page, baseURL: string | undefined, theme: "light" | "dark") {
  const fixture = await installFixture(page, baseURL, { role: "superuser", theme });
  await page.route(`${baseURL}/api/settings/tab-visibility`, (route) => route.fulfill({
    json: { role: "superuser", tabs: { home: true, saved: true } },
  }));
  await page.route((url) => url.origin === baseURL && url.pathname === "/api/imports", (route) => {
    const pageSize = Number(new URL(route.request().url()).searchParams.get("pageSize") || 20);
    return route.fulfill({ json: { imports: [savedFile], pagination: {
      page: 1, pageSize, limit: pageSize, offset: 0, mode: "offset", total: 1, totalPages: 1,
      hasPreviousPage: false, hasNextPage: false,
    } } });
  });
  await page.route(`${baseURL}/api/collection/source-configs`, (route) => route.fulfill({ json: { ok: true, sourceConfigs: [] } }));
  await page.goto("/saved");
  await expect(page.getByTestId("button-view-popup-file")).toBeVisible();
  return fixture;
}

for (const viewport of [{ width: 320, height: 480 }, { width: 667, height: 320 }]) {
  test(`Popup layout: Saved calendar can change month and select a date at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    const fixture = await openSaved(page, baseURL, viewport.width === 320 ? "light" : "dark");
    const trigger = page.getByTestId("button-date-filter");
    await trigger.click();
    const panel = page.getByRole("dialog");
    await expectPopupFits(panel);
    const grid = panel.getByRole("grid");
    const month = await grid.getAttribute("aria-labelledby");
    expect(month).toBeTruthy();
    const caption = panel.locator(`[id="${month}"]`);
    const startingMonth = await caption.innerText();
    await panel.locator('button[name="previous-month"]').click();
    await expect(caption).not.toHaveText(startingMonth);
    await panel.locator('button[name="next-month"]').click();
    await expect(caption).toHaveText(startingMonth);
    await grid.locator('button[name="day"]:not(.day-outside)').filter({ hasText: /^28$/ }).click();
    await expect(panel).toBeHidden();
    await expect(trigger).toHaveAccessibleName(/Filter by date, selected/);
    await expect(trigger).toBeFocused();
    await checkFixture(page, fixture);
  });
}

for (const viewport of [{ width: 320, height: 480 }, { width: 1280, height: 720 }]) {
  const theme = viewport.width === 320 ? "dark" : "light";
  test(`Popup layout: long Saved filenames stay readable at ${viewport.width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    const fixture = await openSaved(page, baseURL, theme);
    for (const action of ["rename", "delete", "configure-source"] as const) {
      if (action !== "configure-source") await page.getByTestId("button-import-actions-popup-file").click();
      await page.getByTestId(`button-${action}-popup-file`).click();
      const panel = page.getByRole(action === "delete" ? "alertdialog" : "dialog");
      await expectPopupFits(panel);
      if (action === "rename") await expect(panel.getByTestId("input-rename")).toBeInViewport({ ratio: 1 });
      await expect(panel.getByText(savedFile.filename, { exact: true })).toBeVisible();
      const cancel = panel.getByRole("button", { name: "Cancel", exact: true });
      await expect(cancel).toBeInViewport({ ratio: 1 });
      const confirmName = { rename: "Save", delete: "Delete", "configure-source": "Save configuration" }[action];
      await expect(panel.getByRole("button", { name: confirmName, exact: true })).toBeInViewport({ ratio: 1 });
      await cancel.click();
      await expect(panel).toBeHidden();
    }
    await checkFixture(page, fixture);
  });

  test(`Popup layout: both group leader dialogs contain a long nickname at ${viewport.width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    const leader = "SW." + "A".repeat(53);
    const fixture = await installFixture(page, baseURL, { role: "superuser", theme, additionalNickname: leader });
    await page.route(`${baseURL}/api/collection/admin-groups`, (route) => route.fulfill({ json: { ok: true, groups: [{
      id: "synthetic-group", leaderNickname: leader, leaderNicknameId: "guidance-alternate", leaderIsActive: true,
      leaderRoleScope: "both", memberNicknames: [], memberNicknameIds: [], createdBy: "synthetic", createdAt: now, updatedAt: now,
    }] } }));
    await page.goto("/collection/nicknames");
    for (const create of [true, false]) {
      if (create) await page.getByRole("button", { name: "Tambah Group", exact: true }).click();
      else {
        await page.getByRole("button", { name: "Group actions" }).click();
        await page.getByText("Tukar Leader", { exact: true }).click();
      }
      const panel = page.getByRole("dialog");
      const picker = panel.getByRole("combobox");
      await picker.click();
      const list = page.getByRole("listbox");
      await expectPopupFits(list);
      await list.getByRole("option", { name: leader }).click();
      await expect(picker).toHaveText(leader);
      await expectPopupFits(panel);
      await panel.getByRole("button", { name: "Simpan", exact: true }).click({ trial: true });
      await panel.getByRole("button", { name: "Batal", exact: true }).click();
      await expect(panel).toBeHidden();
    }
    await checkFixture(page, fixture);
  });
}
