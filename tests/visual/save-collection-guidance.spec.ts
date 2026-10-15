import { expect, test } from "@playwright/test";
import {
  addReceipt, checkFixture, confirmation, draft, fillIdentity, installFixture,
  nickname, openSave, readDraft, reset,
} from "./helpers/save-collection-fixture";

// Static production frontend, synthetic HTTP and generated receipt bytes only.
test.use({ serviceWorkers: "block" });

for (const theme of ["light", "dark"] as const) for (const width of [1366, 390]) {
  test(`Save guidance Reset preserves then clears draft and receipts ${theme} ${width}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installFixture(page, baseURL, { theme, restore: draft });
    await openSave(page);
    await testInfo.attach(`guidance-${theme}-${width}`, {
      body: await page.locator('section[aria-labelledby="save-collection-form-title"] > header').screenshot({
        path: testInfo.outputPath(`guidance-${theme}-${width}.png`),
      }), contentType: "image/png",
    });
    await fillIdentity(page);
    await addReceipt(page);
    await expect.poll(() => fixture.matches).toBe(1);
    const matchMessage = page.getByText("Tiada rekod Saved sepadan. Semak semula identiti, Account/Card Number, Payment Date, dan Amount.", { exact: true });
    await expect(matchMessage).toBeVisible();
    await expect.poll(async () => (await readDraft(page))?.hadPendingReceipts).toBe(true);
    const before = await readDraft(page);
    await reset(page).click();
    await expect(confirmation(page)).toBeVisible();
    await expect(confirmation(page).getByRole("button", { name: "Teruskan Mengisi" })).toBeFocused();
    await page.keyboard.press("Control+s");
    expect(fixture.saves).toHaveLength(0);
    await confirmation(page).getByRole("button", { name: "Teruskan Mengisi" }).click();
    await expect(confirmation(page)).toBeHidden();
    await expect(reset(page)).toBeFocused();
    await expect(page.locator("#save-collection-customer-name")).toHaveValue("Synthetic Customer");
    await expect(page.getByTestId("receipt-draft-card")).toHaveCount(1);
    expect(await readDraft(page)).toEqual(before);
    await expect(matchMessage).toBeVisible();
    await reset(page).click();
    await expect(confirmation(page)).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(confirmation(page)).toBeVisible();
    await expect(confirmation(page).getByRole("button", { name: "Teruskan Mengisi" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toBeHidden();
    await reset(page).click();
    await expect(confirmation(page)).toBeVisible();
    await expect(confirmation(page)).toHaveCSS("opacity", "1");
    await expect(confirmation(page)).toBeInViewport({ ratio: 1 });
    await testInfo.attach(`reset-${theme}-${width}`, {
      body: await page.screenshot({ path: testInfo.outputPath(`reset-${theme}-${width}.png`), animations: "disabled" }), contentType: "image/png",
    });
    await confirmation(page).getByRole("button", { name: "Kosongkan Borang", exact: true }).click();
    await expect(confirmation(page)).toBeHidden();
    await expect(reset(page)).toBeFocused();
    await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
    await expect(page.locator("#save-collection-amount")).toHaveValue("");
    await expect(page.locator("#save-collection-batch")).toHaveValue("P10");
    await expect(page.getByTestId("receipt-draft-card")).toHaveCount(0);
    await expect(matchMessage).toHaveCount(0);
    await expect.poll(() => readDraft(page)).toBeNull();
    await reset(page).click();
    await expect(confirmation(page)).toBeHidden();
    expect(fixture.saves).toHaveLength(0);
    expect(fixture.matches).toBe(1);
    await checkFixture(page, fixture);
  });
}

for (const role of ["admin", "user"] as const) test(`Save guidance pristine and minimal drafts ${role}`, async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role });
  await openSave(page);
  await reset(page).click();
  await expect(confirmation(page)).toBeHidden();
  await page.locator("#save-collection-customer-name").fill(" ");
  await reset(page).click();
  await expect(confirmation(page)).toBeVisible();
  await confirmation(page).getByRole("button", { name: "Kosongkan Borang", exact: true }).click();
  await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
  await addReceipt(page);
  await reset(page).click();
  await expect(confirmation(page)).toBeVisible();
  await confirmation(page).getByRole("button", { name: "Teruskan Mengisi" }).click();
  await expect(page.getByTestId("receipt-draft-card")).toHaveCount(1);
  await reset(page).click();
  await confirmation(page).getByRole("button", { name: "Kosongkan Borang", exact: true }).click();
  await expect(page.getByTestId("receipt-draft-card")).toHaveCount(0);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

for (const viewport of [{ width: 320, height: 844 }, { width: 740, height: 360 }]) test(`Save guidance Betulkan and required labels ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize(viewport);
  const fixture = await installFixture(page, baseURL, { theme: viewport.width === 320 ? "light" : "dark" });
  await openSave(page);
  const targets = {
    "Customer Name": "customer-name", "IC Number": "customer-ic-number", "Customer Phone Number": "customer-phone",
    "Account Number": "account-number", "Card Number": "card-number", "Payment Date": "payment-date-button", "Amount (RM)": "amount",
  };
  const summary = page.getByTestId("save-collection-readiness");
  await summary.scrollIntoViewIfNeeded();
  const missingFields = summary.locator("details");
  await expect(missingFields).not.toHaveAttribute("open");
  await summary.locator("summary").click();
  await expect(missingFields).toHaveAttribute("open", "");
  await testInfo.attach(`summary-${viewport.width}`, {
    body: await summary.screenshot({ path: testInfo.outputPath(`summary-${viewport.width}.png`) }), contentType: "image/png",
  });
  for (const [label, suffix] of Object.entries(targets)) {
    await summary.getByRole("button", { name: `Betulkan ${label}`, exact: true }).click();
    const input = page.locator(`#save-collection-${suffix}`);
    await expect(input).toBeFocused();
    const rect = await input.boundingBox();
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(page.locator("#save-collection-card-number")).toHaveAttribute("type", "password");
  for (const suffix of ["customer-name", "customer-ic-number", "customer-phone", "batch", "payment-date-button", "amount"]) {
    await expect(page.locator(`label[for="save-collection-${suffix}"]`)).toContainText("(wajib)");
    if (suffix === "payment-date-button") {
      // DatePicker uses a button, where aria-required is not a supported state.
      await expect(page.locator(`#save-collection-${suffix}`)).toHaveAccessibleName(/^Payment Date required:/);
    } else {
      await expect(page.locator(`#save-collection-${suffix}`)).toHaveAttribute("aria-required", "true");
    }
  }
  for (const suffix of ["account-number", "card-number"]) {
    await expect(page.locator(`label[for="save-collection-${suffix}"]`)).not.toContainText("(wajib)");
    await expect(page.locator(`#save-collection-${suffix}`)).not.toHaveAttribute("aria-required", "true");
  }
  await page.locator("#save-collection-card-number").fill("00009007199254740993");
  await expect(summary.getByRole("button", { name: "Betulkan Card Number" })).toHaveCount(0);
  await expect(summary.getByRole("button", { name: "Betulkan Account Number" })).toHaveCount(0);
  await expect(summary).not.toContainText("00009007199254740993");
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Save guidance draft copy matches privacy-preserving reload behavior", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { restore: draft });
  await openSave(page);
  await expect(page.getByText("Draf sesi hanya merangkumi batch, tarikh bayaran dan jumlah.")).toBeVisible();
  await expect(page.getByText(/Maklumat pelanggan, nombor akaun\/kad dan fail resit tidak disimpan dalam draf/)).toBeVisible();
  await fillIdentity(page);
  await page.locator("#save-collection-card-number").fill("00009007199254740993");
  await addReceipt(page);
  await expect.poll(async () => (await readDraft(page))?.hadPendingReceipts).toBe(true);
  expect(Object.keys(await readDraft(page)).sort()).toEqual(["amount", "batch", "hadPendingReceipts", "paymentDate", "savedAt"]);
  await page.reload();
  await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
  await expect(page.locator("#save-collection-card-number")).toHaveValue("");
  await expect(page.locator("#save-collection-amount")).toHaveValue("125");
  await expect(page.locator("#save-collection-batch")).toHaveValue("P25");
  await expect(page.getByTestId("receipt-draft-card")).toHaveCount(0);
  await expect(page.getByText(/Pending receipt files need to be uploaded again/)).toBeVisible();
  await reset(page).click();
  await expect(confirmation(page)).toBeVisible();
  await checkFixture(page, fixture);
});

test("Save guidance successful held save disables Reset and clears without confirmation", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { restore: draft, holdSave: true });
  await openSave(page);
  await fillIdentity(page);
  await page.getByRole("button", { name: "Save Collection", exact: true }).click();
  try {
    await expect.poll(() => fixture.saves.length).toBe(1);
    await expect(reset(page)).toBeDisabled();
    await expect(page.locator("#save-collection-customer-name")).toBeDisabled();
    await page.keyboard.press("Control+s");
    expect(fixture.saves).toHaveLength(1);
    await expect(confirmation(page)).toBeHidden();
  } finally { fixture.release(); }
  await expect(page.getByRole("heading", { name: "Collection berjaya disimpan", exact: true })).toBeVisible();
  await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
  await expect(confirmation(page)).toBeHidden();
  expect(fixture.saves[0]!.key).not.toBe("");
  expect(fixture.saves[0]!.fingerprint).not.toBe("");
  expect(fixture.saves[0]!.fields).toMatchObject({ customerName: "Synthetic Customer", batch: "P25", amount: "125", collectionStaffNickname: nickname });
  await checkFixture(page, fixture);
});

