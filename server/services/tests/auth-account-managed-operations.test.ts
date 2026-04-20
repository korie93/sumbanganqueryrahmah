import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "../../../shared/error-codes";
import type { AuthenticatedUser } from "../../auth/guards";
import { AuthAccountManagedLifecycleOperations } from "../auth-account-managed-lifecycle-operations";
import { AuthAccountManagedRecoveryOperations } from "../auth-account-managed-recovery-operations";
import type {
  AuthAccountManagedOpsDeps,
  AuthAccountManagedUser,
} from "../auth-account-managed-shared";
import {
  AuthAccountError,
  type ManagedAccountPasswordResetDelivery,
} from "../auth-account-types";

type ManagedStorage = AuthAccountManagedOpsDeps["storage"];
type AuditLogInput = Parameters<ManagedStorage["createAuditLog"]>[0];
type AuditLogRecord = Awaited<ReturnType<ManagedStorage["createAuditLog"]>>;
type PasswordResetRequestInput = Parameters<ManagedStorage["createPasswordResetRequest"]>[0];
type PasswordResetRequestRecord = Awaited<ReturnType<ManagedStorage["createPasswordResetRequest"]>>;

function buildSuperuser(overrides: Partial<AuthAccountManagedUser> = {}): AuthAccountManagedUser {
  return {
    id: "super-1",
    username: "superuser",
    passwordHash: "hashed-super-password",
    fullName: "Super User",
    email: "superuser@example.com",
    role: "superuser",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    createdBy: "system",
    createdAt: new Date("2026-02-28T12:00:00.000Z"),
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-03-01T00:00:00.000Z"),
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    twoFactorConfiguredAt: null,
    failedLoginAttempts: 0,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    lastLoginAt: null,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
    ...overrides,
  };
}

function buildSuperuserAuth(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: "super-1",
    username: "superuser",
    role: "superuser",
    activityId: "activity-super-1",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    ...overrides,
  };
}

function buildManagedTarget(
  overrides: Partial<AuthAccountManagedUser> = {},
): AuthAccountManagedUser {
  return {
    id: "user-1",
    username: "managed.user",
    passwordHash: "hashed-user-password",
    fullName: "Managed User",
    email: "managed.user@example.com",
    role: "user",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    createdBy: "superuser",
    createdAt: new Date("2026-02-28T12:30:00.000Z"),
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-03-01T00:00:00.000Z"),
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    twoFactorConfiguredAt: null,
    failedLoginAttempts: 0,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    lastLoginAt: null,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
    ...overrides,
  };
}

function buildDelivery(
  overrides: Partial<ManagedAccountPasswordResetDelivery> = {},
): ManagedAccountPasswordResetDelivery {
  return {
    sent: true,
    deliveryMode: "smtp",
    errorCode: null,
    errorMessage: null,
    expiresAt: new Date("2026-03-20T04:00:00.000Z"),
    previewUrl: null,
    recipientEmail: "managed.user@example.com",
    ...overrides,
  };
}

function buildAuditLog(entry: AuditLogInput): AuditLogRecord {
  return {
    id: "audit-log-1",
    action: entry.action,
    performedBy: entry.performedBy,
    requestId: entry.requestId ?? null,
    targetUser: entry.targetUser ?? null,
    targetResource: entry.targetResource ?? null,
    details: entry.details ?? null,
    timestamp: new Date("2026-03-20T00:00:00.000Z"),
  };
}

function buildPasswordResetRequest(
  params: PasswordResetRequestInput,
  overrides: Partial<PasswordResetRequestRecord> = {},
): PasswordResetRequestRecord {
  return {
    id: "reset-request-default",
    userId: params.userId,
    requestedByUser: params.requestedByUser,
    approvedBy: params.approvedBy ?? null,
    resetType: params.resetType ?? "email_link",
    tokenHash: params.tokenHash ?? null,
    expiresAt: params.expiresAt ?? null,
    usedAt: params.usedAt ?? null,
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
    ...overrides,
  };
}

