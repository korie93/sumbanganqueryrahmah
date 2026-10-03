import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Production React routes with explicit synthetic HTTP contracts only. These
// tests verify UI behavior; backend upload/authorization tests cover enforcement.
type Role = "superuser" | "manager" | "admin" | "user";
type Theme = "light" | "dark";
const now = "2026-10-03T08:00:00.000Z";
const fixturePassword = "Synthetic-current-password-123!";
const nextPassword = "Synthetic-new-password-456!";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
const avatarUrl = "/api/me/avatar?v=1234567890abcdef12345678";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const viewports = [
  { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 768, height: 1024 },
  { width: 430, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 800 },
];
test.use({ serviceWorkers: "block" });

async function installPersonalFixture(page: Page, baseURL: string | undefined, options: {
  role?: Role; theme?: Theme; settings?: boolean; longIdentity?: boolean; mustChangePassword?: boolean;
  holdSessionValidation?: boolean; holdAvatarSave?: boolean; sessionValidationTwoFactorEnabled?: boolean;
} = {}) {
  expect(baseURL, "Use the isolated static build runner").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  expect(new URL(origin).protocol).toBe("http:");
  expect(new URL(origin).port).not.toBe("");
  const role = options.role ?? "admin";
  const user = {
    id: `personal-${role}-fixture`, username: options.longIdentity ? "long.personal.account.fixture.username" : `personal.${role}`,
    fullName: "Personal Account Fixture", email: options.longIdentity
      ? "long.personal.account.fixture.address@department.example.test" : "personal@example.test",
    role, createdAt: "2026-02-15T04:05:00.000Z", avatarUrl: null as string | null,
    status: "active", mustChangePassword: options.mustChangePassword ?? false,
    passwordResetBySuperuser: false, isBanned: false, twoFactorEnabled: false,
    twoFactorPendingSetup: false, twoFactorConfiguredAt: null as string | null,
    activatedAt: "2026-02-15T04:05:00.000Z", passwordChangedAt: now, lastLoginAt: now,
  };
  const fixture = {
    user, requests: [] as string[], unexpected: [] as string[], errors: [] as string[], consoleErrors: [] as string[],
    expectedHttpErrors: new Set<string>(), loggedOut: false, logoutCalls: 0,
    avatarCalls: 0, rejectAvatar: false, passwordCalls: 0, setupCalls: 0, enableCalls: 0, disableCalls: 0,
    meCalls: 0, sessionValidationReleased: false, releaseSessionValidation: () => {},
    releaseAvatarSave: () => {},
  };
  let releaseSessionValidation: () => void = () => {};
  const sessionValidationGate = new Promise<void>((resolve) => { releaseSessionValidation = resolve; });
  fixture.releaseSessionValidation = releaseSessionValidation;
  let releaseAvatarSave: () => void = () => {};
  const avatarSaveGate = new Promise<void>((resolve) => { releaseAvatarSave = resolve; });
  fixture.releaseAvatarSave = releaseAvatarSave;
  const respond = (route: Route, body: unknown, status = 200) => {
    if (status >= 400) fixture.expectedHttpErrors.add(`${status} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status, json: body, headers: { "Cache-Control": "no-store" } });
  };
  const failure = (route: Route, code: string, message: string) => respond(route,
    { ok: false, code, message, error: { code, message } }, 400);
  const tabs = { home: true, import: false, saved: false, viewer: false, "general-search": false,
    "collection-report": false, analysis: false, dashboard: false, monitor: false, activity: false,
    "audit-logs": false, backup: false, settings: options.settings ?? true, canViewSystemPerformance: false };
  await page.clock.setFixedTime(new Date(now));
  await page.emulateMedia({ colorScheme: options.theme ?? "light", reducedMotion: "reduce" });
  await page.context().addCookies([{ name: "sqr_auth_hint", value: "1", url: origin }]);
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), options.theme ?? "light");
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
      fixture.unexpected.push(`Unexpected static ${request.method()} ${url.pathname}`);
      return route.abort();
    }
    const endpoint = `${request.method()} ${url.pathname}`;
    fixture.requests.push(endpoint);
    if (endpoint === "GET /api/health") return respond(route, { status: "ok", ready: true });
    if (endpoint === "GET /api/maintenance-status") return respond(route,
      { maintenance: false, message: "Fixture available", type: "soft", startTime: null, endTime: null });
    if (endpoint === "GET /api/me") {
      fixture.meCalls++;
      if (fixture.loggedOut) return respond(route, { ok: false, message: "Synthetic session ended" }, 401);
      // Capture the authoritative response when the request starts, not after
      // the gate releases: an old request must remain stale after avatar save.
      const snapshot = { ...user };
      if (fixture.meCalls === 2 && options.sessionValidationTwoFactorEnabled) {
        snapshot.twoFactorEnabled = true;
        snapshot.twoFactorConfiguredAt = now;
      }
      if (options.holdSessionValidation && fixture.meCalls === 2) {
        await sessionValidationGate;
        await respond(route, { ok: true, user: snapshot, sessionExpiresAt: "2036-01-01T00:00:00.000Z" });
        fixture.sessionValidationReleased = true;
        return;
      }
      return respond(route, { ok: true, user: snapshot, sessionExpiresAt: "2036-01-01T00:00:00.000Z" });
    }
    if (endpoint === "GET /api/app-config") return respond(route, {
      systemName: "SQR", aiEnabled: false, aiTimeoutMs: 30_000, heartbeatIntervalMinutes: 60,
      importUploadLimitBytes: 10 * 1024 * 1024, searchResultLimit: 250, semanticSearchEnabled: false,
      sessionTimeoutMinutes: 30, viewerRowsPerPage: 100, wsIdleMinutes: 10,
    });
    if (endpoint === "GET /api/settings/tab-visibility") return respond(route, { role, tabs });
    if (endpoint === "GET /api/imports") return respond(route, { imports: [], pagination: {
      page: 1, pageSize: 20, limit: 20, mode: "offset", offset: 0, total: 0,
      totalPages: 1, hasNextPage: false, hasPreviousPage: false,
    } });
    if (endpoint === "GET /api/settings") {
      expect(role === "superuser" || role === "admin" && tabs.settings).toBe(true);
      return respond(route, { categories: [
        { id: "general", name: "General", description: "System configuration", settings: [] },
        { id: "security", name: "Security", description: "System security policy", settings: [] },
      ] });
    }
    if (endpoint === "GET /api/auth/two-factor") {
      expect(["admin", "superuser"]).toContain(role);
      return respond(route, { ok: true, user, twoFactor: { enabled: user.twoFactorEnabled,
        pendingSetup: user.twoFactorPendingSetup, configuredAt: user.twoFactorConfiguredAt } });
    }
    if (endpoint === "PUT /api/me/avatar") {
      fixture.avatarCalls++;
      expect([...url.searchParams.keys()]).toEqual([]);
      expect(request.postDataJSON()).toEqual({ fileName: "portrait.png", mimeType: "image/png", contentBase64: png.toString("base64") });
      if (options.holdAvatarSave) await avatarSaveGate;
      if (fixture.rejectAvatar) return failure(route, "REQUEST_BODY_INVALID", "The image could not be saved. Please choose another image.");
      user.avatarUrl = avatarUrl;
      return respond(route, { ok: true, user });
    }
    if (endpoint === "GET /api/me/avatar") {
      expect([...url.searchParams.keys()].every((key) => key === "v")).toBe(true);
      return route.fulfill({ body: png, contentType: "image/png", headers: { "Cache-Control": "no-store" } });
    }
    if (endpoint === "POST /api/auth/change-password") {
      fixture.passwordCalls++;
      const payload = request.postDataJSON();
      expect(Object.keys(payload).sort()).toEqual(["currentPassword", "newPassword"]);
      expect(payload.newPassword).toBe(nextPassword);
      if (payload.currentPassword !== fixturePassword) return failure(route, "INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
      fixture.loggedOut = true;
      return respond(route, { ok: true, user, forceLogout: true });
    }
    if (endpoint === "POST /api/auth/two-factor/setup") {
      expect(["admin", "superuser"]).toContain(role);
      fixture.setupCalls++;
      expect(request.postDataJSON()).toEqual({ currentPassword: fixturePassword });
      user.twoFactorPendingSetup = true;
      return respond(route, { ok: true, user, setup: {
        accountName: user.username, issuer: "SQR", secret: "JBSWY3DPEHPK3PXP",
        otpauthUrl: `otpauth://totp/SQR:${user.username}?secret=JBSWY3DPEHPK3PXP&issuer=SQR&algorithm=SHA1&digits=6&period=30`,
        algorithm: "SHA1", digits: 6, period: 30, expiresAt: "2026-10-03T08:10:00.000Z",
      } });
    }
    if (endpoint === "POST /api/auth/two-factor/enable") {
      fixture.enableCalls++;
      const payload = request.postDataJSON();
      expect(Object.keys(payload)).toEqual(["code"]);
      if (payload.code !== "345678") return failure(route, "TWO_FACTOR_INVALID_CODE", "Kod pengesah tidak sah.");
      user.twoFactorEnabled = true;
      user.twoFactorPendingSetup = false;
      user.twoFactorConfiguredAt = now;
      return respond(route, { ok: true, user });
    }
    if (endpoint === "POST /api/auth/two-factor/disable") {
      fixture.disableCalls++;
      expect(request.postDataJSON()).toEqual({ currentPassword: fixturePassword, code: "456789" });
      user.twoFactorEnabled = false;
      user.twoFactorPendingSetup = false;
      user.twoFactorConfiguredAt = null;
      return respond(route, { ok: true, user });
    }
    if (endpoint === "POST /api/activity/logout") {
      fixture.logoutCalls++;
      fixture.loggedOut = true;
      return route.fulfill({ json: { ok: true, success: true }, headers: { "Set-Cookie": "sqr_auth_hint=; Max-Age=0; Path=/" } });
    }
    if (endpoint === "POST /api/activity/heartbeat") return respond(route, { ok: true, status: "ONLINE", lastActivityTime: now });
    if (endpoint === "POST /api/telemetry/client-errors" || endpoint === "POST /api/telemetry/web-vitals") return respond(route, { ok: true });
    fixture.unexpected.push(endpoint);
    return respond(route, { ok: false, message: "Unexpected personal fixture API" }, 404);
  });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const status = /^Failed to load resource: the server responded with a status of (\d{3})\b/.exec(message.text())?.[1];
    const url = message.location().url ? new URL(message.location().url, origin) : null;
    if (url?.origin === origin && fixture.expectedHttpErrors.has(`${status} ${url.pathname}`)) return;
    fixture.consoleErrors.push(`${message.text()} (${message.location().url})`);
  });
  return fixture;
}

