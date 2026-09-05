import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { COLLECTION_RECEIPT_DIR, COLLECTION_RECEIPT_PUBLIC_PREFIX } from "../../lib/collection-receipt-files";
import bcrypt from "bcrypt";
import { registerCollectionRoutes } from "../collection.routes";
import type { CollectionNicknameSession } from "../../storage-postgres";
import { createCoreCollectionStorageDouble } from "./collection-route-record-doubles";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  createTestRequireTabAccess,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

const password = "CollectionFixture42!";
const passwordHash = bcrypt.hashSync(password, 4);

test("save/update reject client-forged stored receipt paths without attaching or deleting existing files", async () => {
  const h = await createHarness();
  const filename = `save-access-test-${randomUUID()}.png`;
  const filePath = path.join(COLLECTION_RECEIPT_DIR, filename);
  await fs.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });
  await fs.writeFile(filePath, "another record's test-owned receipt");
  try {
    assert.equal((await h.login("user", "Collector Alpha")).status, 200);
    const initial = await h.save("user", "Collector Alpha");
    assert.equal(initial.status, 200);
    const id = (await initial.json()).record.id;
    for (const method of ["POST", "PATCH", "PUT"]) {
      const response = await fetch(`${h.baseUrl}/api/collection${method === "POST" ? "" : `/${id}`}`, {
        method, headers: h.headers("user"), body: JSON.stringify({
          ...h.payload("Collector Alpha"),
          uploadedReceipts: [{ storagePath: `${COLLECTION_RECEIPT_PUBLIC_PREFIX}/${filename}`,
            originalFileName: filename, fileSize: 34 }],
        }),
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).message, /metadata cannot be supplied/i);
      await fs.access(filePath);
    }
    assert.equal(h.createCalls.length, 1);
    assert.equal(h.updateCalls.length, 0);
  } finally {
    await stopTestServer(h.server);
    await fs.unlink(filePath).catch(() => undefined);
  }
});

async function createHarness() {
  const core = createCoreCollectionStorageDouble();
  const profiles = [
    { id: "nickname-admin", nickname: "Admin Alpha", roleScope: "admin" as const },
    { id: "nickname-user", nickname: "Collector Alpha", roleScope: "user" as const },
    { id: "nickname-other", nickname: "Collector Beta", roleScope: "both" as const },
  ].map((profile) => ({
    ...profile,
    isActive: true,
    nicknamePasswordHash: passwordHash,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    passwordUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  }));
  const sessions = new Map<string, CollectionNicknameSession>();
  core.storage.getCollectionNicknameAuthProfileByName = async (nickname) =>
    profiles.find((profile) => profile.nickname.toLowerCase() === nickname.trim().toLowerCase());
  core.storage.getCollectionStaffNicknameByName = async (nickname) => {
    const profile = profiles.find((item) => item.nickname.toLowerCase() === nickname.trim().toLowerCase());
    return profile ? { ...profile, createdBy: "superuser", createdAt: new Date("2026-01-01T00:00:00Z") } : undefined;
  };
  core.storage.getCollectionNicknameSessionByActivity = async (activityId) => sessions.get(activityId);
  core.storage.setCollectionNicknameSession = async (session) => {
    sessions.set(session.activityId, { ...session, verifiedAt: new Date(), updatedAt: new Date() });
  };
  core.storage.clearCollectionNicknameSessionByActivity = async (activityId) => { sessions.delete(activityId); };
  core.storage.getCollectionAdminGroupVisibleNicknameValuesByLeader = async () => [];
  const app = createJsonTestApp();
  registerCollectionRoutes(app, {
    storage: core.storage,
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    requireTabAccess: createTestRequireTabAccess(),
  });
  const running = await startTestServer(app);
  const headers = (role: string, activity = `${role}-activity`) => ({
    "content-type": "application/json",
    "x-test-role": role,
    "x-test-username": `${role}.login`,
    "x-test-activityid": activity,
  });
  const login = (role: string, nickname: string, activity?: string) => fetch(`${running.baseUrl}/api/collection/nickname-auth/login`, {
    method: "POST", headers: headers(role, activity), body: JSON.stringify({ nickname, password }),
  });
  const payload = (nickname: string) => ({
    customerName: "Test Customer", icNumber: "900101010001", customerPhone: "0123456789",
    accountNumber: "ACC-2002", batch: "P25", paymentDate: "2026-03-15", amount: "150.00",
    collectionStaffNickname: nickname,
    // The actor must always come from authenticated middleware, never these fields.
    createdByLogin: "forged.login", role: "superuser",
  });
  const save = (role: string, nickname: string, activity?: string) => fetch(`${running.baseUrl}/api/collection`, {
    method: "POST", headers: headers(role, activity), body: JSON.stringify(payload(nickname)),
  });
  return { ...core, ...running, profiles, sessions, headers, login, payload, save };
}

