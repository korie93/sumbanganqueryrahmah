import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

// Render production routes against a static build and synthetic HTTP only.
// No application server, database, dotenv, real accounts or receipt files.
test.use({ serviceWorkers: "block" });
const now = "2026-10-05T08:00:00.000Z";
const nickname = "Synthetic Collector";

function syntheticRecord(index: number, receiptCount = 0) {
  const id = `polish-record-${index + 1}`;
  return {
    id, customerName: `Synthetic Customer ${index + 1}`, icNumber: "880101105432",
    customerPhone: "0123456789", accountNumber: `SYNTHETIC-ACCOUNT-${index + 1}`,
    cardNumber: "00009007199254740993", cardNumberLast4: "0993", batch: "P10",
    paymentDate: "2026-10-04", amount: "1250.00", receiptFile: null,
    receipts: Array.from({ length: receiptCount }, (_, receiptIndex) => ({
      id: `${id}-receipt-${receiptIndex}`, collectionRecordId: id,
      storagePath: `/receipts/synthetic-${receiptIndex}.pdf`,
      originalFileName: `Synthetic receipt ${receiptIndex + 1}.pdf`, originalMimeType: "application/pdf",
      originalExtension: ".pdf", fileSize: 1024, receiptAmount: "125.00", extractedAmount: "125.00",
      extractionStatus: "suggested", extractionConfidence: 0.98,
      receiptDate: "2026-10-04", receiptReference: `SYNTHETIC-${receiptIndex}`,
      fileHash: `synthetic-hash-${receiptIndex}`, createdAt: now,
    })),
    archivedReceipts: [], receiptTotalAmount: receiptCount ? "1250.00" : "0.00",
    receiptValidationStatus: receiptCount ? "matched" : "unverified",
    receiptValidationMessage: null, receiptCount, duplicateReceiptFlag: false,
    createdByLogin: "polish.admin", collectionStaffNickname: nickname,
    createdAt: now, updatedAt: now, sourceFilename: "Synthetic source with long descriptive name.xlsx",
    totalDue: "1500.00", billingPrincipalOsp: "1000.00", cpStatus: "cp", agingBucket: "D3",
  };
}

async function installFixture(page: Page, baseURL: string | undefined, options: {
  count?: number; role?: "admin" | "manager"; theme?: "light" | "dark";
  loading?: boolean; receipts?: number;
} = {}) {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "admin";
  const records = Array.from({ length: options.count ?? 20 }, (_, index) => syntheticRecord(index, options.receipts));
  const fixture = { unexpected: [] as string[], errors: [] as string[], saves: 0, release: () => {} };
  const gate = new Promise<void>((resolve) => { fixture.release = resolve; });
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, json: body, headers: { "Cache-Control": "no-store" },
  });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ theme, staff }) => {
    localStorage.setItem("theme", theme);
    sessionStorage.setItem("collection_staff_nickname", staff);
    sessionStorage.setItem("collection_staff_nickname_auth", "1");
  }, { theme: options.theme ?? "light", staff: nickname });
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
      id: `polish-${role}`, username: `polish.${role}`, fullName: "Synthetic Collection Operator",
      email: "polish@example.test", role, status: "active", mustChangePassword: false,
      passwordResetBySuperuser: false, isBanned: false, twoFactorEnabled: false,
      twoFactorPendingSetup: false, twoFactorConfiguredAt: null, activatedAt: now,
      passwordChangedAt: now, lastLoginAt: now,
    } });
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route,
      { role, tabs: { home: true, "collection-report": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0,
      totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route,
      { ok: true, status: "ONLINE", lastActivityTime: now });
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route,
      { ok: true, nickname: { id: "polish-nickname", nickname } });
    if (endpoint === "GET /api/collection/nicknames") return respond(route, { ok: true, nicknames: [{
      id: "polish-nickname", nickname, isActive: true, roleScope: "both", createdBy: "polish-admin", createdAt: now,
    }] });
    if (endpoint === "GET /api/collection/list") {
      if (options.loading) await gate;
      const limit = Math.max(20, records.length);
      return respond(route, { ok: true, records, total: records.length, totalAmount: records.length * 1250,
        page: 1, pageSize: limit, limit, offset: 0, nextCursor: null,
        pagination: { mode: "hybrid", page: 1, pageSize: limit, limit, offset: 0,
          total: records.length, totalPages: 1, nextCursor: null, hasNextPage: false, hasPreviousPage: false },
      });
    }
    if (endpoint === "GET /api/collection/source-configs") return respond(route, { ok: true, sourceConfigs: [] });
    if (endpoint === "GET /api/collection/teams") return respond(route, { ok: true, teams: [] });
    if (endpoint === "GET /api/collection/purge-summary") return respond(route,
      { ok: true, retentionMonths: 6, cutoffDate: "2026-04-05", eligibleRecords: 0, totalAmount: 0 });
    if (endpoint === "PATCH /api/collection/polish-record-1") {
      fixture.saves++;
      expect(request.postData()).toContain("Synthetic Updated Customer");
      records[0] = { ...records[0]!, customerName: "Synthetic Updated Customer" };
      return respond(route, { ok: true, record: records[0] });
    }
    if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) {
      return respond(route, { ok: true });
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: `Unexpected synthetic request: ${endpoint}` }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  return fixture;
}

