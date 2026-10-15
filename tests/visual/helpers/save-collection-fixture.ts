import { expect, type Page, type Route } from "@playwright/test";

// Static production frontend, synthetic HTTP and generated receipt bytes only.
export const now = "2026-10-10T08:00:00.000Z";
export const nickname = "Guidance Synthetic Collector";
export const draftKey = `save-collection-draft:${encodeURIComponent(nickname.toLowerCase())}:v2`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=", "base64");
export const draft = { batch: "P25", paymentDate: "2026-10-04", amount: "125", hadPendingReceipts: false, savedAt: now };

export async function installFixture(page: Page, baseURL: string | undefined, options: {
  theme?: "light" | "dark"; role?: "admin" | "user" | "superuser"; restore?: typeof draft;
  holdSave?: boolean; failFirst?: boolean; holdNicknameReload?: boolean;
  controlledClock?: boolean;
  additionalNickname?: string;
  aiEnabled?: boolean;
  onMatch?: (route: Route, index: number, fields: Record<string, string>) => Promise<void>;
  onSave?: (route: Route) => Promise<void>;
} = {}) {
  expect(baseURL).toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "admin";
  const fixture = {
    unexpected: [] as string[], errors: [] as string[], matches: 0, release: () => {},
    matchRequests: [] as Record<string, string>[],
    saves: [] as Array<{ fields: Record<string, string>; files: string[]; key: string; fingerprint: string }>,
  };
  const gate = new Promise<void>((resolve) => { fixture.release = resolve; });
  let nicknameReads = 0;
  const respond = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body, headers: { "Cache-Control": "no-store" } });
  if (options.controlledClock) {
    // Let bootstrap timers run naturally, then pause at `now` in the test before
    // entering identity fields. setFixedTime alone does not control debounce.
    await page.clock.install({ time: new Date(Date.parse(now) - 60_000) });
  } else {
    await page.clock.setFixedTime(new Date(now));
  }
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
    if (endpoint === "GET /api/health/connectivity") return route.fulfill({
      status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" },
    });
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
      systemName: "SQR", aiEnabled: options.aiEnabled ?? false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
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
      const nicknames = [{
        id: "guidance-nickname", nickname, isActive: true, roleScope: "both", createdBy: "guidance-admin", createdAt: now,
      }];
      if (options.additionalNickname) nicknames.push({
        id: "guidance-alternate", nickname: options.additionalNickname, isActive: true,
        roleScope: "both", createdBy: "guidance-admin", createdAt: now,
      });
      return respond(route, { ok: true, nicknames });
    }
    if (endpoint === "POST /api/collection/source-matches") {
      fixture.matches++;
      const fields = request.postDataJSON() as Record<string, string>;
      fixture.matchRequests.push(fields);
      if (options.onMatch) return options.onMatch(route, fixture.matches, fields);
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
      if (options.onSave) return options.onSave(route);
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

export async function openSave(page: Page) {
  await page.goto("/collection/save");
  await expect(page.locator("#save-collection-customer-name")).toBeVisible();
}
export async function fillIdentity(page: Page) {
  for (const [id, value] of Object.entries({
    "customer-name": "Synthetic Customer", "customer-ic-number": "000012345678",
    "customer-phone": "0123456789", "account-number": "000012340000",
  })) await page.locator(`#save-collection-${id}`).fill(value);
}
export async function addReceipt(page: Page) {
  await page.locator('input[name="collectionReceiptUpload"]').setInputFiles({ name: "Synthetic receipt.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("receipt-draft-card")).toHaveCount(1);
}
export function confirmation(page: Page) { return page.getByRole("alertdialog", { name: "Kosongkan borang?" }); }
export function reset(page: Page) { return page.getByRole("button", { name: "Reset Form", exact: true }); }
export async function readDraft(page: Page) { return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "null"), draftKey); }
export async function checkFixture(page: Page, fixture: Awaited<ReturnType<typeof installFixture>>) {
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
