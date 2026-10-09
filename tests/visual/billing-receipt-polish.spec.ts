import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { createBillingPrincipalVisualExportFixture } from "../../client/src/pages/collection/billing-principal-v7-test-fixture";

// Production React/CSS with synthetic HTTP and in-memory files only. Unknown
// requests fail closed; the static runner cannot reach a backend or database.
test.use({ serviceWorkers: "block" });
const now = "2026-09-20T08:00:00.000Z";
const nickname = "Receipt Polish Synthetic Collector";
const portraitFilename = `Synthetic_portrait_${"long_unbroken_receipt_reference_".repeat(4)}.png`;

function billingFixture() {
  const dataset = createBillingPrincipalVisualExportFixture();
  const agings = ["D3", "D4", "D5", "D6"] as const;
  dataset.overview.target.activeRevision.agingScope = [...agings];
  dataset.overview.systemResult.rows = agings.map((aging) => ({ ...dataset.overview.systemResult.rows[0]!, aging }));
  dataset.overview.clientResult.rows = agings.map((aging) => ({ ...dataset.overview.clientResult.rows[0]!, aging }));
  Object.assign(dataset.overview.systemResult.all, {
    totalOsp: "40000.00", targetOsp: "20000.00", ospClosed: "32000.00", balanceOsp: "-12000.00", closedAccountCount: 4,
  });
  Object.assign(dataset.overview.clientResult.all, {
    totalOsp: "40000.00", targetOsp: "20000.00", ospClosed: "30000.00", balanceOsp: "-10000.00",
  });
  Object.assign(dataset.overview.latestComparison.system, { totalOsp: "40000.00", ospClosed: "32000.00" });
  Object.assign(dataset.overview.latestComparison.client!, { totalOsp: "40000.00", ospClosed: "30000.00" });
  return dataset;
}

async function installFixture(page: Page, baseURL: string | undefined, theme: "light" | "dark", options: {
  holdClientSave?: boolean;
} = {}) {
  expect(baseURL, "Run through npm run test:visual:built").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const dataset = billingFixture();
  const { target, revision } = dataset.overview;
  const targetPath = "/api/collection/report/billing-principal/saved-targets";
  const revisionPath = `${targetPath}/${target.id}/revisions/${revision.id}`;
  const fixture = { unexpected: [] as string[], errors: [] as string[], clientSaves: 0, release: () => {} };
  const saveGate = new Promise<void>((resolve) => { fixture.release = resolve; });
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, json: body, headers: { "Cache-Control": "no-store" },
  });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ nextTheme, staff }) => {
    localStorage.setItem("theme", nextTheme);
    sessionStorage.setItem("collection_staff_nickname", staff);
    sessionStorage.setItem("collection_staff_nickname_auth", "1");
  }, { nextTheme: theme, staff: nickname });
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
      id: target.assignedAdminUserId, username: "receipt.polish.fixture", fullName: "Synthetic Billing Operator",
      email: "receipt-polish@example.test", role: "admin", status: "active", mustChangePassword: false,
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
      { role: "admin", tabs: { home: true, "collection-report": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0,
      totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true });
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route,
      { ok: true, nickname: { id: "receipt-polish-nickname", nickname } });
    if (endpoint === "GET /api/collection/nicknames") return respond(route, { ok: true, nicknames: [{
      id: "receipt-polish-nickname", nickname, isActive: true, roleScope: "both",
      createdBy: target.assignedAdminUserId, createdAt: now,
    }] });
    if (endpoint === `GET ${targetPath}`) return respond(route,
      { ok: true, targets: [target], page: 1, pageSize: 50, hasMore: false });
    if (endpoint === `GET ${targetPath}/${target.id}`) return respond(route,
      { ok: true, target, viewerUserId: target.assignedAdminUserId });
    if (endpoint === `GET ${revisionPath}/overview`) return respond(route,
      { ok: true, ...dataset.overview, asOf: url.searchParams.get("asOf") });
    if (endpoint === `GET ${revisionPath}/calendar`) return respond(route, {
      ok: true, from: revision.from, to: revision.to, aging: "ALL", days: dataset.calendar,
    });
    if (endpoint === `PUT ${revisionPath}/client-results` && options.holdClientSave) {
      fixture.clientSaves++;
      const submitted = request.postDataJSON() as { rows: Array<{ aging: string; targetPercentage: string }> };
      expect(submitted.rows.find((row) => row.aging === "D3")?.targetPercentage).toBe("45");
      await saveGate;
      const clientResult = dataset.overview.clientResult;
      clientResult.rows[0] = { ...clientResult.rows[0]!, targetPercentage: "45.0000", targetOsp: "4500.00", balanceOsp: "-3000.00" };
      Object.assign(clientResult.all, { targetPercentage: "48.7500", targetOsp: "19500.00", balanceOsp: "-10500.00" });
      return respond(route, { ok: true, clientResult, latestComparison: dataset.overview.latestComparison });
    }
    if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) {
      return respond(route, { ok: true });
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected synthetic billing/receipt request" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  return fixture;
}