async function openRecords(page: Page) {
  await page.goto("/collection/records");
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
}

async function assertPageFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function bounds(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

for (const theme of ["light", "dark"] as const) for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 600 }]) test(`Collection polish ${theme} ${viewport.width}x${viewport.height} pins identity/actions and one vertical header`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize(viewport);
  const fixture = await installFixture(page, baseURL, { theme });
  await openRecords(page);
  const scroll = page.locator(".collection-records-table-scroll");
  await expect(scroll.locator("tbody tr")).toHaveCount(20);
  await scroll.scrollIntoViewIfNeeded();
  const customer = scroll.locator("tbody .collection-records-table-identity").first();
  const actions = scroll.locator("tbody .collection-records-table-actions").first();
  await scroll.evaluate((element) => { element.scrollLeft = 500; });
  await expect.poll(async () => (await bounds(customer)).x).toBeLessThan((await bounds(scroll)).x + 3);
  const actionBounds = await bounds(actions);
  const scrollBounds = await bounds(scroll);
  expect(Math.abs(actionBounds.x + actionBounds.width - scrollBounds.x - scrollBounds.width)).toBeLessThan(3);
  const header = scroll.getByRole("columnheader", { name: "Customer Name", exact: true });
  const headerTop = (await bounds(header)).y;
  await scroll.evaluate((element) => { element.scrollTop = 220; });
  await expect.poll(async () => Math.abs((await bounds(header)).y - headerTop)).toBeLessThan(2);
  expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await scroll.evaluate((element) => [...element.querySelectorAll("div")].filter((child) => {
    const style = getComputedStyle(child);
    return /auto|scroll/.test(style.overflowY) && child.scrollHeight > child.clientHeight;
  }).length)).toBe(0);
  await assertPageFits(page);
  await testInfo.attach(`records-${theme}-${viewport.width}x${viewport.height}-scrolled`, { body: await page.screenshot(), contentType: "image/png" });
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const state of ["single", "empty", "loading"] as const) test(`Collection polish ${state} records avoid a fixed empty table height`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const fixture = await installFixture(page, baseURL, { count: state === "empty" ? 0 : 1, loading: state === "loading" });
  try {
    await openRecords(page);
    const scroll = page.locator(".collection-records-table-scroll");
    if (state === "single") {
      await expect(scroll).toBeVisible();
      await expect(scroll.getByText("Synthetic Customer 1", { exact: true })).toBeVisible();
      expect((await bounds(scroll)).height).toBeLessThan(300);
      expect(await scroll.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    } else {
      const status = page.getByRole("status").filter({ hasText: state === "loading"
        ? "Loading records..." : "No collection records found." });
      await expect(status).toBeVisible();
      expect((await bounds(status)).height).toBeLessThan(160);
      await expect(scroll).toHaveCount(0);
    }
    await assertPageFits(page);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  } finally { fixture.release(); }
});

