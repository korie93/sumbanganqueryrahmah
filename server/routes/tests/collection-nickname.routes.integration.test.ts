import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_NICKNAME_TEMP_PASSWORD } from "../../routes/collection.validation";
import { registerCollectionRoutes } from "../collection.routes";
import type { CollectionRouteDeps } from "../collection/collection-route-shared";
import {
  allowAllTabs,
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type CollectionNicknameRouteStorageDouble = Pick<
  CollectionRouteDeps["storage"],
  | "getCollectionNicknameAuthProfileByName"
  | "getCollectionStaffNicknameById"
  | "setCollectionNicknamePassword"
  | "setCollectionNicknameSession"
  | "createAuditLog"
>;
type CollectionNicknameAuditEntry = Parameters<
  CollectionNicknameRouteStorageDouble["createAuditLog"]
>[0];
type CollectionNicknameAuditRow = Awaited<
  ReturnType<CollectionNicknameRouteStorageDouble["createAuditLog"]>
>;

function createCollectionNicknameAuditRow(
  entry: CollectionNicknameAuditEntry,
): CollectionNicknameAuditRow {
  return {
    id: "audit-1",
    action: entry.action,
    performedBy: entry.performedBy,
    requestId: entry.requestId ?? null,
    targetUser: entry.targetUser ?? null,
    targetResource: entry.targetResource ?? null,
    details: entry.details ?? null,
    timestamp: new Date("2026-03-27T00:00:00.000Z"),
  };
}

function createCollectionNicknameRouteStorageDouble() {
  const profile = {
    id: "nickname-1",
    nickname: "Collector Alpha",
    isActive: true,
    roleScope: "user" as const,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    nicknamePasswordHash: null as string | null,
    passwordUpdatedAt: null as Date | null,
  };
  const nicknameRecord = {
    id: profile.id,
    nickname: profile.nickname,
    isActive: true,
    roleScope: "user" as const,
    createdBy: "superuser",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  };
  const auditLogs: CollectionNicknameAuditEntry[] = [];

  const storage: CollectionNicknameRouteStorageDouble = {
    getCollectionNicknameAuthProfileByName: async (nickname: string) =>
      nickname.toLowerCase() === profile.nickname.toLowerCase() ? profile : undefined,
    getCollectionStaffNicknameById: async (id: string) =>
      id === profile.id ? nicknameRecord : undefined,
    setCollectionNicknamePassword: async (params: {
      nicknameId: string;
      passwordHash: string;
      mustChangePassword?: boolean;
      passwordResetBySuperuser?: boolean;
      passwordUpdatedAt: Date;
    }) => {
      profile.nicknamePasswordHash = params.passwordHash;
      profile.mustChangePassword = Boolean(params.mustChangePassword);
      profile.passwordResetBySuperuser = Boolean(params.passwordResetBySuperuser);
      profile.passwordUpdatedAt = params.passwordUpdatedAt;
    },
    setCollectionNicknameSession: async () => undefined,
    createAuditLog: async (entry: CollectionNicknameAuditEntry) => {
      auditLogs.push(entry);
      return createCollectionNicknameAuditRow(entry);
    },
  };

  return {
    storage,
    profile,
    auditLogs,
  };
}

test("POST /api/collection/nicknames/:id/reset-password returns the configured temporary password", async () => {
  const { storage, profile, auditLogs } = createCollectionNicknameRouteStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage: storage as unknown as CollectionRouteDeps["storage"],
    authenticateToken: createTestAuthenticateToken({
      userId: "superuser-1",
      username: "superuser",
      role: "superuser",
      activityId: "activity-super-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/nicknames/${encodeURIComponent(profile.id)}/reset-password`, {
      method: "POST",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.nickname.nickname, profile.nickname);
    assert.equal(payload.nickname.mustChangePassword, true);
    assert.equal(payload.nickname.passwordResetBySuperuser, true);
    assert.equal(payload.temporaryPassword, COLLECTION_NICKNAME_TEMP_PASSWORD);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0]?.action, "COLLECTION_NICKNAME_PASSWORD_RESET");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/collection/nickname-auth/login accepts the reset temporary password and flags forced change", async () => {
  const { storage, profile } = createCollectionNicknameRouteStorageDouble();
  const app = createJsonTestApp();

  registerCollectionRoutes(app, {
    storage: storage as unknown as CollectionRouteDeps["storage"],
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "collector.user",
      role: "user",
      activityId: "activity-user-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
  });

  await storage.setCollectionNicknamePassword({
    nicknameId: profile.id,
    passwordHash: await import("bcrypt").then(({ default: bcrypt }) =>
      bcrypt.hash(COLLECTION_NICKNAME_TEMP_PASSWORD, 10)),
    mustChangePassword: true,
    passwordResetBySuperuser: true,
    passwordUpdatedAt: new Date("2026-03-27T00:00:00.000Z"),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/collection/nickname-auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nickname: profile.nickname,
        password: COLLECTION_NICKNAME_TEMP_PASSWORD,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.nickname.nickname, profile.nickname);
    assert.equal(payload.nickname.mustChangePassword, true);
    assert.equal(payload.nickname.passwordResetBySuperuser, true);
    assert.equal(payload.nickname.requiresForcedPasswordChange, true);
  } finally {
    await stopTestServer(server);
  }
});
