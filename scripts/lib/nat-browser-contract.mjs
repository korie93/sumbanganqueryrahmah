import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export const NAT_BASE_URL = "https://127.0.0.1:5443";
export const NAT_USERS = 30;
export const NAT_ROUNDS = 3;
// Includes uncached static assets: request routing disables Chromium's cache,
// and 130 bounded full-page navigations can exceed 12k asset/API requests.
export const NAT_MAX_REQUESTS = 30_000;
export const NAT_TIMEOUT_MS = 15 * 60_000;

const DEFAULT_DENIED_DASHBOARD_ROUTES = new Set([
  "/api/analytics/summary", "/api/analytics/login-trends", "/api/analytics/top-users",
  "/api/analytics/recent-login-activity", "/api/analytics/peak-hours", "/api/analytics/role-distribution",
]);

export function isDefaultDashboardDenial(role, route, status) {
  return status === 403 && ["user", "admin"].includes(role) && DEFAULT_DENIED_DASHBOARD_ROUTES.has(route);
}

// This fixture harness has no production mode or dotenv fallback.
export function readNatBrowserConfig(env = process.env, cwd = process.cwd()) {
  assert.equal(env.CI, "true", "CI=true is required.");
  assert.equal(env.GITHUB_ACTIONS, "true", "GITHUB_ACTIONS=true is required.");
  assert.equal(env.NAT_SIMULATION_ISOLATED, "1", "NAT_SIMULATION_ISOLATED=1 is required.");
  assert.equal(env.NAT_SIMULATION_USERS, String(NAT_USERS), "Exactly 30 participants are required.");
  assert.equal(env.NAT_SIMULATION_BASE_URL, NAT_BASE_URL, "The isolated HTTPS Nginx loopback URL is required.");
  assert.match(env.NAT_SIMULATION_EXPECTED_SHA || "", /^[a-f0-9]{40}$/, "A full expected application SHA is required.");
  assert(env.NAT_SIMULATION_ARTIFACTS_DIR, "An explicit scrubbed artifacts directory is required.");
  assert(env.NAT_SIMULATION_FIXTURE_FILE, "An explicit private fixture file is required.");
  assert((env.NAT_SIMULATION_PASSWORD || "").length >= 20, "An ephemeral fixture password of at least 20 characters is required.");
  const expectedSha = env.NAT_SIMULATION_EXPECTED_SHA;
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  assert.equal(actualSha, expectedSha, "Application checkout must match the expected SHA.");
  const artifactsDir = path.resolve(cwd, env.NAT_SIMULATION_ARTIFACTS_DIR);
  const fixtureFile = path.resolve(cwd, env.NAT_SIMULATION_FIXTURE_FILE);
  assert.notEqual(artifactsDir, cwd, "The workspace root cannot be the artifacts directory.");
  assert.notEqual(artifactsDir, path.parse(artifactsDir).root, "The filesystem root cannot be the artifacts directory.");
  assert(statSync(fixtureFile).size <= 128 * 1024, "Fixture file exceeds the bounded size.");
  const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
  assert.equal(fixture.isolationMarker, "sqr-nat-simulation", "Synthetic isolation marker is required.");
  assert.equal(fixture.expectedSha, expectedSha, "Fixture SHA must match the application checkout.");
  assert(Array.isArray(fixture.accounts) && fixture.accounts.length === NAT_USERS, "Exactly 30 fixture accounts are required.");
  for (const field of ["username", "userId", "accountNumber", "sourceRowId"]) {
    assert(fixture.accounts.every((account) => typeof account[field] === "string" && account[field].length > 0), "Every fixture account needs " + field + ".");
    assert.equal(new Set(fixture.accounts.map((account) => account[field])).size, NAT_USERS, "All 30 " + field + " values must be distinct.");
  }
  for (const role of ["user", "admin", "manager"]) {
    assert.equal(fixture.accounts.filter((account) => account.role === role).length, 10, "Exactly 10 " + role + " accounts are required.");
  }
  const writers = fixture.accounts.filter((account) => account.role !== "manager");
  for (const field of ["nickname", "nicknameId"]) {
    assert(writers.every((account) => typeof account[field] === "string" && account[field].length > 0), "Every Collection writer needs " + field + ".");
    assert.equal(new Set(writers.map((account) => account[field])).size, 20, "All 20 writer " + field + " values must be distinct.");
    assert(fixture.accounts.filter((account) => account.role === "manager").every((account) => account[field] === null), "Managers must not have Collection nickname authentication.");
  }
  for (const account of fixture.accounts) {
    assert(!Object.hasOwn(account, "password"), "Passwords must only come from the ephemeral environment.");
    for (const field of ["customerName", "icNumber", "customerPhone", "sourceImportId", "searchQuery", "amount"]) {
      assert(typeof account[field] === "string" && account[field].length > 0, "A synthetic " + field + " is required.");
    }
    assert.equal(account.amount, "12.34", "Collection mutation amount must be the bounded fixture amount.");
    if (account.role !== "user") {
      assert(typeof account.billingTargetId === "string" && account.billingTargetId.length > 0, "Authorized Billing readers require a synthetic saved target.");
      assert(typeof account.billingRevisionId === "string" && account.billingRevisionId.length > 0, "Authorized Billing readers require a synthetic target revision.");
    }
  }
  assert.match(fixture.paymentDate || "", /^\d{4}-\d{2}-\d{2}$/, "The fixture payment date is required.");
  return { artifactsDir, fixture, expectedSha, password: env.NAT_SIMULATION_PASSWORD };
}

