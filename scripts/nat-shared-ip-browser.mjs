import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  NAT_BASE_URL, NAT_USERS, NAT_ROUNDS, NAT_MAX_REQUESTS, NAT_TIMEOUT_MS,
  readNatBrowserConfig, natRouteLabel, summarizeNatRequests, isDefaultDashboardDenial,
} from "./lib/nat-browser-contract.mjs";

// Run from the pinned application checkout. The workflow owns and destroys the
// synthetic database, Redis, uploads and private fixture after this runner exits.
// Never record HAR, traces, screenshots, request headers/bodies or browser storage.
let config;
try {
  config = readNatBrowserConfig();
} catch {
  console.error("[nat-browser] Isolation/fixture preflight rejected; no browser was started.");
  process.exitCode = 1;
}

if (config) await run(config);

async function run({ artifactsDir, fixture, expectedSha, password }) {
  const actors = [];
  const requests = [];
  const violations = [];
  const phases = [];
  const requestStarts = new WeakMap();
  const authCookies = new Set();
  const csrfCookies = new Set();
  const activityIds = new Set();
  const permissionChecks = new Set();
  let verifiedDefaultDashboardDenials = 0;
  const abortController = new AbortController();
  const startedAt = Date.now();
  const receiptBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmioAAAAASUVORK5CYII=",
    "base64",
  );
  let browser;
  let phase = "startup";
  let failed = false;
  let timedOut = false;
  let closing = false;
  let startedRequests = 0;
  let concurrentRequests = 0;
  let peakConcurrentRequests = 0;
  let simultaneousWebSockets = 0;
  let reconnectParticipants = 0;
  let networkAborts = 0;
  let pageErrorCount = 0;

  function violation(kind, actor, route = null, status = null) {
    // Bounds memory, while preserving the total violation count in the counter.
    if (violations.length < 500) violations.push({ kind, participant: actor?.number || null, phase, route, status });
    failed = true;
  }

  function check(condition, code) {
    if (!condition) {
      const error = new Error(code);
      error.natCheck = code;
      throw error;
    }
  }

  function assertRunning() {
    check(!abortController.signal.aborted, "bounded-run-aborted");
    check(startedRequests <= NAT_MAX_REQUESTS, "request-budget-exceeded");
  }

  async function pause(ms) {
    assertRunning();
    await delay(ms, undefined, { signal: abortController.signal });
  }

  function record(actor, method, url, status, latencyMs) {
    const route = natRouteLabel(url);
    requests.push({ participant: actor.number, method, route, status, latencyMs });
    const initialUnauthenticatedProbe = !actor.authenticated && status === 401 && route === "/api/me";
    if (status === 429) violation("unexpected-429", actor, route, status);
    else if (status >= 500) violation("unexpected-5xx", actor, route, status);
    else if (status >= 400 && !initialUnauthenticatedProbe
      && !isDefaultDashboardDenial(actor.account.role, route, status)) violation("unexpected-http-error", actor, route, status);
  }

  async function request(actor, method, apiPath, body) {
    assertRunning();
    check(apiPath.startsWith("/api/") && !apiPath.startsWith("//"), "invalid-api-path");
    const result = await actor.page.evaluate(async ({ apiPath: target, method: verb, body: data }) => {
      const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("sqr_csrf="));
      const response = await fetch(target, {
        method: verb,
        credentials: "include",
        redirect: "error",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf.slice("sqr_csrf=".length)) } : {}),
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        signal: AbortSignal.timeout(20_000),
      });
      return { status: response.status, payload: await response.json() };
    }, { apiPath, method, body });
    check(result.status === 200, "api-request-must-succeed");
    return result.payload;
  }

  async function withResponse(actor, method, pathname, action) {
    const [response] = await Promise.all([
      actor.page.waitForResponse((value) => value.request().method() === method && new URL(value.url()).pathname === pathname),
      action(),
    ]);
    check(response.status() === 200, "ui-request-must-succeed");
    return response.json();
  }

  async function navigate(actor, route, selector) {
    assertRunning();
    // Finish body verification before a full document navigation discards CDP
    // response buffers. Otherwise a real, expected Dashboard403 becomes an
    // unreadable-body harness failure during rapid Search -> Collection moves.
    await actor.page.waitForLoadState("networkidle", { timeout: 20_000 });
    await Promise.all([...permissionChecks]);
    check(!failed, "response-verification-before-navigation");
    await actor.page.goto(NAT_BASE_URL + route, { waitUntil: "domcontentloaded" });
    await actor.page.locator(selector).first().waitFor({ state: "visible" });
  }

  // Starts are paced globally; an individual slow actor cannot create a burst.
  async function paced(items, concurrency, intervalMs, operation) {
    const inflight = new Set();
    for (const item of items) {
      assertRunning();
      if (inflight.size >= concurrency) await Promise.race(inflight);
      const task = operation(item).catch((error) => {
        violation(typeof error?.natCheck === "string" ? error.natCheck : "browser-step-failed", item);
        item.failedStep = item.step || phase;
        throw error;
      });
      inflight.add(task);
      task.then(() => inflight.delete(task), () => inflight.delete(task));
      // Always consume the whole interval, even if an operation finishes early.
      // Both branches above observe rejections during this paced delay.
      await pause(intervalMs);
      if (failed) break;
    }
    const outcomes = await Promise.allSettled([...inflight]);
    check(!failed && outcomes.every((outcome) => outcome.status === "fulfilled"), "participant-phase-incomplete");
  }

  async function runPhase(name, operation) {
    phase = name;
    console.log("[nat-browser] " + name);
    const start = Date.now();
    await operation();
    phases.push({ name, completed: true, durationMs: Date.now() - start });
  }

  async function socketState(actor) {
    return actor.page.evaluate(() => ({
      open: [...window.__natSocketAudit.sockets].filter((socket) => socket.readyState === WebSocket.OPEN).length,
      opened: window.__natSocketAudit.opened,
      errors: window.__natSocketAudit.errors,
      blocked: window.__natSocketAudit.blocked,
    }));
  }

  async function assertAllSocketsOpen() {
    await Promise.all(actors.map((actor) => actor.page.waitForFunction(
      () => [...window.__natSocketAudit.sockets].some((socket) => socket.readyState === WebSocket.OPEN),
      undefined, { timeout: 20_000 },
    )));
    const states = await Promise.all(actors.map(socketState));
    const count = states.filter((state) => state.open === 1).length;
    simultaneousWebSockets = Math.max(simultaneousWebSockets, count);
    check(count === NAT_USERS, "all-30-native-websockets-must-be-open-together");
    check(states.every((state) => state.errors === 0 && state.blocked === 0), "native-websocket-error");
  }

  async function createActor(account, index) {
    const actor = {
      number: index + 1, account, authenticated: false, step: "login",
      completed: { login: false, dashboard: false, search: false, collection: false, collectionSave: false, billing: false, heartbeatRounds: 0, mixedRounds: 0, reconnect: false },
    };
    const context = await browser.newContext({
      baseURL: NAT_BASE_URL, ignoreHTTPSErrors: true, serviceWorkers: "block",
      viewport: { width: 1280, height: 900 }, timezoneId: "UTC",
      acceptDownloads: false,
    });
    actor.context = context;
    actors.push(actor);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== NAT_BASE_URL || startedRequests > NAT_MAX_REQUESTS || abortController.signal.aborted) {
        violation(url.origin !== NAT_BASE_URL ? "blocked-external-request" : "request-budget-or-timeout", actor);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });
    await context.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      const audit = { sockets: new Set(), opened: 0, errors: 0, blocked: 0 };
      Object.defineProperty(window, "__natSocketAudit", { value: audit });
      window.WebSocket = class extends NativeWebSocket {
        constructor(url, protocols) {
          if (String(url) !== "wss://127.0.0.1:5443/ws") {
            audit.blocked += 1;
            throw new Error("NAT simulation blocks external WebSockets");
          }
          super(url, protocols);
          audit.sockets.add(this);
          this.addEventListener("open", () => { audit.opened += 1; });
          this.addEventListener("error", () => { audit.errors += 1; });
          this.addEventListener("close", () => { audit.sockets.delete(this); });
        }
      };
    });
    const page = await context.newPage();
    actor.page = page;
    page.setDefaultTimeout(25_000);
    page.setDefaultNavigationTimeout(30_000);
    page.on("pageerror", () => {
      pageErrorCount += 1;
      violation("uncaught-browser-error", actor);
    });
    page.on("request", (value) => {
      startedRequests += 1;
      concurrentRequests += 1;
      peakConcurrentRequests = Math.max(peakConcurrentRequests, concurrentRequests);
      requestStarts.set(value, Date.now());
    });
    page.on("response", (response) => {
      const start = requestStarts.get(response.request());
      record(actor, response.request().method(), response.url(), response.status(), start ? Date.now() - start : null);
      const route = natRouteLabel(response.url());
      if (isDefaultDashboardDenial(actor.account.role, route, response.status())) {
        // Pinned UI currently requests these hidden Dashboard routes after login.
        // Preserve and prove the backend denial; do not silently allow all 403s.
        const verification = response.json().then((payload) => {
          if (payload.message === `Tab 'dashboard' is disabled for role '${actor.account.role}'`) verifiedDefaultDashboardDenials++;
          else violation("unexpected-dashboard-denial-reason", actor, route, 403);
        }).catch(() => violation("unverified-dashboard-denial", actor, route, 403));
        permissionChecks.add(verification);
        void verification.finally(() => permissionChecks.delete(verification));
      }
    });
    page.on("requestfinished", () => { concurrentRequests = Math.max(0, concurrentRequests - 1); });
    page.on("requestfailed", (value) => {
      concurrentRequests = Math.max(0, concurrentRequests - 1);
      if (closing) return;
      if (value.failure()?.errorText === "net::ERR_ABORTED") networkAborts += 1;
      else violation("network-request-failed", actor, natRouteLabel(value.url()));
    });
    // Playwright's HTTP response event excludes WebSocket handshakes.
    const session = await context.newCDPSession(page);
    const handshakeStarts = new Map();
    await session.send("Network.enable");
    session.on("Network.webSocketWillSendHandshakeRequest", (event) => {
      handshakeStarts.set(event.requestId, Date.now());
    });
    session.on("Network.webSocketHandshakeResponseReceived", (event) => {
      const start = handshakeStarts.get(event.requestId);
      record(actor, "UPGRADE", NAT_BASE_URL + "/ws", event.response.status, start ? Date.now() - start : null);
      handshakeStarts.delete(event.requestId);
    });
    session.on("Network.webSocketFrameError", () => {
      if (!closing) violation("native-websocket-network-error", actor, "/ws");
    });
    return actor;
  }

  async function login(actor) {
    await navigate(actor, "/login", "[data-testid='input-username']");
    await actor.page.getByTestId("input-username").fill(actor.account.username);
    await actor.page.getByTestId("input-password").fill(password);
    await withResponse(actor, "POST", "/api/auth/login", () => actor.page.getByTestId("button-login").click());
    await actor.page.getByTestId("input-username").waitFor({ state: "hidden" });
    actor.authenticated = true;
    const me = await request(actor, "GET", "/api/me");
    check(String(me.user?.id) === actor.account.userId && me.user?.username === actor.account.username && me.user?.role === actor.account.role, "server-identity-must-match-distinct-fixture-account");
    const cookies = await actor.context.cookies(NAT_BASE_URL);
    const auth = cookies.find((cookie) => cookie.name === "sqr_auth");
    const csrf = cookies.find((cookie) => cookie.name === "sqr_csrf");
    check(auth?.value && auth.httpOnly && auth.secure && csrf?.value, "independent-secure-session-and-csrf-cookies-required");
    authCookies.add(auth.value);
    csrfCookies.add(csrf.value);
    const activityId = await actor.page.evaluate(() => sessionStorage.getItem("activityId"));
    check(typeof activityId === "string" && activityId.length > 0, "real-login-activity-session-required");
    activityIds.add(activityId);
    actor.completed.login = true;
  }

  async function saveCollection(actor) {
    actor.step = "collection-save-with-receipt";
    await navigate(actor, "/collection/save", "#collection-nickname-input");
    const dialog = actor.page.getByRole("dialog");
    await dialog.locator("#collection-nickname-input").fill(actor.account.nickname);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog.locator("#collection-nickname-login-password").fill(password);
    await withResponse(actor, "POST", "/api/collection/nickname-auth/login", () =>
      dialog.getByRole("button", { name: "Login Nickname", exact: true }).click());
    await dialog.waitFor({ state: "hidden" });
    const nicknameSession = await request(actor, "GET", "/api/collection/nickname-auth/session");
    check(nicknameSession.nickname?.nickname === actor.account.nickname, "nickname-session-must-match-participant");
    for (const [field, value] of Object.entries({
      "customer-name": actor.account.customerName,
      "customer-ic-number": actor.account.icNumber,
      "customer-phone": actor.account.customerPhone,
      "account-number": actor.account.accountNumber,
      amount: actor.account.amount,
    })) await actor.page.locator("#save-collection-" + field).fill(value);
    const browserToday = await actor.page.evaluate(() => new Date().toISOString().slice(0, 10));
    check(browserToday === fixture.paymentDate, "fixture-date-must-be-current-utc-day");
    await actor.page.getByTestId("save-collection-payment-date").click();
    const dayNumber = Number(fixture.paymentDate.slice(8));
    await actor.page.locator('button[name="day"]:not(.day-outside):not([disabled])')
      .filter({ hasText: new RegExp("^\\s*" + dayNumber + "\\s*$") }).first().click();
    const receiptName = "nat-participant-" + actor.number + ".png";
    await actor.page.locator('input[type="file"]').setInputFiles({
      name: receiptName, mimeType: "image/png", buffer: receiptBuffer,
    });
    await actor.page.getByText(receiptName, { exact: true }).first().waitFor();
    await actor.page.getByPlaceholder("Receipt Amount (RM)").last().fill(actor.account.amount);
    const matches = await withResponse(actor, "POST", "/api/collection/source-matches", () =>
      actor.page.getByRole("button", { name: "Semak Auto-matching", exact: true }).click());
    check(matches.matches?.some((match) => match.sourceImportId === actor.account.sourceImportId), "matching-must-find-synthetic-saved-source");
    const saved = await withResponse(actor, "POST", "/api/collection", () =>
      actor.page.getByRole("button", { name: "Save Collection", exact: true }).click());
    check(saved.record?.id && saved.record.createdByLogin === actor.account.username
      && saved.record.collectionStaffNickname === actor.account.nickname
      && saved.record.sourceImportId === actor.account.sourceImportId
      && saved.record.sourceDataRowId === actor.account.sourceRowId
      && saved.record.amount === actor.account.amount && saved.record.receiptCount === 1,
    "saved-collection-must-persist-own-source-actor-and-one-receipt");
    actor.savedRecordId = saved.record.id;
    actor.completed.collectionSave = true;
  }

  async function dashboardAndSearch(actor) {
    // The normal tab settings enable Dashboard for managers only.
    if (actor.account.role === "manager") {
      actor.step = "dashboard";
      await withResponse(actor, "GET", "/api/analytics/summary", () =>
        navigate(actor, "/dashboard", "[data-testid='text-dashboard-title']"));
      actor.completed.dashboard = true;
    }
    actor.step = "search";
    await navigate(actor, "/general-search", "[data-testid='input-search']");
    await actor.page.getByTestId("input-search").fill(actor.account.searchQuery);
    const result = await withResponse(actor, "GET", "/api/search/global", () =>
      actor.page.getByTestId("button-search").click());
    check(Array.isArray(result.results) && result.results.length > 0, "search-must-find-synthetic-data");
    actor.completed.search = true;
    actor.step = "collection-read";
    await withResponse(actor, "GET", "/api/collection/list", () =>
      navigate(actor, "/collection/records", "[data-testid='collection-records-page']"));
    actor.completed.collection = true;
    if (actor.account.role !== "user") {
      actor.step = "billing-read";
      const billing = await withResponse(actor, "GET", "/api/collection/report/billing-principal/saved-targets", () =>
        navigate(actor, "/collection/billing-principal",
          "[data-testid='billing-principal-page'][data-state='populated']:has([aria-label='System calendar daily movement']):not(:has([role='alert']))"));
      check(billing.targets?.some((target) => target.id === actor.account.billingTargetId), "billing-ui-must-read-accessible-synthetic-target");
      actor.completed.billing = true;
    }
  }

  async function mixedReadRound(actor) {
    actor.step = "mixed-reads";
    if (actor.account.role === "manager") {
      await request(actor, "GET", "/api/analytics/summary");
      await pause(200);
    }
    const search = await request(actor, "GET", "/api/search/global?q=" + encodeURIComponent(actor.account.searchQuery) + "&page=1&pageSize=10");
    check(Array.isArray(search.results) && search.results.length > 0, "mixed-search-must-find-data");
    await pause(200);
    const collection = await request(actor, "GET", "/api/collection/list?limit=10&offset=0&search=" + encodeURIComponent(actor.account.accountNumber));
    if (actor.savedRecordId) {
      check(collection.records?.some((record) => record.id === actor.savedRecordId && record.receiptCount === 1), "saved-record-and-receipt-must-remain-readable");
    }
    await pause(200);
    const heartbeat = await request(actor, "POST", "/api/activity/heartbeat", {});
    check(heartbeat.status === "ONLINE", "heartbeat-must-confirm-online-session");
    actor.completed.heartbeatRounds += 1;
    if (actor.account.role !== "user") {
      await pause(200);
      const billing = await request(actor, "GET", "/api/collection/report/billing-principal/saved-targets");
      const target = billing.targets?.find((value) => value.id === actor.account.billingTargetId);
      check(target?.activeRevision?.id === actor.account.billingRevisionId, "billing-target-must-match-fixture-revision");
      const prefix = "/api/collection/report/billing-principal/saved-targets/" + encodeURIComponent(target.id)
        + "/revisions/" + encodeURIComponent(target.activeRevision.id);
      await pause(200);
      await request(actor, "GET", prefix + "/overview");
      await pause(200);
      await request(actor, "GET", prefix + "/calendar");
    }
    actor.completed.mixedRounds += 1;
  }

  await mkdir(artifactsDir, { recursive: true });
  const watchdog = setTimeout(() => {
    timedOut = true;
    failed = true;
    abortController.abort();
    closing = true;
    // Closing Chromium interrupts outstanding Playwright operations; finally
    // writes a scrubbed failure artifact and closes remaining contexts.
    void browser?.close().catch(() => {});
  }, NAT_TIMEOUT_MS);
  const shutdown = () => { failed = true; abortController.abort(); void browser?.close().catch(() => {}); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--disable-background-networking", "--disable-component-update", "--disable-sync",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    });
    await runPhase("30 distinct UI logins", async () => {
      // Context allocation is cheap and does not make an HTTP request.
      for (let index = 0; index < fixture.accounts.length; index += 1) await createActor(fixture.accounts[index], index);
      await paced(actors, 3, 2_100, login);
      check(authCookies.size === NAT_USERS && csrfCookies.size === NAT_USERS && activityIds.size === NAT_USERS,
        "30-distinct-auth-csrf-and-activity-sessions-required");
      await assertAllSocketsOpen();
    });
    await runPhase("20 permitted Collection UI saves and receipts", () =>
      paced(actors.filter((actor) => actor.account.role !== "manager"), 3, 750, saveCollection));
    await runPhase("30 Search Collection, 10 Dashboard and 20 Billing UI reads", () =>
      paced(actors, 5, 500, dashboardAndSearch));
    await runPhase("all 30 native WebSockets simultaneous", assertAllSocketsOpen);
    for (let round = 0; round < NAT_ROUNDS; round += 1) {
      await runPhase("mixed read round " + (round + 1), async () => {
        await paced(actors, 10, 250, mixedReadRound);
        await assertAllSocketsOpen();
      });
    }
    await runPhase("all 30 application WebSocket reconnects", async () => {
      await paced(actors, 10, 250, async (actor) => {
        actor.step = "native-websocket-reconnect";
        const baseline = await actor.page.evaluate(() => {
          const before = window.__natSocketAudit.opened;
          for (const socket of window.__natSocketAudit.sockets) socket.close(1000, "isolated NAT reconnect");
          return before;
        });
        await actor.page.waitForFunction((before) => window.__natSocketAudit.opened > before
          && [...window.__natSocketAudit.sockets].some((socket) => socket.readyState === WebSocket.OPEN),
        baseline, { timeout: 25_000 });
        actor.completed.reconnect = true;
        reconnectParticipants += 1;
      });
      await assertAllSocketsOpen();
      // Keep every connection open through a server heartbeat interval.
      await pause(35_000);
      await assertAllSocketsOpen();
    });
    await runPhase("coverage and error acceptance", async () => {
      await Promise.all([...permissionChecks]);
      check(actors.length === NAT_USERS && actors.every((actor) => actor.completed.login
        && actor.completed.search && actor.completed.collection && actor.completed.reconnect
        && actor.completed.mixedRounds === NAT_ROUNDS && actor.completed.heartbeatRounds === NAT_ROUNDS),
      "all-participants-must-complete-required-workflows");
      check(actors.filter((actor) => actor.completed.collectionSave).length === 20, "20-allowed-collection-receipt-saves-required");
      check(actors.filter((actor) => actor.completed.billing).length === 20, "20-allowed-billing-reads-required");
      check(actors.filter((actor) => actor.completed.dashboard).length === 10, "10-default-authorized-dashboard-reads-required");
      check(violations.length === 0 && !failed, "no-unexpected-http-network-or-runtime-errors");
    });
  } catch (error) {
    failed = true;
    if (typeof error?.natCheck === "string") violation(error.natCheck);
    else violation(timedOut ? "bounded-timeout" : "browser-operation-failed");
    console.error("[nat-browser] Failed during " + phase + "; only scrubbed diagnostics are recorded.");
  } finally {
    closing = true;
    clearTimeout(watchdog);
    abortController.abort();
    await Promise.allSettled(actors.map((actor) => actor.context.close()));
    await browser?.close().catch(() => {});
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGINT", shutdown);
    const summary = {
      schemaVersion: 1, ok: !failed, synthetic: true, isolated: true, expectedSha,
      topology: { browserSourceIp: "127.0.0.1", edge: "Nginx HTTPS 127.0.0.1:5443", application: "127.0.0.1:5000" },
      durationMs: Date.now() - startedAt, timedOut, lastPhase: phase,
      limits: { participants: NAT_USERS, mixedRounds: NAT_ROUNDS, maxRequests: NAT_MAX_REQUESTS, timeoutMs: NAT_TIMEOUT_MS, loginStartIntervalMs: 2_100, workflowConcurrency: 5, mixedConcurrency: 10 },
      participants: actors.map((actor) => ({ participant: actor.number, role: actor.account.role, ...actor.completed, ...(actor.failedStep ? { failedStep: actor.failedStep } : {}) })),
      sessions: { distinctAuthCookies: authCookies.size, distinctCsrfCookies: csrfCookies.size, distinctActivitySessions: activityIds.size },
      verifiedDefaultDashboardDenials,
      knownUiLimitation: "Pinned UI requests disabled Dashboard analytics after login for user/admin. Exact backend tab-disabled 403 responses are counted separately, not treated as NAT failures or permission grants. All other 4xx remain failures (except initial /api/me 401).",
      webSockets: { simultaneousParticipants: simultaneousWebSockets, reconnectParticipants, holdAfterReconnectMs: 35_000 },
      startedRequests, observedResponses: requests.length, peakConcurrentRequests, navigationAborts: networkAborts, pageErrorCount,
      latencyMeasure: "Elapsed browser request start to response headers (WebSocket handshake response for UPGRADE).",
      unexpected429: requests.filter((entry) => entry.status === 429).length,
      unexpected5xx: requests.filter((entry) => entry.status >= 500).length,
      phases, violations, routes: summarizeNatRequests(requests),
      artifactPolicy: "Counts and canonical routes only; no usernames, credentials, cookies, request bodies, response bodies, URLs with queries, screenshots or traces.",
    };
    await writeFile(path.join(artifactsDir, "browser-summary.json"), JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
    authCookies.clear();
    csrfCookies.clear();
    activityIds.clear();
    console.log("[nat-browser] " + (summary.ok ? "PASS" : "FAIL") + ": " + actors.filter((actor) => actor.completed.login).length
      + "/30 logins, " + simultaneousWebSockets + "/30 simultaneous sockets, " + reconnectParticipants + "/30 reconnects.");
    if (failed) process.exitCode = 1;
  }
}
