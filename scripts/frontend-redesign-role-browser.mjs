import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

const billingPrefix = "/api/collection/report/billing-principal/saved-targets";
const labels = { home: "Home", import: "Import", saved: "Saved", viewer: "Viewer", "general-search": "Search", "collection-report": "Collection", dashboard: "Dashboard", activity: "Activity", monitor: "System Monitor", analysis: "Analysis", "audit-logs": "Audit Log", settings: "Settings", backup: "Backup & Restore" };
// Reviewed fresh defaults, not inferred from the UI under test.
export const roleNavigation = {
  manager: ["home", "import", "general-search", "collection-report", "analysis", "dashboard"],
  // Existing canViewSystemPerformance defaults false and gates admin monitor.
  admin: ["home", "import", "saved", "viewer", "general-search", "collection-report", "analysis", "settings"],
  user: ["general-search", "collection-report"],
};

export function resolveRedesignRoleChecksEnabled(env = {}) {
  const value = env.SQR_REDESIGN_ROLE_CHECKS;
  assert.ok(value === undefined || value === "" || value === "0" || value === "1", "SQR_REDESIGN_ROLE_CHECKS accepts only 0 or 1");
  return value === "1";
}

export function validateRedesignRoleInputs({ baseUrl, accounts, prepareBillingFixture, widths, themes }) {
  const url = new URL(baseUrl);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin, baseUrl);
  assert.ok(url.port && url.username === "" && url.password === "");
  assert.equal(typeof prepareBillingFixture, "function", "Roles require guarded fresh Billing provenance before any mutation");
  for (const [role, prefix] of [["superuser", "collectioncardfixture"], ["admin", "designadmin"], ["user", "designuser"]]) {
    assert.match(accounts[role]?.username || "", new RegExp(`^${prefix}[a-f0-9]{12}$`));
    assert.match(accounts[role]?.password || "", /^Fixture9![A-Za-z0-9_-]{32}$/);
  }
  assert.ok(widths.length && widths.every((width) => Number.isInteger(width) && width >= 320 && width <= 2560));
  assert.ok(themes.length && themes.every((theme) => ["light", "dark"].includes(theme)));
}