test("Save guidance cancelled Reset preserves failed mutation idempotency for retry", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { restore: draft, failFirst: true });
  await openSave(page);
  await fillIdentity(page);
  await addReceipt(page);
  await page.getByRole("button", { name: "Save Collection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cuba Save Semula", exact: true })).toBeVisible();
  await reset(page).click();
  await confirmation(page).getByRole("button", { name: "Teruskan Mengisi" }).click();
  await expect(page.getByTestId("receipt-draft-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Save Collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Collection berjaya disimpan", exact: true })).toBeVisible();
  expect(fixture.saves).toHaveLength(2);
  expect(fixture.saves[1]).toEqual(fixture.saves[0]);
  expect(fixture.saves[0]!.files).toEqual(["Synthetic receipt.png"]);
  await expect(page.getByTestId("receipt-draft-card")).toHaveCount(0);
  await expect(confirmation(page)).toBeHidden();
  await checkFixture(page, fixture);
});

test("Save guidance superuser selection and suspended access preserve local work", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "superuser", holdNicknameReload: true });
  await page.goto("/collection/save");
  await page.locator("#save-collection-superuser-nickname").click();
  await page.getByRole("button", { name: nickname, exact: true }).click();
  await page.locator("#save-collection-customer-name").fill("Synthetic Superuser Draft");
  const readiness = page.getByTestId("save-collection-readiness");
  await readiness.locator("summary").click();
  await expect(readiness.getByRole("button", { name: "Betulkan Amount (RM)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Muat Semula", exact: true }).click();
  try {
    await expect(reset(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Betulkan Amount (RM)", exact: true })).toBeDisabled();
    await page.keyboard.press("Control+s");
    expect(fixture.saves).toHaveLength(0);
  } finally { fixture.release(); }
  await expect(reset(page)).toBeEnabled();
  await expect(page.locator("#save-collection-customer-name")).toHaveValue("Synthetic Superuser Draft");
  await reset(page).click();
  await expect(confirmation(page)).toBeVisible();
  await confirmation(page).getByRole("button", { name: "Teruskan Mengisi" }).click();
  await expect(page.locator("#save-collection-superuser-nickname")).toContainText(nickname);
  await checkFixture(page, fixture);
});