function mergeManagedUserAccount(
  seedUser: AuthAccountManagedUser,
  params: Parameters<ManagedStorage["updateUserAccount"]>[0],
): AuthAccountManagedUser {
  return {
    ...seedUser,
    username: params.username ?? seedUser.username,
    fullName: params.fullName === undefined ? seedUser.fullName : params.fullName,
    email: params.email === undefined ? seedUser.email : params.email,
    role: params.role ?? seedUser.role,
    status: params.status ?? seedUser.status,
    isBanned: params.isBanned === undefined ? seedUser.isBanned : params.isBanned,
    mustChangePassword: params.mustChangePassword ?? seedUser.mustChangePassword,
    passwordResetBySuperuser:
      params.passwordResetBySuperuser ?? seedUser.passwordResetBySuperuser,
    passwordHash: params.passwordHash ?? seedUser.passwordHash,
    passwordChangedAt:
      params.passwordChangedAt === undefined
        ? seedUser.passwordChangedAt
        : params.passwordChangedAt,
    activatedAt:
      params.activatedAt === undefined ? seedUser.activatedAt : params.activatedAt,
    lastLoginAt:
      params.lastLoginAt === undefined ? seedUser.lastLoginAt : params.lastLoginAt,
    twoFactorEnabled: params.twoFactorEnabled ?? seedUser.twoFactorEnabled,
    twoFactorSecretEncrypted:
      params.twoFactorSecretEncrypted === undefined
        ? seedUser.twoFactorSecretEncrypted
        : params.twoFactorSecretEncrypted,
    twoFactorConfiguredAt:
      params.twoFactorConfiguredAt === undefined
        ? seedUser.twoFactorConfiguredAt
        : params.twoFactorConfiguredAt,
    failedLoginAttempts:
      params.failedLoginAttempts ?? seedUser.failedLoginAttempts,
    lockedAt: params.lockedAt === undefined ? seedUser.lockedAt : params.lockedAt,
    lockedReason:
      params.lockedReason === undefined ? seedUser.lockedReason : params.lockedReason,
    lockedBySystem: params.lockedBySystem ?? seedUser.lockedBySystem,
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
  };
}

function createManagedStorage(
  overrides: Partial<ManagedStorage> = {},
  seedUser: AuthAccountManagedUser = buildManagedTarget(),
): ManagedStorage {
  return {
    consumePasswordResetRequestById: async () => false,
    createAuditLog: async (entry) => buildAuditLog(entry),
    createManagedUserAccount: async (params) =>
      buildManagedTarget({
        id: "created-user-1",
        username: params.username,
        fullName: params.fullName ?? null,
        email: params.email ?? null,
        role: params.role,
        status: params.status ?? "pending_activation",
        passwordHash: params.passwordHash,
        mustChangePassword: params.mustChangePassword ?? false,
        passwordResetBySuperuser: params.passwordResetBySuperuser ?? false,
        createdBy: params.createdBy,
        activatedAt: params.activatedAt ?? null,
        passwordChangedAt: params.passwordChangedAt ?? null,
      }),
    createPasswordResetRequest: async (params) => buildPasswordResetRequest(params),
    deleteManagedUserAccount: async () => true,
    getAccounts: async () => [],
    getManagedUsers: async () => [],
    invalidateUnusedPasswordResetTokens: async () => undefined,
    listManagedUsersPage: async () => ({
      users: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    }),
    listPendingPasswordResetRequests: async () => [],
    listPendingPasswordResetRequestsPage: async () => ({
      requests: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    }),
    resolvePendingPasswordResetRequestsForUser: async () => undefined,
    updateActivitiesUsername: async () => undefined,
    updateUserAccount: async (params) => mergeManagedUserAccount(seedUser, params),
    ...overrides,
  };
}