function clean(fixture: Awaited<ReturnType<typeof installPersonalFixture>>) {
  expect(fixture.unexpected, "Only explicit synthetic API contracts are used").toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(fixture.consoleErrors).toEqual([]);
}

async function openPage(page: Page, path: string, heading: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
  await expect(page.locator("html.app-ready")).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

async function profile(page: Page) {
  const desktop = page.getByTestId("button-user-menu");
  const mobile = page.getByTestId("button-user-menu-mobile");
  if (await desktop.isVisible()) { await desktop.click(); return desktop; }
  if (!(await mobile.isVisible())) await page.getByTestId("button-open-mobile-nav").click();
  await mobile.click();
  return mobile;
}

async function noOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll("main input, main button, .workspace-profile-menu")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
    }).map((element) => element.id || element.getAttribute("data-testid") || element.tagName),
  }));
  expect(geometry.scroll, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.clipped).toEqual([]);
}

async function accessible(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: (root: Document, options: { resultTypes: string[] }) => Promise<{
      violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[]; failureSummary?: string }> }>;
    }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter((entry) => entry.impact === "serious" || entry.impact === "critical")
      .map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })) }));
  });
  expect(violations, "No serious or critical defects in personal pages").toEqual([]);
}

for (const [role, allowed] of [["superuser", true], ["admin", true], ["admin", false], ["manager", true], ["user", true]] as const) {
  test(`Personal profile ${role}, Settings grant ${allowed}, keeps real role policy`, async ({ page, baseURL }) => {
    const fixture = await installPersonalFixture(page, baseURL, { role, settings: allowed });
    await openPage(page, "/account", "Account");
    const trigger = await profile(page);
    const menu = page.locator(".workspace-profile-menu");
    const settingsAllowed = role === "superuser" || role === "admin" && allowed;
    await expect(menu.getByRole("menuitem")).toHaveText(settingsAllowed
      ? ["Account", "Security", "Settings", "Logout"] : ["Account", "Security", "Logout"]);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(menu).toBeHidden();
    await profile(page);
    await page.getByRole("menuitem", { name: "Security", exact: true }).click();
    await expect(page).toHaveURL(/\/security$/);
    await expect(page.getByRole("heading", { level: 1, name: "Security", exact: true })).toBeVisible();
    await expect(page.getByTestId("security-change-password")).toBeVisible();
    await expect(page.getByTestId("two-factor-settings")).toHaveCount(role === "admin" || role === "superuser" ? 1 : 0);
    expect(fixture.requests).not.toContain("GET /api/settings");
    clean(fixture);
  });
}

