import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import type { AuthenticatedUser } from "../../auth/guards";
import { COLLECTION_NICKNAME_TEMP_PASSWORD } from "../../routes/collection.validation";
import { CollectionNicknameService } from "../collection/collection-nickname.service";

function createNicknameHarness() {
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
  const auditLogs: Array<{ action: string; details?: string }> = [];
  const passwordUpdates: Array<{
    nicknameId: string;
    passwordHash: string;
    mustChangePassword: boolean;
    passwordResetBySuperuser: boolean;
    passwordUpdatedAt: Date;
  }> = [];
  const sessionWrites: Array<{ activityId: string; nickname: string }> = [];

  const service = new CollectionNicknameService({
    getCollectionStaffNicknameById: async (id: string) => (id === profile.id ? nicknameRecord : undefined),
    getCollectionNicknameAuthProfileByName: async (nickname: string) =>
      nickname.toLowerCase() === profile.nickname.toLowerCase() ? profile : undefined,
    setCollectionNicknamePassword: async (params: any) => {
      passwordUpdates.push({
        nicknameId: params.nicknameId,
        passwordHash: params.passwordHash,
        mustChangePassword: Boolean(params.mustChangePassword),
        passwordResetBySuperuser: Boolean(params.passwordResetBySuperuser),
        passwordUpdatedAt: params.passwordUpdatedAt,
      });
      profile.nicknamePasswordHash = params.passwordHash;
      profile.mustChangePassword = Boolean(params.mustChangePassword);
      profile.passwordResetBySuperuser = Boolean(params.passwordResetBySuperuser);
      profile.passwordUpdatedAt = params.passwordUpdatedAt;
    },
    setCollectionNicknameSession: async (params: any) => {
      sessionWrites.push({
        activityId: params.activityId,
        nickname: params.nickname,
      });
    },
    createAuditLog: async (entry: any) => {
      auditLogs.push({
        action: String(entry.action || ""),
        details: entry.details,
      });
      return entry;
    },
  } as any);

  return {
    service,
    profile,
    auditLogs,
    passwordUpdates,
    sessionWrites,
  };
}

function buildUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    userId: "user-1",
    username: "collector.user",
    role: "user",
    activityId: "activity-1",
    ...overrides,
  };
}

test("CollectionNicknameService.resetNicknamePassword returns the configured temporary password and hashes it", async () => {
  const { service, profile, auditLogs, passwordUpdates } = createNicknameHarness();

  const result = await service.resetNicknamePassword(
    buildUser({ username: "superuser", role: "superuser", activityId: "activity-super-1" }),
    profile.id,
  );

  assert.equal(result.ok, true);
  assert.equal(result.temporaryPassword, COLLECTION_NICKNAME_TEMP_PASSWORD);
  assert.equal(passwordUpdates.length, 1);
  assert.equal(passwordUpdates[0]?.nicknameId, profile.id);
  assert.equal(passwordUpdates[0]?.mustChangePassword, true);
  assert.equal(passwordUpdates[0]?.passwordResetBySuperuser, true);
  assert.equal(await bcrypt.compare(COLLECTION_NICKNAME_TEMP_PASSWORD, profile.nicknamePasswordHash || ""), true);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, "COLLECTION_NICKNAME_PASSWORD_RESET");
});

test("CollectionNicknameService.loginNickname accepts the reset temporary password and requires a forced password change", async () => {
  const { service, profile, sessionWrites } = createNicknameHarness();

  await service.resetNicknamePassword(
    buildUser({ username: "superuser", role: "superuser", activityId: "activity-super-1" }),
    profile.id,
  );

  const result = await service.loginNickname(buildUser(), {
    nickname: profile.nickname,
    password: COLLECTION_NICKNAME_TEMP_PASSWORD,
  });

  assert.equal(result.ok, true);
  assert.equal(result.nickname.nickname, profile.nickname);
  assert.equal(result.nickname.mustChangePassword, true);
  assert.equal(result.nickname.passwordResetBySuperuser, true);
  assert.equal(result.nickname.requiresForcedPasswordChange, true);
  assert.equal(sessionWrites.length, 0);
});
