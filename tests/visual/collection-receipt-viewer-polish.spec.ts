import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { isChromiumPdfViewerResource } from "./helpers/chromium-pdf-resources";
import { expectPaddedActions } from "./helpers/collection-action-layout";

// Production assets, synthetic records and generated in-memory media only.
// The static runner has no backend; unexpected network requests fail closed.
test.use({ serviceWorkers: "block" });
const now = "2026-10-15T08:00:00.000Z";
const nickname = "Synthetic Receipt Viewer Collector";
const recordId = "synthetic-viewer-record";
const media = [
  { id: "portrait", fileName: "Synthetic portrait receipt.png", mimeType: "image/png", width: 1200, height: 3600 },
  { id: "landscape", fileName: "Synthetic landscape receipt.png", mimeType: "image/png", width: 1800, height: 600 },
  { id: "pdf", fileName: "Synthetic original receipt.pdf", mimeType: "application/pdf", width: 0, height: 0 },
];

function syntheticPdf() {
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  const stream = "BT /F1 16 Tf 30 220 Td (Synthetic receipt fixture only) Tj ET\n";
  for (const [index, body] of [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ].entries()) {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  }
  const xref = Buffer.byteLength(parts.join(""));
  parts.push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(""));
}

async function syntheticPng(page: Page, width: number, height: number) {
  return Buffer.from(await page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#0f766e";
    for (const [x, y] of [[0, 0], [width - 80, 0], [0, height - 80], [width - 80, height - 80]]) context.fillRect(x, y, 80, 80);
    context.fillStyle = "#334155";
    context.font = "48px sans-serif";
    context.fillText("Synthetic receipt fixture", 100, 150);
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, { width, height }), "base64");
}