for (const theme of ["light", "dark"] as Theme[]) for (const viewport of viewports) {
  test(`Personal Account and Security ${theme} at ${viewport.width} stay readable and unclipped`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    const fixture = await installPersonalFixture(page, baseURL, { theme, longIdentity: true });
    await openPage(page, "/account", "Account");
    await expect(page.getByTestId("account-username")).toHaveText(fixture.user.username);
    await expect(page.getByTestId("account-email")).toHaveText(fixture.user.email);
    await expect(page.getByTestId("account-created-at")).toContainText("2026");
    await expect(page.locator("main input:not([type=file]), main textarea, main [contenteditable=true]")).toHaveCount(0);
    await noOverflow(page);
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("account.png"), animations: "disabled" });
    await profile(page);
    await noOverflow(page);
    await page.screenshot({ path: test.info().outputPath("profile.png"), animations: "disabled" });
    await page.getByRole("menuitem", { name: "Security", exact: true }).click();
    await expect(page).toHaveURL(/\/security$/);
    await page.getByTestId("security-change-password").click();
    await expect(page.locator("#my-account-current-password")).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: /logout|sign out/i })).toHaveCount(0);
    await noOverflow(page);
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("security-password.png"), animations: "disabled" });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByTestId("two-factor-settings").getByRole("button", { name: "Aktifkan 2FA", exact: true }).click();
    await page.locator("#my-account-two-factor-password").fill(fixturePassword);
    await page.getByRole("button", { name: "Teruskan ke kod QR", exact: true }).click();
    await expect(page.getByTestId("two-factor-qr")).toBeVisible();
    await noOverflow(page);
    await accessible(page);
    await page.screenshot({ path: test.info().outputPath("security-setup.png"), animations: "disabled",
      mask: [page.getByTestId("two-factor-qr")] });
    clean(fixture);
  });
}

