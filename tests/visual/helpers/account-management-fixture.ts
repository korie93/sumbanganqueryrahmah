import { expect, type Page, type Route } from "@playwright/test";
import type { ManagedUser } from "../../../client/src/pages/settings/types";

// Fictional data and exact intercepted HTTP contracts on an isolated static
// loopback origin. No backend, database, real session, mail or account is used.
export type AccountFixtureRole = "superuser" | "admin" | "manager" | "user";
export const accountFixtureNow = "2026-10-15T08:00:00.000Z";
const expiry = "2036-01-01T00:00:00.000Z";

function makeAccount(index: number): ManagedUser {
  const username = index === 1 ? "maya.synthetic" : index === 2 ? "daniel.synthetic" : `synthetic.user.${String(index).padStart(2, "0")}`;
  return {
    id: `synthetic-managed-${index}`, username,
    fullName: index === 1 ? "Synthetic Maya Chen" : index === 2 ? "Synthetic Daniel Rahman" : `Synthetic Account ${index}`,
    email: `${username}@example.test`, role: index % 3 === 1 ? "admin" : index % 3 === 2 ? "manager" : "user",
    status: index === 2 ? "pending_activation" : index === 5 ? "suspended" : index === 6 ? "disabled" : "active",
    mustChangePassword: index === 7, passwordResetBySuperuser: index === 7,
    createdBy: "synthetic.operator", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: accountFixtureNow,
    activatedAt: index === 2 ? null : "2026-09-02T08:00:00.000Z", lastLoginAt: index === 2 ? null : accountFixtureNow,
    passwordChangedAt: index === 2 ? null : "2026-09-02T08:00:00.000Z", isBanned: index === 4,
    failedLoginAttempts: index === 3 ? 5 : 0, lockedAt: index === 3 ? accountFixtureNow : null,
    lockedReason: index === 3 ? "Synthetic repeated login failures" : null, lockedBySystem: index === 3,
  };
}

function currentUser(user: ManagedUser) {
  return {
    id: user.id, username: user.username, fullName: user.fullName, email: user.email,
    role: user.role, status: user.status, createdAt: user.createdAt, avatarUrl: null,
    mustChangePassword: user.mustChangePassword, passwordResetBySuperuser: user.passwordResetBySuperuser,
    isBanned: user.isBanned, twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorConfiguredAt: null,
    activatedAt: user.activatedAt, passwordChangedAt: user.passwordChangedAt, lastLoginAt: user.lastLoginAt,
  };
}

