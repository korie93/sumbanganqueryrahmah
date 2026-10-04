import assert from "node:assert/strict";
import express from "express";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { authCurrentUserSchema } from "../../../shared/api-contracts";
import { runtimeConfig } from "../../config/runtime";
import { createCsrfProtectionMiddleware } from "../../http/csrf";
import { registerLocalHttpBodyParsers } from "../../internal/local-http-body-parsers";
import { registerAuthRoutes } from "../auth.routes";
import { createOwnCredentialsStorageDouble } from "./auth-route-self-service-doubles";
import { createTestAuthenticateToken, createTestRequireRole, startTestServer, stopTestServer } from "./http-test-utils";

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const upload = { fileName: "photo.png", mimeType: "image/png", contentBase64: pngBase64 };

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-avatar-routes-"));
  const previous = runtimeConfig.app.uploadsRootDir;
  runtimeConfig.app.uploadsRootDir = root;
  const state = createOwnCredentialsStorageDouble({ user: { createdAt: new Date("2026-03-01T00:00:00Z") } });
  const app = express();
  registerLocalHttpBodyParsers(app, { collectionBodyLimit: "1mb", defaultBodyLimit: "8kb", importBodyLimit: "1mb" });
  app.use(createCsrfProtectionMiddleware({ allowedOrigins: ["http://localhost"] }));
  let limiterCalls = 0;
  registerAuthRoutes(app, {
    storage: state.storage,
    authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(),
    connectedClients: new Map(),
    rateLimiters: { authenticatedAuth: (_req, _res, next) => { limiterCalls += 1; next(); } },
  });
  const server = await startTestServer(app);
  return {
    ...state, ...server, limiterCalls: () => limiterCalls,
    headers: { "Content-Type": "application/json", "x-test-userid": state.user.id, "x-test-username": state.user.username, "x-test-role": state.user.role },
    async dispose() { await stopTestServer(server.server); runtimeConfig.app.uploadsRootDir = previous; await fs.rm(root, { recursive: true, force: true }); },
  };
}

test("all authenticated roles can save their own avatar and canonical current-user payload carries only safe metadata", async () => {
  const f = await fixture();
  try {
    for (const role of ["user", "admin", "manager", "superuser"]) {
      f.user.role = role;
      const response = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers: { ...f.headers, "x-test-role": role }, body: JSON.stringify(upload) });
      const payload = await response.json();
      assert.equal(response.status, 200, JSON.stringify(payload));
      assert.equal(payload.user.id, f.user.id);
      assert.equal(payload.user.createdAt, "2026-03-01T00:00:00.000Z");
      assert.match(payload.user.avatarUrl, /^\/api\/me\/avatar\?v=[a-f0-9]{24}$/);
      assert.equal(payload.user.passwordHash, undefined);
      assert.equal(payload.user.twoFactorSecretEncrypted, undefined);
      assert.equal(JSON.stringify(payload).includes("profile-avatars"), false);
      assert.equal(authCurrentUserSchema.safeParse(payload.user).success, true);
      for (const avatarUrl of ["https://example.test/photo.png", "javascript:alert(1)", "/uploads/profile-avatars/file.avatar", "/api/me/avatar?userId=other"]) {
        assert.equal(authCurrentUserSchema.safeParse({ ...payload.user, avatarUrl }).success, false);
      }
      const image = await fetch(`${f.baseUrl}${payload.user.avatarUrl}`, { headers: f.headers });
      assert.equal(image.status, 200);
      assert.equal(image.headers.get("content-type"), "image/png");
      assert.equal(image.headers.get("cache-control"), "private, no-store");
      assert.equal(image.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(pngBase64, "base64"));
      const me = await fetch(`${f.baseUrl}/api/me`, { headers: f.headers });
      assert.equal((await me.json()).user.avatarUrl, payload.user.avatarUrl);
    }
    assert.equal(f.limiterCalls(), 4);
    assert.deepEqual(f.auditLogs.map((entry) => entry.action), Array(4).fill("USER_PROFILE_PICTURE_UPDATED"));
    assert.equal(f.credentialUpdates.length, 0);
    assert.equal(f.accountUpdates.length, 0);
    // A copied current-user avatar URL is a cache revision, never an account selector.
    const otherUser = { ...f.user, id: "another-account-id", username: "another.account" };
    const originalGetUser = f.storage.getUser.bind(f.storage);
    f.storage.getUser = async (id) => id === otherUser.id
      ? otherUser as unknown as NonNullable<Awaited<ReturnType<typeof originalGetUser>>>
      : originalGetUser(id);
    const ownMe = await fetch(`${f.baseUrl}/api/me`, { headers: f.headers });
    const ownPhotoUrl = (await ownMe.json()).user.avatarUrl;
    const otherHeaders = { ...f.headers, "x-test-userid": otherUser.id, "x-test-username": otherUser.username };
    assert.equal((await fetch(`${f.baseUrl}${ownPhotoUrl}`, { headers: otherHeaders })).status, 404);
    assert.equal((await fetch(`${f.baseUrl}${ownPhotoUrl}`, { headers: f.headers })).status, 200);
  } finally { await f.dispose(); }
});

