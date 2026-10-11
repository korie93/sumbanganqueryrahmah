import { expect, test, type Page, type Route } from "@playwright/test";
import {
  addReceipt, checkFixture, confirmation, draft, fillIdentity, installFixture,
  nickname, now, openSave, reset,
} from "./helpers/save-collection-fixture";

// All requests are intercepted by the synthetic loopback fixture. Never run a
// backend/database for these tests or use real customer/receipt information.
test.use({ serviceWorkers: "block" });

const matchingStatus = (page: Page) => page.locator("#save-collection-source-match-status");
const retry = (page: Page) => page.locator("#save-collection-source-match-retry");
const noMatch = "Tiada rekod Saved sepadan. Semak semula identiti, Account/Card Number, Payment Date, dan Amount.";
const incomplete = "Lengkapkan identiti, Account/Card, Payment Date, dan Amount untuk padanan automatik.";
const matched = "Padanan Saved ditemui.";

function sourceMatch(name = "Synthetic Saved Source", amount = "125.00") {
  return {
    sourceImportId: "synthetic-source", sourceImportName: name,
    sourceFilename: "synthetic-saved-source-with-a-long-filename-for-mobile-layout.xlsx",
    matchBasis: "account_and_card", matchAccuracy: 100,
    matchedFields: ["customer_name", "ic_number", "account_number", "card_number"],
    comparedFields: ["customer_name", "ic_number", "account_number", "card_number"],
    agingBucket: "D3", cardNumberLast4: "0993", totalDue: "500.00", billingPrincipalOsp: "450.00",
    callingDate: "2026-10-01", callingWindowEnd: "2026-10-10", callingWindowEndExclusive: "2026-10-11",
    currentEntry: amount, existingCumulative: "50.00", projectedCumulative: "175.00",
    remainingAfterSave: "325.00", projectedTotalDueCovered: false, projectedCpStatus: "abort_cp",
  };
}

function matchResponse(route: Route, name?: string, amount?: string) {
  return route.fulfill({ status: 200, json: { ok: true, matches: [sourceMatch(name, amount)] } });
}

function heldMatch() {
  let release!: () => void;
  let handled!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const settled = new Promise<void>((resolve) => { handled = resolve; });
  return {
    release,
    settled,
    respond: async (route: Route) => {
      try {
        await gate;
        await matchResponse(route, "Obsolete Synthetic Source");
      } finally { handled(); }
    },
  };
}

async function pauseClock(page: Page) {
  await page.clock.pauseAt(new Date(now));
}

async function openControlled(page: Page) {
  await openSave(page);
  await pauseClock(page);
  await expect(matchingStatus(page)).toHaveText(incomplete);
}

async function selectNickname(page: Page, value = nickname) {
  await page.locator("#save-collection-superuser-nickname").click();
  await page.getByRole("button", { name: value, exact: true }).click();
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
}

test("Automatic matching waits for every required valid input and 800 ms idle", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { controlledClock: true });
  await openControlled(page);
  await expect(page.getByRole("button", { name: "Semak Auto-matching", exact: true })).toHaveCount(0);
  for (const [suffix, value] of [
    ["customer-name", "Synthetic Customer"], ["customer-ic-number", "000012345678"],
    ["customer-phone", "invalid"], ["account-number", "000012340000"], ["amount", "125"],
  ]) {
    await page.locator(`#save-collection-${suffix}`).fill(value!);
    await page.clock.runFor(1_000);
    expect(fixture.matches).toBe(0);
    await expect(matchingStatus(page)).toHaveText(incomplete);
  }
  await page.locator("#save-collection-payment-date-button").click();
  await page.getByRole("grid", { name: "October 2026", exact: true }).getByRole("gridcell", { name: "4", exact: true }).click();
  await page.clock.runFor(1_000);
  expect(fixture.matches).toBe(0);
  await page.locator("#save-collection-amount").fill("0");
  await page.locator("#save-collection-customer-phone").fill("0123456789");
  await page.clock.runFor(1_000);
  expect(fixture.matches).toBe(0);
  await page.locator("#save-collection-amount").fill("125");
  await expect(matchingStatus(page)).toContainText("Menunggu input selesai");
  await page.clock.runFor(799);
  expect(fixture.matches).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(() => fixture.matches).toBe(1);
  await expect(matchingStatus(page)).toHaveText(noMatch);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Automatic matching debounces an editing burst into the latest request only", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { controlledClock: true, restore: draft });
  await openControlled(page);
  await fillIdentity(page);
  for (const [suffix, value] of [
    ["customer-name", "Synthetic Edited Customer"], ["customer-ic-number", "000012345679"],
    ["customer-phone", "0123456790"], ["account-number", "000012340001"],
    ["card-number", "00009007199254740993"], ["amount", "250"],
  ]) {
    await page.clock.runFor(400);
    await page.locator(`#save-collection-${suffix}`).fill(value!);
    expect(fixture.matches).toBe(0);
  }
  await page.clock.runFor(799);
  expect(fixture.matches).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(() => fixture.matches).toBe(1);
  expect(fixture.matchRequests).toEqual([{
    customerName: "Synthetic Edited Customer", icNumber: "000012345679", customerPhone: "0123456790",
    accountNumber: "000012340001", cardNumber: "00009007199254740993", paymentDate: "2026-10-04", amount: "250.00",
  }]);
  await page.clock.runFor(5_000);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Card-only matching preserves leading zeros and requires Account or Card", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { controlledClock: true, restore: draft, role: "user" });
  await openControlled(page);
  await fillIdentity(page);
  await page.locator("#save-collection-account-number").fill("");
  await page.clock.runFor(2_000);
  expect(fixture.matches).toBe(0);
  await expect(matchingStatus(page)).toHaveText(incomplete);
  await page.locator("#save-collection-card-number").fill("00009007199254740993");
  await page.clock.runFor(799);
  expect(fixture.matches).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(() => fixture.matches).toBe(1);
  expect(fixture.matchRequests[0]).toMatchObject({ accountNumber: "", cardNumber: "00009007199254740993" });
  await expect(page.locator("#save-collection-card-number")).toHaveAttribute("type", "password");
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