const FIXED_ROUTES = new Set([
  "/", "/login", "/dashboard", "/general-search", "/collection/save", "/collection/records", "/collection/billing-principal", "/ws",
  "/api/me", "/api/auth/login", "/api/auth/logout", "/api/activity/login", "/api/activity/heartbeat",
  "/api/analytics/summary", "/api/analytics/login-trends", "/api/analytics/top-users", "/api/analytics/recent-login-activity",
  "/api/analytics/recent-login-activity-page", "/api/analytics/peak-hours", "/api/analytics/role-distribution",
  "/api/search/global", "/api/search/columns", "/api/search/collection-history",
  "/api/collection", "/api/collection/list", "/api/collection/summary", "/api/collection/nicknames",
  "/api/collection/nickname-auth/check", "/api/collection/nickname-auth/login", "/api/collection/nickname-auth/session",
  "/api/collection/source-matches", "/api/collection/monthly-target", "/api/collection/report/billing-principal/saved-targets",
  "/api/health/live", "/api/app-config", "/api/settings", "/api/settings/tab-visibility",
]);

// Never emit search values, customer IDs, uploaded filenames, cookies or tokens.
export function natRouteLabel(rawUrl) {
  const pathname = new URL(rawUrl, NAT_BASE_URL).pathname;
  if (FIXED_ROUTES.has(pathname)) return pathname;
  if (/^\/api\/collection\/report\/billing-principal\/saved-targets\/[^/]+\/revisions\/[^/]+\/(overview|calendar)$/.test(pathname)) {
    return "/api/collection/report/billing-principal/saved-targets/:targetId/revisions/:revisionId/" + pathname.split("/").at(-1);
  }
  if (/^\/api\/collection\/report\/billing-principal\/saved-targets\/[^/]+$/.test(pathname)) return "/api/collection/report/billing-principal/saved-targets/:targetId";
  if (pathname.startsWith("/api/collection/receipts/")) return "/api/collection/receipts/:receiptId";
  if (/^\/api\/collection\/[^/]+$/.test(pathname)) return "/api/collection/:recordId";
  if (pathname.startsWith("/api/")) return "/api/:other";
  return "/:asset-or-other";
}

export function percentile95(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] * 100) / 100;
}

export function summarizeNatRequests(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.method + " " + entry.route;
    const group = groups.get(key) || { method: entry.method, route: entry.route, count: 0, statuses: {}, latencies: [] };
    group.count += 1;
    group.statuses[entry.status] = (group.statuses[entry.status] || 0) + 1;
    if (Number.isFinite(entry.latencyMs)) group.latencies.push(entry.latencyMs);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ latencies, ...group }) => ({
    ...group, p95Ms: percentile95(latencies), latencySamples: latencies.length,
  })).sort((left, right) => (left.method + " " + left.route).localeCompare(right.method + " " + right.route));
}
