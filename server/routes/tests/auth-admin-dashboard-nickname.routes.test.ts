import assert from "node:assert/strict";
import test from "node:test";
import { registerAuthRoutes } from "../auth.routes";
import type { PostgresStorage } from "../../storage-postgres";
import { readManagedUserBody } from "../auth/auth-admin-request-parsers";
import { createAccountsStorageDouble } from "./auth-route-admin-doubles";
import { createJsonTestApp, createTestAuthenticateToken, createTestRequireRole, startTestServer, stopTestServer } from "./http-test-utils";

const nicknameId = "11111111-1111-4111-8111-111111111111";
test("managed create parser accepts optional stable nickname IDs without accepting malformed values", () => {
  const base = { username: "synthetic.user", email: "user@example.test", role: "user" };
  assert.equal(readManagedUserBody(base).dashboardNicknameId, undefined);
  assert.equal(readManagedUserBody({ ...base, dashboardNicknameId: null }).dashboardNicknameId, null);
  assert.equal(readManagedUserBody({ ...base, dashboardNicknameId: nicknameId }).dashboardNicknameId, nicknameId);
  for (const value of ["", "nickname-name", 10, [], {}]) assert.throws(() => readManagedUserBody({ ...base, dashboardNicknameId: value }));
});

test("managed create nickname choices enforce HTTP superuser guard, exact query and minimal response", async () => {
  const seed = createAccountsStorageDouble();
  const calls: unknown[] = [];
  const storage = { ...seed.storage,
    getCollectionStaffNicknames: async (options: unknown) => { calls.push(options); return [{ id: nicknameId, nickname: "SYNTHETIC.STAFF", nicknamePasswordHash: "never-expose", fullName: "not-needed" }]; },
  } as unknown as PostgresStorage;
  const app = createJsonTestApp();
  registerAuthRoutes(app, { storage, authenticateToken: createTestAuthenticateToken(), requireRole: createTestRequireRole(), connectedClients: new Map() });
  const { server, baseUrl } = await startTestServer(app);
  const headers = { "x-test-userid": seed.actor.id, "x-test-username": seed.actor.username, "x-test-role": "superuser", "Content-Type": "application/json" };
  const endpoint = `${baseUrl}/api/admin/users/dashboard-nicknames`;
  try {
    assert.equal((await fetch(`${endpoint}?role=user`)).status, 401);
    for (const role of ["user", "admin", "manager"]) assert.equal((await fetch(`${endpoint}?role=user`, { headers: { ...headers, "x-test-role": role } })).status, 403);
    assert.deepEqual(calls, []);
    const create = { username: "synthetic.user", email: "user@example.test", role: "user", dashboardNicknameId: nicknameId };
    assert.equal((await fetch(`${baseUrl}/api/admin/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(create) })).status, 401);
    for (const role of ["user", "admin", "manager"]) {
      assert.equal((await fetch(`${baseUrl}/api/admin/users`, { method: "POST", headers: { ...headers, "x-test-role": role }, body: JSON.stringify(create) })).status, 403);
    }
    assert.deepEqual(calls, []);
    for (const query of ["", "?role=manager", "?role=superuser", "?role=user&role=admin", "?role=user&activeOnly=0"]) {
      assert.equal((await fetch(endpoint + query, { headers })).status, 400);
    }
    assert.deepEqual(calls, []);
    for (const role of ["user", "admin"]) {
      const response = await fetch(`${endpoint}?role=${role}`, { headers });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, nicknames: [{ id: nicknameId, nickname: "SYNTHETIC.STAFF" }] });
    }
    assert.deepEqual(calls, [{ activeOnly: true, allowedRole: "user" }, { activeOnly: true, allowedRole: "admin" }]);
    for (const body of [{ role: "user", dashboardNicknameId: "invalid" }, { role: "manager", dashboardNicknameId: nicknameId }]) {
      assert.equal((await fetch(`${baseUrl}/api/admin/users`, { method: "POST", headers, body: JSON.stringify(body) })).status, 400);
    }
  } finally { await stopTestServer(server); }
});