for (const paymentDate of ["2026-02-30", "2026-10-11"]) test(`Invalid or future payment date ${paymentDate} does not start matching`, async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: { ...draft, paymentDate },
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(5_000);
  expect(fixture.matches).toBe(0);
  await expect(matchingStatus(page)).toHaveText(incomplete);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Matching survives receipt, batch, visibility and cancelled Reset changes without another request", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft, onMatch: (route) => matchResponse(route),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.locator("#save-collection-card-number").fill("00009007199254740993");
  await page.clock.runFor(800);
  await expect(matchingStatus(page)).toHaveText(matched);
  await addReceipt(page);
  await page.locator("#save-collection-batch").selectOption("P10");
  await page.getByTestId("toggle-card-number-input").click();
  await page.getByTestId("toggle-card-number-input").click();
  await reset(page).click();
  await expect(confirmation(page)).toBeVisible();
  await page.clock.runFor(2_000);
  await confirmation(page).getByRole("button", { name: "Teruskan Mengisi" }).click();
  await expect(matchingStatus(page)).toHaveText(matched);
  await page.clock.runFor(5_000);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(0);
  await expect(page.locator("#save-collection-card-number")).toHaveAttribute("type", "password");
  await expect(page.locator("#save-collection-card-review-value")).toHaveText("Card ending 0993");
  await page.locator("#save-collection-amount").fill("126");
  await expect(matchingStatus(page)).toContainText("Menunggu input selesai");
  await expect(page.getByText("Synthetic Saved Source", { exact: true })).toHaveCount(0);
  await expect(page.locator("#save-collection-card-review-value")).toHaveText("Card ending 0993");
  await checkFixture(page, fixture);
});