async function installFixture(page: Page, baseURL: string | undefined, options: {
  locale?: "ms" | "en"; verifyMissingAmounts?: boolean;
  breakdownRole?: "user" | "admin" | "manager" | "superuser";
  comparison?: "available" | "retry" | "removed";
  theme?: "light" | "dark"; firstFailure?: "http" | "decode"; holdFirst?: boolean;
} = {}) {
  expect(baseURL, "Use npm run test:visual:built").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const files = await Promise.all(media.map((entry) => entry.id === "pdf" ? syntheticPdf() : syntheticPng(page, entry.width, entry.height)));
  const record = {
    id: recordId, customerName: "Synthetic Viewer Customer", icNumber: "SYNTHETIC-ID", customerPhone: "SYNTHETIC-PHONE",
    accountNumber: "SYNTHETIC-ACCOUNT", cardNumber: "00009007199254740993", cardNumberLast4: "0993", batch: "P10",
    paymentDate: "2026-10-14", amount: options.breakdownRole ? "3250.00" : "125.00", receiptFile: null,
    receipts: media.map((entry, index) => ({
      id: entry.id, collectionRecordId: recordId, storagePath: `/synthetic/${entry.id}`,
      originalFileName: entry.fileName, originalMimeType: entry.mimeType, originalExtension: entry.id === "pdf" ? ".pdf" : ".png",
      fileSize: files[index]!.length, receiptAmount: ["80.00", "0.00", null][index], extractedAmount: null, extractionStatus: "unprocessed",
      extractionConfidence: null, receiptDate: "2026-10-14", receiptReference: `SYNTHETIC-${entry.id}`, fileHash: null, createdAt: now,
    })),
    archivedReceipts: [], receiptTotalAmount: "80.00", receiptValidationStatus: "unverified", receiptValidationMessage: null,
    receiptCount: media.length, duplicateReceiptFlag: options.breakdownRole === "superuser", createdByLogin: "synthetic.viewer", collectionStaffNickname: nickname,
    createdAt: now, updatedAt: now, sourceImportId: "synthetic-source", sourceFilename: "Synthetic source.xlsx",
    totalDue: options.verifyMissingAmounts ? null : options.breakdownRole ? "250.00" : "150.00", billingPrincipalOsp: options.verifyMissingAmounts ? "0.00" : "125.00",
    sourceMatchAccuracy: options.locale === "en" ? 0 : null, cpStatus: "cp", agingBucket: "D3",
  };
  const records = options.comparison ? [
    ...Array.from({ length: 14 }, (_, index) => ({ ...record, id: `synthetic-row-${index}`, customerName: `Synthetic example ${index + 1}`, receipts: [], receiptCount: 0, duplicateReceiptFlag: false })),
    record,
  ] : [record];
  const fixture = { errors: [] as string[], unexpected: [] as string[], views: [] as string[], downloads: [] as string[], breakdownRequests: 0, comparisonRequests: 0, release: () => {} };
  const gate = new Promise<void>((resolve) => { fixture.release = resolve; });
  const respond = (route: Route, json: unknown, status = 200) => route.fulfill({ status, json, headers: { "Cache-Control": "no-store" } });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ theme, staff, fixtureOrigin, locale }) => {
    // Init scripts also run in the native PDF frame. Seed only this app's
    // synthetic loopback origin, never browser-owned or unrelated documents.
    if (window !== window.top || location.origin !== fixtureOrigin) return;
    localStorage.setItem("theme", theme);
    localStorage.setItem("sqr.auth.locale", locale);
    sessionStorage.setItem("collection_staff_nickname", staff);
    sessionStorage.setItem("collection_staff_nickname_auth", "1");
  }, { theme: options.theme ?? "light", staff: nickname, fixtureOrigin: origin, locale: options.locale ?? "ms" });
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // Google Chrome exposes its built-in PDF UI to routing on CI. These
    // internal resources are not outbound requests; other origins stay blocked.
    if (isChromiumPdfViewerResource(url)) return route.continue();
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
    if (endpoint === "GET /api/health/connectivity") return route.fulfill({ status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } });
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route, { maintenance: false, message: "Synthetic fixture", type: "soft", startTime: null, endTime: null });
    if (endpoint === "GET /api/me") return respond(route, { ok: true, sessionExpiresAt: "2036-01-01T00:00:00.000Z", user: {
      id: "synthetic-viewer-admin", username: "synthetic.viewer", fullName: "Synthetic Viewer Operator", email: "viewer@example.test",
      role: options.breakdownRole ?? "admin", status: "active", mustChangePassword: false, passwordResetBySuperuser: false, isBanned: false,
      twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorConfiguredAt: null, activatedAt: now, passwordChangedAt: now, lastLoginAt: now,
    } });
    if (endpoint === "GET /api/app-config") return respond(route, { systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30000, heartbeatIntervalMinutes: 60, importUploadLimitBytes: 10485760, searchResultLimit: 250, semanticSearchEnabled: false, sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10 });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route, { role: options.breakdownRole ?? "admin", tabs: { home: true, "collection-report": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true, status: "ONLINE", lastActivityTime: now });
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route, { ok: true, nickname: { id: "synthetic-viewer-nickname", nickname } });
    if (endpoint === "GET /api/collection/nicknames") return respond(route, { ok: true, nicknames: [{ id: "synthetic-viewer-nickname", nickname, isActive: true, roleScope: "both", createdBy: "synthetic-viewer-admin", createdAt: now }] });
    if (endpoint === "GET /api/collection/list") {
      const duplicateOnly = url.searchParams.get("duplicateOnly") === "1";
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const aging = url.searchParams.get("agingBuckets");
      const selected = records.filter(row => (!duplicateOnly || row.duplicateReceiptFlag)
        && row.customerName.toLowerCase().includes(search) && (!aging || aging === row.agingBucket));
      const total = selected.length;
      const pageSize = Number(url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? 50);
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const offset = (pageNumber - 1) * pageSize;
      const pagination = { mode: "hybrid", page: pageNumber, pageSize, limit: pageSize, offset, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), nextCursor: null, hasNextPage: offset + pageSize < total, hasPreviousPage: pageNumber > 1 };
      return respond(route, { ...pagination, ok: true, records: selected.slice(offset, offset + pageSize), totalAmount: selected.reduce((sum, row) => sum + Number(row.amount), 0), pagination });
    }
    if (endpoint === "GET /api/collection/source-configs") return respond(route, { ok: true, sourceConfigs: [] });
    if (options.breakdownRole && endpoint === `GET /api/collection/${recordId}/receipt-breakdown`) {
      fixture.breakdownRequests++;
      if (options.breakdownRole === "user" && fixture.breakdownRequests === 1) return respond(route, { ok: false }, 500);
      return respond(route, {
        ok: true, recordedAmount: "3250.00", totalDue: "250.00", uniqueAmount: "250.00", sharedAmount: "3000.00",
        receiptCount: 3, unclassifiedCount: 1, sharedReceipts: [{ id: media[1]!.id, fileName: media[1]!.fileName, amount: "3000.00",
          ...(options.breakdownRole === "superuser" ? { related: { count: 1, records: [
            { recordId: "synthetic-peer-id", batch: "P25", paymentDate: "2026-10-12", accountLast4: "0010", cardLast4: "0007" },
          ] } } : {}) }],
      });
    }
    if (options.breakdownRole === "superuser" && endpoint === `GET /api/collection/${recordId}/receipts/landscape/compare/synthetic-peer-id`) {
      fixture.comparisonRequests++;
      if (options.comparison === "removed") return respond(route, { ok: false }, 404);
      if (options.comparison === "retry" && fixture.comparisonRequests === 1) return respond(route, { ok: false }, 500);
      return respond(route, {
        original: { batch: "P10", paymentDate: "2026-10-14", recordedAmount: "3250.00", receiptAmount: "3000.00", fileName: media[1]!.fileName },
        related: { batch: "P25", paymentDate: "2026-10-12", recordedAmount: "3100.25", receiptAmount: "2950.50", fileName: "Renamed receipt.png" },
      });
    }
    if (endpoint === "GET /api/collection/teams") return respond(route, { ok: true, teams: [] });
    if (endpoint === "GET /api/collection/purge-summary") return respond(route, { ok: true, retentionMonths: 6, cutoffDate: "2026-04-15", eligibleRecords: 0, totalAmount: 0 });
    for (const [index, entry] of media.entries()) for (const action of ["view", "download"] as const) {
      if (endpoint !== `GET /api/collection/${recordId}/receipts/${entry.id}/${action}`) continue;
      const calls = action === "view" ? fixture.views : fixture.downloads;
      calls.push(entry.id);
      if (action === "view" && fixture.views.length === 1) {
        if (options.holdFirst) await gate;
        // A terminal 500 exercises the user's Retry action; retryable 503s are
        // deliberately handled earlier by the application's HTTP retry layer.
        if (options.firstFailure === "http") return respond(route, { ok: false, message: "Synthetic receipt temporarily unavailable" }, 500);
        if (options.firstFailure === "decode") return route.fulfill({ status: 200, body: "Synthetic invalid image bytes", contentType: entry.mimeType });
      }
      return route.fulfill({ status: 200, body: files[index]!, contentType: entry.mimeType, headers: { "Cache-Control": "no-store", "Content-Disposition": `${action === "view" ? "inline" : "attachment"}; filename="${entry.fileName}"` } });
    }
    if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) return respond(route, { ok: true });
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected synthetic receipt viewer request" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  return fixture;
}

