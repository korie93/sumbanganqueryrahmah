import { expect, test, type Page } from "@playwright/test";
import {
  accountDashboardNicknames, assertAccountFixtureClean, installAccountManagementFixture,
  openAccountManagement, selectAccountSection,
} from "./helpers/account-management-fixture";

test.use({ serviceWorkers: "block" });
const endpoint = "/api/admin/users/dashboard-nicknames";
const usersEndpoint = "/api/admin/users";
const createRegion = (page: Page) => page.getByRole("region", { name: "Create Closed Account", exact: true });
const nicknameRegion = (page: Page) => createRegion(page).getByRole("region", { name: "Kutipan Dashboard ketika cipta akaun", exact: true });
const nicknameSelect = (page: Page) => nicknameRegion(page).getByRole("combobox", { name: "Nickname Dashboard", exact: true });
const nicknameReads = (fixture: Awaited<ReturnType<typeof installAccountManagementFixture>>) => fixture.reads.filter((entry) => entry.path === endpoint);

async function openCreate(page: Page) {
  await openAccountManagement(page);
  await selectAccountSection(page, "Create Closed Account");
  await expect(createRegion(page)).toBeVisible();
}
async function fillAccount(page: Page, username: string) {
  await createRegion(page).getByLabel("Username", { exact: true }).fill(username);
  await createRegion(page).getByLabel("Email", { exact: true }).fill(`${username}@example.test`);
}
async function expandNicknames(page: Page) {
  const collapsed = nicknameRegion(page).getByRole("button", { name: "Tetapkan nickname sekarang", exact: true });
  if (await collapsed.count()) await collapsed.press("Enter");
  await expect(nicknameRegion(page).getByRole("button", { name: "Sembunyikan pilihan nickname", exact: true })).toBeVisible();
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 1366]) {
    test(`Create account Dashboard nickname commits one optional role-scoped choice at ${width}px ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await installAccountManagementFixture(page, baseURL, { theme });
      const role = width === 320 ? "user" : "admin";
      const nickname = accountDashboardNicknames[role][0]!;
      const username = `synthetic.create.${role}`;
      await openCreate(page);
      expect(nicknameReads(fixture)).toEqual([]);
      await fillAccount(page, username);
      await createRegion(page).getByRole("combobox", { name: "Role", exact: true }).selectOption(role);
      await expandNicknames(page);
      await expect.poll(() => nicknameReads(fixture)).toEqual([{ path: endpoint, query: { role } }]);
      await expect(nicknameSelect(page)).toHaveValue("");
      await expect(nicknameSelect(page).locator("option")).toHaveText(["Tetapkan kemudian", nickname.nickname]);
      await nicknameSelect(page).selectOption(nickname.id);
      await expect(nicknameRegion(page)).toContainText(role === "admin"
        ? "Ringkasan kutipan ketua dan ahli kumpulan aktif." : "Ringkasan kutipan sendiri sahaja.");
      await expect(nicknameSelect(page)).toHaveAttribute("aria-describedby", /\S/);
      await expect(nicknameRegion(page)).toContainText("Pengesahan nickname masih diperlukan");
      await nicknameSelect(page).selectOption("");
      await expect(nicknameSelect(page)).toHaveValue("");
      await nicknameSelect(page).selectOption(nickname.id);
      expect(await createRegion(page).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await nicknameSelect(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath(`create-dashboard-nickname-${width}-${theme}.png`) });
      const release = fixture.hold(`POST ${usersEndpoint}`);
      try {
        await createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true }).click();
        await expect.poll(() => fixture.writes.length).toBe(1);
        await expect(nicknameSelect(page)).toBeDisabled();
        const creating = createRegion(page).getByRole("button", { name: "Creating...", exact: true });
        await expect(creating).toBeDisabled();
        await creating.dispatchEvent("click");
        expect(fixture.writes).toEqual([{ method: "POST", path: usersEndpoint, payload: {
          email: `${username}@example.test`, fullName: null, role, username, dashboardNicknameId: nickname.id,
        } }]);
        release();
        await expect(createRegion(page).getByLabel("Username", { exact: true })).toHaveValue("");
        await expect(createRegion(page).getByLabel("Email", { exact: true })).toHaveValue("");
        expect(fixture.users.filter((account) => account.username === username)).toHaveLength(1);
        expect(fixture.users.find((account) => account.username === username)?.status).toBe("pending_activation");
        expect(fixture.writes.every((write) => write.method === "POST" && write.path === usersEndpoint)).toBe(true);
      } finally { fixture.releaseAll(); }
      await assertAccountFixtureClean(page, fixture);
    });
  }
}

test("Create account Dashboard nickname is skipped without fetching or changing the legacy create payload", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openCreate(page);
  await fillAccount(page, "synthetic.skip");
  await expect(nicknameSelect(page)).toHaveCount(0);
  expect(nicknameReads(fixture)).toEqual([]);
  await createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true }).click();
  await expect(createRegion(page).getByLabel("Username", { exact: true })).toHaveValue("");
  expect(fixture.writes).toEqual([{ method: "POST", path: usersEndpoint, payload: {
    username: "synthetic.skip", email: "synthetic.skip@example.test", fullName: null, role: "user",
  } }]);
  expect(nicknameReads(fixture)).toEqual([]);
  await assertAccountFixtureClean(page, fixture);
});

test("Create account Dashboard nickname remains explicit when collapsed and can be cleared before creating", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openCreate(page);
  await fillAccount(page, "synthetic.clear.choice");
  await expandNicknames(page);
  const nickname = accountDashboardNicknames.user[0]!;
  await nicknameSelect(page).selectOption(nickname.id);
  await nicknameRegion(page).getByRole("button", { name: "Sembunyikan pilihan nickname", exact: true }).click();
  await expect(nicknameSelect(page)).toHaveCount(0);
  await expect(nicknameRegion(page)).toContainText(`Dipilih: ${nickname.nickname}`);
  const reads = nicknameReads(fixture).length;
  await nicknameRegion(page).getByRole("button", { name: "Tetapkan kemudian", exact: true }).press("Enter");
  await expect(nicknameRegion(page).getByText(`Dipilih: ${nickname.nickname}`, { exact: true })).toHaveCount(0);
  expect(nicknameReads(fixture)).toHaveLength(reads);
  await createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true }).click();
  await expect(createRegion(page).getByLabel("Username", { exact: true })).toHaveValue("");
  expect(fixture.writes).toEqual([{ method: "POST", path: usersEndpoint, payload: {
    username: "synthetic.clear.choice", email: "synthetic.clear.choice@example.test", fullName: null, role: "user",
  } }]);
  await assertAccountFixtureClean(page, fixture);
});

test("Create account Dashboard nickname clears a selected user choice when switching through manager to admin", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  await openCreate(page);
  await fillAccount(page, "synthetic.manager");
  await expandNicknames(page);
  await nicknameSelect(page).selectOption(accountDashboardNicknames.user[0]!.id);
  const role = createRegion(page).getByRole("combobox", { name: "Role", exact: true });
  await role.selectOption("manager");
  await expect(nicknameSelect(page)).toHaveCount(0);
  await expect(nicknameRegion(page)).toContainText("Manager melihat semua kutipan bulanan mengikut permission; nickname tidak diperlukan.");
  await role.selectOption("admin");
  if (!await nicknameSelect(page).isVisible()) await expandNicknames(page);
  await expect(nicknameSelect(page)).toHaveValue("");
  await expect(nicknameSelect(page).locator("option")).toHaveText(["Tetapkan kemudian", accountDashboardNicknames.admin[0]!.nickname]);
  await role.selectOption("manager");
  await createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true }).click();
  await expect(createRegion(page).getByLabel("Username", { exact: true })).toHaveValue("");
  expect(fixture.writes).toEqual([{ method: "POST", path: usersEndpoint, payload: {
    username: "synthetic.manager", email: "synthetic.manager@example.test", fullName: null, role: "manager",
  } }]);
  expect(nicknameReads(fixture).every((read) => read.query.role !== "manager")).toBe(true);
  await assertAccountFixtureClean(page, fixture);
});

test("Create account Dashboard nickname ignores a late user options response after the role changes", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let finished = false;
  await page.route(`**${endpoint}?role=user`, async (route) => {
    await held;
    try { await route.fulfill({ json: { ok: true, nicknames: accountDashboardNicknames.user } }).catch(() => {}); }
    finally { finished = true; }
  });
  await openCreate(page);
  try {
    await expandNicknames(page);
    await expect(nicknameRegion(page)).toContainText("Memuatkan nickname…");
    await createRegion(page).getByRole("combobox", { name: "Role", exact: true }).selectOption("admin");
    if (!await nicknameSelect(page).isVisible()) await expandNicknames(page);
    await expect(nicknameSelect(page).locator("option")).toHaveText(["Tetapkan kemudian", accountDashboardNicknames.admin[0]!.nickname]);
    release();
    await expect.poll(() => finished).toBe(true);
    await expect(nicknameSelect(page).locator("option")).toHaveText(["Tetapkan kemudian", accountDashboardNicknames.admin[0]!.nickname]);
    await expect(nicknameSelect(page)).toHaveValue("");
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  } finally { release(); }
});

test("Create account Dashboard nickname option load failure can retry or create without a nickname", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  let calls = 0;
  await page.route(`**${endpoint}?role=user`, (route) => {
    calls++;
    return route.fulfill({ json: calls === 1 ? { ok: true, nicknames: "invalid" }
      : { ok: true, nicknames: accountDashboardNicknames.user } });
  });
  await openCreate(page);
  await fillAccount(page, "synthetic.retry.options");
  await expandNicknames(page);
  await expect(nicknameRegion(page).getByRole("alert")).toContainText("Tiada senarai nickname buat masa ini");
  await expect(createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true })).toBeEnabled();
  await nicknameRegion(page).getByRole("button", { name: "Cuba semula", exact: true }).click();
  await expect(nicknameSelect(page).locator("option")).toHaveText(["Tetapkan kemudian", accountDashboardNicknames.user[0]!.nickname]);
  expect(calls).toBe(2);
  await expect(nicknameRegion(page).getByRole("alert")).toHaveCount(0);
  await expect(nicknameSelect(page)).toHaveValue("");
  await createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true }).click();
  await expect(createRegion(page).getByLabel("Username", { exact: true })).toHaveValue("");
  expect(fixture.writes).toEqual([{ method: "POST", path: usersEndpoint, payload: {
    username: "synthetic.retry.options", email: "synthetic.retry.options@example.test", fullName: null, role: "user",
  } }]);
  await assertAccountFixtureClean(page, fixture);
});

test("Create account Dashboard nickname server rejection preserves the draft for a deliberate single-request retry", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  const attempts: unknown[] = [];
  await page.route(`**${usersEndpoint}`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) return route.fulfill({ status: 400, json: {
      ok: false, code: "INVALID_INPUT", message: "Choose an active nickname allowed for this account role.",
    } });
    return route.fallback();
  });
  await openCreate(page);
  await fillAccount(page, "synthetic.retry.create");
  await expandNicknames(page);
  const nickname = accountDashboardNicknames.user[0]!;
  await nicknameSelect(page).selectOption(nickname.id);
  await createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true }).click();
  await expect(page.getByText("Create Failed", { exact: true }).first()).toBeVisible();
  await expect(createRegion(page).getByLabel("Username", { exact: true })).toHaveValue("synthetic.retry.create");
  await expect(createRegion(page).getByLabel("Email", { exact: true })).toHaveValue("synthetic.retry.create@example.test");
  await expect(nicknameSelect(page)).toHaveValue(nickname.id);
  expect(attempts).toHaveLength(1);
  expect(fixture.users.find((entry) => entry.username === "synthetic.retry.create")).toBeUndefined();
  await createRegion(page).getByRole("button", { name: "Create Closed Account", exact: true }).press("Enter");
  await expect(createRegion(page).getByLabel("Username", { exact: true })).toHaveValue("");
  expect(attempts).toEqual([{
    username: "synthetic.retry.create", email: "synthetic.retry.create@example.test", fullName: null, role: "user", dashboardNicknameId: nickname.id,
  }, {
    username: "synthetic.retry.create", email: "synthetic.retry.create@example.test", fullName: null, role: "user", dashboardNicknameId: nickname.id,
  }]);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({ method: "POST", path: usersEndpoint });
  expect(fixture.users.filter((entry) => entry.username === "synthetic.retry.create")).toHaveLength(1);
  // This case deliberately returns one HTTP400. Accept only Chromium's specific
  // resource-status message; all application errors remain prohibited.
  expect(fixture.consoleErrors.length).toBeLessThanOrEqual(1);
  expect(fixture.consoleErrors.every((message) => /^Failed to load resource:.*\b400\b/.test(message))).toBe(true);
  fixture.consoleErrors.length = 0;
  await assertAccountFixtureClean(page, fixture);
});
