import assert from "node:assert/strict";
import { lstat, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright";
import { validateRedesignSeedEnvironment } from "./fixtures/frontend-redesign-seed.mjs";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

export function resolveRedesignRealtimeChecksEnabled(env = {}) {
  const value = env.SQR_REDESIGN_REALTIME_CHECKS;
  assert.ok(value === undefined || value === "" || value === "0" || value === "1", "SQR_REDESIGN_REALTIME_CHECKS accepts only 0 or 1");
  return value === "1";
}

export function validateRedesignRealtimeEnvironment(env, baseUrl, accounts, tempParent = os.tmpdir()) {
  const fixture = validateRedesignSeedEnvironment(env, tempParent);
  const url = new URL(baseUrl);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin, baseUrl);
  assert.ok(url.port && !url.username && !url.password);
  assert.equal(env.PUBLIC_APP_URL, baseUrl);
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.PORT, url.port);
  assert.notEqual(env.PORT, env.PG_PORT);
  for (const [role, prefix] of [["superuser", "collectioncardfixture"], ["user", "designuser"]]) {
    assert.match(accounts[role]?.username || "", new RegExp(`^${prefix}[a-f0-9]{12}$`));
    assert.match(accounts[role]?.password || "", /^Fixture9![A-Za-z0-9_-]{32}$/);
  }
  assert.equal(env.SEED_SUPERUSER_USERNAME, accounts.superuser.username);
  assert.equal(env.SEED_USER_USERNAME, accounts.user.username);
  return fixture;
}

async function verifyFreshFixture({ env, baseUrl, accounts }) {
  const tempParent = await realpath(os.tmpdir());
  const { dataDir, fixtureRoot } = validateRedesignRealtimeEnvironment(env, baseUrl, accounts, tempParent);
  for (const directory of [fixtureRoot, dataDir]) {
    const state = await lstat(directory);
    assert.equal(state.isSymbolicLink(), false);
    assert.equal(state.isDirectory(), true);
    assert.equal(await realpath(directory), path.resolve(directory));
  }
  const connection = new pg.Client({ host: "127.0.0.1", port: Number(env.PG_PORT), user: "sqr_fixture",
    password: env.PG_PASSWORD, database: "sqr_collection_card_test", ssl: false, connectionTimeoutMillis: 3_000 });
  try {
    await connection.connect();
    const cluster = await connection.query("SHOW data_directory");
    assert.equal(await realpath(cluster.rows[0].data_directory), await realpath(dataDir));
    const identity = await connection.query("SELECT current_database() AS database, current_user AS username");
    assert.deepEqual(identity.rows[0], { database: "sqr_collection_card_test", username: "sqr_fixture" });
    for (const role of ["superuser", "user"]) {
      const user = await connection.query("SELECT role FROM users WHERE username=$1", [accounts[role].username]);
      assert.equal(user.rows.length, 1);
      assert.equal(user.rows[0].role, role);
    }
    const records = await connection.query("SELECT count(*)::int AS count FROM collection_records WHERE created_by_login=$1 AND collection_staff_nickname='Fixture Collector'", [accounts.superuser.username]);
    assert.equal(records.rows[0].count, 59);
  } finally { await connection.end(); }
}

async function api(page, baseUrl, method, endpoint, body, expected = 200) {
  assert.ok(["/api/me", "/api/settings", "/api/activity/logout"].includes(endpoint));
  const result = await page.evaluate(async ({ origin, method, endpoint, body }) => {
    if (location.origin !== origin) throw new Error("Unexpected fixture origin");
    const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("sqr_csrf="))?.slice(9);
    const response = await fetch(endpoint, { method, credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, payload: await response.json() };
  }, { origin: baseUrl, method, endpoint, body });
  assert.equal(result.status, expected, `Synthetic realtime ${method} ${endpoint} succeeds`);
  return result.payload;
}

async function until(check, message, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(message);
}

// Network emulation can leave an established Chromium WebSocket open. Close
// only the real /ws object in this page's realm while it is offline, so native
// reconnect is exercised deterministically. No WebSocket constructor, frame,
// timer, API response, auth state or application event is replaced or mocked.
async function closeOwnedNativeSocket(page, baseUrl) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const prototype = await cdp.send("Runtime.evaluate", { expression: "WebSocket.prototype", objectGroup: "sqr-realtime-fault" });
    assert.ok(prototype.result.objectId);
    const objects = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId, objectGroup: "sqr-realtime-fault" });
    const result = await cdp.send("Runtime.callFunctionOn", { objectId: objects.objects.objectId,
      functionDeclaration: `function(expected) {
        const sockets = this.filter(socket => socket.url === expected && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING));
        if (sockets.length > 1) throw new Error("Unexpected duplicate app sockets");
        sockets.forEach(socket => socket.close(4000, "Synthetic offline transport fault"));
        return sockets.length;
      }`, arguments: [{ value: `${baseUrl.replace("http:", "ws:")}/ws` }], returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, "Only one owned native app socket may be interrupted");
    assert.ok([0, 1].includes(result.result.value));
    return result.result.value;
  } finally {
    await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "sqr-realtime-fault" }).catch(() => {});
    await cdp.detach();
  }
}