test("avatar routes reject anonymous, forbidden account states, another identity and protected payload fields", async () => {
  const f = await fixture();
  try {
    for (const method of ["GET", "PUT", "DELETE"]) {
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { method })).status, 401);
    }
    for (const key of ["userId", "username", "email", "role", "permissions", "status", "path"]) {
      const response = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers: f.headers, body: JSON.stringify({ ...upload, [key]: "other" }) });
      assert.equal(response.status, 400);
      const removeResponse = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "DELETE", headers: f.headers, body: JSON.stringify({ [key]: "other" }) });
      assert.equal(removeResponse.status, 400);
    }
    assert.equal((await fetch(`${f.baseUrl}/api/me/avatar?userId=other`, { headers: f.headers })).status, 400);
    assert.equal((await fetch(`${f.baseUrl}/api/me/avatar/other`, { method: "PUT", headers: f.headers, body: JSON.stringify(upload) })).status, 404);
    for (const query of ["userId=other", "v=0123456789abcdef01234567"]) {
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar?${query}`, { method: "DELETE", headers: f.headers })).status, 400);
    }
    assert.equal((await fetch(`${f.baseUrl}/api/me/avatar/other`, { method: "DELETE", headers: f.headers })).status, 404);
    for (const body of [[], null, "other", 1]) {
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { method: "DELETE", headers: f.headers, body: JSON.stringify(body) })).status, 400);
    }
    for (const state of [{ isBanned: true }, { status: "disabled" }, { status: "deleted" }, { mustChangePassword: true }]) {
      Object.assign(f.user, { isBanned: false, status: "active", mustChangePassword: false }, state);
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers: f.headers, body: JSON.stringify(upload) })).status, 403);
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { method: "DELETE", headers: f.headers })).status, 403);
    }
    assert.equal(f.auditLogs.length, 0);
  } finally { await f.dispose(); }
});

test("avatar mutation remains CSRF protected and scoped JSON parsing accepts above-default images but rejects excess", async () => {
  const f = await fixture();
  try {
    const csrfRejected = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers: { ...f.headers, cookie: "sqr_auth=fixture-session" }, body: JSON.stringify(upload) });
    assert.equal(csrfRejected.status, 403);
    const csrfRemoveRejected = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "DELETE", headers: { ...f.headers, cookie: "sqr_auth=fixture-session" } });
    assert.equal(csrfRemoveRejected.status, 403);
    assert.equal(f.limiterCalls(), 0);
    const aboveDefault = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers: f.headers, body: JSON.stringify({ ...upload, contentBase64: Buffer.alloc(20000).toString("base64") }) });
    assert.equal(aboveDefault.status, 400, "Scoped parser admits the bounded payload; image validation rejects non-image content.");
    const excessive = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers: f.headers, body: JSON.stringify({ ...upload, contentBase64: "A".repeat(1_500_000) }) });
    assert.equal(excessive.status, 413);
    assert.equal(f.auditLogs.length, 0);
  } finally { await f.dispose(); }
});

test("all authenticated roles can remove only their own avatar and synchronize a canonical empty avatar", async () => {
  const f = await fixture();
  try {
    const otherUser = { ...f.user, id: "another-account-id", username: "another.account" };
    const originalGetUser = f.storage.getUser.bind(f.storage);
    f.storage.getUser = async (id) => id === otherUser.id
      ? otherUser as unknown as NonNullable<Awaited<ReturnType<typeof originalGetUser>>>
      : originalGetUser(id);
    const otherHeaders = { ...f.headers, "x-test-userid": otherUser.id, "x-test-username": otherUser.username };
    assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers: otherHeaders, body: JSON.stringify(upload) })).status, 200);

    for (const role of ["user", "admin", "manager", "superuser"]) {
      f.user.role = role;
      const headers = { ...f.headers, "x-test-role": role };
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { method: "PUT", headers, body: JSON.stringify(upload) })).status, 200);
      const removed = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "DELETE", headers });
      const payload = await removed.json();
      assert.equal(removed.status, 200, JSON.stringify(payload));
      assert.equal(payload.ok, true);
      assert.equal(payload.user.id, f.user.id);
      assert.equal(payload.user.avatarUrl, null);
      assert.equal(payload.user.createdAt, "2026-03-01T00:00:00.000Z");
      assert.equal(authCurrentUserSchema.safeParse(payload.user).success, true);
      assert.equal(payload.user.passwordHash, undefined);
      assert.equal(payload.user.twoFactorSecretEncrypted, undefined);
      assert.equal(JSON.stringify(payload).includes("profile-avatars"), false);
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { headers })).status, 404);
      assert.equal((await (await fetch(`${f.baseUrl}/api/auth/me`, { headers })).json()).user.avatarUrl, null);
      const repeated = await fetch(`${f.baseUrl}/api/me/avatar`, { method: "DELETE", headers, body: "{}" });
      assert.equal(repeated.status, 200);
      assert.equal((await repeated.json()).user.avatarUrl, null);
      assert.equal((await fetch(`${f.baseUrl}/api/me/avatar`, { headers: otherHeaders })).status, 200);
    }
    assert.equal(f.limiterCalls(), 13, "Every save/remove attempt retains the existing authenticated limiter.");
    const removalLogs = f.auditLogs.filter((entry) => entry.action === "USER_PROFILE_PICTURE_REMOVED");
    assert.equal(removalLogs.length, 4, "Already-absent photos do not produce duplicate removal events.");
    for (const entry of removalLogs) {
      assert.equal(entry.performedBy, f.user.id);
      assert.equal(entry.targetUser, f.user.id);
      assert.deepEqual(JSON.parse(entry.details!), { removed: true });
    }
    assert.equal(f.credentialUpdates.length, 0);
    assert.equal(f.accountUpdates.length, 0);
  } finally { await f.dispose(); }
});

test("legacy self-credentials rejects identity and administrative fields, including mixed password payloads", async () => {
  const f = await fixture();
  try {
    for (const field of ["username", "email", "role", "permissions", "status", "userId", "isBanned"]) {
      const response = await fetch(`${f.baseUrl}/api/me/credentials`, { method: "PATCH", headers: f.headers, body: JSON.stringify({ [field]: "other" }) });
      assert.equal(response.status, 400);
    }
    for (const body of [{ newUsername: "other" }, { newUsername: "other", currentPassword: "current", newPassword: "AnotherPassword!123" }]) {
      const response = await fetch(`${f.baseUrl}/api/me/credentials`, { method: "PATCH", headers: f.headers, body: JSON.stringify(body) });
      assert.equal(response.status, 403);
    }
    assert.equal(f.credentialUpdates.length, 0);
    assert.equal(f.accountUpdates.length, 0);
    assert.equal(f.auditLogs.length, 0);
  } finally { await f.dispose(); }
});
