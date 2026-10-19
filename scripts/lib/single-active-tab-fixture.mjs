import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { WebSocketServer, WebSocket } from "ws";
import { startVisualBuiltServer } from "../test-visual-built.mjs";

// Synthetic HTTP boundary for the actual built App. Never imports the server,
// dotenv, database, production accounts or a test bypass into application code.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const singleTabFixtureUser = Object.freeze({
  id: "single-tab-synthetic-account", username: "single.tab.fixture", role: "superuser",
  fullName: "Synthetic Tab Operator", email: null, status: "active", isBanned: false,
  mustChangePassword: false, passwordResetBySuperuser: false, twoFactorEnabled: false,
  twoFactorPendingSetup: false, twoFactorConfiguredAt: null, activatedAt: null,
  passwordChangedAt: null, lastLoginAt: null,
});
export const singleTabFixturePassword = "SingleTabFixture1!";
const sourceId = "single-tab-synthetic-import";
const source = { id: sourceId, name: "Synthetic Tab Source", filename: "synthetic-tab.csv", rowCount: 1,
  createdBy: singleTabFixtureUser.username, createdAt: "2026-01-01T00:00:00.000Z", isDeleted: false };
const headers = ["Customer Name", "Account No", "Card No"];
const row = { "Customer Name": "Synthetic Tab Customer", "Account No": "SYNTHETIC-ACCOUNT-1", "Card No": "SYNTHETIC-CARD-1",
  _collectionStatus: { state: "not_recorded", recordCount: 0 } };
const expiry = "2099-01-01T00:00:00.000Z";
const pagination = (total = 0, pageSize = 20) => ({ mode: "offset", page: 1, pageSize, limit: pageSize,
  offset: 0, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), hasNextPage: false, hasPreviousPage: false });

function json(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    assert.ok(raw.length < 16_384, "Synthetic request body exceeds fixture limit");
  }
  return raw ? JSON.parse(raw) : {};
}