async function api(page, baseUrl, method, endpoint, body, expected = 200) {
  assert.ok(endpoint.startsWith("/api/") && !endpoint.startsWith("//"));
  for (let attempt = 0; ; attempt++) {
    const result = await page.evaluate(async ({ origin, method, endpoint, body }) => {
      if (location.origin !== origin) throw new Error("Fixture origin changed");
      const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("sqr_csrf="))?.slice(9);
      const response = await fetch(endpoint, { method, credentials: "include", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, retryAfter: response.headers.get("retry-after"), payload: await response.json() };
    }, { origin: baseUrl, method, endpoint, body });
    if (result.status === 429 && attempt < 2) {
      const seconds = Number(result.retryAfter || 12);
      assert.ok(Number.isFinite(seconds) && seconds > 0 && seconds <= 30, "Role fixture rate window must be bounded");
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    assert.equal(result.status, expected, `Role ${method} ${endpoint.split("?")[0]} status`);
    return result.payload;
  }
}

async function login(page, baseUrl, account, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-username").fill(account.username);
  await page.getByTestId("input-password").fill(account.password);
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
  await page.getByTestId("input-password").press("Enter");
  assert.equal((await pending).status(), 200, `Actual ${role} password login succeeds`);
  await page.locator(".sqr-workspace").waitFor();
  const session = await api(page, baseUrl, "GET", "/api/me");
  assert.equal(session.user?.username, account.username);
  assert.equal(session.user?.role, role, "Role proof comes from actual authenticated /api/me, not localStorage");
  return session.user;
}

async function verifyNavigation(page, baseUrl, role, width, capture) {
  await page.goto(`${baseUrl}/general-search`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("input-search").waitFor();
  const visibility = await api(page, baseUrl, "GET", "/api/settings/tab-visibility");
  assert.equal(visibility.role, role);
  if (role === "admin") assert.equal(visibility.tabs.canViewSystemPerformance, false, "Existing admin System Performance capability remains off by default");
  const expected = roleNavigation[role];
  for (const id of Object.keys(labels)) assert.equal(visibility.tabs[id] === true, expected.includes(id), `${role} fresh ${id} permission`);
  if (width < 1024) {
    await page.getByTestId("button-open-mobile-nav").click();
    const nav = page.getByRole("navigation", { name: "Navigasi mudah alih", exact: true });
    await nav.waitFor();
    assert.equal(await nav.getByRole("button").count(), expected.length);
    for (const id of Object.keys(labels)) assert.equal(await nav.getByRole("button", { name: new RegExp(`^${labels[id]}(?:\\s|$)`) }).count(), expected.includes(id) ? 1 : 0, `${role} mobile ${id} visibility`);
    await capture("navigation-mobile");
    await page.keyboard.press("Escape");
    await nav.waitFor({ state: "hidden" });
  } else {
    for (const id of ["home", "general-search", "collection-report"]) assert.equal(await page.getByTestId(`nav-${id}`).count(), expected.includes(id) ? 1 : 0, `${role} desktop primary ${id}`);
    for (const [group, ids] of [["workspace", ["import", "saved", "viewer"]], ["insights", ["dashboard", "activity", "monitor", "analysis", "audit-logs"]], ["settings-menu", ["settings", "backup"]]]) {
      const trigger = page.getByTestId(`nav-group-${group}`);
      const visible = ids.filter((id) => expected.includes(id));
      assert.equal(await trigger.count(), visible.length ? 1 : 0, `${role} ${group} group visibility`);
      if (!visible.length) continue;
      await trigger.click();
      const menu = page.getByRole("menu");
      await menu.waitFor();
      assert.equal(await menu.getByRole("menuitem").count(), visible.length);
      for (const id of ids) assert.equal(await menu.getByRole("menuitem", { name: new RegExp(`^${labels[id]}(?:\\s|$)`) }).count(), visible.includes(id) ? 1 : 0, `${role} ${id} menu visibility`);
      await capture(`navigation-${group}`);
      await page.keyboard.press("Escape");
    }
  }
  // Ordinary disallowed pages intentionally fall back to the role's default;
  // explicit forbidden Monitor sections render 403. /backup is not an app route.
  const denied = role === "manager" ? ["/saved", "/viewer", "/settings", "/monitor?section=monitor"] : role === "admin" ? ["/monitor?section=audit"] : ["/import", "/saved", "/viewer", "/settings", "/monitor?section=dashboard"];
  for (const route of denied) {
    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      if (route.startsWith("/monitor")) await page.getByRole("heading", { name: "403 Forbidden", exact: true }).waitFor();
      else await page.getByTestId(role === "user" ? "input-search" : "card-general-search").waitFor();
    } catch (error) { error.roleStep = `guard ${route}`; throw error; }
  }
  await capture("guarded-route");
  await api(page, baseUrl, "GET", "/api/admin/users", undefined, 403);
}

async function verifyNicknameScope(page, baseUrl, role, nicknames, password, width, capture) {
  await page.goto(`${baseUrl}/collection/save`, { waitUntil: "domcontentloaded" });
  if (role === "manager") {
    await page.getByTestId("collection-records-page").waitFor();
    assert.equal(await page.locator("#save-collection-customer-name").count(), 0);
    if (width < 768) await page.getByTestId("button-open-collection-sections").click();
    const nav = page.getByRole("navigation", { name: width < 768 ? "Collection sections mobile" : "Collection sections", exact: true });
    assert.equal(await nav.getByRole("button", { name: "Simpan Collection Individual", exact: true }).count(), 0);
    if (width < 768) await page.keyboard.press("Escape");
    assert.equal(await page.locator("[aria-label^='Actions for record ']").count(), 0, "Manager cannot mutate Collection rows");
    await api(page, baseUrl, "POST", "/api/collection", {}, 403);
    await capture("collection-readonly");
    return;
  }
  let session = await api(page, baseUrl, "GET", "/api/collection/nickname-auth/session");
  if (!session.nickname) {
    const own = nicknames[role];
    const other = nicknames[role === "admin" ? "user" : "admin"];
    await page.locator("#collection-nickname-input").fill(other);
    let pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/collection/nickname-auth/check" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal((await pending).status(), 403, "Opposite role nickname is denied through the real dialog");
    assert.equal(await page.locator("#save-collection-customer-name").count(), 0);
    await page.locator("#collection-nickname-input").fill(own);
    pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/collection/nickname-auth/check" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const result = await pending;
    assert.equal(result.status(), 200);
    const profile = (await result.json()).nickname;
    if (profile.requiresPasswordSetup) {
      await page.locator("#collection-nickname-setup-password").fill(password);
      await page.locator("#collection-nickname-setup-confirm-password").fill(password);
      pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/collection/nickname-auth/setup-password" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Save Password", exact: true }).click();
    } else {
      await page.locator("#collection-nickname-login-password").fill(password);
      pending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/collection/nickname-auth/login" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Login Nickname", exact: true }).click();
    }
    assert.equal((await pending).status(), 200);
  }
  await page.locator("#save-collection-customer-name").waitFor();
  assert.equal(await page.locator("#save-collection-superuser-nickname").count(), 0, "Admin/User cannot select an arbitrary save nickname");
  session = await api(page, baseUrl, "GET", "/api/collection/nickname-auth/session");
  assert.equal(session.nickname?.nickname, nicknames[role]);
  const forged = await api(page, baseUrl, "POST", "/api/collection", {
    customerName: "Synthetic Rejected Scope", accountNumber: "0000880000000001", cardNumber: "0000990000000001", icNumber: "990101010001", customerPhone: "01999000001", agingBucket: "D3", batch: "P10", paymentDate: "2026-08-20", amount: "1.00", collectionStaffNickname: "Design Billing Collector",
  }, 403);
  assert.equal(forged.error?.code ?? forged.code, "COLLECTION_NICKNAME_SESSION_MISMATCH", "Same-role but unverified nickname is not a save authority");
  await capture("collection-verified-nickname");
}