for (const [role, nickname] of [["admin", "Admin Alpha"], ["user", "Collector Alpha"]] as const) {
  test(`${role}: matching succeeds, missing nickname session is recoverable, verified save retains canonical nickname and real actor`, async () => {
    const h = await createHarness();
    try {
      const match = await fetch(`${h.baseUrl}/api/collection/source-matches`, {
        method: "POST", headers: h.headers(role), body: JSON.stringify(h.payload(nickname)),
      });
      assert.equal(match.status, 200);
      const rejected = await h.save(role, nickname);
      assert.equal(rejected.status, 403);
      assert.equal((await rejected.json()).error.code, "COLLECTION_NICKNAME_SESSION_REQUIRED");
      assert.equal(h.createCalls.length, 0);
      assert.equal((await h.login(role, nickname)).status, 200);
      const session = await fetch(`${h.baseUrl}/api/collection/nickname-auth/session`, { headers: h.headers(role) });
      assert.equal(session.status, 200);
      assert.deepEqual(await session.json(), { ok: true, nickname: { id: role === "admin" ? "nickname-admin" : "nickname-user", nickname } });
      const saved = await h.save(role, `  ${nickname.toLowerCase()}  `);
      assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
      const record = (await saved.json()).record;
      assert.equal(record.collectionStaffNickname, nickname);
      assert.equal(record.createdByLogin, `${role}.login`);
      assert.equal(h.createCalls.length, 1);
      assert.equal(h.createCalls[0]?.amount, 150);
      const audit = h.auditLogs.find((entry) => entry.action === "COLLECTION_RECORD_CREATED");
      assert.equal(audit?.performedBy, `${role}.login`);
      assert.equal(JSON.parse(audit?.details || "{}").snapshot.collectionStaffNickname, nickname);
      const otherActivity = await h.save(role, nickname, "new-login-activity");
      assert.equal(otherActivity.status, 403);
      assert.equal(h.createCalls.length, 1);
    } finally { await stopTestServer(h.server); }
  });

  test(`${role}: forged nickname, invalidated credentials, inactive/scope-changed nickname and session identity mismatch are denied`, async () => {
    const h = await createHarness();
    try {
      assert.equal((await h.login(role, nickname)).status, 200);
      const forged = await h.save(role, "Collector Beta");
      assert.equal(forged.status, 403);
      assert.equal((await forged.json()).error.code, "COLLECTION_NICKNAME_SESSION_MISMATCH");
      const profile = h.profiles.find((item) => item.nickname === nickname)!;
      for (const change of [
        { isActive: false }, { mustChangePassword: true }, { passwordResetBySuperuser: true },
        { passwordUpdatedAt: new Date(Date.now() + 10_000) },
        { roleScope: role === "admin" ? "user" as const : "admin" as const },
      ]) {
        const before = { ...profile };
        Object.assign(profile, change);
        const result = await h.save(role, nickname);
        assert.ok(result.status === 400 || result.status === 403);
        const session = await fetch(`${h.baseUrl}/api/collection/nickname-auth/session`, { headers: h.headers(role) });
        assert.equal((await session.json()).nickname, null);
        Object.assign(profile, before);
        assert.equal((await h.login(role, nickname)).status, 200);
      }
      const verified = h.sessions.get(`${role}-activity`)!;
      for (const replacement of [
        { ...verified, username: "another.login" },
        { ...verified, userRole: role === "admin" ? "user" : "admin" },
        { ...verified, activityId: "another-activity" },
      ]) {
        h.sessions.set(`${role}-activity`, replacement);
        assert.equal((await h.save(role, nickname)).status, 403);
      }
      assert.equal(h.createCalls.length, 0);
    } finally { await stopTestServer(h.server); }
  });
}

test("superuser chooses any active nickname scope; missing/unknown/inactive selections cannot create records", async () => {
  const h = await createHarness();
  try {
    for (const profile of h.profiles) {
      const response = await h.save("superuser", profile.nickname);
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      const record = (await response.json()).record;
      assert.equal(record.collectionStaffNickname, profile.nickname);
      assert.equal(record.createdByLogin, "superuser.login");
    }
    assert.equal(h.sessions.size, 0);
    for (const nickname of ["", "Unknown Nickname"]) {
      assert.equal((await h.save("superuser", nickname)).status, 400);
    }
    h.profiles[0]!.isActive = false;
    assert.equal((await h.save("superuser", h.profiles[0]!.nickname)).status, 400);
    assert.equal(h.createCalls.length, 3);
    assert.equal(h.auditLogs.filter((entry) => entry.action === "COLLECTION_RECORD_CREATED").length, 3);
  } finally { await stopTestServer(h.server); }
});