export async function startSingleActiveTabFixture({ publicDirectory = path.join(repoRoot, "dist-local/public"), port = 0 } = {}) {
  assert.ok(Number.isSafeInteger(port) && port >= 0 && port <= 65535);
  const staticServer = await startVisualBuiltServer(publicDirectory);
  const sockets = new Set();
  const state = { authenticated: true, user: { ...singleTabFixtureUser }, requests: [], unexpected: [],
    websocketConnections: 0, meGate: null, meSequence: [], sessionExpiresAt: expiry, idleTimeoutMinutes: 30 };
  const wss = new WebSocketServer({ noServer: true });
  let releaseMe = null;
  let closed = false;

  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    const url = new URL(request.url, "http://fixture.invalid");
    const endpoint = `${request.method} ${url.pathname}`;
    try {
      if (!url.pathname.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(request.method)) return void response.writeHead(405).end();
        const upstream = httpRequest(new URL(`${url.pathname}${url.search}`, staticServer.origin), { method: request.method }, (incoming) => {
          response.writeHead(incoming.statusCode, { ...incoming.headers, "set-cookie": state.authenticated
            ? ["sqr_auth_hint=1; Path=/; SameSite=Lax", "sqr_csrf=synthetic-tab-csrf; Path=/; SameSite=Lax"]
            : ["sqr_auth_hint=; Max-Age=0; Path=/; SameSite=Lax"] });
          incoming.pipe(response);
        });
        upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
        request.on("aborted", () => upstream.destroy());
        upstream.end();
        return;
      }
      state.requests.push(endpoint);
      if (endpoint === "GET /api/health/connectivity") return void response.writeHead(204, { "X-SQR-Connectivity": "ok" }).end();
      if (["GET /api/health", "GET /api/health/live"].includes(endpoint)) return json(response, { status: "ok", ready: true });
      if (endpoint === "GET /api/csrf-token") return json(response, { csrfToken: "synthetic-tab-csrf" });
      if (endpoint === "GET /api/maintenance-status") return json(response, { maintenance: false, type: "hard", message: "", startTime: null, endTime: null });
      if (["POST /api/telemetry/client-errors", "POST /api/telemetry/web-vitals"].includes(endpoint)) return void response.writeHead(204).end();
      if (endpoint === "GET /api/me") {
        const gate = state.meGate;
        if (gate) await gate;
        const queued = state.meSequence.shift();
        if (queued) return json(response, queued.body, queued.status ?? 200);
        return state.authenticated
          ? json(response, { ok: true, user: state.user, sessionExpiresAt: state.sessionExpiresAt })
          : json(response, { ok: false, message: "Synthetic unauthenticated session", error: { code: "TOKEN_REQUIRED", message: "Synthetic unauthenticated session" } }, 401);
      }
      if (endpoint === "POST /api/auth/login") {
        const body = await readBody(request);
        assert.equal(body.username, singleTabFixtureUser.username);
        assert.equal(body.password, singleTabFixturePassword);
        state.authenticated = true;
        response.setHeader("Set-Cookie", "sqr_auth_hint=1; Path=/; SameSite=Lax");
        return json(response, { ok: true, user: state.user, username: state.user.username, role: state.user.role,
          activityId: "synthetic-tab-activity", sessionExpiresAt: state.sessionExpiresAt, mustChangePassword: false, status: "active" });
      }
      if (["POST /api/activity/logout", "POST /api/auth/logout"].includes(endpoint)) {
        state.authenticated = false;
        response.setHeader("Set-Cookie", "sqr_auth_hint=; Max-Age=0; Path=/; SameSite=Lax");
        return json(response, { ok: true, success: true });
      }
      if (!state.authenticated) return json(response, { ok: false, message: "Synthetic unauthenticated session" }, 401);
      if (endpoint === "GET /api/app-config") return json(response, { systemName: "Sumbangan Query Rahmah", aiEnabled: false,
        sessionTimeoutMinutes: state.idleTimeoutMinutes, heartbeatIntervalMinutes: 5, wsIdleMinutes: 30, aiTimeoutMs: 30_000,
        searchResultLimit: 200, viewerRowsPerPage: 100, importUploadLimitBytes: 10 * 1024 * 1024 });
      if (endpoint === "GET /api/settings/tab-visibility") return json(response, { role: state.user.role, tabs: {} });
      if (endpoint === "GET /api/analytics/summary") return json(response, { totalUsers: 1, activeSessions: 1, loginsToday: 1,
        totalDataRows: 1, totalImports: 1, bannedUsers: 0, collectionRecordVersionConflicts24h: 0, loginFailures24h: 0, backupActions24h: 0 });
      if (["GET /api/analytics/login-trends", "GET /api/analytics/top-users", "GET /api/analytics/recent-login-activity",
        "GET /api/analytics/role-distribution"].includes(endpoint)) return json(response, []);
      if (endpoint === "GET /api/analytics/peak-hours") return json(response, Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })));
      if (endpoint === "GET /api/analytics/recent-login-activity-page") return json(response, { activities: [],
        filterCounts: { all: 0, active: 0, ended: 0, failed: 0, attention: 0 }, pagination: { page: 1, pageSize: 4, totalItems: 0, totalPages: 1 } });
      if (endpoint === "POST /api/activity/heartbeat") return json(response, { ok: true, status: "ONLINE", lastActivityTime: new Date().toISOString() });
      if (endpoint === "POST /api/activity/login") return json(response, { ok: true, success: true });
      if (endpoint === "GET /api/imports") return json(response, { imports: [source], pagination: pagination(1, Number(url.searchParams.get("pageSize")) || 20) });
      if (endpoint === `GET /api/imports/${sourceId}/data`) return json(response, { headers,
        rows: [{ id: "synthetic-tab-row", importId: sourceId, jsonDataJsonb: row }], total: 1,
        page: 1, pageSize: 100, limit: 100, offset: 0, nextCursor: null,
        pagination: { ...pagination(1, 100), mode: "hybrid", nextCursor: null } });
      if (endpoint === "GET /api/search/columns") return json(response, headers);
      if (endpoint === "GET /api/search/global") return json(response, { columns: headers, rows: [row], results: [row], total: 1,
        totalIsApproximate: false, page: 1, pageSize: 50, limit: 50, offset: 0, pagination: pagination(1, 50) });
      if (endpoint === "GET /api/collection/nickname-auth/session") return json(response, { ok: true, nickname: null });
      if (endpoint === "GET /api/collection/summary") {
        const year = Number(url.searchParams.get("year") || 2026);
        const month = Number(url.searchParams.get("month") || 1);
        return json(response, { ok: true, year,
          summary: [{ month, monthName: "Synthetic month", totalRecords: 0, totalAmount: 0 }],
          dashboard: { month, scopeLabel: "Synthetic Collection records",
            canViewLeaderBreakdown: ["superuser", "manager"].includes(state.user.role), leaders: [], unassignedAmount: 0 } });
      }
      if (endpoint === "GET /api/collection/nicknames") return json(response, { ok: true, nicknames: [{ id: "synthetic-tab-nickname",
        nickname: "SYNTHETIC STAFF", isActive: true, roleScope: "both", createdBy: state.user.id, createdAt: "2026-01-01T00:00:00.000Z" }] });
      if (endpoint === "GET /api/collection/list") return json(response, { ok: true, records: [], total: 0, totalAmount: 0,
        page: 1, pageSize: 20, limit: 20, offset: 0, nextCursor: null, pagination: { ...pagination(), mode: "hybrid", nextCursor: null } });
      if (endpoint === "GET /api/collection/source-files") return json(response, { ok: true, sourceFiles: [], pagination: { limit: 50, total: 0, nextCursor: null } });
      if (endpoint === "GET /api/collection/source-configs") return json(response, { ok: true, sourceConfigs: [] });
      if (endpoint === "GET /api/collection/teams") return json(response, { ok: true, teams: [] });
      if (endpoint === "GET /api/collection/purge-summary") return json(response, { ok: true, retentionMonths: 6, cutoffDate: "2026-01-01", eligibleRecords: 0, totalAmount: 0 });
      if (endpoint === "GET /api/activity/page") return json(response, { activities: [], pagination: pagination(),
        summary: { idleCount: 0, kickedCount: 0, logoutCount: 0, onlineCount: 0 } });
      if (endpoint === "GET /api/users/banned") return json(response, { users: [] });
      if (endpoint === "GET /api/activity/retention") return json(response, { ok: true, success: true, retention: {
        policy: { autoCleanupEnabled: true, batchSize: 500, securityRetentionDays: 365, standardRetentionDays: 90 },
        preview: { protectedActiveBanCount: 0, securityEligibleCount: 0, standardEligibleCount: 0, totalEligibleCount: 0 },
        securityCutoff: "2025-01-01T00:00:00.000Z", standardCutoff: "2026-01-01T00:00:00.000Z" } });
      state.unexpected.push(endpoint);
      return json(response, { ok: false, message: "Unexpected isolated tab fixture endpoint" }, 404);
    } catch (error) {
      state.unexpected.push(`${endpoint}: ${error.name}`);
      if (!response.headersSent) json(response, { ok: false, message: "Synthetic fixture contract failed" }, 500);
      else response.end();
    }
  });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws" || !state.authenticated) return socket.destroy();
    state.websocketConnections += 1;
    wss.handleUpgrade(request, socket, head, (websocket) => {
      sockets.add(websocket);
      websocket.on("close", () => sockets.delete(websocket));
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  } catch (error) {
    await staticServer.close();
    throw error;
  }
  return {
    origin: `http://127.0.0.1:${server.address().port}`, state,
    holdMe() {
      assert.equal(releaseMe, null, "Only one synthetic identity gate may be pending");
      state.meGate = new Promise((resolve) => { releaseMe = resolve; });
      return () => { releaseMe?.(); releaseMe = null; state.meGate = null; };
    },
    reset() {
      releaseMe?.(); releaseMe = null;
      state.authenticated = true; state.user = { ...singleTabFixtureUser }; state.meGate = null;
      state.meSequence = []; state.requests = []; state.unexpected = []; state.websocketConnections = 0; state.sessionExpiresAt = expiry; state.idleTimeoutMinutes = 30;
    },
    broadcast(type) {
      assert.ok(["kicked", "idle_timeout", "banned", "logout"].includes(type));
      state.authenticated = false;
      for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, reason: "Synthetic session lifecycle verification" }));
    },
    async close() {
      if (closed) return;
      closed = true;
      releaseMe?.();
      for (const socket of sockets) socket.terminate();
      wss.close();
      await new Promise((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
      await staticServer.close();
    },
  };
}