async function verifyBilling(page, baseUrl, role, fixture, capture) {
  const revision = `${billingPrefix}/${encodeURIComponent(fixture.targetId)}/revisions/${encodeURIComponent(fixture.revisionId)}`;
  await page.goto(`${baseUrl}/collection/billing-principal`, { waitUntil: "domcontentloaded" });
  if (role === "user") {
    await page.locator("#save-collection-customer-name").waitFor();
    assert.equal(await page.getByTestId("billing-principal-page").count(), 0);
    await api(page, baseUrl, "GET", billingPrefix, undefined, 403);
    await api(page, baseUrl, "GET", `${revision}/overview?asOf=${fixture.to}`, undefined, 403);
    await capture("billing-guarded");
    return;
  }
  await page.locator("#billing-saved-target-select").selectOption(fixture.targetId);
  const table = page.getByRole("table", { name: "Table B Client Billing Principal result", exact: true });
  await table.waitFor();
  for (const action of ["Create Target", "Edit Target", "Delete Target"]) assert.equal(await page.getByRole("button", { name: action, exact: true }).count(), 0, "Shared target mutation stays Superuser-only");
  await api(page, baseUrl, "GET", `${billingPrefix}/options`, undefined, 403);
  const before = await api(page, baseUrl, "GET", `${revision}/overview?asOf=${fixture.to}`);
  const expected = role === "manager" ? 1050 : 3150;
  assert.ok([0, expected].includes(Number(before.clientResult.all.ospClosed)), "Private Table B is empty or this account's own previous result; never another account's");
  const resultPercentage = role === "manager" ? "10" : "30";
  for (const aging of ["D3", "D4", "D5", "D6"]) {
    await table.getByLabel(`${aging} private target percentage`, { exact: true }).fill("25");
    await table.getByLabel(`${aging} client result percentage`, { exact: true }).fill(resultPercentage);
  }
  const saveButton = page.getByRole("button", { name: "Save Client Result", exact: true });
  if (await saveButton.isEnabled()) {
    const saved = page.waitForResponse((response) => new URL(response.url()).pathname === `${revision}/client-results` && response.request().method() === "PUT");
    await saveButton.click();
    assert.equal((await saved).status(), 200, `${role} saves its own private result through actual UI`);
  }
  const after = await api(page, baseUrl, "GET", `${revision}/overview?asOf=${fixture.to}`);
  assert.equal(Number(after.clientResult.all.ospClosed), expected);
  assert.equal(Number(after.systemResult.all.ospClosed), 10000, "Private edits do not mutate Table A");
  await page.reload({ waitUntil: "domcontentloaded" });
  await table.waitFor();
  const total = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "ALL", exact: true }) });
  await page.waitForFunction(({ amount }) => [...document.querySelectorAll("table[aria-label='Table B Client Billing Principal result'] tfoot tr")].some((row) => row.firstElementChild?.textContent === "ALL" && Number(row.children[5]?.textContent?.replace(/[^\d.-]/g, "")) === amount), { amount: expected });
  assert.equal(Number((await total.getByRole("cell").nth(5).innerText()).replace(/[^\d.-]/g, "")), expected);
  await table.scrollIntoViewIfNeeded();
  await capture("billing-private-result");
}