for (const [width, theme] of [[320, "dark"], [390, "light"], [800, "light"], [1024, "dark"], [1366, "light"]] as const) {
  test(`Customer name opens collection details at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: width < 768 ? 568 : 900 });
    const en = width === 390 || width === 1366;
    const fixture = await installFixture(page, baseURL, { theme, locale: en ? "en" : "ms", verifyMissingAmounts: true });
    const cardLabel = en ? "Card Number" : "Nombor kad";
    const accountLabel = en ? "Account Number" : "Nombor akaun";
    const sourceLabel = en ? "Source File" : "Fail sumber";
    const missing = en ? "No information" : "Tiada maklumat";
    await page.goto("/collection/records");
    const name = "Synthetic Viewer Customer";
    const modes = width < 768 ? ["list", "all"] : ["list", "full", "all"];
    for (const mode of modes) {
      if (mode === "full") await page.getByRole("button", { name: "Lengkap", exact: true }).click();
      if (mode === "all") await page.getByRole("button", { name: "View All", exact: true }).click();
      const parent = mode === "all" ? page.getByRole("dialog", { name: "Senarai Penuh Rekod Collection" }) : page;
      const trigger = parent.getByRole("button", { name, exact: true });
      await expect(trigger).toBeVisible();
      if (width < 768) {
        const card = parent.locator("article").filter({ has: page.getByRole("button", { name, exact: true }) });
        await expect(card.locator("dt")).toHaveText([cardLabel, accountLabel, "Jumlah dibayar", "Tarikh bayaran"]);
        await expect(card.getByText(en ? "Row 1" : "Baris 1", { exact: true })).toHaveCount(1);
        const marker = card.getByText("#1", { exact: true });
        const nameBox = await trigger.boundingBox();
        const markerBox = await marker.boundingBox();
        expect(markerBox!.x).toBeGreaterThanOrEqual(nameBox!.x + nameBox!.width);
        expect(markerBox!.y).toBeLessThan(nameBox!.y + nameBox!.height);
        await expect(card.locator("details, summary")).toHaveCount(0);
        await expect(card.getByRole("button", { name: /Show more|Record details/ })).toHaveCount(0);
        await expect(card.getByRole("button", { name: "View Receipt (3)", exact: true })).toBeVisible();
        await trigger.click();
      }
      else {
        const headers = await parent.getByRole("columnheader").allTextContents();
        const identifiers = mode === "list" ? [en ? "Card / Account" : "Kad / Akaun"] : [cardLabel, accountLabel];
        const expected = ["No.", "Customer Name", ...identifiers, "Amount", "Payment Date", "Receipt"];
        expect(headers.slice(0, expected.length)).toEqual(expected);
        const table = parent.getByRole("table");
        const cells = table.locator("tbody tr").first().getByRole("cell");
        await expect(cells.nth(0)).toHaveText("1");
        await expect(cells.nth(1).getByRole("button", { name, exact: true })).toBeVisible();
        const scroller = table.locator("..");
        const distance = await scroller.evaluate(element => {
          element.scrollLeft = element.scrollWidth;
          return element.scrollLeft;
        });
        if (mode !== "list" || width <= 1024) expect(distance).toBeGreaterThan(0);
        const edge = await scroller.evaluate(element => element.getBoundingClientRect().left + element.clientLeft);
        for (const columns of [table.getByRole("columnheader"), cells]) {
          const numberBox = (await columns.nth(0).boundingBox())!;
          const nameBox = (await columns.nth(1).boundingBox())!;
          expect(Math.abs(numberBox.x - edge)).toBeLessThan(2);
          expect(Math.abs(nameBox.x - numberBox.x - numberBox.width)).toBeLessThan(2);
        }
        await trigger.press("Enter");
      }
      const dialog = page.getByRole("dialog", { name, exact: true });
      await expect(dialog).toBeVisible();
      if (width < 768) {
        const close = dialog.getByRole("button", { name: "Close", exact: true });
        await expect(close).toHaveCSS("width", "44px");
        await expect(close).toHaveCSS("height", "44px");
      }
      await expect(dialog).toContainText("14/10/2026");
      await expect(dialog.locator("dt")).toHaveCount(15);
      await expect(dialog.locator("dl").first().locator("dt")).toHaveText([cardLabel, accountLabel, "Jumlah dibayar", "Tarikh bayaran"]);
      for (const value of ["00009007199254740993", "SYNTHETIC-ID", "SYNTHETIC-ACCOUNT", "SYNTHETIC-PHONE", "Synthetic source.xlsx", nickname]) {
        await expect(dialog.getByText(value, { exact: true })).toHaveCount(1);
      }
      const payment = dialog.locator("dt").filter({ hasText: /^Jumlah dibayar$/ }).locator("+ dd");
      await expect(payment).toHaveCSS("font-weight", "600");
      await expect(dialog.getByText("TOTAL DUE", { exact: true }).locator("+ dd")).toHaveCSS("font-weight", "400");
      await expect(dialog.getByText("TOTAL DUE", { exact: true }).locator("+ dd")).toHaveText(missing);
      await expect(dialog.getByText("Billing Principal (OSP)", { exact: true }).locator("+ dd")).toHaveText(/RM\s*0\.00/);
      await expect(dialog.getByText("Match", { exact: true }).locator("+ dd")).toHaveText(en ? "0%" : missing);
      for (const label of [accountLabel, cardLabel, sourceLabel]) {
        const fullWidth = await dialog.getByText(label, { exact: true }).evaluate(term => {
          const item = term.parentElement!;
          return Math.abs(item.clientWidth - item.parentElement!.clientWidth) <= 1;
        });
        expect(fullWidth, label).toBe(width < 640);
      }
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      if (mode === "list") await page.screenshot({ path: testInfo.outputPath(`record-details-${width}.png`) });
      if (mode === "all") {
        expect(fixture.views).toEqual([]);
        const receipt = dialog.getByRole("button", { name: "Lihat 3 resit", exact: true });
        await receipt.click();
        await expectImage(page.getByRole("dialog", { name: "Receipt Preview", exact: true }));
        await page.keyboard.press("Escape");
        await expect(receipt).toBeFocused();
      }
      await dialog.getByText(sourceLabel, { exact: true }).scrollIntoViewIfNeeded();
      if (mode === "all") await dialog.getByRole("button", { name: "Close" }).click();
      else await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    expect(fixture.views.length).toBeGreaterThan(0);
    if (width < 768) {
      const list = page.getByRole("dialog", { name: "Senarai Penuh Rekod Collection" });
      const receipt = list.getByRole("button", { name: "View Receipt (3)", exact: true });
      await receipt.click();
      const preview = page.getByRole("dialog", { name: "Receipt Preview", exact: true });
      await expectImage(preview);
      await page.keyboard.press("Escape");
      await expect(receipt).toBeFocused();
    }
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const [width, role] of [[320, "user"], [1366, "superuser"]] as const) {
  test(`Receipt breakdown for ${role} at ${width}px`, async ({ page, baseURL }, testInfo) => {
    const staff = role === "user";
    await page.setViewportSize({ width, height: staff ? 740 : 900 });
    const fixture = await installFixture(page, baseURL, { locale: "ms", theme: staff ? "dark" : "light", breakdownRole: role });
    await page.goto("/collection/records");
    const trigger = page.getByRole("button", { name: "Synthetic Viewer Customer", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Synthetic Viewer Customer", exact: true });
    const toggle = dialog.getByRole("button", { name: "Pecahan amaun resit" });
    if (staff) {
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(fixture.breakdownRequests).toBe(0);
      await toggle.press("Enter");
      await dialog.getByRole("button", { name: "Cuba semula" }).click();
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const [term, amount] of [
      ["Bayaran direkodkan", /RM\s*3,250\.00/], ["Jumlah perlu dibayar", /RM\s*250\.00/],
      ["Resit unik bagi rekod ini", /RM\s*250\.00/], ["Resit dikongsi dengan rekod lain", /RM\s*3,000\.00/],
    ] as const) await expect(dialog.getByText(term, { exact: true }).locator("+ dd")).toHaveText(amount);
    await expect(dialog.getByText(/Resit yang belum dapat dibandingkan: 1/)).toBeAttached();
    const link = dialog.getByText(/ID synthetic-peer-id/);
    if (staff) {
      await expect(link).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: /^Bandingkan/ })).toHaveCount(0);
      expect(fixture.comparisonRequests).toBe(0);
    }
    else {
      await expect(link).toContainText("P25 · 12/10/2026");
      await expect(dialog.getByText(/Nombor akaun •••• 0010 · Nombor kad •••• 0007/)).toBeVisible();
    }
    await (staff ? dialog.getByText(media[1]!.fileName, { exact: true }) : link).scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`receipt-breakdown-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const width of [320, 1366]) {
  test(`Receipt comparison preserves the filtered list at ${width}px`, async ({ page, baseURL }, testInfo) => {
    const phone = width === 320;
    await page.setViewportSize({ width, height: phone ? 740 : 900 });
    const fixture = await installFixture(page, baseURL, { locale: "ms", theme: phone ? "dark" : "light", breakdownRole: "superuser", comparison: phone ? "available" : "retry" });
    await page.goto("/collection/records");
    const search = page.getByRole("searchbox", { name: "Search" });
    await search.fill("Synthetic");
    await page.getByTestId("collection-records-filter-toggle").click();
    await page.getByRole("combobox", { name: "Aging", exact: true }).click();
    await page.getByRole("option", { name: "D3", exact: true }).click();
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    const chip = page.getByText("Aging: D3", { exact: true });
    await expect(chip).toBeVisible();
    const name = "Synthetic Viewer Customer";
    const row = page.getByRole("button", { name, exact: true });
    await row.scrollIntoViewIfNeeded();
    const listScroll = () => row.evaluate(element => {
      const offsets: number[] = [];
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.scrollHeight > ancestor.clientHeight) offsets.push(ancestor.scrollTop);
      }
      return offsets;
    });
    const offsets = await listScroll();
    expect(offsets.some(offset => offset > 0)).toBe(true);
    await row.press("Enter");
    const details = page.getByRole("dialog", { name, exact: true });
    const link = details.getByRole("button", { name: /^Bandingkan Nombor akaun/ });
    await expect(link).toBeVisible();
    expect(fixture.comparisonRequests).toBe(0);
    await link.press("Enter");
    const pair = page.getByRole("dialog", { name: "Bandingkan rekod resit" });
    await expect(pair.getByRole("heading", { name: "Bandingkan rekod resit" })).toBeFocused();
    if (!phone) await pair.getByRole("button", { name: "Cuba semula" }).click();
    const original = pair.getByRole("region", { name: "Rekod asal" });
    const related = pair.getByRole("region", { name: "Rekod berkaitan" });
    await expect(original.locator("dd")).toHaveText([/RM\s*3,250\.00/, "14/10/2026", "P10", /RM\s*3,000\.00/, media[1]!.fileName]);
    await expect(related.locator("dd")).toHaveText([/RM\s*3,100\.25/, "12/10/2026", "P25", /RM\s*2,950\.50/, "Renamed receipt.png"]);
    const left = (await original.boundingBox())!;
    const right = (await related.boundingBox())!;
    if (phone) {
      expect(right.y).toBeGreaterThanOrEqual(left.y + left.height);
      expect(right.x).toBe(left.x);
      await expect(pair.getByRole("button", { name: "Close", exact: true })).toHaveCSS("width", "44px");
    } else {
      expect(right.x).toBeGreaterThan(left.x + left.width);
      expect(right.y).toBe(left.y);
      const fieldPositions = (section: Locator) => section.locator("dt").evaluateAll(labels => labels.map(label => label.getBoundingClientRect().top));
      expect(await fieldPositions(related)).toEqual(await fieldPositions(original));
    }
    expect(await pair.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`receipt-comparison-${width}.png`) });
    expect(fixture.views).toEqual([]);
    const previewButton = pair.getByRole("button", { name: "Lihat resit yang dikongsi" });
    await previewButton.click();
    await expectImage(page.getByRole("dialog", { name: "Receipt Preview" }), media[1]!.fileName);
    expect(fixture.views).toEqual(["landscape"]);
    await page.keyboard.press("Escape");
    await expect(previewButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(link).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(row).toBeFocused();
    expect(await listScroll()).toEqual(offsets);
    await expect(search).toHaveValue("Synthetic");
    await expect(chip).toBeAttached();
    expect(fixture.errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}

for (const width of [320, 1366]) {
  test(`Duplicate receipt filter opens a comparison and preserves selection at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    const fixture = await installFixture(page, baseURL, { locale: "ms", theme: width === 320 ? "dark" : "light", breakdownRole: "superuser", comparison: "available" });
    await page.goto("/collection/records");
    const search = page.getByRole("searchbox", { name: "Search" });
    const toggle = page.getByTestId("collection-records-filter-toggle");
    const checkbox = page.getByRole("checkbox", { name: "Resit pendua" });
    const ordinary = page.getByRole("button", { name: "Synthetic example 1", exact: true });
    const duplicate = page.getByRole("button", { name: "Synthetic Viewer Customer", exact: true });
    await expect(ordinary).toBeVisible();
    await search.fill("Synthetic");
    await toggle.click();
    await page.getByRole("combobox", { name: "Aging", exact: true }).click();
    await page.getByRole("option", { name: "D3", exact: true }).click();
    await expect(checkbox).not.toBeChecked();
    await checkbox.focus();
    await checkbox.press("Space");
    await expect(checkbox).toBeChecked();
    await checkbox.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`duplicate-filter-${width}.png`) });
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(toggle).toBeFocused();
    await expect(ordinary).toHaveCount(0);
    await expect(duplicate).toBeVisible();
    await expect(page.getByTestId("collection-records-filter-count")).toHaveText("2");
    await page.getByRole("button", { name: "View All", exact: true }).click();
    const fullList = page.getByRole("dialog", { name: "Senarai Penuh Rekod Collection" });
    await expect(fullList.getByRole("button", { name: "Synthetic Viewer Customer" })).toBeVisible();
    await expect(fullList.getByRole("button", { name: /^Synthetic example / })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await duplicate.click();
    const peer = page.getByRole("button", { name: /^Bandingkan Nombor akaun/ });
    await peer.click();
    await expect(page.getByRole("region", { name: "Rekod berkaitan" })).toContainText("Renamed receipt.png");
    await page.keyboard.press("Escape");
    await expect(peer).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(duplicate).toBeFocused();
    await expect(search).toHaveValue("Synthetic");
    await search.fill("Synthetic example");
    await expect(page.getByRole("heading", { name: "Tiada rekod sepadan" })).toBeVisible();
    await page.getByRole("button", { name: "Remove filter Resit pendua" }).click();
    await expect(ordinary).toBeVisible();
    await expect(duplicate).toHaveCount(0);
    await expect(search).toHaveValue("Synthetic example");
    await expect(page.getByTestId("collection-records-filter-count")).toHaveText("1");
    await toggle.click();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(ordinary).toBeVisible();
    await expect(duplicate).toBeVisible();
    await expect(search).toHaveValue("");
    await expect(page.getByTestId("collection-records-filter-count")).toHaveCount(0);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

for (const role of ["user", "admin", "manager"] as const) {
  test(`Duplicate receipt filter stays hidden for ${role}`, async ({ page, baseURL }) => {
    await installFixture(page, baseURL, { breakdownRole: role });
    await page.goto("/collection/records");
    await page.getByTestId("collection-records-filter-toggle").click();
    await expect(page.getByRole("combobox", { name: "Aging" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Resit pendua" })).toHaveCount(0);
  });
}

test("Receipt comparison handles a removed match", async ({ page, baseURL }) => {
  const fixture = await installFixture(page, baseURL, { breakdownRole: "superuser", comparison: "removed" });
  await page.goto("/collection/records");
  await page.getByRole("button", { name: "Synthetic Viewer Customer", exact: true }).click();
  const link = page.getByRole("button", { name: /^Bandingkan Nombor akaun/ });
  await link.click();
  const pair = page.getByRole("dialog", { name: "Bandingkan rekod resit" });
  await expect(pair.getByRole("status")).toHaveText("Padanan ini sudah tiada atau akses anda telah berubah.");
  await expect(pair.locator("dd")).toHaveCount(0);
  await expect(pair.getByRole("button", { name: "Lihat resit yang dikongsi" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(link).toBeFocused();
  expect(fixture.views).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

async function openPreview(page: Page) {
  await page.goto("/collection/records");
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
  const launcher = page.getByRole("button", { name: /^View(?: Receipt)? \(3\)$/, exact: false });
  await launcher.scrollIntoViewIfNeeded();
  await launcher.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Receipt Preview", exact: true });
  await expect(dialog).toBeVisible();
  return { launcher, dialog };
}

for (const width of [320, 1366]) {
  test(`Receipt amounts stay scoped to the selected file at ${width}px`, async ({ page, baseURL }, testInfo) => {
    const ms = width === 320;
    await page.setViewportSize({ width, height: ms ? 740 : 900 });
    const fixture = await installFixture(page, baseURL, { theme: ms ? "dark" : "light", locale: ms ? "ms" : "en" });
    const { dialog } = await openPreview(page);
    await expectImage(dialog);
    await dialog.getByRole("button", { name: "Details", exact: true }).click();
    const details = dialog.getByRole("region", { name: ms ? "Butiran resit dan kutipan" : "Receipt and collection details" });
    const group = dialog.getByRole("group", { name: ms ? "Pilih resit" : "Choose receipt" });
    const term = (label: string) => details.getByText(label, { exact: true }).locator("+ dd");
    const recorded = term(ms ? "Bayaran direkodkan" : "Recorded payment");
    const combined = term(ms ? "Jumlah semua resit" : "Total of all receipts");
    const current = term(ms ? "Amaun resit ini" : "This receipt’s amount");
    for (const [index, expected] of [/RM\s*80\.00/, /RM\s*0\.00/, ms ? "Tiada maklumat" : "No information"].entries()) {
      const receipt = media[index]!;
      const choice = group.getByRole("button").and(group.getByTitle(receipt.fileName, { exact: true }));
      await choice.click();
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      await expect(recorded).toHaveText(/RM\s*125\.00/);
      await expect(combined).toHaveText(/RM\s*80\.00/);
      await expect(current).toHaveText(expected);
      await expect(term(ms ? "Rujukan" : "Reference")).toHaveText(`SYNTHETIC-${receipt.id}`);
      await expect(details.getByText(receipt.fileName, { exact: false })).toBeAttached();
      if (index === 0) {
        const left = await recorded.boundingBox();
        const right = await combined.boundingBox();
        expect(right!.x).toBeGreaterThan(left!.x);
        expect(Math.abs(right!.y - left!.y)).toBeLessThan(2);
        expect(await details.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`receipt-amounts-${width}.png`) });
      }
    }
    expect(fixture.errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}

async function expectImage(dialog: Locator, name = media[0]!.fileName) {
  const image = dialog.getByRole("img", { name, exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return image;
}

async function expectContainedImage(dialog: Locator) {
  const canvas = dialog.locator(".receipt-preview-image-canvas");
  const result = await canvas.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const image = element.querySelector("img")!.getBoundingClientRect();
    return { left: image.left - box.left, top: image.top - box.top, right: box.right - image.right, bottom: box.bottom - image.bottom };
  });
  for (const value of Object.values(result)) expect(Math.abs(value)).toBeLessThan(1.1);
}

async function expectKeyboardEdges(page: Page, scroller: Locator) {
  await scroller.focus();
  await expect(scroller).toBeFocused();
  // Assert the receipt's visible edges, rather than blank reserved gutter or
  // padding. Chromium's keyboard endpoint can exclude that empty gutter.
  const edgeOverflow = (edge: "left" | "right" | "top" | "bottom") => scroller.evaluate((element, edge) => {
    const viewport = element.getBoundingClientRect();
    const receipt = element.querySelector(".receipt-preview-image-canvas")!.getBoundingClientRect();
    return edge === "left" ? viewport.left - receipt.left : edge === "top" ? viewport.top - receipt.top : receipt[edge] - viewport[edge];
  }, edge);
  const horizontalSteps = await scroller.evaluate((element) => Math.min(80, Math.ceil((element.scrollWidth - element.clientWidth) / 30) + 2));
  for (let step = 0; step < horizontalSteps; step++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => edgeOverflow("right")).toBeLessThan(1.1);
  for (let step = 0; step < horizontalSteps; step++) await page.keyboard.press("ArrowLeft");
  await expect.poll(() => edgeOverflow("left")).toBeLessThan(1.1);
  await page.keyboard.press("End");
  await expect.poll(() => edgeOverflow("bottom")).toBeLessThan(1.1);
  await page.keyboard.press("Home");
  await expect.poll(() => edgeOverflow("top")).toBeLessThan(1.1);
}

for (const theme of ["light", "dark"] as const) for (const viewport of [
  { width: 320, height: 740 }, { width: 393, height: 852 }, { width: 1366, height: 768 },
]) test(`Receipt viewer ${theme} ${viewport.width}px zoom rotation fit selection and Escape remain usable`, async ({ page, baseURL }) => {
  await page.setViewportSize(viewport);
  const fixture = await installFixture(page, baseURL, { theme, locale: "en" });
  const expectedPortraitViews = viewport.width < 768 ? ["portrait", "portrait"] : ["portrait"];
  const { launcher, dialog } = await openPreview(page);
  let image = await expectImage(dialog);
  const fitWidth = (await image.boundingBox())!.width;
  await expect(dialog.getByText("Receipt 1 of 3", { exact: true })).toBeVisible();
  const portrait = dialog.getByRole("button", { name: /1 · RM\s*80\.00.*Synthetic portrait receipt/ });
  const landscape = dialog.getByRole("button", { name: /2 · RM\s*0\.00.*Synthetic landscape receipt/ });
  await expect(portrait).toHaveAttribute("aria-pressed", "true");
  await expect(landscape).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByText("110% fit", { exact: true })).toBeVisible();
  await expect.poll(() => fixture.views).toEqual(expectedPortraitViews);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(fitWidth * 1.08);
  for (let step = 0; step < 7; step++) await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
  await expect(dialog.getByText("175% fit", { exact: true })).toBeVisible();
  const scroller = dialog.getByRole("region", { name: "Receipt image viewer. Scroll to inspect the receipt.", exact: true });
  await expect(scroller).toHaveCSS("scrollbar-gutter", "stable");
  await expectContainedImage(dialog);
  await expectKeyboardEdges(page, scroller);
  for (let turn = 0; turn < 4; turn++) {
    await dialog.getByRole("button", { name: "Rotate receipt clockwise", exact: true }).click();
    await expectContainedImage(dialog);
    await expectKeyboardEdges(page, scroller);
  }
  await dialog.getByRole("button", { name: "Fit receipt to viewer width", exact: true }).click();
  await expect(dialog.getByText("100% fit", { exact: true })).toBeVisible();
  await expect.poll(async () => Math.abs((await image.boundingBox())!.width - fitWidth)).toBeLessThan(1.1);
  expect(await scroller.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const detailsButton = dialog.getByRole("button", { name: "Details", exact: true });
  await detailsButton.click();
  const details = dialog.getByRole("region", { name: "Receipt and collection details", exact: true });
  await expect(dialog.getByRole("button", { name: "Hide details", exact: true })).toHaveAttribute("aria-controls", await details.getAttribute("id") as string);
  await expect(details).toContainText("Synthetic Viewer Customer");
  await details.focus();
  await expect(details).toBeFocused();
  await dialog.getByRole("button", { name: "Hide details", exact: true }).click();
  await expect(details).not.toBeVisible();
  await landscape.click();
  image = await expectImage(dialog, media[1]!.fileName);
  await expect(landscape).toHaveAttribute("aria-pressed", "true");
  await expect(portrait).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByText("Receipt 2 of 3", { exact: true })).toBeVisible();
  await expect(dialog.getByText("100% fit", { exact: true })).toBeVisible();
  expect((await image.boundingBox())!.width).toBeGreaterThan((await image.boundingBox())!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
  expect(fixture.views).toEqual([...expectedPortraitViews, "landscape"]);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

for (const width of [320, 393, 720, 1366]) test(`Receipt viewer PDF ${width}px has one open action and downloads original authenticated bytes`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width, height: 740 });
  const fixture = await installFixture(page, baseURL, { theme: width === 393 || width === 720 ? "dark" : "light" });
  const { launcher, dialog } = await openPreview(page);
  await expectImage(dialog);
  await dialog.getByRole("button", { name: `3 · ${media[2]!.fileName}`, exact: true }).click();
  const openPdf = dialog.getByRole("link", { name: "Open PDF", exact: true });
  await expect(openPdf).toHaveCount(1);
  await expect(openPdf).toHaveAttribute("href", /^blob:http:\/\/127\.0\.0\.1:/);
  await expect(openPdf).toHaveAttribute("target", "_blank");
  const download = dialog.getByRole("button", { name: "Download Original", exact: true });
  await expect(download).toHaveCount(1);
  await expect(download).toBeInViewport();
  await expect(openPdf).toBeInViewport();
  const footer = dialog.locator('[data-floating-ai-avoid="true"]').filter({ has: page.getByRole("link", { name: "Open PDF", exact: true }) });
  await footer.screenshot({ path: testInfo.outputPath("receipt-footer.png") });
  await expectPaddedActions(footer);
  const close = footer.getByRole("button", { name: "Close", exact: true });
  if (width <= 393) {
    const openBounds = (await openPdf.boundingBox())!;
    const downloadBounds = (await download.boundingBox())!;
    const closeBounds = (await close.boundingBox())!;
    expect(openBounds.y + openBounds.height).toBeLessThan(downloadBounds.y);
    expect(downloadBounds.y).toBeCloseTo(closeBounds.y, 0);
    expect(closeBounds.height).toBeGreaterThanOrEqual(44);
  }
  await expect(dialog.getByRole("group", { name: "Image controls", exact: true })).toHaveCount(0);
  if (width < 768) {
    await expect(dialog.getByText("PDF ready to open", { exact: true })).toBeVisible();
    await expect(dialog.locator("iframe")).toHaveCount(0);
  } else {
    await expect(dialog.locator('iframe[title="Receipt PDF Preview"]')).toHaveAttribute("src", /^blob:http:\/\/127\.0\.0\.1:/);
  }
  const downloadEvent = page.waitForEvent("download");
  await download.click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe("Synthetic_original_receipt.pdf");
  expect(await readFile((await downloaded.path())!)).toEqual(syntheticPdf());
  await expect.poll(() => fixture.downloads).toEqual(["pdf"]);
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`Desktop PDF actions stay inside the receipt frame in ${theme} mode`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installFixture(page, baseURL, { theme });
    const { dialog } = await openPreview(page);
    await expectImage(dialog);
    await dialog.getByRole("button", { name: `3 · ${media[2]!.fileName}`, exact: true }).click();
    const pdf = dialog.getByTitle("Receipt PDF Preview");
    const open = dialog.getByRole("link", { name: "Open PDF", exact: true });
    const download = dialog.getByRole("button", { name: "Download Original", exact: true });
    const footer = dialog.locator('[data-floating-ai-avoid="true"]').filter({ has: page.getByRole("link", { name: "Open PDF" }) });
    const close = footer.getByRole("button", { name: "Close", exact: true });
    const frame = dialog.locator(".receipt-preview-desktop-frame");
    await expect(pdf).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[1280, 720], [768, 320], [768, 480], [1024, 370], [1366, 768], [1920, 1080]] as const) {
      await page.setViewportSize({ width, height });
      for (const expanded of [false, true]) {
        const toggle = dialog.getByRole("button", { name: /^(?:Hide details|Details)$/ });
        if (await toggle.getAttribute("aria-expanded") !== String(expanded)) await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
        if (expanded) {
          const lastDetail = dialog.getByRole("region").getByText("SYNTHETIC-pdf", { exact: true });
          await lastDetail.scrollIntoViewIfNeeded();
          await expect(lastDetail).toBeInViewport({ ratio: 1 });
        }
        const box = (await dialog.boundingBox())!;
        const bounds = (await frame.boundingBox())!;
        const foot = (await footer.boundingBox())!;
        const paper = (await pdf.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(10);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 10);
        expect(bounds.y).toBeGreaterThanOrEqual(box.y);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(Math.min(height, box.y + box.height));
        expect(paper.height).toBeGreaterThanOrEqual(55);
        expect(paper.y + paper.height).toBeCloseTo(foot.y, 0);
        let previousRight = bounds.x;
        for (const action of [open, download, close]) {
          const button = (await action.boundingBox())!;
          expect(button.x - previousRight).toBeGreaterThanOrEqual(7);
          expect(bounds.x + bounds.width - button.x - button.width).toBeGreaterThanOrEqual(12);
          expect(button.y - foot.y).toBeGreaterThanOrEqual(10);
          expect(bounds.y + bounds.height - button.y - button.height).toBeGreaterThanOrEqual(10);
          await action.click({ trial: true });
          previousRight = button.x + button.width;
        }
        if ((width === 1280 && !expanded) || (width === 1024 && expanded)) {
          await page.screenshot({ path: testInfo.outputPath(`desktop-${width}x${height}.png`) });
        }
      }
    }
    await open.focus();
    await page.keyboard.press("Tab");
    await expect(download).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
  });
}

for (const failure of ["http", "decode"] as const) test(`Receipt viewer retries ${failure} failure with accessible status and clears stale preview`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 393, height: 600 });
  const fixture = await installFixture(page, baseURL, { firstFailure: failure, holdFirst: true });
  try {
    const { launcher, dialog } = await openPreview(page);
    await expect(dialog.getByRole("status").filter({ hasText: "Loading preview" })).toBeVisible();
    await expect(dialog.locator('[aria-busy="true"]')).not.toHaveCount(0);
    await expect(dialog.getByRole("img")).toHaveCount(0);
    fixture.release();
    await expect(dialog.getByRole("alert")).toContainText(failure === "http" ? "Synthetic receipt temporarily unavailable" : "could not be displayed");
    const retry = dialog.getByRole("button", { name: "Retry preview", exact: true });
    await expect(retry).toBeInViewport();
    await retry.click();
    await expectImage(dialog);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    expect(fixture.views).toEqual(["portrait", "portrait"]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
    expect(fixture.errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  } finally { fixture.release(); }
});

test("Receipt viewer development StrictMode restores media after replay and cleans up on unmount", async ({ page }) => {
  // Development React is bundled in memory and served on its own loopback
  // origin. Production assets, dotenv, the backend and the database are unused.
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const developmentRenderer = await build({
    absWorkingDir: repoRoot,
    stdin: {
      sourcefile: "receipt-strict-mode-regression.tsx",
      resolveDir: repoRoot,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { ReceiptPreviewContent } from "./client/src/pages/collection-records/ReceiptPreviewContent";
        async function mount() {
          const kind = new URLSearchParams(location.search).get("kind");
          const canvas = document.createElement("canvas");
          canvas.width = 240;
          canvas.height = 720;
          canvas.getContext("2d").fillRect(0, 0, 240, 720);
          const pdf = Uint8Array.from(atob(${JSON.stringify(syntheticPdf().toString("base64"))}), (character) => character.charCodeAt(0));
          const blob = kind === "image" ? await new Promise((resolve) => canvas.toBlob(resolve, "image/png")) : new Blob([pdf], { type: "application/pdf" });
          const source = URL.createObjectURL(blob);
          window.receiptStrictSource = source;
          const root = createRoot(document.getElementById("root"));
          window.unmountReceiptStrictPreview = () => root.unmount();
          root.render(React.createElement(React.StrictMode, null, React.createElement(ReceiptPreviewContent, {
            loading: false, error: "", safeSource: source, hasUnsafeSource: false,
            showPdfFallback: false, kind, isMobile: false, zoomValue: "1", rotationDegrees: 0,
            fileName: "Synthetic StrictMode receipt." + (kind === "image" ? "png" : "pdf"), selectedReceipt: null,
          })));
        }
        mount().catch((error) => console.error(error));
      `,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    tsconfig: "client/tsconfig.json",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://fixture.invalid").pathname;
    if (request.method !== "GET") return void response.writeHead(405).end();
    if (path === "/renderer.js") return void response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }).end(developmentRenderer.outputFiles[0]!.text);
    if (path !== "/") return void response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(`<!doctype html><html><head><style>html,body,#root,#root>div{height:100%;margin:0}.h-full{height:100%}.receipt-preview-image-scroller{height:100%;padding:12px}iframe{height:100%;width:100%}</style></head><body><div id="root"></div><script src="/renderer.js" defer></script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  expect(address && typeof address !== "string").toBeTruthy();
  const origin = `http://127.0.0.1:${(address as { port: number }).port}`;
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (isChromiumPdfViewerResource(url) || url.origin === origin) return route.continue();
    unexpected.push(route.request().url());
    return route.abort();
  });
  try {
    for (const kind of ["image", "pdf"] as const) {
      await page.goto(`${origin}/?kind=${kind}`);
      const mediaElement = page.locator(kind === "image" ? "img" : "iframe");
      await expect(mediaElement).toHaveAttribute("src", /^blob:http:\/\/127\.0\.0\.1:/);
      if (kind === "image") {
        await expect.poll(() => mediaElement.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(240);
        await expect(page.getByRole("status").filter({ hasText: "Loading receipt image" })).toHaveCount(0);
      } else {
        await expect(page.getByRole("status").filter({ hasText: "Opening PDF preview" })).toHaveCount(0);
      }
      const removed = await mediaElement.evaluate((element) => {
        (window as typeof window & { unmountReceiptStrictPreview: () => void }).unmountReceiptStrictPreview();
        return { connected: element.isConnected, source: element.getAttribute("src") };
      });
      expect(removed.connected).toBe(false);
      expect(removed.source).toBe(kind === "image" ? null : "about:blank");
    }
    expect(errors).toEqual([]);
    expect(unexpected).toEqual([]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});