for (const role of ["superuser", "manager", "admin", "user"] as const) test(`Personal ${role} avatar is self-only and synchronizes current-user displays`, async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL, { role });
  await openPage(page, "/account?userId=another-account", "Account");
  await expect(page.getByTestId("account-username")).toHaveText(fixture.user.username);
  const picker = page.getByTestId("avatar-input");
  await picker.setInputFiles({ name: "not-an-image.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.locator("main [role=alert]")).toBeVisible();
  expect(fixture.avatarCalls).toBe(0);
  await picker.setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("avatar-preview")).toBeVisible();
  fixture.rejectAvatar = true;
  await page.getByTestId("avatar-save").click();
  await expect(page.locator("main [role=alert]")).toContainText("could not be saved");
  expect(fixture.avatarCalls).toBe(1);
  fixture.rejectAvatar = false;
  await page.getByTestId("avatar-save").click();
  await expect.poll(() => fixture.avatarCalls).toBe(2);
  const updatedImages = page.locator(`img[src="${avatarUrl}"]`);
  await expect.poll(() => updatedImages.count()).toBeGreaterThanOrEqual(2);
  await profile(page);
  await expect.poll(() => updatedImages.count()).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("account-username")).toHaveText(fixture.user.username);
  await expect.poll(() => updatedImages.count()).toBeGreaterThanOrEqual(2);
  expect(fixture.requests.some((request) => /credentials|\/users\//.test(request))).toBe(false);
  clean(fixture);
});