export async function runFrontendRedesignRoleBrowser({ baseUrl, accounts, artifactsDir, prepareBillingFixture, widths = [1440, 390], themes = ["light", "dark"] }) {
  validateRedesignRoleInputs({ baseUrl, accounts, prepareBillingFixture, widths, themes });
  const manifest = { syntheticDataOnly: true, realBackend: true, roleIdentityStrategy: "Seeded User is transitioned to Manager then restored to User through the authenticated Superuser role API; Admin is a separate account.", widths, themes, checks: [], screenshots: [], errors: [], externalRequests: [], pageErrors: [] };
  const persist = () => writeFile(path.join(artifactsDir, "roles-manifest.json"), JSON.stringify(manifest, null, 2));
  const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  let phase = "guarded fixture preparation";
  let ownerPage;
  let userId;
  let restored = false;
  const contexts = [];
  async function newPage(theme) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme, reducedMotion: "reduce", locale: "en-US", timezoneId: "Asia/Kuala_Lumpur", serviceWorkers: "block" });
    contexts.push(context);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseUrl || ["blob:", "data:"].includes(url.protocol)) return route.continue();
      manifest.externalRequests.push(url.origin); return route.abort();
    });
    await context.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", () => manifest.pageErrors.push({ phase, kind: "Browser runtime error" }));
    return page;
  }
  try {
    ownerPage = await newPage("light");
    await login(ownerPage, baseUrl, accounts.superuser, "superuser");
    // This mandatory callback checks the exact fresh loopback cluster, filesystem
    // identity, 59 synthetic records, and empty target table before API writes.
    const fixture = await prepareBillingFixture(ownerPage);
    assert.equal(fixture.evidence?.realCreateTarget, true);
    assert.equal(fixture.evidence?.collections, 5);
    const users = (await api(ownerPage, baseUrl, "GET", "/api/admin/users")).users;
    const actor = users.find((user) => user.username === accounts.user.username);
    assert.equal(actor?.role, "user");
    userId = actor.id;
    const nicknames = { admin: "Design Role Admin", user: "Design Role User" };
    for (const role of ["admin", "user"]) await api(ownerPage, baseUrl, "POST", "/api/collection/nicknames", { nickname: nicknames[role], roleScope: role });
    const nicknamePassword = `Role9!${randomBytes(24).toString("base64url")}`;
    await api(ownerPage, baseUrl, "PATCH", `/api/admin/users/${encodeURIComponent(userId)}/role`, { role: "manager" });
    for (const role of ["manager", "admin", "user"]) {
      if (role === "user") {
        await api(ownerPage, baseUrl, "PATCH", `/api/admin/users/${encodeURIComponent(userId)}/role`, { role: "user" });
        restored = true;
      }
      for (const theme of themes) {
        phase = `${role}/${theme}/login`;
        const page = await newPage(theme);
        let loggedIn = false;
        try {
          await login(page, baseUrl, accounts[role === "manager" ? "user" : role], role);
          loggedIn = true;
          for (const width of widths) {
            await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
            const capture = async (id) => {
              await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme && document.documentElement.classList.contains("dark") === (theme === "dark"), theme);
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
              assert.equal(overflow, false, `${role} ${id} has no document overflow`);
              const file = `role-${role}-${id}-${theme}-${width}.png`;
              await page.screenshot({ path: path.join(artifactsDir, file), animations: "disabled", caret: "hide", mask: [page.locator("input[type='password']")] });
              manifest.screenshots.push({ role, theme, width, id, file, horizontalOverflow: overflow });
            };
            for (const [check, run] of [
              ["navigation-and-route-guards", () => verifyNavigation(page, baseUrl, role, width, capture)],
              ["nickname-save-scope", () => verifyNicknameScope(page, baseUrl, role, nicknames, nicknamePassword, width, capture)],
              ["billing-private-access", () => verifyBilling(page, baseUrl, role, fixture, capture)],
            ]) {
              phase = `${role}/${theme}/${width}/${check}`;
              await run();
              manifest.checks.push({ role, theme, width, check, passed: true });
              await persist();
              console.log(`[redesign-roles] PASS ${phase}`);
            }
          }
        } finally {
          if (loggedIn) await api(page, baseUrl, "POST", "/api/activity/logout", {});
          await page.context().close();
        }
      }
    }
    phase = "superuser private-result isolation";
    const overview = await api(ownerPage, baseUrl, "GET", `${billingPrefix}/${encodeURIComponent(fixture.targetId)}/revisions/${encodeURIComponent(fixture.revisionId)}/overview?asOf=${fixture.to}`);
    assert.equal(Number(overview.clientResult.all.ospClosed), 2100, "Other role saves preserve Superuser private result");
    manifest.checks.push({ check: "superuser-private-result-unchanged", passed: true });
  } catch (error) {
    manifest.errors.push({ phase, ...(error.roleStep ? { step: error.roleStep } : {}), kind: error?.code === "ERR_ASSERTION" ? String(error.message).split("\n")[0] : "Role UI verification failed; sensitive details suppressed" });
  } finally {
    if (ownerPage && userId && !restored) await api(ownerPage, baseUrl, "PATCH", `/api/admin/users/${encodeURIComponent(userId)}/role`, { role: "user" }).catch(() => manifest.errors.push({ phase: "restore fixture role", kind: "Role restoration failed before fixture removal" }));
    if (ownerPage) await api(ownerPage, baseUrl, "POST", "/api/activity/logout", {}).catch(() => manifest.errors.push({ phase: "owner logout", kind: "Logout failed" }));
    for (const context of contexts) await context.close().catch(() => {});
    await persist();
    await browser.close();
  }
  assert.equal(manifest.errors.length, 0, "Role checks failed; inspect sanitized roles-manifest.json");
  assert.equal(manifest.pageErrors.length, 0, "Role browser runtime errors occurred");
  assert.equal(manifest.externalRequests.length, 0, "Role browser attempted external requests");
}