test("AuthAccountManagedRecoveryOperations.resetManagedUserPassword completes approved email-reset flow", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget({ lockedAt: new Date("2026-03-20T00:00:00.000Z") });
  const auditActions: string[] = [];
  const invalidatedTokens: Array<{ userId: string; now: Date }> = [];
  const createdRequests: Array<Parameters<ManagedStorage["createPasswordResetRequest"]>[0]> = [];
  const resolvedRequests: Array<
    Parameters<ManagedStorage["resolvePendingPasswordResetRequestsForUser"]>[0]
  > = [];
  const updatedUsers: Array<Parameters<ManagedStorage["updateUserAccount"]>[0]> = [];
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];

  const operations = new AuthAccountManagedRecoveryOperations({
    storage: createManagedStorage({
      invalidateUnusedPasswordResetTokens: async (userId: string, now: Date) => {
        invalidatedTokens.push({ userId, now });
      },
      createPasswordResetRequest: async (params) => {
        createdRequests.push(params);
        return buildPasswordResetRequest(params, { id: "reset-request-1" });
      },
      resolvePendingPasswordResetRequestsForUser: async (params) => {
        resolvedRequests.push(params);
      },
      updateUserAccount: async (params) => {
        updatedUsers.push(params);
        return mergeManagedUserAccount(target, params);
      },
      createAuditLog: async (entry) => {
        auditActions.push(String(entry.action || ""));
        return buildAuditLog(entry);
      },
      consumePasswordResetRequestById: async () => false,
    }, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      invalidatedSessions.push({ username, reason });
      return ["session-1"];
    },
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => {
      if (!email) {
        throw new Error("email required");
      }
      return email;
    },
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.resetManagedUserPassword(actor, target.id);

  assert.equal(result.user.id, target.id);
  assert.deepEqual(result.closedSessionIds, ["session-1"]);
  assert.equal(result.reset.sent, true);
  assert.equal(invalidatedTokens.length, 1);
  assert.equal(createdRequests.length, 1);
  assert.equal(resolvedRequests.length, 1);
  assert.equal(updatedUsers.length, 1);
  assert.deepEqual(invalidatedSessions, [
    { username: target.username, reason: "PASSWORD_RESET_BY_SUPERUSER" },
  ]);
  assert.deepEqual(auditActions, ["PASSWORD_RESET_APPROVED"]);
  assert.equal(updatedUsers[0].mustChangePassword, true);
  assert.equal(updatedUsers[0].passwordResetBySuperuser, true);
  assert.equal(updatedUsers[0].failedLoginAttempts, 0);
  assert.equal(updatedUsers[0].lockedAt, null);
});