async function bounds(locator: Locator) {
  const rectangle = await locator.boundingBox();
  expect(rectangle).not.toBeNull();
  return rectangle!;
}

async function assertPageFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function assertOneTableScroller(table: Locator) {
  // Count overflow owners, even on desktop where the full table currently fits.
  const overflowOwners = await table.evaluate((element) => {
    const owners: string[] = [];
    for (let ancestor = element.parentElement; ancestor && ancestor.tagName !== "SECTION"; ancestor = ancestor.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(ancestor).overflowX)) owners.push(ancestor.className);
    }
    return owners;
  });
  expect(overflowOwners).toHaveLength(1);
  const scroll = table.locator("..");
  await expect(scroll).toHaveCSS("overflow-x", "auto");
  await scroll.scrollIntoViewIfNeeded();
  await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  const scrollBox = await bounds(scroll);
  for (const cell of [
    table.getByRole("columnheader", { name: "Aging", exact: true }),
    table.getByRole("cell", { name: "D3", exact: true }),
    table.getByRole("cell", { name: /^ALL/ }),
  ]) {
    await expect(cell).toHaveCSS("position", "sticky");
    expect(Math.abs((await bounds(cell)).x - scrollBox.x)).toBeLessThan(3);
    expect(await cell.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  }
  expect(await scroll.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  return scroll;
}

async function syntheticPng(page: Page, width: number, height: number) {
  const encoded = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e2e8f0";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#334155";
    context.fillRect(0, 0, width, 12);
    context.fillRect(0, height - 12, width, 12);
    context.fillStyle = "#0d9488";
    context.fillRect(width / 4, height / 4, width / 2, height / 2);
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, { width, height });
  return Buffer.from(encoded, "base64");
}

test("Billing explains a pending private save beside save and export actions on a phone", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installFixture(page, baseURL, "light", { holdClientSave: true });
  try {
    await page.goto("/collection/billing-principal");
    const client = page.getByRole("table", { name: "Table B Client Billing Principal result", exact: true });
    await client.getByLabel("D3 private target percentage").fill("45");
    await page.getByRole("button", { name: "Save Client Result", exact: true }).click();
    await expect.poll(() => fixture.clientSaves).toBe(1);
    const saveReason = page.locator("#billing-client-save-disabled-reason");
    const exportReason = page.locator("#billing-export-disabled-reason");
    await expect(saveReason).toBeVisible();
    await expect(saveReason).toContainText(/Saving your private Client Result/i);
    const saving = page.getByRole("button", { name: "Saving…", exact: true });
    await expect(saving).toBeDisabled();
    await expect(saving).toHaveAccessibleDescription(/Saving your private Client Result/i);
    await expect(exportReason).toBeVisible();
    const exports = page.getByRole("button", { name: /^Export Billing Principal report as / });
    await expect(exports).toHaveCount(3);
    for (const action of await exports.all()) {
      await expect(action).toBeDisabled();
      await expect(action).toHaveAccessibleDescription(/Saving.*Wait before exporting/i);
    }
    await assertPageFits(page);
    fixture.release();
    await expect(client.getByLabel("D3 private target percentage")).toHaveValue("45.0000");
    await expect(page.getByRole("button", { name: "Save Client Result", exact: true })).toHaveAccessibleDescription(/No unsaved changes/i);
    await expect(exportReason).toHaveCount(0);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  } finally { fixture.release(); }
});

