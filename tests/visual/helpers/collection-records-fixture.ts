import { expect, type Page, type Route } from "@playwright/test";

export const now = "2026-10-05T08:00:00.000Z";
export const nickname = "Synthetic Collector";
export const filterSourceName = "Synthetic source with a deliberately long name for compact filter labels and narrow screens.xlsx";
// A tiny generated fixture image; receipt tests never read receipt files.
export const receiptPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=", "base64");

function syntheticRecord(index: number, receiptCount = 0, id = `polish-record-${index + 1}`) {
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
    createdAt: now, updatedAt: now, sourceImportId: "polish-source", sourceFilename: "Synthetic source with long descriptive name.xlsx",
    totalDue: "1500.00", billingPrincipalOsp: "1000.00", cpStatus: "cp", agingBucket: "D3",
  };
}

export async function installFixture(page: Page, baseURL: string | undefined, options: {
  count?: number; role?: "admin" | "manager" | "superuser" | "user"; theme?: "light" | "dark";
  loading?: boolean; receipts?: number; paginate?: boolean; receiptFileName?: string;
  holdSave?: boolean; saveOutcome?: "failure" | "conflict"; filterSources?: boolean;
  recordId?: (index: number) => string;
  recordOverrides?: Partial<ReturnType<typeof syntheticRecord>>;
} = {}) {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "admin";
  const records = Array.from({ length: options.count ?? 20 }, (_, index) => ({
    ...syntheticRecord(index, options.receipts, options.recordId?.(index)),
    ...(options.filterSources && index > 0 ? { sourceImportId: "other-synthetic-source" } : {}),
    ...options.recordOverrides,
  }));
  if (options.receiptFileName) for (const record of records) for (const receipt of record.receipts) {
    receipt.originalFileName = options.receiptFileName;
  }
  const fixture = {
    unexpected: [] as string[], errors: [] as string[], receiptViews: [] as string[], saves: 0,
    listRequests: [] as string[], offlineDetailViews: [] as string[], failLists: false,
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
    if (endpoint === "GET /api/health/connectivity") return route.fulfill({
      status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" },
    });
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
      fixture.listRequests.push(url.search);
      if (fixture.failLists) return respond(route, {
        ok: false, code: "INTERNAL_ERROR", message: "Synthetic records unavailable.",
      }, 500);
      if (options.loading) await gate;
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const aging = (url.searchParams.get("agingBuckets") ?? "").split(",").filter(Boolean);
      const sources = (url.searchParams.get("sourceImportIds") ?? "").split(",").filter(Boolean);
      const classifications = (url.searchParams.get("classifications") ?? "").split(",").filter(Boolean);
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      const matching = records.filter((record) => record.customerName.toLowerCase().includes(search)
        && (!aging.length || aging.includes(record.agingBucket))
        && (!sources.length || sources.includes(record.sourceImportId))
        && (!classifications.length || classifications.includes(record.cpStatus))
        && (!from || record.paymentDate >= from)
        && (!to || record.paymentDate <= to));
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
    const offlineRecord = role === "superuser" && records.find((record) =>
      endpoint === `GET /api/collection/export-selected-offline/records/${record.id}`);
    if (offlineRecord) {
      fixture.offlineDetailViews.push(offlineRecord.id);
      return respond(route, { ok: true, record: offlineRecord });
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
    if (endpoint === "GET /api/collection/source-configs") return respond(route, { ok: true, sourceConfigs: options.filterSources ? [{
      sourceImportId: "polish-source", sourceImportName: filterSourceName, sourceFilename: filterSourceName,
      rowCount: records.length, validFrom: "2026-10-01", validTo: "2026-10-31", cycleKey: "2026-10",
      enabled: true, compatibilityStatus: "compatible", compatibilityIssues: [], indexedRowCount: records.length,
      configuredBy: "polish.admin", configuredAt: now, updatedAt: now, status: "active",
    }] : [] });
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

export async function openRecords(page: Page) {
  await page.goto("/collection/records");
  await expect(page.getByTestId("collection-records-page")).toBeVisible();
}