function pageOf<T>(rows: T[], url: URL, defaultPageSize = 50) {
  const pageSize = Number(url.searchParams.get("pageSize") || defaultPageSize);
  const page = Number(url.searchParams.get("page") || 1);
  expect(Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100).toBe(true);
  expect(Number.isInteger(page) && page > 0).toBe(true);
  const total = rows.length;
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function installAccountManagementFixture(page: Page, baseURL: string | undefined, options: {
  role?: AccountFixtureRole; theme?: "light" | "dark"; settings?: boolean; aiEnabled?: boolean;
} = {}) {
  expect(baseURL, "Use the existing isolated static built runner").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "superuser";
  const operator = { ...currentUser(makeAccount(70)), id: `synthetic-operator-${role}`,
    username: `synthetic.operator.${role}`, fullName: "Synthetic Account Operator", role, mustChangePassword: false };
  const users = Array.from({ length: 67 }, (_, index) => makeAccount(index + 1));
  const resets = [users[0]!, users[2]!].map((user, index) => ({
    id: `synthetic-reset-${index + 1}`, userId: user.id, username: user.username, fullName: user.fullName,
    email: user.email, role: user.role, status: user.status, isBanned: user.isBanned,
    requestedByUser: user.username, approvedBy: null, resetType: "user_request",
    createdAt: accountFixtureNow, expiresAt: null, usedAt: null,
  }));
  const held = new Map<string, Promise<void>>();
  const releases = new Set<() => void>();
  const fixture = {
    users, resets, requests: [] as string[], reads: [] as Array<{ path: string; query: Record<string, string> }>,
    writes: [] as Array<{ method: string; path: string; payload: unknown }>,
    unexpected: [] as string[], errors: [] as string[], consoleErrors: [] as string[],
    hold(endpoint: string) {
      let release = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      held.set(endpoint, gate);
      releases.add(release);
      return () => { held.delete(endpoint); releases.delete(release); release(); };
    },
    releaseAll() { for (const release of releases) release(); held.clear(); releases.clear(); },
  };
  await page.clock.setFixedTime(new Date(accountFixtureNow));
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript(({ theme, user, expiresAt }) => {
    localStorage.setItem("theme", theme);
    sessionStorage.setItem("sessionStoredAt", String(Date.now()));
    sessionStorage.setItem("sessionExpiresAt", String(Date.parse(expiresAt)));
    sessionStorage.setItem("username", user.username);
    sessionStorage.setItem("role", user.role);
    sessionStorage.setItem("user", JSON.stringify({ ...user, sessionExpiresAt: expiresAt }));
  }, { theme: options.theme ?? "light", user: operator, expiresAt: expiry });
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  const respond = (route: Route, json: unknown, status = 200) => route.fulfill({ status, json, headers: { "Cache-Control": "no-store" } });
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const endpoint = `${method} ${url.pathname}`;
    if (url.origin !== origin) {
      fixture.unexpected.push(`Off-origin ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (method === "GET" || method === "HEAD") return route.continue();
      fixture.unexpected.push(endpoint);
      return route.abort();
    }
    fixture.requests.push(endpoint);
    if (endpoint === "GET /api/health/connectivity") return route.fulfill({ status: 204, headers: { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" } });
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route, { maintenance: false, message: "Synthetic test available", type: "soft", startTime: null, endTime: null });
    if (endpoint === "GET /api/me") return respond(route, { ok: true, user: operator, sessionExpiresAt: expiry });
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: options.aiEnabled ?? false, semanticSearchEnabled: false, aiTimeoutMs: 30_000,
      heartbeatIntervalMinutes: 60, importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route, { role, tabs: {
      home: true, settings: options.settings ?? true, import: false, saved: false, viewer: false,
      "general-search": false, "collection-report": false, analysis: false, dashboard: false,
      monitor: false, activity: false, "audit-logs": false, backup: false, canViewSystemPerformance: false,
    } });
    if (endpoint === "GET /api/settings") return respond(route, { categories: [
      { id: "general", name: "General", description: "Synthetic general settings", settings: [] },
      { id: "security", name: "Security", description: "Synthetic administrative security", settings: [] },
    ] });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "GET /api/analytics/summary") return respond(route, {
      totalUsers: 67, activeSessions: 1, loginsToday: 1, totalDataRows: 0, totalImports: 0,
      bannedUsers: 1, collectionRecordVersionConflicts24h: 0, loginFailures24h: 0, backupActions24h: 0,
    });
    if (["GET /api/analytics/login-trends", "GET /api/analytics/top-users", "GET /api/analytics/recent-login-activity", "GET /api/analytics/peak-hours", "GET /api/analytics/role-distribution"].includes(endpoint)) return respond(route, []);
    if (endpoint === "GET /api/auth/two-factor") return respond(route, { ok: true, user: operator,
      twoFactor: { enabled: false, pendingSetup: false, configuredAt: null } });
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true, status: "ONLINE", lastActivityTime: accountFixtureNow });
    if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) return respond(route, { ok: true });
    if (url.pathname.startsWith("/api/admin/")) {
      // Role-denied tests must never reach these client APIs, even if a fixture
      // grants the broader Settings tab to a lower role.
      if (role !== "superuser") {
        fixture.unexpected.push(endpoint);
        return respond(route, { ok: false, message: "Synthetic forbidden operation" }, 403);
      }
      if (method === "GET") {
        fixture.reads.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
        const search = (url.searchParams.get("search") || "").toLowerCase();
        const status = url.searchParams.get("status") || "all";
        const matchesStatus = (user: ManagedUser) => status === "all" || (status === "banned" ? user.isBanned
          : status === "locked" ? Boolean(user.lockedAt) : user.status === status);
        if (url.pathname === "/api/admin/users") {
          expect([...url.searchParams.keys()].every((key) => ["page", "pageSize", "search", "role", "status"].includes(key))).toBe(true);
          const selectedRole = url.searchParams.get("role") || "all";
          const filtered = users.filter((user) => (selectedRole === "all" || user.role === selectedRole) && matchesStatus(user)
            && [user.username, user.fullName, user.email].some((value) => String(value || "").toLowerCase().includes(search)));
          const result = pageOf(filtered, url);
          return respond(route, { ok: true, users: result.rows, pagination: result.pagination });
        }
        if (url.pathname === "/api/admin/password-reset-requests") {
          expect([...url.searchParams.keys()].every((key) => ["page", "pageSize", "search", "status"].includes(key))).toBe(true);
          const result = pageOf(resets.filter((entry) => {
            const user = users.find((item) => item.id === entry.userId)!;
            return matchesStatus(user) && [entry.username, entry.fullName, entry.email].some((value) => String(value || "").toLowerCase().includes(search));
          }), url);
          return respond(route, { ok: true, requests: result.rows, pagination: result.pagination });
        }
        if (url.pathname === "/api/admin/dev-mail-outbox") {
          expect([...url.searchParams.keys()].every((key) => ["page", "pageSize", "searchEmail", "searchSubject", "sortDirection"].includes(key))).toBe(true);
          return respond(route, { ok: true, enabled: false, previews: [], pagination: pageOf([], url, 25).pagination });
        }
      } else {
        const target = /^\/api\/admin\/users\/([^/]+)(?:\/(role|status|reset-password|resend-activation))?$/.exec(url.pathname);
        if (endpoint === "POST /api/admin/users" || target && ["PATCH", "POST", "DELETE"].includes(method)) {
          expect([...url.searchParams.keys()]).toEqual([]);
          const payload = request.postData() ? request.postDataJSON() : null;
          fixture.writes.push({ method, path: url.pathname, payload });
          const gate = held.get(endpoint);
          if (gate) await gate;
          if (endpoint === "POST /api/admin/users") {
            expect(Object.keys(payload).sort()).toEqual(["email", "fullName", "role", "username"]);
            expect(["user", "manager", "admin"]).toContain(payload.role);
            const user = { ...makeAccount(users.length + 1), ...payload, status: "pending_activation", activatedAt: null, lastLoginAt: null } as ManagedUser;
            users.push(user);
            return respond(route, { ok: true, user: currentUser(user), activation: delivery(user.email!) });
          }
          const user = users.find((item) => item.id === decodeURIComponent(target![1]!));
          expect(user, "Mutation target must be a known fictional account").toBeTruthy();
          if (method === "PATCH" && !target![2]) {
            expect(Object.keys(payload).every((key) => ["username", "fullName", "email"].includes(key))).toBe(true);
            Object.assign(user!, payload);
            return respond(route, { ok: true, user: currentUser(user!) });
          }
          if (method === "PATCH" && target![2] === "role") {
            expect(Object.keys(payload)).toEqual(["role"]);
            expect(["user", "manager", "admin"]).toContain(payload.role);
            user!.role = payload.role;
            return respond(route, { ok: true, user: currentUser(user!), forceLogout: false });
          }
          if (method === "PATCH" && target![2] === "status") {
            expect(Object.keys(payload).every((key) => ["status", "isBanned"].includes(key))).toBe(true);
            Object.assign(user!, payload);
            return respond(route, { ok: true, user: currentUser(user!), forceLogout: false });
          }
          if (method === "DELETE" && !target![2]) {
            expect(payload).toBeNull();
            users.splice(users.indexOf(user!), 1);
            return respond(route, { ok: true, user: currentUser(user!), deleted: true });
          }
          if (method === "POST" && target![2] === "reset-password") {
            expect(payload).toBeNull();
            return respond(route, { ok: true, user: currentUser(user!), forceLogout: false, reset: delivery(user!.email!) });
          }
          if (method === "POST" && target![2] === "resend-activation") {
            expect(payload).toBeNull();
            expect(user!.status).toBe("pending_activation");
            expect(user!.isBanned).toBe(false);
            return respond(route, { ok: true, user: currentUser(user!), activation: delivery(user!.email!) });
          }
        }
      }
    }
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected synthetic request" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") fixture.consoleErrors.push(message.text());
  });
  return fixture;
}

function delivery(recipientEmail: string) {
  return { deliveryMode: "smtp", errorCode: null, errorMessage: null,
    expiresAt: "2026-10-16T08:00:00.000Z", previewUrl: null, recipientEmail, sent: true };
}

export function accountWorkspace(page: Page) { return page.getByTestId("account-management-workspace"); }
export function managedAccounts(page: Page) { return page.getByRole("region", { name: "Managed accounts", exact: true }); }
export function accountRow(page: Page, username = "maya.synthetic") {
  return managedAccounts(page).locator('[role="group"], tr').filter({ has: page.getByRole("button", { name: `Details for ${username}`, exact: true }) });
}
export async function openAccountManagement(page: Page) {
  await page.goto("/settings?section=account-management");
  await expect(accountWorkspace(page)).toBeVisible();
  await expect(accountRow(page)).toBeVisible();
}
export async function selectAccountSection(page: Page, name: string) {
  await page.getByRole("navigation", { name: "User Account Management", exact: true })
    .getByRole("button", { name: new RegExp(`^${name}(?:\\s|$)`) }).click();
}
export async function assertAccountFixtureClean(page: Page, fixture: Awaited<ReturnType<typeof installAccountManagementFixture>>) {
  expect(fixture.unexpected).toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(fixture.consoleErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(fixture.writes.every((entry) => !entry.path.includes("password-reset-requests") && !entry.path.includes("dev-mail-outbox"))).toBe(true);
}
