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
    cardNumber: "00009007199254740993", cardNumberLast4: "0993", batch: "P10",
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
  loading?: boolean; receipts?: number; paginate?: boolean;
} = {}) {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "admin";
  const records = Array.from({ length: options.count ?? 20 }, (_, index) => syntheticRecord(index, options.receipts));
  const fixture = { unexpected: [] as string[], errors: [] as string[], receiptViews: [] as string[], saves: 0, release: () => {} };
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