test("AuthAccountManagedRecoveryOperations.resetManagedUserPassword cancels failed delivery without mutating the account", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget();
  const consumedRequests: Array<Parameters<ManagedStorage["consumePasswordResetRequestById"]>[0]> = [];
  const auditActions: string[] = [];
  let updatedUserCalled = false;
  let invalidateSessionsCalled = false;

  const operations = new AuthAccountManagedRecoveryOperations({
    storage: createManagedStorage({
      invalidateUnusedPasswordResetTokens: async () => undefined,
      createPasswordResetRequest: async (params) =>
        buildPasswordResetRequest(params, { id: "reset-request-2" }),
      consumePasswordResetRequestById: async (params) => {
        consumedRequests.push(params);
        return true;
      },
      createAuditLog: async (entry) => {
        auditActions.push(String(entry.action || ""));
        return buildAuditLog(entry);
      },
      resolvePendingPasswordResetRequestsForUser: async () => undefined,
      updateUserAccount: async () => {
        updatedUserCalled = true;
        return target;
      },
    }, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async () => {
      invalidateSessionsCalled = true;
      return [];
    },
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => {
      if (!email) {
        throw new Error("email required");
      }
      return email;
    },
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () =>
      buildDelivery({
        sent: false,
        deliveryMode: "none",
        errorCode: "MAIL_DISABLED",
        errorMessage: "Mail delivery is disabled.",
      }),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.resetManagedUserPassword(actor, target.id);

  assert.equal(result.user.id, target.id);
  assert.deepEqual(result.closedSessionIds, []);
  assert.equal(result.reset.sent, false);
  assert.equal(consumedRequests.length, 1);
  assert.deepEqual(auditActions, ["PASSWORD_RESET_SEND_FAILED"]);
  assert.equal(updatedUserCalled, false);
  assert.equal(invalidateSessionsCalled, false);
});

test("AuthAccountManagedRecoveryOperations.resendActivation rejects non-pending accounts", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget({ status: "active" });
  const operations = new AuthAccountManagedRecoveryOperations({
    storage: createManagedStorage({}, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async () => [],
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => ({ delivery: buildDelivery() }),
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  await assert.rejects(
    operations.resendActivation(actor, target.id),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 409
      && error.code === "ACCOUNT_UNAVAILABLE",
  );
});

test("AuthAccountManagedLifecycleOperations.updateManagedUserRole invalidates target sessions", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget({ role: "user" });
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];
  const updatedAccounts: Array<Parameters<ManagedStorage["updateUserAccount"]>[0]> = [];
  const auditActions: string[] = [];
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: createManagedStorage({
      updateUserAccount: async (params) => {
        updatedAccounts.push(params);
        return mergeManagedUserAccount(target, params);
      },
      createAuditLog: async (entry) => {
        auditActions.push(String(entry.action || ""));
        return buildAuditLog(entry);
      },
    }, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      invalidatedSessions.push({ username, reason });
      return ["activity-role-1"];
    },
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.updateManagedUserRole(actor, target.id, "admin");

  assert.equal(result.user.role, "admin");
  assert.deepEqual(result.closedSessionIds, ["activity-role-1"]);
  assert.deepEqual(updatedAccounts, [{ userId: target.id, role: "admin" }]);
  assert.deepEqual(invalidatedSessions, [
    { username: target.username, reason: "ROLE_CHANGED" },
  ]);
  assert.deepEqual(auditActions, ["ROLE_CHANGED"]);
});

test("AuthAccountManagedLifecycleOperations.updateManagedUserRole keeps sessions when role is unchanged", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget({ role: "admin" });
  let invalidateSessionsCalled = false;
  let updateUserCalled = false;
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: createManagedStorage({
      updateUserAccount: async () => {
        updateUserCalled = true;
        return target;
      },
      createAuditLog: async (entry) => buildAuditLog(entry),
    }, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async () => {
      invalidateSessionsCalled = true;
      return [];
    },
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.updateManagedUserRole(actor, target.id, "admin");

  assert.equal(result.user.id, target.id);
  assert.deepEqual(result.closedSessionIds, []);
  assert.equal(updateUserCalled, false);
  assert.equal(invalidateSessionsCalled, false);
});

test("AuthAccountManagedLifecycleOperations.updateManagedUserStatus invalidates when banning target account", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget({ isBanned: false });
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: createManagedStorage({
      updateUserAccount: async (params) => {
        return mergeManagedUserAccount(target, params);
      },
      createAuditLog: async (entry) => buildAuditLog(entry),
    }, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      invalidatedSessions.push({ username, reason });
      return ["activity-ban-1", "activity-ban-2"];
    },
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.updateManagedUserStatus(actor, target.id, {
    isBanned: true,
  });

  assert.equal(result.user.isBanned, true);
  assert.deepEqual(result.closedSessionIds, ["activity-ban-1", "activity-ban-2"]);
  assert.deepEqual(invalidatedSessions, [
    { username: target.username, reason: "BANNED" },
  ]);
});

test("AuthAccountManagedLifecycleOperations.deleteManagedUser invalidates sessions before deleting account", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget();
  const events: string[] = [];
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: createManagedStorage({
      deleteManagedUserAccount: async () => {
        events.push("delete-account");
        return true;
      },
      createAuditLog: async (entry) => {
        events.push(String(entry.action || ""));
        return buildAuditLog(entry);
      },
    }, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      events.push(`invalidate:${username}:${reason}`);
      return ["activity-delete-1"];
    },
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.deleteManagedUser(actor, target.id);

  assert.equal(result.user.id, target.id);
  assert.deepEqual(result.closedSessionIds, ["activity-delete-1"]);
  assert.deepEqual(events, [
    `invalidate:${target.username}:ACCOUNT_DELETED`,
    "delete-account",
    "ACCOUNT_DELETED",
  ]);
});

test("AuthAccountManagedLifecycleOperations.deleteManagedUser converts dependency conflicts into a user-facing AuthAccountError", async () => {
  const actor = buildSuperuserAuth();
  const actorAccount = buildSuperuser();
  const target = buildManagedTarget();
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];
  const dependencyError = new Error("update or delete on table \"users\" violates foreign key constraint");
  Object.assign(dependencyError, {
    code: "23503",
  });

  const operations = new AuthAccountManagedLifecycleOperations({
    storage: createManagedStorage({
      deleteManagedUserAccount: async () => {
        throw dependencyError;
      },
    }, target),
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      invalidatedSessions.push({ username, reason });
      return ["activity-delete-1"];
    },
    requireManageableTarget: async () => target,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actorAccount,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  await assert.rejects(
    () => operations.deleteManagedUser(actor, target.id),
    (error: unknown) => {
      assert.ok(error instanceof AuthAccountError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, ERROR_CODES.ACCOUNT_UNAVAILABLE);
      assert.match(
        error.message,
        /cannot be deleted because it is still referenced by existing operational records/i,
      );
      return true;
    },
  );
  assert.deepEqual(invalidatedSessions, [
    { username: target.username, reason: "ACCOUNT_DELETED" },
  ]);
});