test("Personal avatar survives an older in-flight session validation response", async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL, { role: "user", holdSessionValidation: true });
  try {
    await openPage(page, "/account", "Account");
    await expect.poll(() => fixture.meCalls).toBe(2);
    await page.getByTestId("avatar-input").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
    await page.getByTestId("avatar-save").click();
    await expect(page.locator("main [role=status]")).toHaveText("Profile picture updated.");
    await expect.poll(() => page.locator(`img[src="${avatarUrl}"]`).count()).toBeGreaterThanOrEqual(2);
    fixture.releaseSessionValidation();
    await expect.poll(() => fixture.sessionValidationReleased).toBe(true);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("user") || "{}").avatarUrl)).toBe(avatarUrl);
    await expect.poll(() => page.locator(`img[src="${avatarUrl}"]`).count()).toBeGreaterThanOrEqual(2);
    await profile(page);
    await expect.poll(() => page.locator(`img[src="${avatarUrl}"]`).count()).toBeGreaterThanOrEqual(3);
    expect(fixture.avatarCalls).toBe(1);
    clean(fixture);
  } finally { fixture.releaseSessionValidation(); }
});

for (const order of ["session-first", "avatar-first"] as const) test(`Personal avatar preserves unrelated refreshed 2FA with ${order} response order`, async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL, {
    holdSessionValidation: true, holdAvatarSave: true, sessionValidationTwoFactorEnabled: true,
  });
  try {
    await openPage(page, "/account", "Account");
    await expect.poll(() => fixture.meCalls).toBe(2);
    await page.getByTestId("avatar-input").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
    await page.getByTestId("avatar-save").click();
    await expect.poll(() => fixture.avatarCalls).toBe(1);
    if (order === "session-first") {
      fixture.releaseSessionValidation();
      await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("user") || "{}").twoFactorEnabled)).toBe(true);
      fixture.releaseAvatarSave();
    } else {
      fixture.releaseAvatarSave();
      await expect(page.locator("main [role=status]")).toHaveText("Profile picture updated.");
      fixture.releaseSessionValidation();
    }
    await expect(page.locator("main [role=status]")).toHaveText("Profile picture updated.");
    await expect.poll(() => fixture.sessionValidationReleased).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const user = JSON.parse(sessionStorage.getItem("user") || "{}");
      return { avatarUrl: user.avatarUrl, twoFactorEnabled: user.twoFactorEnabled };
    })).toEqual({ avatarUrl, twoFactorEnabled: true });
    await profile(page);
    await page.getByRole("menuitem", { name: "Security", exact: true }).click();
    await expect(page.getByTestId("two-factor-settings")).toHaveAttribute("data-two-factor-state", "active");
    clean(fixture);
  } finally { fixture.releaseAvatarSave(); fixture.releaseSessionValidation(); }
});

test("Personal avatar saving locks input and prevents duplicate writes", async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL, { role: "user", holdAvatarSave: true });
  try {
    await openPage(page, "/account", "Account");
    const picker = page.getByTestId("avatar-input");
    await picker.setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
    const save = page.getByTestId("avatar-save");
    // Two synchronous DOM activations exercise the pre-render request lock.
    await save.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await expect.poll(() => fixture.avatarCalls).toBe(1);
    await expect(save).toBeDisabled();
    await expect(save).toHaveText("Saving…");
    await expect(picker).toBeDisabled();
    await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await expect(page.locator("section[aria-labelledby=account-photo-title]")).toHaveAttribute("aria-busy", "true");
    fixture.releaseAvatarSave();
    await expect(page.locator("main [role=status]")).toHaveText("Profile picture updated.");
    await expect(save).toHaveCount(0);
    await expect(picker).toBeEnabled();
    expect(fixture.avatarCalls).toBe(1);
    clean(fixture);
  } finally { fixture.releaseAvatarSave(); }
});

