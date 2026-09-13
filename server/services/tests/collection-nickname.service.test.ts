import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import type { AuthenticatedUser } from "../../auth/guards";
import { getCredentialPasswordValidationError, isTemporaryPasswordPolicyCompliant } from "../../../shared/password-policy";
import { conflict, HttpError } from "../../http/errors";
import { CollectionNicknameService } from "../collection/collection-nickname.service";

type CollectionNicknameStorage = ConstructorParameters<typeof CollectionNicknameService>[0];
type CollectionNicknamePasswordInput =
  Parameters<CollectionNicknameStorage["setCollectionNicknamePassword"]>[0];
type CollectionNicknameSessionInput =
  Parameters<CollectionNicknameStorage["setCollectionNicknameSession"]>[0];
type CollectionNicknameAuditLogInput =
  Parameters<CollectionNicknameStorage["createAuditLog"]>[0];
type CollectionNicknameAuditLogRecord =
  Awaited<ReturnType<CollectionNicknameStorage["createAuditLog"]>>;

function createCollectionNicknameService(storage: object): CollectionNicknameService {
  return new CollectionNicknameService(storage as unknown as CollectionNicknameStorage);
}

function buildCollectionNicknameAuditLog(
  entry: CollectionNicknameAuditLogInput,
): CollectionNicknameAuditLogRecord {
  return {
    id: "audit-collection-nickname-1",
    action: entry.action,
    performedBy: entry.performedBy,
    requestId: entry.requestId ?? null,
    targetUser: entry.targetUser ?? null,
    targetResource: entry.targetResource ?? null,
    details: entry.details ?? null,
    timestamp: new Date("2026-03-01T00:00:00.000Z"),
  };
}

function createNicknameHarness(options: { beforePasswordWrite?: () => void } = {}) {
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
  const auditLogs: Array<{ action: string; details: string | null }> = [];
  const passwordUpdates: Array<{
    nicknameId: string;
    passwordHash: string;
    mustChangePassword: boolean;
    passwordResetBySuperuser: boolean;
    passwordUpdatedAt: Date | null;
  }> = [];
  const sessionWrites: Array<{ activityId: string; nickname: string }> = [];

  const service = createCollectionNicknameService({
    getCollectionStaffNicknameById: async (id: string) => (id === profile.id ? nicknameRecord : undefined),
    getCollectionNicknameAuthProfileByName: async (nickname: string) =>
      nickname.toLowerCase() === profile.nickname.toLowerCase() ? profile : undefined,
    setCollectionNicknamePassword: async (params: CollectionNicknamePasswordInput) => {
      options.beforePasswordWrite?.();
      if (params.expectedPasswordHash !== undefined && params.expectedPasswordHash !== profile.nicknamePasswordHash) {
        throw conflict("Password nickname telah berubah.", "CONFLICT");
      }
      passwordUpdates.push({
        nicknameId: params.nicknameId,
        passwordHash: params.passwordHash,
        mustChangePassword: Boolean(params.mustChangePassword),
        passwordResetBySuperuser: Boolean(params.passwordResetBySuperuser),
        passwordUpdatedAt: params.passwordUpdatedAt ?? null,
      });
      profile.nicknamePasswordHash = params.passwordHash;
      profile.mustChangePassword = Boolean(params.mustChangePassword);
      profile.passwordResetBySuperuser = Boolean(params.passwordResetBySuperuser);
      profile.passwordUpdatedAt = params.passwordUpdatedAt ?? null;
    },
    setCollectionNicknameSession: async (params: CollectionNicknameSessionInput) => {
      sessionWrites.push({
        activityId: params.activityId,
        nickname: params.nickname,
      });
    },
    createAuditLog: async (entry: CollectionNicknameAuditLogInput) => {
      auditLogs.push({
        action: String(entry.action || ""),
        details: entry.details ?? null,
      });
      return buildCollectionNicknameAuditLog(entry);
    },
  });

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

test("CollectionNicknameService.resetNicknamePassword returns a unique temporary password and only stores its hash", async () => {
  const { service, profile, auditLogs, passwordUpdates } = createNicknameHarness();

  const result = await service.resetNicknamePassword(
    buildUser({ username: "superuser", role: "superuser", activityId: "activity-super-1" }),
    profile.id,
  );

  assert.equal(result.ok, true);
  assert.equal(isTemporaryPasswordPolicyCompliant(result.temporaryPassword), true);
  assert.equal(passwordUpdates.length, 1);
  assert.equal(passwordUpdates[0]?.nicknameId, profile.id);
  assert.equal(passwordUpdates[0]?.mustChangePassword, true);
  assert.equal(passwordUpdates[0]?.passwordResetBySuperuser, true);
  assert.equal(await bcrypt.compare(result.temporaryPassword, profile.nicknamePasswordHash || ""), true);
  assert.notEqual(profile.nicknamePasswordHash, result.temporaryPassword);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, "COLLECTION_NICKNAME_PASSWORD_RESET");
  assert.equal(JSON.stringify(auditLogs).includes(result.temporaryPassword), false);
  const next = await service.resetNicknamePassword(buildUser({ role: "superuser" }), profile.id);
  assert.notEqual(next.temporaryPassword, result.temporaryPassword);
  assert.equal(await bcrypt.compare(result.temporaryPassword, profile.nicknamePasswordHash || ""), false);
});

