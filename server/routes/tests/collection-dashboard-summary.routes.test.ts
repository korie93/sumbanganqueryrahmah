import assert from "node:assert/strict";
import test from "node:test";
import { registerCollectionRoutes } from "../collection.routes";
import type { PostgresStorage } from "../../storage-postgres";
import { createJsonTestApp, createTestAuthenticateToken, createTestRequireRole, createTestRequireTabAccess, startTestServer, stopTestServer } from "./http-test-utils";

test("dashboard summary opt-in retains auth/tab guards and restricted rows never read the team directory", async () => {
  const calls: string[] = [];
  const storage = {
    getCollectionMonthlySummary: async () => { calls.push("summary"); return [{ month: 10, monthName: "October", totalRecords: 1, totalAmount: 20 }]; },
    getCollectionNicknameSessionByActivity: async () => null,
    getCollectionAdminGroups: async () => { calls.push("groups"); return []; },
    getCollectionStaffNicknames: async () => { calls.push("nicknames"); return []; },
    summarizeCollectionRecordsByNickname: async () => { calls.push("aggregate"); return [{ nickname: "STAFF", totalRecords: 1, totalAmount: 20 }]; },
  } as unknown as PostgresStorage;
  const app = createJsonTestApp();
  registerCollectionRoutes(app, { storage, authenticateToken: createTestAuthenticateToken(), requireRole: createTestRequireRole(), requireTabAccess: createTestRequireTabAccess() });
  const { server, baseUrl } = await startTestServer(app);
  const endpoint = `${baseUrl}/api/collection/summary?year=2026&includeDashboard=1&month=10`;
  try {
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal(calls.length, 0);
    for (const role of ["user", "admin", "manager"]) {
      const denied = await fetch(endpoint, { headers: { "x-test-role": role, "x-test-username": "viewer", "x-test-deny-tabs": "collection-report" } });
      assert.equal(denied.status, 403);
      assert.equal(calls.length, 0);
    }
    for (const role of ["user", "admin", "manager", "superuser"]) {
      calls.length = 0;
      const response = await fetch(endpoint, { headers: { "x-test-role": role, "x-test-username": "viewer" } });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.dashboard.canViewLeaderBreakdown, role === "manager" || role === "superuser");
      assert.deepEqual(payload.dashboard.leaders, []);
      if (role === "user" || role === "admin") {
        assert.equal(calls.includes("groups"), false);
        assert.equal(calls.includes("aggregate"), false);
        assert.equal(payload.dashboard.unassignedAmount, 0);
      } else {
        assert.equal(calls.filter((name) => name === "aggregate").length, 1);
        assert.equal(payload.dashboard.unassignedAmount, 20);
      }
    }
  } finally { await stopTestServer(server); }
});

test("Dashboard ignores forged account/group identity and takes scope from authenticated stable user ID", async () => {
  const lookups: string[] = [];
  const filters: unknown[] = [];
  const storage = {
    getCollectionDashboardAccount: async (id: string) => {
      lookups.push(id);
      return { nicknameId: "nickname", nickname: "OWN", accountRole: "user", isActive: true };
    },
    getCollectionMonthlySummary: async (input: unknown) => {
      filters.push(input);
      return [{ month: 10, monthName: "October", totalAmount: 123, totalRecords: 2 }];
    },
    getCollectionNicknameSessionByActivity: async () => { throw new Error("Transient session is not Dashboard ownership"); },
  } as unknown as PostgresStorage;
  const app = createJsonTestApp();
  registerCollectionRoutes(app, { storage, authenticateToken: createTestAuthenticateToken(), requireRole: createTestRequireRole(), requireTabAccess: createTestRequireTabAccess() });
  const { server, baseUrl } = await startTestServer(app);
  const endpoint = `${baseUrl}/api/collection/summary?year=2026&month=10&includeDashboard=1`;
  const headers = { "x-test-role": "user", "x-test-username": "viewer", "x-test-userid": "actual-id" };
  try {
    const response = await fetch(`${endpoint}&userId=other&username=other&leaderId=other&scope=all`, { headers });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).summary[0].totalAmount, 123);
    assert.deepEqual(lookups, ["actual-id"]);
    assert.deepEqual(filters, [{ year: 2026, nicknames: ["OWN"] }]);
    assert.equal((await fetch(`${endpoint}&nicknames=OTHER`, { headers })).status, 400);
    assert.deepEqual(lookups, ["actual-id"]);
    assert.deepEqual(filters, [{ year: 2026, nicknames: ["OWN"] }]);
  } finally { await stopTestServer(server); }
});