test("Personal collapsed profile settles before positioning, closes outside, and keeps Logout out of command search", async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL, { role: "user" });
  await openPage(page, "/account", "Account");
  const toggle = page.getByTestId("button-toggle-sidebar");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await profile(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator(".workspace-profile-menu");
  await expect(menu).toBeVisible();
  const sidebarBox = await page.locator("aside.workspace-sidebar").boundingBox();
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width);
  await noOverflow(page);
  await page.mouse.click(1000, 120);
  await expect(menu).toBeHidden();
  await expect(page.locator('aside [data-testid="nav-account"], aside [data-testid="nav-security"]')).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByTestId("input-quick-search").fill("Logout");
  await expect(page.locator(".workspace-command-popup").getByRole("option", { name: /logout|sign out/i })).toHaveCount(0);
  await page.keyboard.press("Escape");
  clean(fixture);
});

test("Personal password confirms independently, preserves server rejection, and ends the session after success", async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL, { role: "user" });
  await openPage(page, "/security", "Security");
  await page.getByTestId("security-change-password").click();
  const current = page.locator("#my-account-current-password");
  const password = page.locator("#my-account-new-password");
  const confirmation = page.locator("#my-account-confirm-password");
  const submit = page.getByRole("button", { name: "Tukar kata laluan", exact: true });
  await current.fill("Wrong-synthetic-password-123!");
  await password.fill(nextPassword);
  await submit.click();
  await expect(confirmation).toHaveAttribute("aria-invalid", "true");
  expect(fixture.passwordCalls).toBe(0);
  await confirmation.fill("Mismatched-new-password-123!");
  await submit.click();
  expect(fixture.passwordCalls).toBe(0);
  await confirmation.fill(nextPassword);
  await submit.click();
  await expect(page.locator("#my-account-current-password-error")).toContainText("Kata laluan semasa tidak betul");
  expect(fixture.passwordCalls).toBe(1);
  await expect(password).toHaveValue(nextPassword);
  await expect(password).toHaveAttribute("type", "password");
  await current.fill(fixturePassword);
  await submit.click();
  await expect.poll(() => fixture.passwordCalls).toBe(2);
  await expect(page.getByRole("heading", { level: 1, name: "Security", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("user"))).toBeNull();
  expect(fixture.requests).not.toContain("PATCH /api/me/credentials");
  clean(fixture);
});

test("Personal 2FA uses server setup, rejects invalid code, enables only after verification, and confirms disable", async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL);
  await openPage(page, "/security", "Security");
  const panel = page.getByTestId("two-factor-settings");
  await expect(panel).toHaveAttribute("data-two-factor-state", "off");
  await panel.getByRole("button", { name: "Aktifkan 2FA", exact: true }).click();
  await panel.locator("#my-account-two-factor-password").fill(fixturePassword);
  await panel.getByRole("button", { name: "Teruskan ke kod QR", exact: true }).click();
  await expect(page.getByTestId("two-factor-qr")).toBeVisible();
  await expect(panel).toHaveAttribute("data-two-factor-state", "setup");
  expect(fixture.setupCalls).toBe(1);
  expect(fixture.user.twoFactorEnabled).toBe(false);
  await expect(page.locator("#my-account-two-factor-secret")).toHaveCount(0);
  await panel.getByRole("button", { name: "Saya sudah tambah akaun", exact: true }).click();
  await panel.locator("#my-account-two-factor-code").fill("123456");
  await panel.getByRole("button", { name: "Sahkan dan aktifkan 2FA", exact: true }).click();
  await expect(panel.locator("#my-account-two-factor-code-error")).toContainText("Kod pengesah tidak betul");
  await expect(panel).toHaveAttribute("data-two-factor-state", "setup");
  await panel.locator("#my-account-two-factor-code").fill("345678");
  await panel.getByRole("button", { name: "Sahkan dan aktifkan 2FA", exact: true }).click();
  await expect(panel).toHaveAttribute("data-two-factor-state", "active");
  expect(fixture.enableCalls).toBe(2);
  await expect(page.getByTestId("two-factor-qr")).toHaveCount(0);
  await page.reload();
  await expect(panel).toHaveAttribute("data-two-factor-state", "active");
  await expect(page.getByTestId("two-factor-qr")).toHaveCount(0);
  expect(fixture.setupCalls).toBe(1);
  await panel.getByRole("button", { name: "Nyahaktifkan 2FA", exact: true }).click();
  expect(fixture.disableCalls).toBe(0);
  await panel.locator("#my-account-two-factor-password").fill(fixturePassword);
  await panel.locator("#my-account-two-factor-code").fill("456789");
  await panel.getByRole("button", { name: "Sahkan nyahaktifkan", exact: true }).click();
  await expect(panel).toHaveAttribute("data-two-factor-state", "off");
  expect(fixture.disableCalls).toBe(1);
  expect(fixture.requests).not.toContain("GET /api/settings");
  clean(fixture);
});

