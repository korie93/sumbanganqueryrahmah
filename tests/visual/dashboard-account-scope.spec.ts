import { expect, test, type Page } from "@playwright/test";
import { accountRow, assertAccountFixtureClean, installAccountManagementFixture, openAccountManagement } from "./helpers/account-management-fixture";

test.use({ serviceWorkers: "block" });

const nicknameId = "11111111-1111-4111-8111-111111111111";
const secondNicknameId = "22222222-2222-4222-8222-222222222222";
const nicknames = [{ id: nicknameId, nickname: "LEADER.SYNTHETIC" }, { id: secondNicknameId, nickname: "SECOND.SYNTHETIC" }];
type Link = { nicknameId: string | null; nickname: string | null; accountRole: string; isActive: boolean } | null;
const activeLink = (id = nicknameId, role = "admin"): Link => ({
  nicknameId: id, nickname: nicknames.find((item) => item.id === id)!.nickname, accountRole: role, isActive: true,
});
function detailsDialog(page: Page) { return page.getByRole("dialog", { name: "Account details", exact: true }); }
function collectionScope(page: Page) {
  return detailsDialog(page).locator("section").filter({ has: page.getByRole("heading", { name: "Kutipan Dashboard", exact: true }) });
}
async function openDetails(page: Page, username = "maya.synthetic") {
  await accountRow(page, username).getByRole("button", { name: `Details for ${username}`, exact: true }).click();
  await expect(detailsDialog(page)).toBeVisible();
}
async function openEditor(page: Page) {
  await collectionScope(page).getByRole("button", { name: /^(?:Tetapkan|Ubah) nickname Dashboard$/ }).press("Enter");
  await expect(collectionScope(page).getByRole("combobox", { name: "Nickname Collection", exact: true })).toBeVisible();
}
async function expectStatus(page: Page, label: string, tone: "success" | "warning" | "neutral") {
  const badge = collectionScope(page).getByTestId("dashboard-nickname-status");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(label);
  await expect(badge).toHaveAttribute("aria-live", "polite");
  await expect(badge).toHaveAttribute("aria-atomic", "true");
  await expect(badge.locator("svg")).toHaveCount(1);
  await expect(badge.locator("svg")).toHaveAttribute("aria-hidden", "true");
  if (tone === "neutral") {
    await expect(badge).toHaveClass(/(?:^|\s)border-border(?:\s|$)/);
    await expect(badge).toHaveClass(/(?:^|\s)bg-muted(?:\s|$)/);
    await expect(badge).toHaveClass(/(?:^|\s)text-muted-foreground(?:\s|$)/);
    await expect(badge).not.toHaveClass(/(?:bg|text)-(?:success|warning)(?:[\s/]|$)/);
  } else {
    for (const token of [`text-${tone}`, `border-${tone}/20`, `bg-${tone}/10`]) {
      expect((await badge.getAttribute("class"))?.split(/\s+/)).toContain(token);
    }
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 1366]) {
    test(`Dashboard nickname status, changed-only save and confirmed revocation at ${width}px ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installAccountManagementFixture(page, baseURL, { theme });
      let link: Link = null;
      const writes: unknown[] = [];
      let reads = 0;
      await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
        const request = route.request();
        expect(new URL(request.url()).origin).toBe(new URL(baseURL!).origin);
        if (request.method() === "GET") {
          reads++;
          return route.fulfill({ json: { ok: true, link, nicknames } });
        }
        expect(request.method()).toBe("PUT");
        const body = request.postDataJSON();
        writes.push(body);
        link = body.nicknameId ? activeLink(body.nicknameId) : { nicknameId: null, nickname: null, accountRole: "admin", isActive: false };
        return route.fulfill({ json: { ok: true, link } });
      });
      await openAccountManagement(page);
      expect(reads).toBe(0);
      await openDetails(page);
      const scope = collectionScope(page);
      const save = scope.getByRole("button", { name: "Simpan pautan Dashboard", exact: true });
      const select = scope.getByRole("combobox", { name: "Nickname Collection", exact: true });
      await expect(scope.getByText("Belum ditetapkan", { exact: true })).toBeVisible();
      await expectStatus(page, "Belum ditetapkan", "neutral");
      const assign = scope.getByRole("button", { name: "Tetapkan nickname Dashboard", exact: true });
      await expect(assign).toHaveAttribute("aria-expanded", "false");
      await expect(scope.getByRole("button", { name: "Ubah nickname Dashboard", exact: true })).toHaveCount(0);
      const badgeBox = await scope.getByTestId("dashboard-nickname-status").boundingBox();
      const actionBox = await assign.boundingBox();
      expect(badgeBox).toBeTruthy();
      expect(actionBox).toBeTruthy();
      if (width === 320) {
        expect(actionBox!.y).toBeGreaterThanOrEqual(badgeBox!.y + badgeBox!.height - 1);
      } else {
        expect(actionBox!.x).toBeGreaterThanOrEqual(badgeBox!.x + badgeBox!.width);
        expect(Math.max(actionBox!.y, badgeBox!.y)).toBeLessThan(Math.min(actionBox!.y + actionBox!.height, badgeBox!.y + badgeBox!.height));
      }
      await expect.poll(() => reads).toBe(1);
      await expect(select).toBeHidden();
      await openEditor(page);
      await expect(save).toBeDisabled();
      await expect(select.locator('option[value=""]')).toBeDisabled();
      await expect(scope.getByRole("button", { name: "Buang pautan", exact: true })).toHaveCount(0);
      await select.selectOption(nicknameId);
      await expect(save).toBeEnabled();
      await expect(scope).toContainText(/kutipan ketua dan ahli kumpulan aktif/i);
      await save.press("Enter");
      await expect(scope.getByText("Pautan Dashboard disimpan.", { exact: true })).toBeVisible();
      await expect(save).toBeDisabled();
      await expect(scope).toContainText("Dipautkan: LEADER.SYNTHETIC");
      await expectStatus(page, "Dipautkan: LEADER.SYNTHETIC", "success");
      expect(writes).toEqual([{ nicknameId }]);
      await scope.getByRole("button", { name: "Tutup tetapan nickname", exact: true }).click();
      await expect(select).toBeHidden();
      await expect(scope).toContainText("Dipautkan: LEADER.SYNTHETIC");
      await expect(scope.getByRole("button", { name: "Ubah nickname Dashboard", exact: true })).toHaveAttribute("aria-expanded", "false");
      await expect(scope.getByRole("button", { name: "Tetapkan nickname Dashboard", exact: true })).toHaveCount(0);
      await scope.screenshot({ path: test.info().outputPath(`dashboard-account-active-${width}-${theme}.png`) });
      await openEditor(page);
      await expect(select).toHaveValue(nicknameId);
      await expect(save).toBeDisabled();
      expect(reads).toBe(1);
      await select.selectOption(secondNicknameId);
      await expect(save).toBeEnabled();
      await select.selectOption(nicknameId);
      await expect(save).toBeDisabled();
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath(`dashboard-account-editor-${width}-${theme}.png`) });

      const remove = scope.getByRole("button", { name: "Buang pautan", exact: true });
      await remove.press("Enter");
      const confirmation = page.getByRole("alertdialog", { name: "Buang pautan Dashboard?", exact: true });
      await expect(confirmation).toBeVisible();
      await expect(confirmation).toContainText("LEADER.SYNTHETIC");
      const layers = await confirmation.evaluate((element) => {
        const overlay = element.previousElementSibling;
        const details = document.querySelector('[role="dialog"][data-state="open"]');
        if (!overlay || !details) throw new Error("Expected a nested confirmation over account Details");
        return { overlay: Number(getComputedStyle(overlay).zIndex), details: Number(getComputedStyle(details).zIndex) };
      });
      expect(layers.overlay).toBeGreaterThanOrEqual(layers.details);
      await page.screenshot({ path: test.info().outputPath(`dashboard-account-confirmation-${width}-${theme}.png`) });
      await confirmation.getByRole("button", { name: "Batal", exact: true }).press("Enter");
      await expect(confirmation).toBeHidden();
      await expect(remove).toBeFocused();
      expect(writes).toEqual([{ nicknameId }]);
      await expect(select).toHaveValue(nicknameId);
      await remove.press("Enter");
      await confirmation.getByRole("button", { name: "Ya, buang pautan", exact: true }).click();
      await expect(confirmation).toBeHidden();
      await expect(scope.getByText(/^(?:Belum ditetapkan|Tiada pautan)$/)).toBeVisible();
      await expectStatus(page, "Tiada pautan", "neutral");
      await expect(select).toHaveValue("");
      await expect(save).toBeDisabled();
      await expect(remove).toHaveCount(0);
      expect(writes).toEqual([{ nicknameId }, { nicknameId: null }]);
      expect(await detailsDialog(page).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath(`dashboard-account-link-${width}-${theme}.png`) });
      await scope.getByRole("button", { name: "Tutup tetapan nickname", exact: true }).click();
      await expect(scope.getByRole("button", { name: "Tetapkan nickname Dashboard", exact: true })).toHaveAttribute("aria-expanded", "false");
      expect(writes).toEqual([{ nicknameId }, { nicknameId: null }]);
      await assertAccountFixtureClean(page, fixture);
    });
  }
}

test("Dashboard nickname user scope and inactive mapping are explicit before editing", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-3", (route) => route.fulfill({ json: {
    ok: true, link: { nicknameId: "33333333-3333-4333-8333-333333333333", nickname: "INACTIVE.SYNTHETIC", accountRole: "user", isActive: false }, nicknames,
  } }));
  await openAccountManagement(page);
  await openDetails(page, "synthetic.user.03");
  const scope = collectionScope(page);
  await expect(scope.getByText("Perlu semakan", { exact: true })).toBeVisible();
  await expectStatus(page, "Perlu semakan", "warning");
  await expect(scope.getByRole("button", { name: "Ubah nickname Dashboard", exact: true })).toBeVisible();
  await expect(scope.getByRole("button", { name: "Tetapkan nickname Dashboard", exact: true })).toHaveCount(0);
  await scope.screenshot({ path: test.info().outputPath("dashboard-account-review-light.png") });
  await openEditor(page);
  const select = scope.getByRole("combobox", { name: "Nickname Collection", exact: true });
  await expect(select).toHaveValue("");
  const save = scope.getByRole("button", { name: "Simpan pautan Dashboard", exact: true });
  await expect(save).toBeDisabled();
  await select.selectOption(secondNicknameId);
  await expect(scope).toContainText(/kutipan (?:sendiri|nickname ini)/i);
  await expect(save).toBeEnabled();
  await expect(scope.getByRole("button", { name: "Buang pautan", exact: true })).toBeVisible();
  expect(fixture.writes).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

for (const width of [320, 768]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Dashboard nickname long linked status wraps with an available action at ${width}px ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installAccountManagementFixture(page, baseURL, { theme });
      const nickname = `LEADER.${"SYNTHETIC".repeat(18)}`;
      let reads = 0;
      await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
        expect(route.request().method()).toBe("GET");
        reads++;
        return route.fulfill({ json: {
          ok: true, link: { nicknameId, nickname, accountRole: "admin", isActive: true },
          nicknames: [{ id: nicknameId, nickname }],
        } });
      });
      await openAccountManagement(page);
      await openDetails(page);
      const scope = collectionScope(page);
      await expectStatus(page, `Dipautkan: ${nickname}`, "success");
      const badge = scope.getByTestId("dashboard-nickname-status");
      const action = scope.getByRole("button", { name: "Ubah nickname Dashboard", exact: true });
      await badge.scrollIntoViewIfNeeded();
      await expect(action).toBeVisible();
      for (const element of [badge, scope, detailsDialog(page)]) {
        expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`dashboard-account-long-status-${width}-${theme}.png`) });
      await action.press("Enter");
      const select = scope.getByRole("combobox", { name: "Nickname Collection", exact: true });
      await expect(select).toBeVisible();
      await expect(select).toHaveValue(nicknameId);
      await expect(scope.getByRole("button", { name: "Simpan pautan Dashboard", exact: true })).toBeDisabled();
      expect(await scope.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`dashboard-account-long-editor-${width}-${theme}.png`) });
      await scope.getByRole("button", { name: "Tutup tetapan nickname", exact: true }).press("Enter");
      await expect(select).toBeHidden();
      await expect(action).toBeFocused();
      await expectStatus(page, `Dipautkan: ${nickname}`, "success");
      expect(reads).toBe(1);
      expect(fixture.writes).toEqual([]);
      await assertAccountFixtureClean(page, fixture);
    });
  }
}

test("Dashboard nickname failed save retains the selection and permits a deliberate retry", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  const writes: unknown[] = [];
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, link: activeLink(), nicknames } });
    expect(route.request().method()).toBe("PUT");
    writes.push(route.request().postDataJSON());
    // Malformed success exercises the real contract-error UI without HTTP retry,
    // deliberate browser network errors, or a real server mutation.
    return route.fulfill({ json: writes.length === 1 ? { ok: true, link: "invalid" } : { ok: true, link: activeLink(secondNicknameId) } });
  });
  await openAccountManagement(page);
  await openDetails(page);
  const scope = collectionScope(page);
  await expect(scope).toContainText("Dipautkan: LEADER.SYNTHETIC");
  await openEditor(page);
  const select = scope.getByRole("combobox", { name: "Nickname Collection", exact: true });
  const save = scope.getByRole("button", { name: "Simpan pautan Dashboard", exact: true });
  await select.selectOption(secondNicknameId);
  await save.click();
  await expect(scope.getByRole("alert")).toContainText("Pautan tidak dapat disimpan");
  await expect(select).toHaveValue(secondNicknameId);
  await expect(save).toBeEnabled();
  await expect(scope).toContainText("Dipautkan: LEADER.SYNTHETIC");
  expect(writes).toEqual([{ nicknameId: secondNicknameId }]);
  await save.press("Enter");
  await expect(scope.getByRole("alert")).toHaveCount(0);
  await expect(scope).toContainText("Dipautkan: SECOND.SYNTHETIC");
  await expect(save).toBeDisabled();
  expect(writes).toEqual([{ nicknameId: secondNicknameId }, { nicknameId: secondNicknameId }]);
  await assertAccountFixtureClean(page, fixture);
});

test("Dashboard nickname inactive link removal retries safely and restores focus when no options remain", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  const writes: unknown[] = [];
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, link: {
      nicknameId, nickname: "INACTIVE.SYNTHETIC", accountRole: "admin", isActive: false,
    }, nicknames: [] } });
    expect(route.request().method()).toBe("PUT");
    writes.push(route.request().postDataJSON());
    return route.fulfill({ json: writes.length === 1 ? { ok: true, link: "invalid" }
      : { ok: true, link: { nicknameId: null, nickname: null, accountRole: "admin", isActive: false } } });
  });
  await openAccountManagement(page);
  await openDetails(page);
  const scope = collectionScope(page);
  await expect(scope.getByText("Perlu semakan", { exact: true })).toBeVisible();
  await openEditor(page);
  const select = scope.getByRole("combobox", { name: "Nickname Collection", exact: true });
  await expect(select).toBeDisabled();
  await expect(scope.getByRole("button", { name: "Simpan pautan Dashboard", exact: true })).toBeDisabled();
  await expect(scope).toContainText("Tiada nickname aktif yang sesuai");
  await scope.getByRole("button", { name: "Buang pautan", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Buang pautan Dashboard?", exact: true });
  const confirm = confirmation.getByRole("button", { name: "Ya, buang pautan", exact: true });
  await confirm.press("Enter");
  await expect(confirmation.getByRole("alert")).toContainText("Pautan tidak dapat dibuang");
  await expect(confirm).toBeEnabled();
  expect(writes).toEqual([{ nicknameId: null }]);
  await confirm.press("Enter");
  await expect(confirmation).toBeHidden();
  await expect(scope.getByText("Tiada pautan", { exact: true })).toBeVisible();
  await expect(scope.getByRole("button", { name: "Buang pautan", exact: true })).toHaveCount(0);
  await expect(select).toBeDisabled();
  await expect(scope.getByRole("button", { name: "Tutup tetapan nickname", exact: true })).toBeFocused();
  expect(writes).toEqual([{ nicknameId: null }, { nicknameId: null }]);
  await assertAccountFixtureClean(page, fixture);
});

test("Dashboard nickname status discards stale account responses and can retry a failed load", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  let staleFinished = false;
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
    expect(route.request().method()).toBe("GET");
    calls++;
    const call = calls;
    if (call === 1) await held;
    try {
      // A malformed success is rejected by the API contract, not network retry.
      await route.fulfill({ json: call === 2 ? { ok: true, link: null, nicknames: "invalid" }
        : { ok: true, link: activeLink(), nicknames } }).catch(() => {});
    } finally { if (call === 1) staleFinished = true; }
  });
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-3", (route) => route.fulfill({ json: { ok: true, link: null, nicknames } }));
  await openAccountManagement(page);
  try {
    await openDetails(page);
    await expect(collectionScope(page)).toContainText(/Memuatkan/);
    await expectStatus(page, "Memuatkan status…", "neutral");
    await expect(collectionScope(page).getByText("Belum ditetapkan", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await openDetails(page, "synthetic.user.03");
    await expect(collectionScope(page).getByText("Belum ditetapkan", { exact: true })).toBeVisible();
    release();
    await expect.poll(() => staleFinished).toBe(true);
    await expect(collectionScope(page).getByText("Belum ditetapkan", { exact: true })).toBeVisible();
    await expect(collectionScope(page).getByText("Dipautkan: LEADER.SYNTHETIC", { exact: true })).toHaveCount(0);
    await openEditor(page);
    await expect(collectionScope(page).getByRole("combobox", { name: "Nickname Collection", exact: true })).toHaveValue("");
    await expect(collectionScope(page).getByRole("button", { name: "Simpan pautan Dashboard", exact: true })).toBeDisabled();
    await expect(collectionScope(page).getByText("Pilih nickname untuk menyemak skop kutipan Dashboard.", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await openDetails(page);
    await expect(collectionScope(page).getByRole("alert")).toContainText("Tetapan tidak dapat dimuatkan");
    await expectStatus(page, "Status tidak tersedia", "neutral");
    await expect(collectionScope(page).getByText("Belum ditetapkan", { exact: true })).toHaveCount(0);
    await collectionScope(page).getByRole("button", { name: "Cuba semula", exact: true }).click();
    await expect(collectionScope(page)).toContainText("Dipautkan: LEADER.SYNTHETIC");
    await expect(collectionScope(page).getByRole("alert")).toHaveCount(0);
    await openEditor(page);
    await expect(collectionScope(page).getByRole("combobox", { name: "Nickname Collection", exact: true })).toHaveValue(nicknameId);
    expect(calls).toBe(3);
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  } finally { release(); }
});

test("Dashboard nickname pending save locks actions and cannot update another account after closing", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const writes: unknown[] = [];
  let completed = false;
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, link: activeLink(), nicknames } });
    expect(route.request().method()).toBe("PUT");
    writes.push(route.request().postDataJSON());
    await held;
    try { await route.fulfill({ json: { ok: true, link: activeLink(secondNicknameId) } }).catch(() => {}); }
    finally { completed = true; }
  });
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-3", (route) => route.fulfill({ json: { ok: true, link: null, nicknames } }));
  await openAccountManagement(page);
  try {
    await openDetails(page);
    await expect(collectionScope(page)).toContainText("Dipautkan: LEADER.SYNTHETIC");
    await openEditor(page);
    const scope = collectionScope(page);
    const select = scope.getByRole("combobox", { name: "Nickname Collection", exact: true });
    await select.selectOption(secondNicknameId);
    await scope.getByRole("button", { name: "Simpan pautan Dashboard", exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    await expect(select).toBeDisabled();
    await expect(scope.getByRole("button", { name: "Buang pautan", exact: true })).toBeDisabled();
    await expect(scope.getByRole("button", { name: "Menyimpan…", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await openDetails(page, "synthetic.user.03");
    await expect(collectionScope(page).getByText("Belum ditetapkan", { exact: true })).toBeVisible();
    release();
    await expect.poll(() => completed).toBe(true);
    await expect(collectionScope(page).getByText("Belum ditetapkan", { exact: true })).toBeVisible();
    await expect(collectionScope(page).getByText("Pautan Dashboard disimpan.", { exact: true })).toHaveCount(0);
    await expect(collectionScope(page).getByText("Dipautkan: SECOND.SYNTHETIC", { exact: true })).toHaveCount(0);
    await openEditor(page);
    await expect(collectionScope(page).getByRole("combobox", { name: "Nickname Collection", exact: true })).toHaveValue("");
    await expect(collectionScope(page).getByRole("button", { name: "Simpan pautan Dashboard", exact: true })).toBeDisabled();
    await expect(collectionScope(page).getByText("Pilih nickname untuk menyemak skop kutipan Dashboard.", { exact: true })).toBeVisible();
    expect(writes).toEqual([{ nicknameId: secondNicknameId }]);
    await assertAccountFixtureClean(page, fixture);
  } finally { release(); }
});