export function parseSingleActiveTabFixtureArgs(args) {
  let serve = false;
  let controlStdin = false;
  let port = 0;
  let portSpecified = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--serve" && !serve) serve = true;
    else if (arg === "--control-stdin" && !controlStdin) controlStdin = true;
    else if (arg === "--port" && !portSpecified) {
      const value = args[++index];
      assert.match(value ?? "", /^\d{1,5}$/, "--port requires a numeric loopback port");
      port = Number(value);
      assert.ok(port >= 0 && port <= 65535, "--port must be between 0 and 65535");
      portSpecified = true;
    } else assert.fail("Allowed options: --serve [--control-stdin] [--port 0..65535], each once");
  }
  assert.equal(serve, true, "Run with --serve for a synthetic built-App preview");
  return { controlStdin, port };
}

function controlObject(value) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Expected a control object");
  return value;
}

function syntheticUserPatch(value, base) {
  const patch = controlObject(value);
  assert.ok(Object.keys(patch).every((key) => ["id", "username", "role", "status", "mustChangePassword", "isBanned"].includes(key)), "Unsupported synthetic user field");
  const next = { ...base };
  for (const key of ["id", "username"]) {
    if (key in patch) {
      assert.ok(typeof patch[key] === "string" && patch[key].trim().length > 0 && patch[key].length <= 200 && !/[\r\n\0]/.test(patch[key]), "Synthetic identity must be bounded plain text");
      next[key] = patch[key].trim();
    }
  }
  if ("role" in patch) {
    assert.ok(["superuser", "admin", "user", "manager"].includes(patch.role), "Unsupported role");
    next.role = patch.role;
  }
  if ("status" in patch) {
    assert.ok(["active", "pending_activation", "suspended", "disabled"].includes(patch.status), "Unsupported account status");
    next.status = patch.status;
  }
  for (const key of ["mustChangePassword", "isBanned"]) {
    if (key in patch) { assert.equal(typeof patch[key], "boolean"); next[key] = patch[key]; }
  }
  return next;
}