export async function runRedesignRealtimeBrowser({ baseUrl, accounts, artifactsDir, env }) {
  await verifyFreshFixture({ env, baseUrl, accounts });
  const manifest = { syntheticDataOnly: true, realBackend: true, activityTransport: "Visible 30s polling and native heartbeat-synced events (not WebSocket feed)",
    socketTransport: "Native authenticated /ws, no relay or synthetic frames", checks: [], screenshots: [], errors: [], pageErrors: [], externalRequests: [] };
  const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  let phase = "browser setup";
  let observer;
  let actor;
  let originalSystemName;
  let settingChanged = false;
  const contexts = [];
  const persist = () => writeFile(path.join(artifactsDir, "realtime-manifest.json"), JSON.stringify(manifest, null, 2));
  const pass = (name, evidence = {}) => { manifest.checks.push({ name, passed: true, ...evidence }); console.log(`[redesign-realtime] PASS ${name}`); };
  const createSession = async (role) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block", timezoneId: "Asia/Kuala_Lumpur" });
    contexts.push(context);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseUrl || ["data:", "blob:"].includes(url.protocol)) return route.continue();
      manifest.externalRequests.push(url.origin);
      return route.abort();
    });
    // Passive instrumentation only: these counters never dispatch app events.
    await context.addInitScript(() => {
      localStorage.setItem("theme", "light");
      window.__sqrRealtimeObserved = { heartbeat: 0, settings: 0, offline: 0, online: 0 };
      for (const [event, key] of [["activity-heartbeat-synced", "heartbeat"], ["settings-updated", "settings"], ["offline", "offline"], ["online", "online"]]) {
        window.addEventListener(event, () => { window.__sqrRealtimeObserved[key] += 1; });
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const state = { page, context, role, sockets: [], openedSockets: 0, activityResponses: 0, actorActivity: undefined, loginRequests: 0, loggedIn: false };
    // A browser WebSocket creation event precedes the native handshake. Observe
    // handshake success before broadcasting so reconnect timing cannot lose the
    // test frame. Neither handshake headers nor session material are retained.
    const network = await context.newCDPSession(page);
    const ownedSocketRequests = new Set();
    network.on("Network.webSocketCreated", ({ requestId, url }) => {
      if (url === `${baseUrl.replace("http:", "ws:")}/ws`) ownedSocketRequests.add(requestId);
    });
    network.on("Network.webSocketHandshakeResponseReceived", ({ requestId, response }) => {
      if (ownedSocketRequests.has(requestId) && response.status === 101) state.openedSockets += 1;
    });
    await network.send("Network.enable");
    page.on("pageerror", () => manifest.pageErrors.push({ phase, role, kind: "Browser runtime error" }));
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/auth/login" && request.method() === "POST") state.loginRequests += 1; });
    page.on("response", async (response) => {
      if (new URL(response.url()).pathname !== "/api/activity/page" || response.status() !== 200) return;
      try {
        const payload = await response.json();
        state.actorActivity = payload.activities?.find((activity) => activity.username === accounts.user.username);
        state.activityResponses += 1;
      } catch { /* A closed page can abort an unrelated final response. */ }
    });
    page.on("websocket", (socket) => {
      const url = new URL(socket.url());
      if (url.origin !== baseUrl.replace("http:", "ws:") || url.pathname !== "/ws") {
        manifest.externalRequests.push(url.origin);
        return;
      }
      const record = { index: state.sockets.length, closed: false, settingsFrames: 0 };
      state.sockets.push(record);
      socket.on("close", () => { record.closed = true; });
      socket.on("framereceived", ({ payload }) => {
        try {
          const frame = JSON.parse(String(payload));
          if (frame.type === "settings_updated" && frame.key === "system_name") record.settingsFrames += 1;
        } catch { /* Only the known harmless settings frame is counted. */ }
      });
    });
    return state;
  };
  const login = async (session) => {
    const { page, role } = session;
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("input-username").fill(accounts[role].username);
    await page.getByTestId("input-password").fill(accounts[role].password);
    const response = page.waitForResponse((item) => new URL(item.url()).pathname === "/api/auth/login" && item.request().method() === "POST");
    await page.getByTestId("input-password").press("Enter");
    assert.equal((await response).status(), 200);
    session.loggedIn = true;
    await page.locator(".sqr-workspace").waitFor();
    const me = await api(page, baseUrl, "GET", "/api/me");
    assert.equal(me.user?.username, accounts[role].username);
    assert.equal(me.user?.role, role);
    return me.user.id;
  };
  const capture = async (page, name) => {
    await page.evaluate(async () => { await document.fonts.ready; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, "Realtime state has no document overflow");
    const filename = `realtime-${name}.png`;
    await page.screenshot({ path: path.join(artifactsDir, filename), fullPage: true, mask: [page.locator('input[type="password"]')] });
    manifest.screenshots.push({ name, file: filename, horizontalOverflow: overflow });
  };
  const patchName = async (value) => {
    const result = await api(observer.page, baseUrl, "PATCH", "/api/settings", { key: "system_name", value });
    settingChanged = true;
    assert.equal(result.status, "updated");
  };
  try {
    phase = "two real account sessions";
    observer = await createSession("superuser");
    const observerId = await login(observer);
    await observer.page.goto(`${baseUrl}/activity`, { waitUntil: "domcontentloaded" });
    await observer.page.getByRole("heading", { name: "Activity Monitor", exact: true }).waitFor();
    await until(() => observer.page.getByTestId("button-refresh").isEnabled(), "Initial Activity feed loads");
    await observer.page.bringToFront();
    assert.equal(await observer.page.evaluate(() => document.visibilityState), "visible");
    const activityDocument = await observer.page.evaluate(() => performance.timeOrigin);
    actor = await createSession("user");
    const actorId = await login(actor);
    assert.notEqual(actorId, observerId);
    pass("different-authenticated-accounts");

    phase = "automatic Activity login update";
    await observer.page.bringToFront();
    await until(() => observer.actorActivity?.status === "ONLINE" && observer.actorActivity?.isActive === true, "Activity automatically receives actor login without Refresh");
    const activityId = observer.actorActivity.id;
    const row = observer.page.getByTestId(`activity-row-${activityId}`);
    await row.getByText("ONLINE", { exact: true }).waitFor();
    assert.equal(await observer.page.evaluate(() => performance.timeOrigin), activityDocument);
    await row.scrollIntoViewIfNeeded();
    await capture(observer.page, "activity-online");
    pass("activity-login-automatically-visible", { manualRefresh: false });

    phase = "visible Activity periodic refresh";
    const previousResponses = observer.activityResponses;
    const heartbeatBeforeRefresh = await observer.page.evaluate(() => window.__sqrRealtimeObserved.heartbeat);
    await until(() => observer.activityResponses > previousResponses, "Visible Activity refreshes again without user interaction", 35_000);
    assert.equal(await observer.page.evaluate(() => window.__sqrRealtimeObserved.heartbeat), heartbeatBeforeRefresh, "This observed refresh is not a heartbeat-triggered request");
    assert.equal(await observer.page.evaluate(() => document.visibilityState), "visible");
    assert.equal(await observer.page.evaluate(() => performance.timeOrigin), activityDocument);
    pass("visible-activity-periodic-refresh", { manualRefresh: false, heartbeatTriggered: false, timerOverride: false });

    phase = "native authenticated settings frame";
    const settings = await api(observer.page, baseUrl, "GET", "/api/settings");
    const setting = settings.categories.flatMap((category) => category.settings).find((item) => item.key === "system_name");
    assert.ok(setting?.permission?.canEdit && !setting.isCritical);
    originalSystemName = setting.value;
    await until(() => actor.openedSockets > 0 && actor.sockets.length > 0, "Actor has a native authenticated app WebSocket handshake");
    const firstSocket = actor.sockets.at(-1);
    const firstEvents = await actor.page.evaluate(() => window.__sqrRealtimeObserved.settings);
    await patchName("Synthetic realtime before reconnect");
    await until(() => firstSocket.settingsFrames > 0, "Real settings_updated frame reaches actor socket");
    await actor.page.waitForFunction((before) => window.__sqrRealtimeObserved.settings > before, firstEvents);
    pass("native-websocket-frame-and-client-event", { frameType: "settings_updated", settingKey: "system_name" });

    phase = "offline transport interruption";
    const actorDocument = await actor.page.evaluate(() => performance.timeOrigin);
    const openedBeforeOffline = actor.openedSockets;
    await actor.context.setOffline(true);
    await actor.page.waitForFunction(() => navigator.onLine === false && window.__sqrRealtimeObserved.offline > 0);
    const explicitlyClosed = await closeOwnedNativeSocket(actor.page, baseUrl);
    await until(() => firstSocket.closed, "Original native socket closes during the offline fault", 15_000);
    await actor.page.locator(".sqr-workspace").waitFor();
    assert.equal(await actor.page.getByTestId("input-username").count(), 0, "Offline socket loss must not clear authentication UI");
    pass("offline-does-not-log-out", { networkEmulated: true, explicitNativeSocketClose: explicitlyClosed === 1 });

    phase = "online native reconnect";
    await actor.context.setOffline(false);
    await actor.page.waitForFunction(() => navigator.onLine === true && window.__sqrRealtimeObserved.online > 0);
    await until(() => actor.openedSockets > openedBeforeOffline && actor.sockets.some((socket) => socket.index > firstSocket.index && !socket.closed), "AutoLogout opens a new native socket after reconnect", 35_000);
    const nextSocket = actor.sockets.at(-1);
    const nextEvents = await actor.page.evaluate(() => window.__sqrRealtimeObserved.settings);
    await patchName("Synthetic realtime after reconnect");
    await until(() => nextSocket.settingsFrames > 0, "Reconnected native socket receives the real server broadcast");
    await actor.page.waitForFunction((before) => window.__sqrRealtimeObserved.settings > before, nextEvents);
    const meAfter = await api(actor.page, baseUrl, "GET", "/api/me");
    assert.equal(meAfter.user?.id, actorId);
    assert.equal(meAfter.user?.role, "user");
    assert.equal(actor.loginRequests, 1, "Reconnect does not submit another login");
    assert.equal(await actor.page.evaluate(() => performance.timeOrigin), actorDocument, "Reconnect does not reload the page");
    await capture(actor.page, "user-after-reconnect");
    pass("reconnect-preserves-auth-and-receives-new-frame", { reload: false, additionalLogin: false });

    phase = "automatic Activity logout update";
    await actor.page.getByTestId("button-user-menu").click();
    const logout = actor.page.waitForResponse((response) => new URL(response.url()).pathname === "/api/activity/logout" && response.request().method() === "POST");
    await actor.page.getByTestId("button-logout").click();
    assert.equal((await logout).status(), 200);
    actor.loggedIn = false;
    phase = "actor returns to anonymous landing after logout";
    // The application deliberately returns to the public landing route, not
    // the login form. Verify the actual contract without navigating either tab.
    await actor.page.locator(".sqr-workspace").waitFor({ state: "hidden" });
    await actor.page.waitForURL((url) => url.origin === baseUrl && url.pathname === "/");
    await api(actor.page, baseUrl, "GET", "/api/me", undefined, 401);
    phase = "automatic Activity logout row update";
    await observer.page.bringToFront();
    await until(() => observer.actorActivity?.id === activityId && observer.actorActivity?.status === "LOGOUT" && !observer.actorActivity?.isActive, "Activity automatically updates the same session to LOGOUT");
    await row.getByText("LOGOUT", { exact: true }).waitFor();
    assert.equal(await observer.page.evaluate(() => performance.timeOrigin), activityDocument);
    await row.scrollIntoViewIfNeeded();
    await capture(observer.page, "activity-logout");
    pass("activity-logout-automatically-visible", { sameActivityRecord: true, manualRefresh: false });
    const events = await observer.page.evaluate(() => window.__sqrRealtimeObserved);
    assert.ok(events.heartbeat > 0, "Real heartbeat request dispatches the existing Activity sync event");
    pass("real-heartbeat-sync-event-observed", { count: events.heartbeat });
    assert.deepEqual(manifest.pageErrors, []);
    assert.deepEqual(manifest.externalRequests, []);
    assert.equal(manifest.checks.length, 8);
  } catch (error) {
    manifest.errors.push({ phase, kind: error?.code === "ERR_ASSERTION" ? error.message : "Browser or API check failed" });
    console.error(`[redesign-realtime] FAIL ${phase}`);
    throw error;
  } finally {
    if (actor) await actor.context.setOffline(false).catch(() => {});
    if (settingChanged && observer?.loggedIn && originalSystemName !== undefined) {
      await api(observer.page, baseUrl, "PATCH", "/api/settings", { key: "system_name", value: originalSystemName }).catch(() => manifest.errors.push({ phase: "restore synthetic setting", kind: "Restore failed" }));
    }
    for (const session of [actor, observer]) {
      if (session?.loggedIn) await api(session.page, baseUrl, "POST", "/api/activity/logout", {}).catch(() => manifest.errors.push({ phase: "session cleanup", kind: "Logout failed" }));
    }
    for (const context of contexts) await context.close();
    await browser.close();
    await persist();
  }
  assert.deepEqual(manifest.errors, []);
}
