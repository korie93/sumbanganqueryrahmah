import { expect, test, type Page, type Route } from "@playwright/test";

// Static production frontend, synthetic HTTP and generated receipt bytes only.
test.use({ serviceWorkers: "block" });
const now = "2026-10-10T08:00:00.000Z";
const nickname = "Guidance Synthetic Collector";
const draftKey = `save-collection-draft:${encodeURIComponent(nickname.toLowerCase())}:v2`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=", "base64");
const draft = { batch: "P25", paymentDate: "2026-10-04", amount: "125", hadPendingReceipts: false, savedAt: now };

async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: "light" | "dark"; role?: "admin" | "user" | "superuser"; restore?: typeof draft;
  holdSave?: boolean; failFirst?: boolean; holdNicknameReload?: boolean;
} = {}) {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "admin";
  const fixture = {
    unexpected: [] as string[], errors: [] as string[], matches: 0, release: () => {},
    saves: [] as Array<{ fields: Record<string, string>; files: string[]; key: string; fingerprint: string }>,
  };
  const gate = new Promise<void>((resolve) => { fixture.release = resolve; });
  let nicknameReads = 0;
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body, headers: { "Cache-Control": "no-store" } });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ theme, staff, restored, key, userRole }) => {
    localStorage.setItem("theme", theme);
    // Model an already-authenticated same-user reload, otherwise the legitimate
    // account-boundary cleanup deliberately removes pre-login draft storage.
    sessionStorage.setItem("sessionStoredAt", String(Date.now()));
    sessionStorage.setItem("sessionExpiresAt", String(Date.parse("2036-01-01T00:00:00.000Z")));
    sessionStorage.setItem("username", `guidance.${userRole}`);
    sessionStorage.setItem("role", userRole);
    sessionStorage.setItem("user", JSON.stringify({
      id: `guidance-${userRole}`, username: `guidance.${userRole}`, role: userRole,
      status: "active", mustChangePassword: false, twoFactorEnabled: false, twoFactorPendingSetup: false,
      sessionExpiresAt: "2036-01-01T00:00:00.000Z",
    }));
    sessionStorage.setItem("collection_staff_nickname", staff);
    sessionStorage.setItem("collection_staff_nickname_auth", "1");
    if (!sessionStorage.getItem("guidance-fixture-initialized")) {
      if (restored) sessionStorage.setItem(key, JSON.stringify(restored));
      sessionStorage.setItem("guidance-fixture-initialized", "1");
    }
  }, { theme: options.theme ?? "light", staff: nickname, restored: options.restore, key: draftKey, userRole: role });
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      fixture.unexpected.push(`Off-origin ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (["GET", "HEAD"].includes(request.method())) return route.continue();
      fixture.unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const endpoint = `${request.method()} ${url.pathname}`;
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route,
      { maintenance: false, message: "Fixture available", type: "soft", startTime: null, endTime: null });
    if (endpoint === "GET /api/me") return respond(route, { ok: true, sessionExpiresAt: "2036-01-01T00:00:00.000Z", user: {
      id: `guidance-${role}`, username: `guidance.${role}`, fullName: "Synthetic Collection Operator",
      email: "guidance@example.test", role, status: "active", mustChangePassword: false,
      passwordResetBySuperuser: false, isBanned: false, twoFactorEnabled: false,
      twoFactorPendingSetup: false, twoFactorConfiguredAt: null, activatedAt: now, passwordChangedAt: now, lastLoginAt: now,
    } });
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route, { role, tabs: { home: true, "collection-report": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true });
    if (role === "superuser" && endpoint === "GET /api/analytics/summary") return respond(route, {
      activeSessions: 1, backupActions24h: 0, bannedUsers: 0, collectionRecordVersionConflicts24h: 0,
      loginFailures24h: 0, loginsToday: 1, totalDataRows: 0, totalImports: 0, totalUsers: 1,
    });
    if (role === "superuser" && [
      "GET /api/analytics/login-trends", "GET /api/analytics/top-users", "GET /api/analytics/recent-login-activity",
      "GET /api/analytics/peak-hours", "GET /api/analytics/role-distribution",
    ].includes(endpoint)) return respond(route, []);
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route, { ok: true, nickname: { id: "guidance-nickname", nickname } });
    if (endpoint === "GET /api/collection/nicknames") {
      nicknameReads++;
      if (options.holdNicknameReload && nicknameReads > 1) await gate;
      return respond(route, { ok: true, nicknames: [{
        id: "guidance-nickname", nickname, isActive: true, roleScope: "both", createdBy: "guidance-admin", createdAt: now,
      }] });
    }
    if (endpoint === "POST /api/collection/source-matches") {
      fixture.matches++;
      return respond(route, { ok: true, matches: [] });
    }
    if (endpoint === "POST /api/collection") {
      const form = await new Response(new Uint8Array(request.postDataBuffer()!), {
        headers: { "content-type": request.headers()["content-type"]! },
      }).formData();
      const fields: Record<string, string> = {};
      const files: string[] = [];
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") fields[key] = value;
        else files.push(value.name);
      }
      fixture.saves.push({ fields, files, key: request.headers()["x-idempotency-key"] ?? "", fingerprint: request.headers()["x-idempotency-fingerprint"] ?? "" });
      if (options.holdSave) await gate;
      if (options.failFirst && fixture.saves.length === 1) return respond(route,
        { ok: false, code: "SYNTHETIC_UNAVAILABLE", message: "Synthetic temporary failure", requestId: "guidance-reference" }, 500);
      return respond(route, { ok: true, record: {
        id: "guidance-saved", customerName: fields.customerName, icNumber: fields.icNumber,
        customerPhone: fields.customerPhone, accountNumber: fields.accountNumber, cardNumberLast4: null,
        batch: fields.batch, paymentDate: fields.paymentDate, amount: fields.amount,
        receiptFile: null, receipts: [], receiptTotalAmount: "0.00", receiptValidationStatus: "unverified",
        receiptValidationMessage: null, receiptCount: 0, duplicateReceiptFlag: false,
        createdByLogin: "guidance.admin", collectionStaffNickname: fields.collectionStaffNickname, createdAt: now, updatedAt: now,
      } });
    }
    if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) return respond(route, { ok: true });
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected synthetic request" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  return fixture;
}

async function openSave(page: Page) {
  await page.goto("/collection/save");
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
}
async function fillIdentity(page: Page) {
  for (const [id, value] of Object.entries({
    "customer-name": "Synthetic Customer", "customer-ic-number": "000012345678",
    "customer-phone": "0123456789", "account-number": "000012340000",
  })) await page.locator(`#save-collection-${id}`).fill(value);
}
async function addReceipt(page: Page) {
  await page.locator('input[name="collectionReceiptUpload"]').setInputFiles({ name: "Synthetic receipt.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("receipt-draft-card")).toHaveCount(1);
}
function confirmation(page: Page) { return page.getByRole("alertdialog", { name: "Kosongkan borang?" }); }
function reset(page: Page) { return page.getByRole("button", { name: "Reset Form", exact: true }); }
async function readDraft(page: Page) { return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "null"), draftKey); }
async function checkFixture(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>) {
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

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
    await page.getByRole("button", { name: "Semak Auto-matching", exact: true }).click();
    const matchMessage = page.getByText("Tiada padanan Saved yang sah untuk maklumat ini.", { exact: true });
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