/** Opt-in local-process control only; deliberately no HTTP control route. */
export function attachSingleActiveTabFixtureControl(fixture, input, output) {
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  let releaseHeldMe = null;
  const reply = (value) => output.write(`${JSON.stringify({ type: "single-tab-fixture-control", ...value })}\n`);
  lines.on("line", (line) => {
    let command = "invalid";
    try {
      assert.ok(line.length > 0 && line.length <= 16_384, "Control line must contain at most 16384 characters");
      const message = controlObject(JSON.parse(line));
      assert.ok(typeof message.command === "string" && message.command.length <= 30, "Missing bounded command");
      command = message.command;
      const state = fixture.state;
      switch (command) {
        case "report": {
          const counts = Object.create(null);
          for (const endpoint of state.requests) counts[endpoint] = (counts[endpoint] ?? 0) + 1;
          reply({ command, ok: true, state: { authenticated: state.authenticated, user: state.user,
            sessionExpiresAt: state.sessionExpiresAt, websocketConnections: state.websocketConnections,
            identityHeld: Boolean(state.meGate), queuedIdentities: state.meSequence.length,
            counts, requests: state.requests.slice(-500), unexpected: state.unexpected.slice(-100) } });
          return;
        }
        case "reset":
          releaseHeldMe?.(); releaseHeldMe = null; fixture.reset(); break;
        case "holdMe":
          assert.equal(releaseHeldMe, null, "Identity response is already held");
          releaseHeldMe = fixture.holdMe(); break;
        case "releaseMe":
          releaseHeldMe?.(); releaseHeldMe = null; break;
        case "setAuthenticated":
          assert.equal(typeof message.value, "boolean"); state.authenticated = message.value; break;
        case "setUser":
          state.user = syntheticUserPatch(message.user, state.user); break;
        case "setMeSequence": {
          assert.ok(Array.isArray(message.responses) && message.responses.length <= 10, "Expected at most ten synthetic identity responses");
          state.meSequence = message.responses.map((entry) => {
            const response = controlObject(entry);
            const status = response.status ?? 200;
            assert.ok([200, 401, 403, 503].includes(status), "Unsupported synthetic identity response status");
            if (status !== 200) return { status, body: { ok: false, message: "Synthetic identity unavailable",
              error: { code: status === 401 ? "TOKEN_REQUIRED" : "PERMISSION_DENIED", message: "Synthetic identity unavailable" } } };
            const user = response.user === null ? null : syntheticUserPatch(response.user ?? {}, state.user);
            return { status, body: { ok: true, user, sessionExpiresAt: state.sessionExpiresAt } };
          });
          break;
        }
        case "broadcast": {
          const type = ({ kick: "kicked", ban: "banned" })[message.type] ?? message.type;
          fixture.broadcast(type); break;
        }
        default: assert.fail("Unsupported fixture control command");
      }
      reply({ command, ok: true });
    } catch {
      reply({ command, ok: false, error: "Invalid synthetic fixture control request" });
    }
  });
  lines.once("close", () => { releaseHeldMe?.(); void fixture.close(); });
  return { close: () => lines.close() };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const options = parseSingleActiveTabFixtureArgs(process.argv.slice(2));
  const fixture = await startSingleActiveTabFixture({ port: options.port });
  console.log(`SQR synthetic single-active-tab fixture: ${fixture.origin}`);
  console.log("Synthetic identity only; no application server, database, .env or production access.");
  const controls = options.controlStdin ? attachSingleActiveTabFixtureControl(fixture, process.stdin, process.stdout) : null;
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { controls?.close(); void fixture.close(); });
}
