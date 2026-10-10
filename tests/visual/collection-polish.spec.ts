import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

// Render production routes against a static build and synthetic HTTP only.
// No application server, database, dotenv, real accounts or receipt files.
test.use({ serviceWorkers: "block" });
const now = "2026-10-05T08:00:00.000Z";
const nickname = "Synthetic Collector";
// A tiny generated fixture image; receipt tests never read receipt files.
const receiptPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=", "base64");

function syntheticRecord(index: number, receiptCount = 0) {
  const id = `polish-record-${index + 1}`;
  return {
    id, customerName: `Synthetic Customer ${index + 1}`, icNumber: "880101105432",
    customerPhone: "0123456789", accountNumber: `SYNTHETIC-ACCOUNT-${index + 1}`,
    cardNumber: "00009007199254740993", cardNumberLast4: "0993" as string | null, batch: "P10",
    paymentDate: "2026-10-04", amount: "1250.00", receiptFile: null,
    receipts: Array.from({ length: receiptCount }, (_, receiptIndex) => ({
      id: `${id}-receipt-${receiptIndex}`, collectionRecordId: id,
      storagePath: `/receipts/synthetic-${receiptIndex}.png`,
      originalFileName: `Synthetic receipt ${receiptIndex + 1}.png`, originalMimeType: "image/png",
      originalExtension: ".png", fileSize: receiptPng.length, receiptAmount: "125.00", extractedAmount: "125.00",
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
  loading?: boolean; receipts?: number; paginate?: boolean; receiptFileName?: string;
  holdSave?: boolean; saveOutcome?: "failure" | "conflict";
  recordOverrides?: Partial<ReturnType<typeof syntheticRecord>>;
} = {}) {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "admin";
  const records = Array.from({ length: options.count ?? 20 }, (_, index) => ({
    ...syntheticRecord(index, options.receipts), ...options.recordOverrides,
  }));
  if (options.receiptFileName) for (const record of records) for (const receipt of record.receipts) {
    receipt.originalFileName = options.receiptFileName;
  }
  const fixture = {
    unexpected: [] as string[], errors: [] as string[], receiptViews: [] as string[], saves: 0,
    release: () => {}, releaseSave: () => {},
    mutations: [] as Array<{
      fields: Record<string, string[]>;
      files: Array<{ field: string; name: string; type: string; size: number }>;
      idempotencyKey: string;
      idempotencyFingerprint: string;
    }>,
  };
  const gate = new Promise<void>((resolve) => { fixture.release = resolve; });
  const saveGate = new Promise<void>((resolve) => { fixture.releaseSave = resolve; });
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
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const matching = records.filter((record) => record.customerName.toLowerCase().includes(search));
      const paginated = options.paginate || url.searchParams.has("page");
      const limit = paginated
        ? Number(url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? "50")
        : Math.max(20, records.length);
      const requestedPage = Number(url.searchParams.get("page") ?? "1");
      const cursor = url.searchParams.get("cursor");
      if (paginated && (![10, 25, 50, 100, 200].includes(limit)
        || !Number.isInteger(requestedPage) || requestedPage < 1
        || (cursor && !/^polish-offset-\d+$/.test(cursor)))) {
        fixture.unexpected.push(`Invalid synthetic pagination: ${url.search}`);
        return respond(route, { ok: false, message: "Invalid synthetic pagination" }, 400);
      }
      const offset = paginated
        ? cursor ? Number(cursor.slice("polish-offset-".length)) : (requestedPage - 1) * limit
        : 0;
      const pageRecords = matching.slice(offset, offset + limit);
      const pageNumber = Math.floor(offset / limit) + 1;
      const nextCursor = paginated && offset + limit < matching.length ? `polish-offset-${offset + limit}` : null;
      return respond(route, { ok: true, records: pageRecords, total: matching.length, totalAmount: matching.length * 1250,
        page: pageNumber, pageSize: limit, limit, offset, nextCursor,
        pagination: { mode: "hybrid", page: pageNumber, pageSize: limit, limit, offset,
          total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / limit)),
          nextCursor, hasNextPage: nextCursor !== null, hasPreviousPage: offset > 0 },
      });
    }
    // Only exact record/receipt pairs created above may load fixture bytes.
    for (const record of records) for (const receipt of record.receipts) {
      if (endpoint === `GET /api/collection/${record.id}/receipts/${receipt.id}/view`) {
        fixture.receiptViews.push(record.id);
        return route.fulfill({ status: 200, body: receiptPng, contentType: "image/png", headers: {
          "Cache-Control": "no-store", "Content-Disposition": `inline; filename="${receipt.originalFileName}"`,
        } });
      }
    }
    if (endpoint === "GET /api/collection/source-configs") return respond(route, { ok: true, sourceConfigs: [] });
    if (endpoint === "GET /api/collection/teams") return respond(route, { ok: true, teams: [] });
    if (endpoint === "GET /api/collection/purge-summary") return respond(route,
      { ok: true, retentionMonths: 6, cutoffDate: "2026-04-05", eligibleRecords: 0, totalAmount: 0 });
    if (endpoint === "PATCH /api/collection/polish-record-1") {
      const form = await new Response(new Uint8Array(request.postDataBuffer()!), {
        headers: { "content-type": request.headers()["content-type"]! },
      }).formData();
      const fields: Record<string, string[]> = {};
      const files: typeof fixture.mutations[number]["files"] = [];
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") (fields[key] ??= []).push(value);
        else files.push({ field: key, name: value.name, type: value.type, size: value.size });
      }
      const idempotencyKey = request.headers()["x-idempotency-key"] ?? "";
      const idempotencyFingerprint = request.headers()["x-idempotency-fingerprint"] ?? "";
      expect(fields.expectedUpdatedAt).toEqual([now]);
      expect(idempotencyKey).not.toBe("");
      expect(idempotencyFingerprint).not.toBe("");
      fixture.mutations.push({ fields, files, idempotencyKey, idempotencyFingerprint });
      fixture.saves++;
      if (options.holdSave) await saveGate;
      if (options.saveOutcome === "failure") return respond(route, {
        ok: false, code: "SYNTHETIC_VALIDATION_ERROR", message: "Synthetic save rejected; draft remains available.",
      }, 422);
      if (options.saveOutcome === "conflict") return respond(route, {
        ok: false, code: "COLLECTION_RECORD_VERSION_CONFLICT", message: "Synthetic record changed elsewhere.",
      }, 409);
      records[0] = { ...records[0]!, customerName: fields.customerName![0]! };
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

async function openFirstEdit(page: Page) {
  await page.getByRole("button", { name: "Actions for record 1", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Collection Record", exact: true });
  await expect(dialog.getByRole("textbox", { name: "Customer Name", exact: true })).toBeFocused();
  await expect(dialog).toHaveCSS("pointer-events", "auto");
  return dialog;
}

async function expectNoEditChanges(dialog: Locator) {
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAccessibleDescription("Tiada perubahan untuk disimpan.");
  await expect(dialog.getByText("Tiada perubahan untuk disimpan.", { exact: true })).toBeVisible();
  await expect(dialog.getByTestId("edit-collection-change-summary")).toHaveCount(0);
}

async function expectEditFieldError(dialog: Locator, field: Locator, message: string) {
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(message);
  const error = dialog.getByText(message, { exact: true });
  await expect(error).toBeVisible();
  await expect(field).toHaveCSS("border-top-color", await error.evaluate((element) => getComputedStyle(element).color));
}

async function expectEditFieldCorrected(field: Locator) {
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await expect(field).not.toHaveAttribute("aria-describedby", /-error(?:\s|$)/);
}

async function expectUnsavedConfirmation(page: Page) {
  const confirmation = page.getByRole("alertdialog", { name: "Perubahan belum disimpan", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveAccessibleDescription("Perubahan pada rekod dan resit belum disimpan. Buang perubahan ini?");
  await expect(confirmation.getByRole("button", { name: "Teruskan Edit", exact: true })).toBeFocused();
  return confirmation;
}

async function discardPendingEdit(page: Page) {
  const confirmation = await expectUnsavedConfirmation(page);
  await confirmation.getByRole("button", { name: "Buang Perubahan", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Edit Collection Record", exact: true })).toHaveCount(0);
  await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
}

async function assertPageFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function bounds(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

async function recordScrollPositions(page: Page) {
  return page.getByTestId("collection-records-page").evaluate((element) => {
    const positions = [{ target: "window", left: window.scrollX, top: window.scrollY }];
    let ancestor: Element | null = element;
    while (ancestor) {
      positions.push({ target: `${ancestor.tagName}#${ancestor.id}`, left: ancestor.scrollLeft, top: ancestor.scrollTop });
      ancestor = ancestor.parentElement;
    }
    const table = element.querySelector(".collection-records-table-scroll");
    if (table) positions.push({ target: "records-table", left: table.scrollLeft, top: table.scrollTop });
    return positions;
  });
}

async function expectReceiptImage(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Receipt Preview", exact: true });
  await expect(dialog).toBeVisible();
  const image = dialog.getByRole("img", { name: "Synthetic receipt 1.png", exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return dialog;
}

async function expectLastOpened(page: Page, record: Locator) {
  await expect(page.locator('[data-last-viewed="true"]')).toHaveCount(1);
  await expect(record).toHaveAttribute("data-last-viewed", "true");
  await expect(record.getByText("Last opened record", { exact: true })).toHaveCount(1);
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
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    const exportScope = page.getByTestId("collection-records-export-scope");
    const exportReason = page.getByTestId("collection-records-export-disabled-reason");
    await expect(exportScope).toBeVisible();
    await expect(exportScope).toContainText(/all pages/i);
    await expect(exportScope).toContainText(/filters last applied/i);
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
    if (state === "loading") {
      await expect(exportButton).toBeDisabled();
      await expect(exportReason).toBeVisible();
      await expect(exportReason).toContainText(/loading/i);
      await expect(exportButton).toHaveAccessibleDescription(/all pages[\s\S]*loading/i);
    } else {
      // An empty result keeps the existing export gate; the action explains an
      // empty export when invoked, so the new helper must not disable it.
      await expect(exportButton).toBeEnabled();
      await expect(exportReason).toHaveCount(0);
      await expect(exportButton).toHaveAccessibleDescription(/all pages/i);
    }
    await assertPageFits(page);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  } finally { fixture.release(); }
});

for (const width of [1366, 390]) test(`Collection polish manager receipt return keeps read-only actions unchanged at ${width}px`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await installFixture(page, baseURL, { role: "manager", count: 1, receipts: 1 });
  await openRecords(page);
  await expect(page.getByText("Synthetic Customer 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for record/ })).toHaveCount(0);
  await expect(page.locator(".collection-records-table-actions")).toHaveCount(0);
  const row = page.getByTestId("collection-records-page").locator(width < 768 ? "article" : "tbody tr").first();
  const launcher = row.getByRole("button", { name: width < 768 ? "View Receipt" : "View", exact: true });
  await launcher.scrollIntoViewIfNeeded();
  await launcher.focus();
  const before = await recordScrollPositions(page);
  await page.keyboard.press("Enter");
  const preview = await expectReceiptImage(page);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await expectLastOpened(page, row);
  await expect.poll(() => recordScrollPositions(page)).toEqual(before);
  await expect(page.getByRole("button", { name: /^Actions for record/ })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toHaveCount(0);
  expect(fixture.receiptViews).toEqual(["polish-record-1"]);
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) test(`Collection return ${theme} desktop remembers one record without moving table or page`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 600 });
  const fixture = await installFixture(page, baseURL, { theme, receipts: 1 });
  await openRecords(page);
  const table = page.locator(".collection-records-table-scroll");
  await expect(table.locator("tbody tr")).toHaveCount(20);
  await table.scrollIntoViewIfNeeded();
  await table.evaluate((element) => { element.scrollTop = 220; element.scrollLeft = element.scrollWidth; });
  const recordA = table.locator("tbody tr").nth(8);
  const recordB = table.locator("tbody tr").nth(9);
  const receiptA = recordA.getByRole("button", { name: "View", exact: true });
  await receiptA.scrollIntoViewIfNeeded();
  await receiptA.focus();
  const beforeReceipt = await recordScrollPositions(page);
  expect(beforeReceipt.find((position) => position.target === "records-table")!.left).toBeGreaterThan(0);
  expect(beforeReceipt.find((position) => position.target === "records-table")!.top).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  const preview = await expectReceiptImage(page);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(receiptA).toBeFocused();
  await expectLastOpened(page, recordA);
  await expect.poll(() => recordScrollPositions(page)).toEqual(beforeReceipt);

  const actionsB = recordB.getByRole("button", { name: "Actions for record 10", exact: true });
  await actionsB.scrollIntoViewIfNeeded();
  await actionsB.focus();
  const beforeEdit = await recordScrollPositions(page);
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Collection Record", exact: true });
  await expect(edit).toBeVisible();
  await expectLastOpened(page, recordB);
  await expect(recordA).not.toHaveAttribute("data-last-viewed", "true");

  // Opening a receipt inside Edit must return to that dialog before returning
  // to the row, with neither scroll container being repositioned by focus.
  const nestedReceipt = edit.getByRole("button", { name: "View", exact: true });
  await nestedReceipt.scrollIntoViewIfNeeded();
  const editBody = edit.locator(".overflow-y-auto");
  const editScrollTop = await editBody.evaluate((element) => element.scrollTop);
  await nestedReceipt.click();
  await expectReceiptImage(page);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(nestedReceipt).toBeFocused();
  await expect(edit).toBeVisible();
  await expect.poll(() => editBody.evaluate((element) => element.scrollTop)).toBe(editScrollTop);
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(actionsB).toBeFocused();
  await expectLastOpened(page, recordB);
  await expect.poll(() => recordScrollPositions(page)).toEqual(beforeEdit);
  await testInfo.attach(`records-last-opened-${theme}-desktop`, { body: await page.screenshot(), contentType: "image/png" });
  expect(fixture.receiptViews).toEqual(["polish-record-9", "polish-record-10"]);
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) test(`Collection return ${theme} mobile keeps details and overlays at the opened record`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL, { theme, count: 12, receipts: 1 });
  await openRecords(page);
  const cards = page.getByTestId("collection-records-page").locator("article");
  await expect(cards).toHaveCount(12);
  const recordA = cards.nth(6);
  const recordB = cards.nth(7);
  for (const card of [recordA, recordB]) {
    const details = card.locator("details");
    const summary = details.locator("summary");
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    const beforeDetails = await recordScrollPositions(page);
    expect(beforeDetails.some((position) => position.top > 0)).toBe(true);
    const summaryTop = (await bounds(summary)).y;
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expectLastOpened(page, card);
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
    await expect(summary).toBeInViewport();
    await expectLastOpened(page, card);
    await expect.poll(() => recordScrollPositions(page)).toEqual(beforeDetails);
    expect(Math.abs((await bounds(summary)).y - summaryTop)).toBeLessThan(2);
  }
  await expect(recordA).not.toHaveAttribute("data-last-viewed", "true");

  const receiptB = recordB.getByRole("button", { name: "View Receipt", exact: true });
  await receiptB.scrollIntoViewIfNeeded();
  await receiptB.focus();
  const beforeReceipt = await recordScrollPositions(page);
  await page.keyboard.press("Enter");
  const preview = await expectReceiptImage(page);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(receiptB).toBeFocused();
  await expectLastOpened(page, recordB);
  await expect.poll(() => recordScrollPositions(page)).toEqual(beforeReceipt);

  const actionsB = recordB.getByRole("button", { name: "Actions for record 8", exact: true });
  await actionsB.focus();
  const beforeEdit = await recordScrollPositions(page);
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Collection Record", exact: true });
  await expect(edit).toBeVisible();
  await expect(edit.getByRole("textbox", { name: "Customer Name", exact: true })).toBeFocused();
  await expect(edit).toHaveCSS("pointer-events", "auto");
  await page.keyboard.press("Escape");
  await expect(edit).toHaveCount(0);
  await expect(actionsB).toBeFocused();
  await expectLastOpened(page, recordB);
  await expect.poll(() => recordScrollPositions(page)).toEqual(beforeEdit);
  await testInfo.attach(`records-last-opened-${theme}-mobile`, { body: await page.screenshot(), contentType: "image/png" });
  expect(fixture.receiptViews).toEqual(["polish-record-8"]);
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Collection return clears the previous marker when filters or pagination change", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const fixture = await installFixture(page, baseURL, { count: 60, paginate: true });
  await openRecords(page);
  const table = page.locator(".collection-records-table-scroll");
  await expect(table.locator("tbody tr")).toHaveCount(50);
  const markFirstRecord = async () => {
    const row = table.locator("tbody tr").first();
    await row.getByRole("button", { name: "Actions for record 1", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit Collection Record", exact: true });
    await expect(edit).toBeVisible();
    // Visibility can precede the outgoing action menu's dismissable-layer
    // cleanup. Wait for the dialog to own focus and accept input before Escape.
    await expect(edit.getByRole("textbox", { name: "Customer Name", exact: true })).toBeFocused();
    await expect(edit).toHaveCSS("pointer-events", "auto");
    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);
    await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
    await expectLastOpened(page, row);
  };
  await markFirstRecord();
  await page.getByLabel("Search", { exact: true }).fill("Synthetic");
  await expect(page.locator('[data-last-viewed="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(50);
  await expect(table.getByText("Synthetic Customer 1", { exact: true })).toBeVisible();
  await markFirstRecord();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.getByText("Synthetic Customer 51", { exact: true })).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(page.locator('[data-last-viewed="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Prev", exact: true }).click();
  await expect(table.getByText("Synthetic Customer 1", { exact: true })).toBeVisible();
  await expect(page.locator('[data-last-viewed="true"]')).toHaveCount(0);
  await markFirstRecord();
  await page.getByLabel("Records per page", { exact: true }).selectOption("100");
  await expect(table.locator("tbody tr")).toHaveCount(60);
  await expect(page.locator('[data-last-viewed="true"]')).toHaveCount(0);
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const width of [1366, 390]) test(`Collection return keyboard menu and cancelled dialogs release page interaction at ${width}px`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await installFixture(page, baseURL, { count: 1 });
  await openRecords(page);
  const row = page.getByTestId("collection-records-page").locator(width < 768 ? "article" : "tbody tr").first();
  // Include the background launcher in the locator while a modal hides it
  // from the accessibility tree, so its inherited pointer lock can be checked.
  const launcher = row.getByRole("button", { name: "Actions for record 1", exact: true, includeHidden: true });
  const body = page.locator("body");
  const editItem = page.getByRole("menuitem", { name: "Edit", exact: true });
  await launcher.scrollIntoViewIfNeeded();
  await launcher.focus();
  await page.keyboard.press("ArrowDown");
  await expect(editItem).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await expect(body).toHaveCSS("pointer-events", "auto");

  await page.keyboard.press("ArrowDown");
  await expect(editItem).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const remove = page.getByRole("alertdialog", { name: "Padam Rekod", exact: true });
  await expect(remove.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
  await expect(remove).toHaveCSS("pointer-events", "auto");
  await expect(body).toHaveCSS("pointer-events", "none");
  await expect(launcher).toHaveCSS("pointer-events", "none");
  await page.keyboard.press("Enter");
  await expect(remove).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await expect(body).toHaveCSS("pointer-events", "auto");
  await expect(page.locator('[data-last-viewed="true"]')).toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  await expect(editItem).toBeFocused();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("dialog", { name: "Edit Collection Record", exact: true });
  await expect(edit.getByRole("textbox", { name: "Customer Name", exact: true })).toBeFocused();
  await expect(edit).toHaveCSS("pointer-events", "auto");
  await expect(body).toHaveCSS("pointer-events", "none");
  await expect(launcher).toHaveCSS("pointer-events", "none");
  await page.keyboard.press("Escape");
  await expect(edit).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await expect(body).toHaveCSS("pointer-events", "auto");
  await expectLastOpened(page, row);

  // A normal pointer action after both handoffs catches a lingering page lock.
  await page.getByRole("button", { name: "View All", exact: true }).click();
  const viewAll = page.getByRole("dialog", { name: "Senarai Penuh Rekod Collection", exact: true });
  await expect(viewAll.getByText("Synthetic Customer 1", { exact: true })).toBeVisible();
  await viewAll.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(viewAll).toHaveCount(0);
  await expect(body).toHaveCSS("pointer-events", "auto");
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Collection return restores a nested View All receipt to its own record", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const fixture = await installFixture(page, baseURL, { count: 2, receipts: 1 });
  await openRecords(page);
  const table = page.locator(".collection-records-table-scroll");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  const recordA = table.locator("tbody tr").nth(0);
  const recordB = table.locator("tbody tr").nth(1);
  await recordA.getByRole("button", { name: "View", exact: true }).click();
  const preview = await expectReceiptImage(page);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expectLastOpened(page, recordA);

  const viewAllLauncher = page.getByRole("button", { name: "View All", exact: true });
  await viewAllLauncher.scrollIntoViewIfNeeded();
  await viewAllLauncher.focus();
  const beforeViewAll = await recordScrollPositions(page);
  await viewAllLauncher.click();
  const viewAll = page.getByRole("dialog", { name: "Senarai Penuh Rekod Collection", exact: true });
  await expect(viewAll.locator("tbody tr")).toHaveCount(2);
  const nestedReceipt = viewAll.locator("tbody tr").nth(1).getByRole("button", { name: "View", exact: true });
  await nestedReceipt.scrollIntoViewIfNeeded();
  const viewAllScroll = () => viewAll.locator(".overflow-auto").evaluateAll((elements) => elements.map((element) => ({
    left: element.scrollLeft, top: element.scrollTop,
  })));
  const beforeNestedReceipt = await viewAllScroll();
  await nestedReceipt.click();
  await expectReceiptImage(page);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(viewAll).toBeVisible();
  await expect(nestedReceipt).toBeFocused();
  await expect.poll(viewAllScroll).toEqual(beforeNestedReceipt);
  await expectLastOpened(page, recordB);
  await expect(recordA).not.toHaveAttribute("data-last-viewed", "true");
  await viewAll.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(viewAll).toHaveCount(0);
  await expectLastOpened(page, recordB);
  await expect.poll(() => recordScrollPositions(page)).toEqual(beforeViewAll);
  expect(fixture.receiptViews).toEqual(["polish-record-1", "polish-record-2"]);
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const width of [320, 390]) test(`Collection polish mobile records preserve fields at ${width}px`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await installFixture(page, baseURL, { count: 1 });
  await openRecords(page);
  await expect(page.getByRole("button", { name: "Actions for record 1" })).toBeVisible();
  const exportScope = page.getByTestId("collection-records-export-scope");
  await expect(exportScope).toBeVisible();
  await expect(exportScope).toContainText(/all pages/i);
  expect(await exportScope.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await testInfo.attach(`records-export-context-${width}`, {
    body: await page.getByRole("group", { name: "Record Actions", exact: true }).screenshot(), contentType: "image/png",
  });
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
    await expectNoEditChanges(dialog);
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
    await expect(save).toBeEnabled();
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
    await discardPendingEdit(page);
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
    expect(fixture.saves).toBe(0);
    await launcher.click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await dialog.getByLabel("Customer Name", { exact: true }).fill("Synthetic Updated Customer");
    await expect(save).toBeEnabled();
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

for (const theme of ["light", "dark"] as const) for (const width of [1366, 390]) {
  test(`Collection inline validation ${theme} ${width}px shows field errors only after Save and focuses each correction`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1, theme });
    await openRecords(page);
    const dialog = await openFirstEdit(page);
    const name = dialog.getByLabel("Customer Name", { exact: true });
    const ic = dialog.getByLabel("IC Number", { exact: true });
    const phone = dialog.getByLabel("Customer Phone Number", { exact: true });
    const amount = dialog.getByLabel("Amount (RM)", { exact: true });
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    const body = dialog.locator("#edit-collection-fields");
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await name.fill("");
    await ic.fill("");
    await phone.fill("12");
    await amount.fill("0");
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(dialog.getByText("Customer Name is required.", { exact: true })).toHaveCount(0);
    await save.click();
    await expectEditFieldError(dialog, name, "Customer Name is required.");
    await expectEditFieldError(dialog, ic, "IC Number is required.");
    await expectEditFieldError(dialog, phone, "Customer Phone Number is invalid.");
    await expectEditFieldError(dialog, amount, "Amount must be greater than 0.");
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(4);
    await expect(name).toBeFocused();
    await expect(name).toBeInViewport();
    await expect(page.getByText("Validation Error", { exact: true })).toHaveCount(0);
    expect(fixture.mutations).toEqual([]);
    await assertPageFits(page);
    await testInfo.attach(`inline-errors-${theme}-${width}`, { body: await page.screenshot(), contentType: "image/png" });

    await name.fill("Synthetic corrected customer");
    await expectEditFieldCorrected(name);
    await expect(name).toBeFocused();
    await expect(ic).not.toBeFocused();
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await save.click();
    await expect(ic).toBeFocused();
    await expect(ic).toBeInViewport();
    await ic.fill("880101105432");
    await expectEditFieldCorrected(ic);
    await expect(ic).toBeFocused();
    await expect(phone).not.toBeFocused();
    await save.click();
    await expect(phone).toBeFocused();
    await expect(phone).toBeInViewport();
    // Repeating the exact same invalid Save still refocuses the first error.
    await amount.focus();
    await save.click();
    await expect(phone).toBeFocused();
    await phone.fill("0123456789");
    await expectEditFieldCorrected(phone);
    await expect(phone).toBeFocused();
    await save.click();
    await expect(amount).toBeFocused();
    await expect(amount).toBeInViewport();
    await expect(save).toBeInViewport();
    await testInfo.attach(`inline-amount-error-${theme}-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    expect(fixture.mutations).toEqual([]);
    await amount.fill("1251.25");
    await expectEditFieldCorrected(amount);
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.saves).toBe(1);
    const mutation = fixture.mutations[0]!;
    expect(mutation.fields.customerName).toEqual(["Synthetic corrected customer"]);
    expect(mutation.fields.amount).toEqual(["1251.25"]);
    expect(mutation.fields.expectedUpdatedAt).toEqual([now]);
    expect(mutation.idempotencyKey).not.toBe("");
    expect(mutation.idempotencyFingerprint).not.toBe("");
    const metadata = JSON.parse(mutation.fields.existingReceiptMetadata![0]!);
    expect(metadata[0].receiptId).toBe("polish-record-1-receipt-0");
    expect(metadata[0].receiptReference).toBe("SYNTHETIC-0");
    expect(mutation.files).toEqual([]);
    const reopened = await openFirstEdit(page);
    await expect(reopened.locator('[aria-invalid="true"]')).toHaveCount(0);
    await reopened.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const width of [1366, 390]) test(`Collection inline validation ${width}px continues errors and receipt drafts but clears them after discard`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1 });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const name = dialog.getByLabel("Customer Name", { exact: true });
  const reference = dialog.getByLabel("Existing receipt reference for Synthetic receipt 1.png", { exact: true });
  await name.fill("");
  await reference.fill("SYNTHETIC-UNSAVED-REFERENCE");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expectEditFieldError(dialog, name, "Customer Name is required.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const confirmation = await expectUnsavedConfirmation(page);
  await confirmation.getByRole("button", { name: "Teruskan Edit", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(name).toHaveValue("");
  await expectEditFieldError(dialog, name, "Customer Name is required.");
  await expect(reference).toHaveValue("SYNTHETIC-UNSAVED-REFERENCE");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(name).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await discardPendingEdit(page);
  const reopened = await openFirstEdit(page);
  await expect(reopened.locator('[aria-invalid="true"]')).toHaveCount(0);
  await expect(name).toHaveValue("Synthetic Customer 1");
  await expect(reference).toHaveValue("SYNTHETIC-0");
  await expectNoEditChanges(reopened);
  await name.fill("");
  await expect(reopened.locator('[aria-invalid="true"]')).toHaveCount(0);
  await name.fill("Synthetic Customer 1");
  await reopened.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(fixture.mutations).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Collection inline validation preserves required phone and matched-card account exception", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { count: 1 });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const phone = dialog.getByLabel("Customer Phone Number", { exact: true });
  const account = dialog.getByLabel("Account Number", { exact: true });
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await phone.fill("");
  await account.fill("");
  await save.click();
  await expectEditFieldError(dialog, phone, "Customer Phone Number is invalid.");
  await expect(phone).toBeFocused();
  await expectEditFieldCorrected(account);
  await expect(dialog.getByText("Account Number or a previously matched Card Number is required.", { exact: true })).toHaveCount(0);
  expect(fixture.mutations).toEqual([]);
  await phone.fill("0123456789");
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.saves).toBe(1);
  expect(fixture.mutations[0]!.fields.accountNumber).toEqual([""]);
  expect(fixture.mutations[0]!.fields.customerPhone).toEqual(["0123456789"]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Collection inline validation requires an account when no matched card exists", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { count: 1, recordOverrides: { cardNumber: "", cardNumberLast4: null } });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const account = dialog.getByLabel("Account Number", { exact: true });
  await account.fill("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expectEditFieldError(dialog, account, "Account Number or a previously matched Card Number is required.");
  await expect(account).toBeFocused();
  expect(fixture.mutations).toEqual([]);
  await account.fill("SYNTHETIC-CORRECTED-ACCOUNT");
  await expectEditFieldCorrected(account);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.saves).toBe(1);
  expect(fixture.mutations[0]!.fields.accountNumber).toEqual(["SYNTHETIC-CORRECTED-ACCOUNT"]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Collection inline validation focuses a future date without opening its calendar and preserves batch selection", async ({ page, baseURL }) => {
  // Invalid batches are rejected by the response contract before rendering;
  // unit tests cover that defensive validator branch. Keep HTTP fixtures valid.
  const fixture = await installFixture(page, baseURL, { count: 1, recordOverrides: { paymentDate: "2026-10-06" } });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const batch = dialog.getByRole("combobox", { name: "Batch", exact: true });
  const date = dialog.getByTestId("edit-collection-payment-date");
  await dialog.getByLabel("Customer Name", { exact: true }).fill("Synthetic corrected legacy record");
  await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await batch.click();
  await page.getByRole("option", { name: "P25", exact: true }).click();
  await expectEditFieldCorrected(batch);
  await expect(batch).toBeFocused();
  await save.click();
  await expectEditFieldError(dialog, date, "Payment Date cannot be in the future.");
  await expect(date).toBeFocused();
  await expect(date).toBeInViewport();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("grid")).toHaveCount(0);
  expect(fixture.mutations).toEqual([]);
  await date.click();
  await page.getByRole("grid", { name: "October 2026", exact: true }).getByRole("gridcell", { name: "4", exact: true }).click();
  await expectEditFieldCorrected(date);
  await expect(date).toBeFocused();
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.saves).toBe(1);
  expect(fixture.mutations[0]!.fields.batch).toEqual(["P25"]);
  expect(fixture.mutations[0]!.fields.paymentDate).toEqual(["2026-10-04"]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const { theme, viewport } of [
  { theme: "light" as const, viewport: { width: 320, height: 844 } },
  { theme: "dark" as const, viewport: { width: 740, height: 360 } },
]) test(`Collection inline validation ${theme} messages and footer fit ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize(viewport);
  const fixture = await installFixture(page, baseURL, { count: 1, theme, recordOverrides: { cardNumber: "", cardNumberLast4: null } });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const account = dialog.getByLabel("Account Number", { exact: true });
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await account.fill("");
  await save.click();
  await expectEditFieldError(dialog, account, "Account Number or a previously matched Card Number is required.");
  await expect(account).toBeFocused();
  await expect(account).toBeInViewport();
  const error = dialog.getByText("Account Number or a previously matched Card Number is required.", { exact: true });
  await expect(error).toBeInViewport();
  const body = dialog.locator("#edit-collection-fields");
  expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await error.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(save).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
  const rect = await bounds(dialog);
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
  await assertPageFits(page);
  await testInfo.attach(`inline-validation-layout-${theme}-${viewport.width}x${viewport.height}`, { body: await page.screenshot(), contentType: "image/png" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await discardPendingEdit(page);
  expect(fixture.mutations).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) for (const width of [1366, 390]) {
  test(`Collection edit ${theme} ${width}px reviews only changed fields and disables reverted Save`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installFixture(page, baseURL, { count: 1, theme });
    await openRecords(page);
    const dialog = await openFirstEdit(page);
    await expectNoEditChanges(dialog);
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    const amount = dialog.getByLabel("Amount (RM)", { exact: true });
    const name = dialog.getByLabel("Customer Name", { exact: true });
    await amount.fill("1250");
    await expectNoEditChanges(dialog);
    await name.fill(" Synthetic Customer 1 ");
    await expectNoEditChanges(dialog);
    await name.fill("Synthetic Updated Customer");
    await amount.fill("1400.25");
    await expect(save).toBeEnabled();
    const review = dialog.getByTestId("edit-collection-change-summary");
    await expect(review.locator("summary")).toHaveText("2 perubahan");
    await expect(review).not.toHaveAttribute("open", "");
    await review.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(review).toHaveAttribute("open", "");
    await expect(review.locator("li")).toHaveCount(2);
    await expect(review.getByText("Synthetic Customer 1", { exact: true })).toBeVisible();
    await expect(review.getByText("Synthetic Updated Customer", { exact: true })).toBeVisible();
    await expect(review.getByText("RM 1250.00", { exact: true })).toBeVisible();
    await expect(review.getByText("RM 1400.25", { exact: true })).toBeVisible();
    await expect(review.getByText("IC Number", { exact: true })).toHaveCount(0);
    await dialog.locator(".overflow-y-auto").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(review.getByText("Synthetic Updated Customer", { exact: true })).toBeInViewport();
    await expect(review.getByText("RM 1400.25", { exact: true })).toBeInViewport();
    await expect(save).toBeInViewport();
    await assertPageFits(page);
    await testInfo.attach(`edit-review-${theme}-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    await amount.fill("1250.00");
    await expect(review.locator("summary")).toHaveText("1 perubahan");
    await expect(review).toHaveAttribute("open", "");
    await name.fill("Synthetic Customer 1");
    await expectNoEditChanges(dialog);
    expect(fixture.saves).toBe(0);
    await name.fill("Synthetic Updated Customer");
    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.saves).toBe(1);
    expect(fixture.mutations[0]!.fields.customerName).toEqual(["Synthetic Updated Customer"]);
    expect(fixture.mutations[0]!.fields.amount).toEqual(["1250"]);
    expect(fixture.mutations[0]!.files).toEqual([]);
    await openFirstEdit(page);
    await expectNoEditChanges(dialog);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(fixture.saves).toBe(1);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const width of [1366, 390]) {
  test(`Collection edit receipt-only changes and undo at ${width}px keep Save accurate`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1 });
    await openRecords(page);
    const dialog = await openFirstEdit(page);
    await expectNoEditChanges(dialog);
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    const receiptAmount = dialog.getByLabel("Existing receipt amount for Synthetic receipt 1.png", { exact: true });
    const reference = dialog.getByLabel("Existing receipt reference for Synthetic receipt 1.png", { exact: true });
    const review = dialog.getByTestId("edit-collection-change-summary");
    await receiptAmount.fill("125");
    await expectNoEditChanges(dialog);
    await reference.fill("SYNTHETIC-UPDATED");
    await expect(save).toBeEnabled();
    await review.locator("summary").click();
    await expect(review.getByText("SYNTHETIC-0", { exact: true })).toBeVisible();
    await expect(review.getByText("SYNTHETIC-UPDATED", { exact: true })).toBeVisible();
    await reference.fill("SYNTHETIC-0");
    await expectNoEditChanges(dialog);
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(save).toBeEnabled();
    await review.locator("summary").click();
    await expect(review.getByText("Receipt dibuang", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Undo Remove", exact: true }).click();
    await expectNoEditChanges(dialog);
    const upload = dialog.locator('input[name="collectionReceiptUpload"]');
    await upload.setInputFiles({ name: "Synthetic new.png", mimeType: "image/png", buffer: receiptPng });
    await expect(save).toBeEnabled();
    await expect(review.locator("summary")).toHaveText("1 perubahan");
    await dialog.getByTestId("receipt-draft-card").getByRole("button", { name: "Remove", exact: true }).click();
    await expectNoEditChanges(dialog);
    expect(fixture.saves).toBe(0);
    await reference.fill("SYNTHETIC-UPDATED");
    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.saves).toBe(1);
    const mutation = fixture.mutations[0]!;
    const metadata = JSON.parse(mutation.fields.existingReceiptMetadata![0]!);
    expect(metadata[0].receiptId).toBe("polish-record-1-receipt-0");
    expect(metadata[0].receiptReference).toBe("SYNTHETIC-UPDATED");
    expect(mutation.files).toEqual([]);
    expect(mutation.fields.removeReceiptIds).toBeUndefined();
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test("Collection edit same-count receipt replacement preserves removal confirmation and payload", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1 });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await dialog.locator('input[name="collectionReceiptUpload"]').setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: receiptPng });
  const review = dialog.getByTestId("edit-collection-change-summary");
  await expect(review.locator("summary")).toHaveText("2 perubahan");
  await review.locator("summary").click();
  await expect(review.getByText("Receipt dibuang", { exact: true })).toBeVisible();
  await expect(review.getByText("Receipt ditambah", { exact: true })).toBeVisible();
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await save.click();
  await expect(save).toBeEnabled();
  expect(fixture.saves).toBe(0);
  page.once("dialog", (confirmation) => confirmation.accept());
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.saves).toBe(1);
  const mutation = fixture.mutations[0]!;
  expect(mutation.fields.removeReceiptIds).toEqual(["polish-record-1-receipt-0"]);
  expect(mutation.fields.removeReceipt).toEqual(["true"]);
  expect(JSON.parse(mutation.fields.existingReceiptMetadata![0]!)).toEqual([]);
  expect(mutation.files).toEqual([{ field: "receipts", name: "replacement.png", type: "image/png", size: receiptPng.length }]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) for (const viewport of [{ width: 320, height: 844 }, { width: 740, height: 360 }]) {
  test(`Collection edit ${theme} long summary wraps at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize(viewport);
    const filename = `${"SyntheticLongFile".repeat(10)}.png`;
    const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1, receiptFileName: filename, theme });
    await openRecords(page);
    const dialog = await openFirstEdit(page);
    await dialog.getByLabel("Account Number", { exact: true }).fill(`0000${"9876543210".repeat(12)}`);
    await dialog.getByLabel(`Existing receipt reference for ${filename}`, { exact: true }).fill("SYNTHETIC-NEW-REFERENCE");
    const review = dialog.getByTestId("edit-collection-change-summary");
    await review.locator("summary").click();
    await expect(review).toHaveAttribute("open", "");
    await expect(review.locator("li")).toHaveCount(2);
    const body = dialog.locator(".overflow-y-auto");
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await body.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await review.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
    await assertPageFits(page);
    await testInfo.attach(`edit-review-long-${theme}-${viewport.width}`, { body: await page.screenshot(), contentType: "image/png" });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await discardPendingEdit(page);
    expect(fixture.saves).toBe(0);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`Collection unsaved ${theme} ${viewport.width}px protects every dismiss route and restores focus`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize(viewport);
    const fixture = await installFixture(page, baseURL, { count: 1, theme });
    await openRecords(page);
    const launcher = page.getByRole("button", { name: "Actions for record 1", exact: true });
    const dialog = await openFirstEdit(page);
    const customerName = dialog.getByLabel("Customer Name", { exact: true });
    await customerName.fill("Synthetic unsaved draft");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    const confirmation = await expectUnsavedConfirmation(page);
    await expect(confirmation.getByRole("button", { name: "Teruskan Edit", exact: true })).toBeInViewport();
    await expect(confirmation.getByRole("button", { name: "Buang Perubahan", exact: true })).toBeInViewport();
    expect(await confirmation.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const confirmationBounds = await bounds(confirmation);
    expect(confirmationBounds.x).toBeGreaterThanOrEqual(0);
    expect(confirmationBounds.y).toBeGreaterThanOrEqual(0);
    expect(confirmationBounds.x + confirmationBounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(confirmationBounds.y + confirmationBounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await assertPageFits(page);
    await testInfo.attach(`edit-unsaved-${theme}-${viewport.width}`, { body: await page.screenshot(), contentType: "image/png" });
    // The confirmation is genuinely modal, including when its overlay is clicked.
    await page.mouse.click(2, 2);
    await expect(confirmation).toBeVisible();
    expect(fixture.saves).toBe(0);
    await confirmation.getByRole("button", { name: "Teruskan Edit", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(customerName).toHaveValue("Synthetic unsaved draft");
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expectUnsavedConfirmation(page);
    // Escape dismisses only the confirmation, preserving the original draft.
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(customerName).toHaveValue("Synthetic unsaved draft");
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await page.keyboard.press("Escape");
    await expectUnsavedConfirmation(page);
    await confirmation.getByRole("button", { name: "Teruskan Edit", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await page.mouse.click(2, 2);
    await discardPendingEdit(page);
    await expect(launcher).toBeFocused();
    expect(fixture.saves).toBe(0);
    expect(fixture.mutations).toEqual([]);

    // Reopening does not resurrect abandoned draft data or leave a pointer lock.
    await openFirstEdit(page);
    await expect(customerName).toHaveValue("Synthetic Customer 1");
    await expectNoEditChanges(dialog);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(confirmation).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
    await page.getByRole("button", { name: "View All", exact: true }).click();
    const allRecords = page.getByRole("dialog", { name: "Senarai Penuh Rekod Collection", exact: true });
    await expect(allRecords).toBeVisible();
    await allRecords.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(allRecords).toHaveCount(0);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const width of [1366, 390]) test(`Collection unsaved ${width}px pristine cosmetic and reverted drafts close directly`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1 });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const confirmation = page.getByRole("alertdialog", { name: "Perubahan belum disimpan", exact: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
  await openFirstEdit(page);
  await dialog.getByLabel("Customer Name", { exact: true }).fill("  Synthetic Customer 1  ");
  await dialog.getByLabel("Amount (RM)", { exact: true }).fill("1250");
  await expectNoEditChanges(dialog);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
  await openFirstEdit(page);
  const reference = dialog.getByLabel("Existing receipt reference for Synthetic receipt 1.png", { exact: true });
  await reference.fill("SYNTHETIC-CHANGED");
  await reference.fill("SYNTHETIC-0");
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await dialog.getByRole("button", { name: "Undo Remove", exact: true }).click();
  await expectNoEditChanges(dialog);
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
  await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const width of [1366, 390]) test(`Collection unsaved ${width}px preserves receipt metadata removals and uploads until discard`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1 });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const reference = dialog.getByLabel("Existing receipt reference for Synthetic receipt 1.png", { exact: true });
  await reference.fill("SYNTHETIC-UNSAVED-REFERENCE");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  let confirmation = await expectUnsavedConfirmation(page);
  await confirmation.getByRole("button", { name: "Teruskan Edit", exact: true }).click();
  await expect(reference).toHaveValue("SYNTHETIC-UNSAVED-REFERENCE");
  await reference.fill("SYNTHETIC-0");
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  confirmation = await expectUnsavedConfirmation(page);
  await confirmation.getByRole("button", { name: "Teruskan Edit", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Undo Remove", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Undo Remove", exact: true }).click();
  await dialog.locator('input[name="collectionReceiptUpload"]').setInputFiles({
    name: "Synthetic unsaved upload.png", mimeType: "image/png", buffer: receiptPng,
  });
  const pending = dialog.getByTestId("receipt-draft-card");
  await pending.getByLabel("Reference / no. transaksi", { exact: true }).fill("SYNTHETIC-UPLOAD-REFERENCE");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expectUnsavedConfirmation(page);
  await page.keyboard.press("Escape");
  await expect(pending).toHaveCount(1);
  await expect(pending.getByLabel("Reference / no. transaksi", { exact: true })).toHaveValue("SYNTHETIC-UPLOAD-REFERENCE");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await discardPendingEdit(page);
  await openFirstEdit(page);
  await expect(reference).toHaveValue("SYNTHETIC-0");
  await expect(dialog.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await expect(pending).toHaveCount(0);
  await expectNoEditChanges(dialog);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.saves).toBe(0);
  expect(fixture.mutations).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

test("Collection unsaved nested receipt select and calendar close without discarding their parent draft", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { count: 1, receipts: 1 });
  await openRecords(page);
  const dialog = await openFirstEdit(page);
  const name = dialog.getByLabel("Customer Name", { exact: true });
  const confirmation = page.getByRole("alertdialog", { name: "Perubahan belum disimpan", exact: true });
  await name.fill("Synthetic nested draft");
  const batch = dialog.getByRole("combobox", { name: "Batch", exact: true });
  await batch.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
  await expect(batch).toBeFocused();
  const paymentDate = dialog.getByTestId("edit-collection-payment-date");
  await paymentDate.click();
  await expect(page.getByRole("grid")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
  await expect(paymentDate).toBeFocused();
  const receipt = dialog.getByRole("button", { name: "View", exact: true });
  await receipt.click();
  const preview = await expectReceiptImage(page);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(confirmation).toHaveCount(0);
  await expect(receipt).toBeFocused();
  await expect(name).toHaveValue("Synthetic nested draft");
  await expect(dialog).toHaveCSS("pointer-events", "auto");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await discardPendingEdit(page);
  expect(fixture.receiptViews).toEqual(["polish-record-1"]);
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const outcome of ["success", "failure", "conflict"] as const) test(`Collection unsaved saving gate preserves ${outcome} close behavior`, async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, {
    count: 1, holdSave: true, ...(outcome !== "success" ? { saveOutcome: outcome } : {}),
  });
  try {
    await openRecords(page);
    const dialog = await openFirstEdit(page);
    const name = dialog.getByLabel("Customer Name", { exact: true });
    const confirmation = page.getByRole("alertdialog", { name: "Perubahan belum disimpan", exact: true });
    await name.fill("Synthetic gated save");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => fixture.saves).toBe(1);
    await expect(dialog.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await expect(name).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(confirmation).toHaveCount(0);
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    if (await close.isEnabled()) await close.click();
    await expect(dialog).toBeVisible();
    await expect(confirmation).toHaveCount(0);
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    await expect(confirmation).toHaveCount(0);
    fixture.releaseSave();
    if (outcome === "failure") {
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
      await expect(name).toHaveValue("Synthetic gated save");
      await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(0);
      await expect(page.getByText("Failed to Update Record", { exact: true })).toBeVisible();
      await expect(confirmation).toHaveCount(0);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await discardPendingEdit(page);
    } else {
      await expect(dialog).toHaveCount(0);
      await expect(confirmation).toHaveCount(0);
      await expect(page.getByText(outcome === "success" ? "Synthetic gated save" : "Synthetic Customer 1", { exact: true })).toBeVisible();
    }
    await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
    expect(fixture.saves).toBe(1);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  } finally { fixture.releaseSave(); }
});

test("Collection unsaved repeated confirmation handoffs retain safe focus and draft interaction", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { count: 1 });
  await openRecords(page);
  const launcher = page.getByRole("button", { name: "Actions for record 1", exact: true });
  const dialog = await openFirstEdit(page);
  const name = dialog.getByLabel("Customer Name", { exact: true });
  const confirmation = page.getByRole("alertdialog", { name: "Perubahan belum disimpan", exact: true });
  await name.fill("Synthetic repeated draft");
  for (let iteration = 0; iteration < 8; iteration++) {
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expectUnsavedConfirmation(page);
    await expect(confirmation).toHaveCSS("pointer-events", "auto");
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await expect(name).toHaveValue("Synthetic repeated draft");
    await page.mouse.click(2, 2);
    await expectUnsavedConfirmation(page);
    await expect(confirmation).toHaveCSS("pointer-events", "auto");
    await confirmation.getByRole("button", { name: "Teruskan Edit", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await expect(name).toHaveValue("Synthetic repeated draft");
    expect(fixture.mutations).toEqual([]);
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await discardPendingEdit(page);
  await expect(launcher).toBeFocused();
  expect(fixture.saves).toBe(0);
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

for (const viewport of [{ width: 320, height: 844 }, { width: 740, height: 360 }]) {
  test(`Collection unsaved confirmation stays reachable at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize(viewport);
    const theme = viewport.width === 320 ? "light" : "dark";
    const fixture = await installFixture(page, baseURL, { count: 1, theme });
    await openRecords(page);
    const launcher = page.getByRole("button", { name: "Actions for record 1", exact: true });
    const dialog = await openFirstEdit(page);
    await dialog.getByLabel("Customer Name", { exact: true }).fill("Synthetic narrow confirmation");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    const confirmation = await expectUnsavedConfirmation(page);
    const rect = await bounds(confirmation);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await confirmation.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(confirmation.getByRole("button", { name: "Teruskan Edit", exact: true })).toBeInViewport();
    await expect(confirmation.getByRole("button", { name: "Buang Perubahan", exact: true })).toBeInViewport();
    await assertPageFits(page);
    await testInfo.attach(`edit-unsaved-${theme}-${viewport.width}x${viewport.height}`, {
      body: await page.screenshot(), contentType: "image/png",
    });
    await discardPendingEdit(page);
    await expect(launcher).toBeFocused();
    expect(fixture.saves).toBe(0);
    expect(fixture.mutations).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test.describe("Collection unsaved actual touch dismissal", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("Collection unsaved touch outside preserves safe focus through continue and discard", async ({ page, baseURL }) => {
    const fixture = await installFixture(page, baseURL, { count: 1 });
    await openRecords(page);
    const launcher = page.getByRole("button", { name: "Actions for record 1", exact: true });
    const dialog = await openFirstEdit(page);
    const name = dialog.getByLabel("Customer Name", { exact: true });
    await name.fill("Synthetic touch draft");
    // Radix defers touch outside dismissal to click rather than pointerdown.
    // Use a real touch sequence so desktop mouse coverage cannot mask that path.
    await page.touchscreen.tap(2, 2);
    const confirmation = await expectUnsavedConfirmation(page);
    await expect(confirmation).toHaveCSS("pointer-events", "auto");
    await confirmation.getByRole("button", { name: "Teruskan Edit", exact: true }).tap();
    await expect(confirmation).toHaveCount(0);
    await expect(name).toHaveValue("Synthetic touch draft");
    await expect(dialog).toHaveCSS("pointer-events", "auto");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.touchscreen.tap(2, 2);
    await expectUnsavedConfirmation(page);
    await confirmation.getByRole("button", { name: "Buang Perubahan", exact: true }).tap();
    await expect(confirmation).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
    expect(fixture.saves).toBe(0);
    expect(fixture.mutations).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
});
