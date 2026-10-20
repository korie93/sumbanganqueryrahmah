import { expect, test } from "@playwright/test";
import { accountRow, assertAccountFixtureClean, installAccountManagementFixture, openAccountManagement } from "./helpers/account-management-fixture";

test.use({ serviceWorkers: "block" });
for (const width of [320, 1366]) {
  test(`Dashboard nickname assignment loads on demand, saves and revokes at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installAccountManagementFixture(page, baseURL);
    const id = "11111111-1111-4111-8111-111111111111";
    let link: null | { nicknameId: string | null; nickname: string | null; accountRole: string; isActive: boolean } = null;
    const writes: unknown[] = [];
    let reads = 0;
    await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
      const request = route.request();
      expect(new URL(request.url()).origin).toBe(new URL(baseURL!).origin);
      if (request.method() === "GET") {
        reads++;
        return route.fulfill({ json: { ok: true, link, nicknames: [{ id, nickname: "LEADER.SYNTHETIC" }] } });
      }
      expect(request.method()).toBe("PUT");
      const body = request.postDataJSON();
      writes.push(body);
      link = { nicknameId: body.nicknameId, nickname: body.nicknameId ? "LEADER.SYNTHETIC" : null, accountRole: "admin", isActive: Boolean(body.nicknameId) };
      return route.fulfill({ json: { ok: true, link } });
    });
    await openAccountManagement(page);
    await accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Account details", exact: true });
    expect(reads).toBe(0);
    await details.getByRole("button", { name: "Tetapkan nickname Dashboard" }).press("Enter");
    const select = details.getByRole("combobox", { name: "Nickname Collection", exact: true });
    await expect(select).toBeVisible();
    await expect.poll(() => reads).toBe(1);
    await select.selectOption(id);
    await details.getByRole("button", { name: "Simpan pautan Dashboard", exact: true }).press("Enter");
    await expect(details.getByRole("status")).toContainText("Pautan Dashboard disimpan.");
    expect(writes).toEqual([{ nicknameId: id }]);
    await page.keyboard.press("Escape");
    await accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true }).click();
    await details.getByRole("button", { name: "Tetapkan nickname Dashboard" }).click();
    await expect(select).toHaveValue(id);
    await select.selectOption("");
    await details.getByRole("button", { name: "Simpan pautan Dashboard", exact: true }).click();
    await expect(details.getByRole("status")).toContainText("Pautan Dashboard disimpan.");
    expect(writes).toEqual([{ nicknameId: id }, { nicknameId: null }]);
    expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await select.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`dashboard-account-link-${width}.png`) });
    await assertAccountFixtureClean(page, fixture);
  });
}

test("Dashboard nickname editor discards stale account responses and can retry a failed load", async ({ page, baseURL }) => {
  const fixture = await installAccountManagementFixture(page, baseURL);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route("**/api/collection/dashboard-accounts/synthetic-managed-1", async (route) => {
    calls++;
    if (calls === 1) await held;
    // A malformed success is rejected by the API contract without depending on
    // HTTP automatic retries or generating an expected browser network error.
    return route.fulfill({ json: calls === 2 ? { ok: true, link: null, nicknames: "invalid" }
      : { ok: true, link: null, nicknames: [] } }).catch(() => {});
  });
  await openAccountManagement(page);
  const open = async () => {
    await accountRow(page).getByRole("button", { name: "Details for maya.synthetic", exact: true }).click();
    await page.getByRole("button", { name: "Tetapkan nickname Dashboard" }).click();
  };
  try {
    await open();
    await expect(page.getByText("Memuatkan nickname…", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    release();
    await expect(page.getByRole("dialog", { name: "Account details" })).toHaveCount(0);
    await open();
    await expect(page.getByRole("alert")).toContainText("Tetapan tidak dapat dimuatkan");
    await page.getByRole("button", { name: "Cuba semula", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Nickname Collection" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(calls).toBe(3);
    expect(fixture.writes).toEqual([]);
    await assertAccountFixtureClean(page, fixture);
  } finally { release(); }
});