test("Personal functions are absent from administrative Settings and Logout is only in the profile menu", async ({ page, baseURL }) => {
  const fixture = await installPersonalFixture(page, baseURL);
  await openPage(page, "/settings?section=security", "Security");
  await expect(page.getByRole("navigation", { name: "Settings Navigation", exact: true })).toBeVisible();
  await expect(page.getByTestId("security-change-password")).toHaveCount(0);
  await expect(page.getByTestId("two-factor-settings")).toHaveCount(0);
  await expect(page.getByTestId("avatar-input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /logout|sign out/i })).toHaveCount(0);
  await profile(page);
  await expect(page.getByRole("menuitem", { name: "Logout", exact: true })).toHaveCount(1);
  await page.getByTestId("button-logout").click();
  await expect.poll(() => fixture.logoutCalls).toBe(1);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("user"))).toBeNull();
  for (const path of ["/account", "/security"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("button-login")).toBeVisible();
    await expect(page.getByTestId("account-page")).toHaveCount(0);
    await expect(page.getByTestId("security-change-password")).toHaveCount(0);
  }
  clean(fixture);
});

for (const role of ["user", "manager", "admin"] as const) {
  test(`Personal self-service does not bypass denied ${role} Settings`, async ({ page, baseURL }) => {
    const fixture = await installPersonalFixture(page, baseURL, { role, settings: false });
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("home-dashboard")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings Navigation", exact: true })).toHaveCount(0);
    expect(fixture.requests).not.toContain("GET /api/settings");
    await openPage(page, "/account", "Account");
    await openPage(page, "/security", "Security");
    clean(fixture);
  });
}

test("Personal routes cannot bypass mandatory password change", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const fixture = await installPersonalFixture(page, baseURL, { role: "user", mustChangePassword: true });
  for (const path of ["/account", "/security"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.locator("#change-password-current-password")).toBeVisible();
    await expect(page.getByTestId("account-page")).toHaveCount(0);
    await expect(page.getByTestId("security-change-password")).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: test.info().outputPath(`forced-password-${path.slice(1)}.png`), animations: "disabled" });
  }
  const trigger = await profile(page);
  const menu = page.locator(".workspace-profile-menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Account", "Security", "Logout"]);
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(fixture.requests).not.toContain("GET /api/auth/two-factor");
  clean(fixture);
});

for (const [section, path, heading] of [["account", "/account", "Account"],
  ["my-account", "/account", "Account"], ["account-security", "/security", "Security"]]) {
  test(`Personal legacy ${section} link normalizes without requiring administrative Settings`, async ({ page, baseURL }) => {
    const fixture = await installPersonalFixture(page, baseURL, { role: "user", settings: false });
    await openPage(page, `/settings?section=${section}`, heading!);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: heading!, exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    expect(fixture.requests).not.toContain("GET /api/settings");
    clean(fixture);
  });
}
