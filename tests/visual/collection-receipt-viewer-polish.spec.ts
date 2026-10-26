import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { isChromiumPdfViewerResource } from "./helpers/chromium-pdf-resources";

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
    paymentDate: "2026-10-14", amount: "125.00", receiptFile: null,
    receipts: media.map((entry, index) => ({
      id: entry.id, collectionRecordId: recordId, storagePath: `/synthetic/${entry.id}`,
      originalFileName: entry.fileName, originalMimeType: entry.mimeType, originalExtension: entry.id === "pdf" ? ".pdf" : ".png",
      fileSize: files[index]!.length, receiptAmount: "125.00", extractedAmount: null, extractionStatus: "unprocessed",
      extractionConfidence: null, receiptDate: "2026-10-14", receiptReference: `SYNTHETIC-${entry.id}`, fileHash: null, createdAt: now,
    })),
    archivedReceipts: [], receiptTotalAmount: "375.00", receiptValidationStatus: "unverified", receiptValidationMessage: null,
    receiptCount: media.length, duplicateReceiptFlag: false, createdByLogin: "synthetic.viewer", collectionStaffNickname: nickname,
    createdAt: now, updatedAt: now, sourceImportId: "synthetic-source", sourceFilename: "Synthetic source.xlsx",
    totalDue: "150.00", billingPrincipalOsp: "125.00", cpStatus: "cp", agingBucket: "D3",
  };
  const fixture = { errors: [] as string[], unexpected: [] as string[], views: [] as string[], downloads: [] as string[], release: () => {} };
  const gate = new Promise<void>((resolve) => { fixture.release = resolve; });
  const respond = (route: Route, json: unknown, status = 200) => route.fulfill({ status, json, headers: { "Cache-Control": "no-store" } });
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ theme, staff, fixtureOrigin }) => {
    // Init scripts also run in the native PDF frame. Seed only this app's
    // synthetic loopback origin, never browser-owned or unrelated documents.
    if (window !== window.top || location.origin !== fixtureOrigin) return;
    localStorage.setItem("theme", theme);
    sessionStorage.setItem("collection_staff_nickname", staff);
    sessionStorage.setItem("collection_staff_nickname_auth", "1");
  }, { theme: options.theme ?? "light", staff: nickname, fixtureOrigin: origin });
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
      role: "admin", status: "active", mustChangePassword: false, passwordResetBySuperuser: false, isBanned: false,
      twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorConfiguredAt: null, activatedAt: now, passwordChangedAt: now, lastLoginAt: now,
    } });
    if (endpoint === "GET /api/app-config") return respond(route, { systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30000, heartbeatIntervalMinutes: 60, importUploadLimitBytes: 10485760, searchResultLimit: 250, semanticSearchEnabled: false, sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10 });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route, { role: "admin", tabs: { home: true, "collection-report": true } });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: { page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true, status: "ONLINE", lastActivityTime: now });
    if (endpoint === "GET /api/collection/nickname-auth/session") return respond(route, { ok: true, nickname: { id: "synthetic-viewer-nickname", nickname } });
    if (endpoint === "GET /api/collection/nicknames") return respond(route, { ok: true, nicknames: [{ id: "synthetic-viewer-nickname", nickname, isActive: true, roleScope: "both", createdBy: "synthetic-viewer-admin", createdAt: now }] });
    if (endpoint === "GET /api/collection/list") return respond(route, { ok: true, records: [record], total: 1, totalAmount: 125, page: 1, pageSize: 50, limit: 50, offset: 0, nextCursor: null, pagination: { mode: "hybrid", page: 1, pageSize: 50, limit: 50, offset: 0, total: 1, totalPages: 1, nextCursor: null, hasNextPage: false, hasPreviousPage: false } });
    if (endpoint === "GET /api/collection/source-configs") return respond(route, { ok: true, sourceConfigs: [] });
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
  const fixture = await installFixture(page, baseURL, { theme });
  const expectedPortraitViews = viewport.width < 768 ? ["portrait", "portrait"] : ["portrait"];
  const { launcher, dialog } = await openPreview(page);
  let image = await expectImage(dialog);
  const fitWidth = (await image.boundingBox())!.width;
  await expect(dialog.getByText("Receipt 1 of 3", { exact: true })).toBeVisible();
  const portrait = dialog.getByRole("button", { name: `Receipt 1: ${media[0]!.fileName}`, exact: true });
  const landscape = dialog.getByRole("button", { name: `Receipt 2: ${media[1]!.fileName}`, exact: true });
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

for (const width of [320, 393, 1366]) test(`Receipt viewer PDF ${width}px has one open action and downloads original authenticated bytes`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 740 });
  const fixture = await installFixture(page, baseURL);
  const { launcher, dialog } = await openPreview(page);
  await expectImage(dialog);
  await dialog.getByRole("button", { name: `Receipt 3: ${media[2]!.fileName}`, exact: true }).click();
  const openPdf = dialog.getByRole("link", { name: "Open PDF", exact: true });
  await expect(openPdf).toHaveCount(1);
  await expect(openPdf).toHaveAttribute("href", /^blob:http:\/\/127\.0\.0\.1:/);
  await expect(openPdf).toHaveAttribute("target", "_blank");
  const download = dialog.getByRole("button", { name: "Download Original", exact: true });
  await expect(download).toHaveCount(1);
  await expect(download).toBeInViewport();
  await expect(openPdf).toBeInViewport();
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
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

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
