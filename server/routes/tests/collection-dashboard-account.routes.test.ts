import assert from "node:assert/strict";
import test from "node:test";
import { registerCollectionRoutes } from "../collection.routes";
import type { PostgresStorage } from "../../storage-postgres";
import { createJsonTestApp, createTestAuthenticateToken, createTestRequireRole, createTestRequireTabAccess, startTestServer, stopTestServer } from "./http-test-utils";

test("Dashboard account links are strictly superuser-managed with stable target IDs and validated bodies", async () => {
  const calls: unknown[] = [];
  const nicknameId = "11111111-1111-4111-8111-111111111111";
  const storage = {
    getUser: async (id: string) => id === "missing" ? undefined : { id, role: id === "manager" ? "manager" : id === "admin" ? "admin" : "user", status: "active" },
    getCollectionDashboardAccount: async (id: string) => { calls.push(["get", id]); return null; },
    getCollectionStaffNicknames: async (options: unknown) => { calls.push(["options", options]); return [{ id: nicknameId, nickname: "STAFF", nicknamePasswordHash: "never-return-this" }]; },
    setCollectionDashboardAccount: async (input: unknown) => { calls.push(["set", input]); return null; },
  } as unknown as PostgresStorage;
  const app = createJsonTestApp();
  registerCollectionRoutes(app, { storage, authenticateToken: createTestAuthenticateToken(), requireRole: createTestRequireRole(), requireTabAccess: createTestRequireTabAccess() });
  const { server, baseUrl } = await startTestServer(app);
  const endpoint = `${baseUrl}/api/collection/dashboard-accounts/user`;
  const headers = { "x-test-role": "superuser", "x-test-username": "operator", "Content-Type": "application/json" };
  try {
    for (const method of ["GET", "PUT"]) {
      assert.equal((await fetch(endpoint, { method })).status, 401);
      for (const role of ["user", "admin", "manager"]) {
        assert.equal((await fetch(endpoint, { method, headers: { ...headers, "x-test-role": role } })).status, 403);
      }
    }
    assert.deepEqual(calls, []);
    const data = await (await fetch(endpoint, { headers })).json();
    assert.deepEqual(data, { ok: true, link: null, nicknames: [{ id: nicknameId, nickname: "STAFF" }] });
    assert.deepEqual(calls, [["get", "user"], ["options", { activeOnly: true, allowedRole: "user" }]]);
    calls.length = 0;
    for (const body of [{}, { nicknameId: "not-a-uuid" }, { nicknameId, accountRole: "superuser" }, { nicknameId, userId: "other" }]) {
      assert.equal((await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.deepEqual(calls, []);
    for (const value of [nicknameId, null]) {
      assert.equal((await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ nicknameId: value }) })).status, 200);
    }
    assert.deepEqual(calls, [nicknameId, null].map((value) => ["set", { userId: "user", nicknameId: value, actor: "operator" }]));
    assert.equal((await fetch(`${baseUrl}/api/collection/dashboard-accounts/manager`, { headers })).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/collection/dashboard-accounts/missing`, { headers })).status, 404);
  } finally { await stopTestServer(server); }
});