for (const theme of ["light", "dark"] as const) for (const viewport of [
  { width: 1366, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 740 },
]) {
  test(`Billing receipt polish tables ${theme} ${viewport.width}x${viewport.height} retain one scroll owner and Aging`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize(viewport);
    const fixture = await installFixture(page, baseURL, theme);
    await page.goto("/collection/billing-principal");
    await expect(page.getByRole("region", { name: "System calendar daily movement" })).toBeVisible();
    const system = page.getByRole("table", { name: "Table A System Billing Principal result", exact: true });
    const client = page.getByRole("table", { name: "Table B Client Billing Principal result", exact: true });
    for (const table of [system, client]) {
      const scroll = await assertOneTableScroller(table);
      if (viewport.width < 768) {
        expect(await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await scroll.evaluate((element) => { element.scrollLeft = 0; });
        await scroll.focus();
        await expect(scroll).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      }
      await testInfo.attach(`billing-${table === system ? "system" : "client"}-${theme}-${viewport.width}`, {
        body: await scroll.screenshot(), contentType: "image/png",
      });
    }
    await expect(system.getByRole("textbox")).toHaveCount(0);
    await expect(client.getByRole("textbox")).toHaveCount(8);
    await expect(client.getByRole("columnheader", { name: "Target % Editable", exact: true })).toBeVisible();
    await expect(client.getByRole("columnheader", { name: "Client Result % Editable", exact: true })).toBeVisible();
    await expect(client.getByRole("columnheader").filter({ hasText: "Calculated" })).toHaveCount(3);
    await expect(client.locator("tfoot").getByRole("textbox")).toHaveCount(0);
    const exportScope = page.locator("#billing-export-scope");
    const exportReason = page.locator("#billing-export-disabled-reason");
    const save = page.getByRole("button", { name: "Save Client Result", exact: true });
    const saveReason = page.locator("#billing-client-save-disabled-reason");
    const exports = page.getByRole("button", { name: /^Export Billing Principal report as / });
    await expect(exportScope).toBeVisible();
    await expect(exportScope).toContainText("2026-09-01");
    await expect(exportScope).toContainText("2026-09-30");
    await expect(exportScope).toContainText(/Table A as of 2026-09-20/i);
    await expect(exportScope).toContainText(/Month and Cumulative aging.*do not limit/i);
    await expect(exportScope).toContainText(/only your saved private results/i);
    await expect(exports).toHaveCount(3);
    for (const action of await exports.all()) {
      await expect(action).toBeEnabled();
      await expect(action).toHaveAccessibleDescription(/only your saved private results/i);
    }
    await expect(save).toBeDisabled();
    await expect(saveReason).toBeVisible();
    await expect(save).toHaveAccessibleDescription(/No unsaved changes/i);
    await expect(exportReason).toHaveCount(0);
    await client.getByLabel("D3 private target percentage").fill("45");
    await expect(client.getByLabel("D3 private target percentage")).toHaveValue("45");
    await expect(save).toBeEnabled();
    await expect(saveReason).toHaveCount(0);
    await expect(exportReason).toBeVisible();
    await expect(exportReason).toContainText(/Save or discard.*changes/i);
    for (const action of await exports.all()) {
      await expect(action).toBeDisabled();
      await expect(action).toHaveAccessibleDescription(/Save or discard.*changes/i);
    }
    await assertPageFits(page);
    expect(await exportScope.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await testInfo.attach(`billing-export-context-${theme}-${viewport.width}`, {
      body: await exportScope.locator("..").screenshot(), contentType: "image/png",
    });
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(client.getByLabel("D3 private target percentage")).toHaveValue("50.0000");
    await expect(exportReason).toHaveCount(0);
    for (const action of await exports.all()) await expect(action).toBeEnabled();
    await expect(save).toHaveAccessibleDescription(/No unsaved changes/i);
    await assertPageFits(page);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });

  test(`Billing receipt polish previews ${theme} ${viewport.width}x${viewport.height} stay compact and preserve metadata`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize(viewport);
    const fixture = await installFixture(page, baseURL, theme);
    await page.goto("/collection/save");
    const upload = page.locator('input[name="collectionReceiptUpload"]');
    await expect(upload).toHaveCount(1);
    // Missing fields keep the existing guided-validation action available.
    await expect(page.getByRole("button", { name: "Semak Medan Wajib", exact: true })).toBeEnabled();
    await expect(page.locator("#save-collection-action-hint")).toHaveCount(0);
    await upload.setInputFiles({ name: portraitFilename, mimeType: "image/png", buffer: await syntheticPng(page, 240, 720) });
    await upload.setInputFiles({ name: "Synthetic landscape.png", mimeType: "image/png", buffer: await syntheticPng(page, 720, 240) });
    await upload.setInputFiles({ name: "Synthetic receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% Synthetic preview-only fixture\n%%EOF") });
    const cards = page.getByTestId("receipt-draft-card");
    await expect(cards).toHaveCount(3);
    const portrait = cards.filter({ hasText: portraitFilename });
    const landscape = cards.filter({ hasText: "Synthetic landscape.png" });
    const pdf = cards.filter({ hasText: "Synthetic receipt.pdf" });
    const filename = portrait.getByText(portraitFilename, { exact: true });
    await expect(filename).toBeVisible();
    expect(await filename.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    if (viewport.width < 640) {
      expect((await bounds(filename)).width).toBeGreaterThanOrEqual((await bounds(portrait)).width - 40);
    }
    for (const card of [portrait, landscape]) {
      const image = card.getByRole("img");
      await expect(image).toBeVisible();
      await expect(image).toHaveCSS("object-fit", "contain");
      expect((await bounds(image)).height).toBeLessThanOrEqual(160);
      const toggle = card.getByRole("button", { name: /^Lihat besar resit/ });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      const previewBox = await bounds(card.getByTestId("receipt-draft-preview"));
      for (const content of [image, toggle]) {
        const contentBox = await bounds(content);
        expect(contentBox.x).toBeGreaterThanOrEqual(previewBox.x);
        expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(previewBox.x + previewBox.width + 1);
      }
    }
    await expect(pdf.getByRole("img")).toHaveCount(0);
    await expect(pdf.getByRole("button", { name: /Lihat besar|Kecilkan/ })).toHaveCount(0);
    // On desktop the compact icon column stretches to the metadata height;
    // mobile must never reserve the old 288px empty preview block.
    if (viewport.width < 640) {
      expect((await bounds(pdf.getByTestId("receipt-draft-preview"))).height).toBeLessThan(100);
    } else {
      expect((await bounds(pdf)).height).toBeLessThan(500);
    }
    for (const card of [portrait, landscape, pdf]) {
      await expect(card.getByLabel("Jumlah resit (RM)", { exact: true })).toBeVisible();
      await expect(card.getByLabel("Tarikh resit", { exact: true })).toBeVisible();
      await expect(card.getByLabel("Reference / no. transaksi", { exact: true })).toBeVisible();
    }
    await portrait.getByLabel("Jumlah resit (RM)", { exact: true }).fill("125.50");
    await portrait.getByLabel("Tarikh resit", { exact: true }).fill("2026-09-19");
    await portrait.getByLabel("Reference / no. transaksi", { exact: true }).fill("SYNTHETIC-PORTRAIT");
    const expand = portrait.getByRole("button", { name: "Lihat besar resit 1", exact: true });
    await expand.focus();
    await page.keyboard.press("Enter");
    const collapse = portrait.getByRole("button", { name: "Kecilkan resit 1", exact: true });
    await expect(collapse).toBeFocused();
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    const controlledId = await collapse.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    await expect(portrait.getByRole("img")).toHaveAttribute("id", controlledId!);
    expect((await bounds(portrait.getByRole("img"))).height).toBeGreaterThan(160);
    await expect(landscape.getByRole("button", { name: "Lihat besar resit 2", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(portrait.getByLabel("Jumlah resit (RM)", { exact: true })).toHaveValue("125.50");
    await expect(portrait.getByLabel("Tarikh resit", { exact: true })).toHaveValue("2026-09-19");
    await expect(portrait.getByLabel("Reference / no. transaksi", { exact: true })).toHaveValue("SYNTHETIC-PORTRAIT");
    await assertPageFits(page);
    await testInfo.attach(`receipt-expanded-${theme}-${viewport.width}`, { body: await portrait.screenshot(), contentType: "image/png" });
    await collapse.focus();
    await page.keyboard.press("Space");
    await expect(expand).toBeFocused();
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(portrait.getByLabel("Reference / no. transaksi", { exact: true })).toHaveValue("SYNTHETIC-PORTRAIT");
    await testInfo.attach(`receipt-compact-${theme}-${viewport.width}`, { body: await portrait.screenshot(), contentType: "image/png" });
    await testInfo.attach(`receipt-pdf-${theme}-${viewport.width}`, { body: await pdf.screenshot(), contentType: "image/png" });
    await landscape.getByLabel("Reference / no. transaksi", { exact: true }).fill("SYNTHETIC-LANDSCAPE");
    await pdf.getByLabel("Reference / no. transaksi", { exact: true }).fill("SYNTHETIC-PDF");
    await landscape.getByRole("button", { name: "Lihat besar resit 2", exact: true }).click();
    const landscapeImageId = await landscape.getByRole("img").getAttribute("id");
    await portrait.getByRole("button", { name: /Remove/ }).click();
    await expect(cards).toHaveCount(2);
    await expect(portrait).toHaveCount(0);
    await expect(landscape.getByText("Receipt 1 of 2", { exact: true })).toBeVisible();
    await expect(pdf.getByText("Receipt 2 of 2", { exact: true })).toBeVisible();
    await expect(landscape.getByRole("button", { name: "Kecilkan resit 1", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(landscape.getByRole("img")).toHaveAttribute("id", landscapeImageId!);
    await expect(landscape.getByLabel("Reference / no. transaksi", { exact: true })).toHaveValue("SYNTHETIC-LANDSCAPE");
    await expect(pdf.getByLabel("Reference / no. transaksi", { exact: true })).toHaveValue("SYNTHETIC-PDF");
    await assertPageFits(page);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}