test("A late matching response cannot overwrite the newer edited values", async ({ page, baseURL }) => {
  const pending = heldMatch();
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft,
    // Distinct outcomes make stale completion observable without source details.
    onMatch: (route, index) => index === 1 ? pending.respond(route) : route.fulfill({ status: 200, json: { ok: true, matches: [] } }),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect.poll(() => fixture.matches).toBe(1);
  await expect(matchingStatus(page)).toContainText("Sedang menyemak");
  try {
    await page.locator("#save-collection-amount").fill("126");
    await expect(matchingStatus(page)).toContainText("Menunggu input selesai");
    await page.clock.runFor(800);
    await expect.poll(() => fixture.matches).toBe(2);
    await expect(matchingStatus(page)).toHaveText(noMatch);
  } finally { pending.release(); }
  await pending.settled;
  await expect(matchingStatus(page)).toHaveText(noMatch);
  await expect(page.getByText("Obsolete Synthetic Source", { exact: true })).toHaveCount(0);
  expect(fixture.matchRequests[1]!.amount).toBe("126.00");
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Confirmed Reset invalidates a pending match and leaves no automatic request", async ({ page, baseURL }) => {
  const pending = heldMatch();
  const fixture = await installFixture(page, baseURL, { controlledClock: true, restore: draft, onMatch: pending.respond });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect.poll(() => fixture.matches).toBe(1);
  try {
    await reset(page).click();
    await confirmation(page).getByRole("button", { name: "Kosongkan Borang", exact: true }).click();
    await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
  } finally { pending.release(); }
  await pending.settled;
  await page.clock.runFor(5_000);
  await expect(matchingStatus(page)).toHaveText(incomplete);
  await expect(page.getByText("Obsolete Synthetic Source", { exact: true })).toHaveCount(0);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Automatic matching cancels a debounce during Reset and starts once after cancellation", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { controlledClock: true, restore: draft });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(400);
  await reset(page).click();
  await expect(confirmation(page)).toBeVisible();
  await page.clock.runFor(2_000);
  expect(fixture.matches).toBe(0);
  await confirmation(page).getByRole("button", { name: "Teruskan Mengisi" }).click();
  await expect(matchingStatus(page)).toContainText("Menunggu input selesai");
  await page.clock.runFor(799);
  expect(fixture.matches).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(() => fixture.matches).toBe(1);
  await expect(matchingStatus(page)).toHaveText(noMatch);
  // A confirmed Reset during a later debounce must not query the discarded input.
  await page.locator("#save-collection-amount").fill("126");
  await reset(page).click();
  await confirmation(page).getByRole("button", { name: "Kosongkan Borang", exact: true }).click();
  await page.clock.runFor(2_000);
  await expect(matchingStatus(page)).toHaveText(incomplete);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Automatic matching restarts an interrupted request once after cancelling Reset", async ({ page, baseURL }) => {
  const pending = heldMatch();
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft,
    onMatch: (route, index) => index === 1 ? pending.respond(route) : route.fulfill({ status: 200, json: { ok: true, matches: [] } }),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect.poll(() => fixture.matches).toBe(1);
  try {
    await reset(page).click();
    await page.clock.runFor(2_000);
    expect(fixture.matches).toBe(1);
    await confirmation(page).getByRole("button", { name: "Teruskan Mengisi" }).click();
    await page.clock.runFor(800);
    await expect.poll(() => fixture.matches).toBe(2);
    await expect(matchingStatus(page)).toHaveText(noMatch);
  } finally { pending.release(); }
  await pending.settled;
  await expect(matchingStatus(page)).toHaveText(noMatch);
  await expect(page.getByText("Obsolete Synthetic Source", { exact: true })).toHaveCount(0);
  await page.clock.runFor(2_000);
  expect(fixture.matches).toBe(2);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Automatic matching is cancelled by an explicit held Save and cannot reappear after success", async ({ page, baseURL }) => {
  const pending = heldMatch();
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft, holdSave: true, onMatch: pending.respond,
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect.poll(() => fixture.matches).toBe(1);
  try {
    await page.getByRole("button", { name: "Save Collection", exact: true }).click();
    await expect.poll(() => fixture.saves.length).toBe(1);
    await expect(matchingStatus(page)).toContainText("dijeda");
    await expect(reset(page)).toBeDisabled();
    await page.clock.runFor(5_000);
    expect(fixture.matches).toBe(1);
    expect(fixture.saves).toHaveLength(1);
  } finally { fixture.release(); pending.release(); }
  await pending.settled;
  await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
  await expect(matchingStatus(page)).toHaveText(incomplete);
  await expect(page.getByText("Obsolete Synthetic Source", { exact: true })).toHaveCount(0);
  await page.clock.runFor(2_000);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(1);
  await checkFixture(page, fixture);
});