for (const [role, nickname] of [["admin", "Admin Alpha"], ["user", "Collector Alpha"]] as const) {
  test(`${role}: idempotent create/update retry cannot bypass revoked verification or disclose another nickname`, async () => {
    const h = await createHarness();
    try {
      assert.equal((await h.login(role, nickname)).status, 200);
      const headers = { ...h.headers(role), "x-idempotency-key": `${role}-create-access` };
      const create = () => fetch(`${h.baseUrl}/api/collection`, {
        method: "POST", headers, body: JSON.stringify(h.payload(nickname)),
      });
      const initial = await create();
      assert.equal(initial.status, 200);
      const id = (await initial.json()).record.id;
      assert.equal((await create()).status, 200);
      assert.equal(h.createCalls.length, 1);
      const update = () => fetch(`${h.baseUrl}/api/collection/${id}`, {
        method: "PATCH", headers: { ...h.headers(role), "x-idempotency-key": `${role}-update-access` },
        body: JSON.stringify({ amount: "151.00" }),
      });
      assert.equal((await update()).status, 200);
      assert.equal((await update()).status, 200);
      assert.equal(h.updateCalls.length, 1);
      h.sessions.clear();
      assert.equal((await create()).status, 403);
      assert.equal((await update()).status, 403);
      const ordinaryUpdate = await fetch(`${h.baseUrl}/api/collection/${id}`, {
        method: "PATCH", headers: h.headers(role), body: JSON.stringify({ amount: "152.00" }),
      });
      assert.equal(ordinaryUpdate.status, 403);
      assert.equal((await h.login(role, "Collector Beta")).status, 200);
      assert.equal((await create()).status, 403);
      assert.equal((await update()).status, 403);
      assert.equal(h.createCalls.length, 1);
      assert.equal(h.updateCalls.length, 1);
    } finally { await stopTestServer(h.server); }
  });
}

test("user cannot reassign their collection through PATCH; verified admin group editing is preserved", async () => {
  const h = await createHarness();
  try {
    assert.equal((await h.login("user", "Collector Alpha")).status, 200);
    const created = await h.save("user", "Collector Alpha");
    const id = (await created.json()).record.id;
    const forged = await fetch(`${h.baseUrl}/api/collection/${id}`, {
      method: "PATCH", headers: h.headers("user"), body: JSON.stringify({ collectionStaffNickname: "Collector Beta" }),
    });
    assert.equal(forged.status, 403);
    assert.equal(h.updateCalls.length, 0);
    assert.equal((await h.login("admin", "Admin Alpha")).status, 200);
    h.storage.getCollectionAdminGroupVisibleNicknameValuesByLeader = async () => ["Admin Alpha", "Collector Alpha"];
    const allowed = await fetch(`${h.baseUrl}/api/collection/${id}`, {
      method: "PATCH", headers: h.headers("admin"), body: JSON.stringify({ amount: "155.00" }),
    });
    assert.equal(allowed.status, 200);
    assert.equal(h.updateCalls.length, 1);
    h.profiles[0]!.mustChangePassword = true;
    const revoked = await fetch(`${h.baseUrl}/api/collection/${id}`, {
      method: "PATCH", headers: h.headers("admin"), body: JSON.stringify({ amount: "160.00" }),
    });
    assert.equal(revoked.status, 403);
    assert.equal(h.updateCalls.length, 1);
  } finally { await stopTestServer(h.server); }
});

test("Collection save/session routes reject unauthenticated requests, manager mutations and disabled module access", async () => {
  const h = await createHarness();
  try {
    for (const url of ["/api/collection", "/api/collection/nickname-auth/session"]) {
      const response = await fetch(`${h.baseUrl}${url}`, { method: url === "/api/collection" ? "POST" : "GET" });
      assert.equal(response.status, 401);
      const manager = await fetch(`${h.baseUrl}${url}`, {
        method: url === "/api/collection" ? "POST" : "GET", headers: h.headers("manager"),
      });
      assert.equal(manager.status, 403);
      const disabled = await fetch(`${h.baseUrl}${url}`, {
        method: url === "/api/collection" ? "POST" : "GET",
        headers: { ...h.headers("user"), "x-test-deny-tabs": "collection-report" },
      });
      assert.equal(disabled.status, 403);
    }
    assert.equal(h.createCalls.length, 0);
  } finally { await stopTestServer(h.server); }
});