test("Collection polish manager keeps read-only actions unchanged", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { role: "manager", count: 1 });
  await openRecords(page);
  await expect(page.getByText("Synthetic Customer 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for record/ })).toHaveCount(0);
  await expect(page.locator(".collection-records-table-actions")).toHaveCount(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const width of [320, 390]) test(`Collection polish mobile records preserve fields at ${width}px`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await installFixture(page, baseURL, { count: 1 });
  await openRecords(page);
  await expect(page.getByRole("button", { name: "Actions for record 1" })).toBeVisible();
  await page.getByText("Record details", { exact: true }).click();
  await expect(page.getByText("00009007199254740993", { exact: true })).toBeVisible();
  await assertPageFits(page);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const viewport of [{ width: 1366, height: 600 }, { width: 390, height: 844 }, { width: 740, height: 360 }]) {
  test(`Collection polish Edit footer stays reachable at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize(viewport);
    const fixture = await installFixture(page, baseURL, { count: 1, receipts: 10 });
    await openRecords(page);
    const launcher = page.getByRole("button", { name: "Actions for record 1" });
    await launcher.click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Collection Record" });
    await expect(dialog).toBeVisible();
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    await expect(save).toBeInViewport();
    await expect(cancel).toBeInViewport();
    const body = dialog.locator(".overflow-y-auto");
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    const footerTop = (await bounds(save)).y;
    // Pending cards are shared with Save Collection; check them in the narrower
    // edit body too, without sending receipt bytes to any backend.
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 100; canvas.height = 300;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#dbeafe"; context.fillRect(0, 0, 100, 300);
      return canvas.toDataURL("image/png").split(",")[1]!;
    });
    const upload = dialog.locator('input[name="collectionReceiptUpload"]');
    await upload.setInputFiles({ name: "Synthetic edit receipt.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    const pending = dialog.getByTestId("receipt-draft-card");
    await expect(pending).toHaveCount(1);
    await pending.getByLabel("Reference / no. transaksi", { exact: true }).fill("SYNTHETIC-EDIT-PREVIEW");
    await pending.getByRole("button", { name: "Lihat besar resit 1", exact: true }).click();
    await expect(pending.getByRole("button", { name: "Kecilkan resit 1", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(pending.getByLabel("Reference / no. transaksi", { exact: true })).toHaveValue("SYNTHETIC-EDIT-PREVIEW");
    expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(Math.abs((await bounds(save)).y - footerTop)).toBeLessThan(2);
    const dialogBounds = await bounds(dialog);
    expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
    expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await assertPageFits(page);
    await testInfo.attach(`edit-${viewport.width}x${viewport.height}`, { body: await page.screenshot(), contentType: "image/png" });
    await cancel.click();
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
    expect(fixture.saves).toBe(0);
    await launcher.click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await dialog.getByLabel("Customer Name", { exact: true }).fill("Synthetic Updated Customer");
    await save.click();
    await expect.poll(() => fixture.saves).toBe(1);
    await expect(dialog).toHaveCount(0);
    // Saving refreshes the table and removes the original launcher. The existing
    // overlay-focus contract restores the stable page/filter fallback instead.
    await expect(viewport.width < 768
      ? page.getByRole("button", { name: /Search & Filters/ })
      : page.getByTestId("collection-records-page")).toBeFocused();
    await expect(page.getByText("Synthetic Updated Customer", { exact: true })).toBeVisible();
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}