test("CollectionNicknameService.loginNickname accepts the reset temporary password and requires a forced password change", async () => {
  const { service, profile, sessionWrites } = createNicknameHarness();

  const reset = await service.resetNicknamePassword(
    buildUser({ username: "superuser", role: "superuser", activityId: "activity-super-1" }),
    profile.id,
  );

  const result = await service.loginNickname(buildUser(), {
    nickname: profile.nickname,
    password: reset.temporaryPassword,
  });

  assert.equal(result.ok, true);
  assert.equal(result.nickname.nickname, profile.nickname);
  assert.equal(result.nickname.mustChangePassword, true);
  assert.equal(result.nickname.passwordResetBySuperuser, true);
  assert.equal(result.nickname.requiresForcedPasswordChange, true);
  assert.equal(sessionWrites.length, 0);
});

test("Collection nickname setup reports the shared policy rule and does not mutate invalid inputs", async () => {
  const { service, profile, passwordUpdates, sessionWrites } = createNicknameHarness();
  for (const password of ["Short1!Aa", "1234567890123!", "lowercasepass1!", "UPPERCASEPASS1!", "NoNumbersHere!", "NoSymbolsHere12", `Aa1!${"x".repeat(256)}`]) {
    const expected = getCredentialPasswordValidationError(password, "ms");
    assert.ok(expected);
    await assert.rejects(
      service.setupNicknamePassword(buildUser(), {
        nickname: profile.nickname,
        newPassword: password,
        confirmPassword: password,
      }),
      (error: unknown) => error instanceof HttpError
        && error.statusCode === 400
        && error.code === expected.code
        && error.message === expected.message,
    );
  }
  await assert.rejects(
    service.setupNicknamePassword(buildUser(), {
      nickname: profile.nickname,
      newPassword: "StrongPass123!",
      confirmPassword: "DifferentPass123!",
    }),
    (error: unknown) => error instanceof HttpError && error.code === "PASSWORD_CONFIRMATION_MISMATCH",
  );
  assert.equal(passwordUpdates.length, 0);
  assert.equal(sessionWrites.length, 0);
});

test("Collection nickname reset credentials cannot grant a session until securely changed", async () => {
  const { service, profile, sessionWrites } = createNicknameHarness();
  const reset = await service.resetNicknamePassword(buildUser({ role: "superuser" }), profile.id);
  await assert.rejects(
    service.setupNicknamePassword(buildUser(), {
      nickname: profile.nickname,
      currentPassword: "wrong-password",
      newPassword: "StrongPass123!",
      confirmPassword: "StrongPass123!",
    }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 401,
  );
  assert.equal(sessionWrites.length, 0);
  const result = await service.setupNicknamePassword(buildUser(), {
    nickname: profile.nickname,
    currentPassword: reset.temporaryPassword,
    newPassword: "StrongPass123!",
    confirmPassword: "StrongPass123!",
  });
  assert.equal(result.nickname.mustChangePassword, false);
  assert.equal(result.nickname.passwordResetBySuperuser, false);
  assert.equal(sessionWrites.length, 1);
  assert.equal(await bcrypt.compare("StrongPass123!", profile.nicknamePasswordHash || ""), true);
  await assert.rejects(
    service.loginNickname(buildUser(), { nickname: profile.nickname, password: reset.temporaryPassword }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 401,
  );
});

test("Collection nickname reset is superuser-only even when the service is invoked directly", async () => {
  const { service, profile, passwordUpdates } = createNicknameHarness();
  for (const role of ["user", "admin", "manager"]) {
    await assert.rejects(
      service.resetNicknamePassword(buildUser({ role }), profile.id),
      (error: unknown) => error instanceof HttpError && error.statusCode === 403,
    );
  }
  assert.equal(passwordUpdates.length, 0);
});

test("Collection nickname setup cannot overwrite a reset that occurs during password verification", async () => {
  let race = false;
  const h = createNicknameHarness({
    beforePasswordWrite: () => {
      if (race) h.profile.nicknamePasswordHash = "newer-reset-password-hash";
    },
  });
  const reset = await h.service.resetNicknamePassword(buildUser({ role: "superuser" }), h.profile.id);
  race = true;
  await assert.rejects(
    h.service.setupNicknamePassword(buildUser(), {
      nickname: h.profile.nickname,
      currentPassword: reset.temporaryPassword,
      newPassword: "StrongPass123!",
      confirmPassword: "StrongPass123!",
    }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409,
  );
  assert.equal(h.profile.nicknamePasswordHash, "newer-reset-password-hash");
  assert.equal(h.passwordUpdates.length, 1);
  assert.equal(h.sessionWrites.length, 0);
});