test("Nickname selection and suspended access gate matching, then resume once", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft, role: "superuser", holdNicknameReload: true,
  });
  await page.goto("/collection/save");
  await expect(page.locator("#save-collection-superuser-nickname")).toBeEnabled();
  await pauseClock(page);
  await page.clock.runFor(2_000);
  expect(fixture.matches).toBe(0);
  await expect(page.locator("#save-collection-customer-name")).toHaveCount(0);
  await selectNickname(page);
  await fillIdentity(page);
  await page.getByRole("button", { name: "Muat Semula", exact: true }).click();
  try {
    await expect(reset(page)).toBeDisabled();
    await expect(matchingStatus(page)).toContainText("dijeda");
    await page.clock.runFor(2_000);
    expect(fixture.matches).toBe(0);
  } finally { fixture.release(); }
  await expect(reset(page)).toBeEnabled();
  await expect(matchingStatus(page)).toContainText("Menunggu input selesai");
  await page.clock.runFor(799);
  expect(fixture.matches).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(() => fixture.matches).toBe(1);
  await expect(matchingStatus(page)).toHaveText(noMatch);
  await page.clock.runFor(5_000);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Nickname changes unmount the old form and suppress its late matching response", async ({ page, baseURL }) => {
  const alternateNickname = "Other Synthetic Collector";
  const pending = heldMatch();
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft, role: "superuser", additionalNickname: alternateNickname,
    onMatch: pending.respond,
  });
  await page.goto("/collection/save");
  await selectNickname(page);
  await pauseClock(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect.poll(() => fixture.matches).toBe(1);
  try {
    await selectNickname(page, alternateNickname);
    await expect(page.locator("#save-collection-customer-name")).toHaveValue("");
  } finally { pending.release(); }
  await pending.settled;
  await page.clock.runFor(5_000);
  await expect(matchingStatus(page)).toHaveText(incomplete);
  await expect(page.getByText("Obsolete Synthetic Source", { exact: true })).toHaveCount(0);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

for (const failure of [
  { name: "no match", status: 400, code: "COLLECTION_SOURCE_NO_MATCH", message: noMatch },
  { name: "no source configured", status: 400, code: "COLLECTION_SOURCE_NOT_CONFIGURED", message: "Tiada source Saved aktif" },
  { name: "ambiguous match", status: 400, code: "COLLECTION_SOURCE_AMBIGUOUS_MATCH", message: "Lebih daripada satu source atau rekod sepadan" },
  { name: "access denied", status: 403, code: "FORBIDDEN", message: "Akses semakan padanan tidak dibenarkan" },
]) test(`Matching ${failure.name} offers no retry and does not poll`, async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft,
    onMatch: (route) => route.fulfill({ status: failure.status, json: {
      ok: false, message: "Synthetic matching failure", error: { code: failure.code, message: "Synthetic matching failure" },
    } }),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect(matchingStatus(page)).toContainText(failure.message);
  await expect(retry(page)).toHaveCount(0);
  await page.clock.runFor(10_000);
  expect(fixture.matches).toBe(1);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("Transient failure respects retry cooldown and retries only after an explicit click", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft,
    onMatch: (route, index) => index === 1
      ? route.fulfill({ status: 429, json: { ok: false, message: "Synthetic temporary limit", retryAfterMs: 2_000, error: {
        code: "RATE_LIMITED", message: "Synthetic temporary limit",
      } } })
      : matchResponse(route),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect(matchingStatus(page)).toContainText("Tunggu sebentar sebelum cuba semula");
  await expect(retry(page)).toHaveCount(0);
  await page.clock.runFor(1_999);
  await expect(retry(page)).toHaveCount(0);
  expect(fixture.matches).toBe(1);
  await page.clock.runFor(1);
  await expect(retry(page)).toBeEnabled();
  await page.clock.runFor(10_000);
  expect(fixture.matches).toBe(1);
  await retry(page).click();
  await expect.poll(() => fixture.matches).toBe(2);
  await expect(matchingStatus(page)).toHaveText(matched);
  await expect(retry(page)).toHaveCount(0);
  expect(fixture.matchRequests[1]).toEqual(fixture.matchRequests[0]);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("A stalled request times out and waits for manual retry without accepting its late response", async ({ page, baseURL }) => {
  const pending = heldMatch();
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft,
    onMatch: (route, index) => index === 1 ? pending.respond(route) : route.fulfill({ status: 200, json: { ok: true, matches: [] } }),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect.poll(() => fixture.matches).toBe(1);
  try {
    await page.clock.runFor(59_999);
    await expect(matchingStatus(page)).toContainText("Sedang menyemak");
    await page.clock.runFor(1);
    await expect(retry(page)).toBeEnabled();
    await page.clock.runFor(5_000);
    expect(fixture.matches).toBe(1);
    await retry(page).click();
    await expect.poll(() => fixture.matches).toBe(2);
    await expect(matchingStatus(page)).toHaveText(noMatch);
  } finally { pending.release(); }
  await pending.settled;
  await expect(page.getByText("Obsolete Synthetic Source", { exact: true })).toHaveCount(0);
  await expect(matchingStatus(page)).toHaveText(noMatch);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});

test("A matched preview never autosaves and backend validation remains authoritative on explicit Save", async ({ page, baseURL }) => {
  const backendMessage = "Synthetic source changed before save; backend rejected the collection.";
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft, onMatch: (route) => matchResponse(route),
    onSave: (route) => route.fulfill({ status: 400, json: {
      ok: false, message: backendMessage, error: { code: "COLLECTION_SOURCE_NO_MATCH", message: backendMessage },
    } }),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.clock.runFor(800);
  await expect(matchingStatus(page)).toHaveText(matched);
  await page.clock.runFor(10_000);
  expect(fixture.saves).toHaveLength(0);
  await page.getByRole("button", { name: "Save Collection", exact: true }).click();
  await expect.poll(() => fixture.saves.length).toBe(1);
  await expect(page.getByRole("alert").filter({ hasText: backendMessage }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Collection berjaya disimpan", exact: true })).toHaveCount(0);
  await expect(page.locator("#save-collection-customer-name")).toHaveValue("Synthetic Customer");
  expect(fixture.saves[0]!.fields).toMatchObject({
    customerName: "Synthetic Customer", amount: "125", collectionStaffNickname: nickname,
  });
  for (const key of ["sourceImportId", "matchedFields", "totalDue", "projectedCpStatus"]) {
    expect(fixture.saves[0]!.fields).not.toHaveProperty(key);
  }
  expect(fixture.saves[0]!.key).not.toBe("");
  expect(fixture.saves[0]!.fingerprint).not.toBe("");
  await page.clock.runFor(5_000);
  expect(fixture.saves).toHaveLength(1);
  expect(fixture.matches).toBe(1);
  await checkFixture(page, fixture);
});

for (const theme of ["light", "dark"] as const) for (const viewport of [
  { width: 320, height: 740 }, { width: 390, height: 844 },
  { width: 740, height: 360 }, { width: 1280, height: 900 },
]) test(`Automatic matching compact feedback and retry ${theme} ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize(viewport);
  const fixture = await installFixture(page, baseURL, {
    controlledClock: true, restore: draft, theme,
    onMatch: (route, index) => index === 2
      ? route.fulfill({ status: 503, json: { ok: false, message: "Synthetic temporary failure", code: "SYNTHETIC_UNAVAILABLE" } })
      : matchResponse(route),
  });
  await openControlled(page);
  await fillIdentity(page);
  await page.locator("#save-collection-card-number").fill("00009007199254740993");
  await page.clock.runFor(800);
  await expect(matchingStatus(page)).toHaveText(matched);
  const feedback = page.locator("#save-collection-matching-feedback");
  const actions = page.locator("#save-collection-actions");
  const save = actions.getByRole("button", { name: "Save Collection", exact: true });
  await expect(page.getByRole("heading", { name: "Saved Matching & Coverage", exact: true })).toHaveCount(0);
  await expect(page.getByText("Synthetic Saved Source", { exact: true })).toHaveCount(0);
  await expect(page.getByText("TOTAL DUE", { exact: true })).toHaveCount(0);
  await expect(feedback).not.toContainText(/00009007199254740993|0993|Synthetic Saved Source|Cumulative|Abort CP|Aging/);
  await expect(matchingStatus(page)).toHaveAttribute("role", "status");
  await expect(matchingStatus(page)).toHaveAttribute("aria-live", "polite");
  await expect(save).toHaveAttribute("aria-describedby", /save-collection-source-match-status/);
  expect(await feedback.evaluate((element) => element.nextElementSibling?.id)).toBe("save-collection-actions");
  expect(await feedback.evaluate((element) => getComputedStyle(element).position)).toBe("static");
  await feedback.scrollIntoViewIfNeeded();
  await expect(feedback).toBeInViewport();
  expect((await feedback.boundingBox())!.height).toBeLessThanOrEqual(48);
  await testInfo.attach(`matching-compact-${theme}-${viewport.width}`, {
    body: await page.screenshot({ path: testInfo.outputPath(`matching-compact-${theme}-${viewport.width}.png`), animations: "disabled" }),
    contentType: "image/png",
  });

  await page.locator("#save-collection-amount").fill("126");
  await page.clock.runFor(800);
  await expect(retry(page)).toBeEnabled();
  await feedback.scrollIntoViewIfNeeded();
  await expect(retry(page)).toBeInViewport();
  const feedbackBox = (await feedback.boundingBox())!;
  const actionBox = (await actions.boundingBox())!;
  expect(feedbackBox.height).toBeLessThan(viewport.height / 2);
  expect(feedbackBox.y + feedbackBox.height).toBeLessThanOrEqual(actionBox.y + 1);
  expect((await retry(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await retry(page).click({ trial: true });
  await testInfo.attach(`matching-retry-${theme}-${viewport.width}`, {
    body: await page.screenshot({ path: testInfo.outputPath(`matching-retry-${theme}-${viewport.width}.png`), animations: "disabled" }),
    contentType: "image/png",
  });
  await retry(page).click();
  await expect(matchingStatus(page)).toHaveText(matched);
  await expect(retry(page)).toHaveCount(0);
  expect(fixture.matches).toBe(3);
  expect(fixture.saves).toHaveLength(0);
  await checkFixture(page, fixture);
});
