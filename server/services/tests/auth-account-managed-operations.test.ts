import assert from "node:assert/strict";
import test from "node:test";
import { AuthAccountManagedLifecycleOperations } from "../auth-account-managed-lifecycle-operations";
import { AuthAccountManagedRecoveryOperations } from "../auth-account-managed-recovery-operations";
import {
  AuthAccountError,
  type ManagedAccountPasswordResetDelivery,
} from "../auth-account-types";

function buildSuperuser() {
  return {
    id: "super-1",
    username: "superuser",
    fullName: "Super User",
    email: "superuser@example.com",
    role: "superuser",
    status: "active",
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    lockedAt: null,
  };
}

function buildManagedTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    username: "managed.user",
    fullName: "Managed User",
    email: "managed.user@example.com",
    role: "user",
    status: "active",
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    lockedAt: null,
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

test("AuthAccountManagedRecoveryOperations.resetManagedUserPassword completes approved email-reset flow", async () => {
  const actor = buildSuperuser();
  const target = buildManagedTarget({ lockedAt: new Date("2026-03-20T00:00:00.000Z") });
  const auditActions: string[] = [];
  const invalidatedTokens: Array<{ userId: string; now: Date }> = [];
  const createdRequests: Array<Record<string, unknown>> = [];
  const resolvedRequests: Array<Record<string, unknown>> = [];
  const updatedUsers: Array<Record<string, unknown>> = [];
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];

  const operations = new AuthAccountManagedRecoveryOperations({
    storage: {
      invalidateUnusedPasswordResetTokens: async (userId: string, now: Date) => {
        invalidatedTokens.push({ userId, now });
      },
      createPasswordResetRequest: async (params: Record<string, unknown>) => {
        createdRequests.push(params);
        return { id: "reset-request-1" };
      },
      resolvePendingPasswordResetRequestsForUser: async (params: Record<string, unknown>) => {
        resolvedRequests.push(params);
      },
      updateUserAccount: async (params: Record<string, unknown>) => {
        updatedUsers.push(params);
        return { ...target, ...params };
      },
      createAuditLog: async (entry: Record<string, unknown>) => {
        auditActions.push(String(entry.action || ""));
        return entry;
      },
      consumePasswordResetRequestById: async () => undefined,
    } as any,
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      invalidatedSessions.push({ username, reason });
      return ["session-1"];
    },
    requireManageableTarget: async () => target as any,
    requireManagedEmail: (email: string | null) => {
      if (!email) {
        throw new Error("email required");
      }
      return email;
    },
    requireSuperuser: async () => actor as any,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.resetManagedUserPassword(actor as any, target.id);

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
  const actor = buildSuperuser();
  const target = buildManagedTarget();
  const consumedRequests: Array<Record<string, unknown>> = [];
  const auditActions: string[] = [];
  let updatedUserCalled = false;
  let invalidateSessionsCalled = false;

  const operations = new AuthAccountManagedRecoveryOperations({
    storage: {
      invalidateUnusedPasswordResetTokens: async () => undefined,
      createPasswordResetRequest: async () => ({ id: "reset-request-2" }),
      consumePasswordResetRequestById: async (params: Record<string, unknown>) => {
        consumedRequests.push(params);
      },
      createAuditLog: async (entry: Record<string, unknown>) => {
        auditActions.push(String(entry.action || ""));
        return entry;
      },
      resolvePendingPasswordResetRequestsForUser: async () => undefined,
      updateUserAccount: async () => {
        updatedUserCalled = true;
        return target;
      },
    } as any,
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async () => {
      invalidateSessionsCalled = true;
      return [];
    },
    requireManageableTarget: async () => target as any,
    requireManagedEmail: (email: string | null) => {
      if (!email) {
        throw new Error("email required");
      }
      return email;
    },
    requireSuperuser: async () => actor as any,
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

  const result = await operations.resetManagedUserPassword(actor as any, target.id);

  assert.equal(result.user.id, target.id);
  assert.deepEqual(result.closedSessionIds, []);
  assert.equal(result.reset.sent, false);
  assert.equal(consumedRequests.length, 1);
  assert.deepEqual(auditActions, ["PASSWORD_RESET_SEND_FAILED"]);
  assert.equal(updatedUserCalled, false);
  assert.equal(invalidateSessionsCalled, false);
});

test("AuthAccountManagedRecoveryOperations.resendActivation rejects non-pending accounts", async () => {
  const actor = buildSuperuser();
  const target = buildManagedTarget({ status: "active" });
  const operations = new AuthAccountManagedRecoveryOperations({
    storage: {} as any,
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async () => [],
    requireManageableTarget: async () => target as any,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actor as any,
    sendActivationEmail: async () => ({ delivery: buildDelivery() }),
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  await assert.rejects(
    operations.resendActivation(actor as any, target.id),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 409
      && error.code === "ACCOUNT_UNAVAILABLE",
  );
});

test("AuthAccountManagedLifecycleOperations.updateManagedUserRole invalidates target sessions", async () => {
  const actor = buildSuperuser();
  const target = buildManagedTarget({ role: "user" });
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];
  const updatedAccounts: Array<Record<string, unknown>> = [];
  const auditActions: string[] = [];
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: {
      updateUserAccount: async (params: Record<string, unknown>) => {
        updatedAccounts.push(params);
        return { ...target, role: params.role };
      },
      createAuditLog: async (entry: Record<string, unknown>) => {
        auditActions.push(String(entry.action || ""));
        return entry;
      },
    } as any,
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      invalidatedSessions.push({ username, reason });
      return ["activity-role-1"];
    },
    requireManageableTarget: async () => target as any,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actor as any,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.updateManagedUserRole(actor as any, target.id, "admin");

  assert.equal(result.user.role, "admin");
  assert.deepEqual(result.closedSessionIds, ["activity-role-1"]);
  assert.deepEqual(updatedAccounts, [{ userId: target.id, role: "admin" }]);
  assert.deepEqual(invalidatedSessions, [
    { username: target.username, reason: "ROLE_CHANGED" },
  ]);
  assert.deepEqual(auditActions, ["ROLE_CHANGED"]);
});

test("AuthAccountManagedLifecycleOperations.updateManagedUserRole keeps sessions when role is unchanged", async () => {
  const actor = buildSuperuser();
  const target = buildManagedTarget({ role: "admin" });
  let invalidateSessionsCalled = false;
  let updateUserCalled = false;
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: {
      updateUserAccount: async () => {
        updateUserCalled = true;
        return target;
      },
      createAuditLog: async (entry: Record<string, unknown>) => entry,
    } as any,
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async () => {
      invalidateSessionsCalled = true;
      return [];
    },
    requireManageableTarget: async () => target as any,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actor as any,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.updateManagedUserRole(actor as any, target.id, "admin");

  assert.equal(result.user.id, target.id);
  assert.deepEqual(result.closedSessionIds, []);
  assert.equal(updateUserCalled, false);
  assert.equal(invalidateSessionsCalled, false);
});

test("AuthAccountManagedLifecycleOperations.updateManagedUserStatus invalidates when banning target account", async () => {
  const actor = buildSuperuser();
  const target = buildManagedTarget({ isBanned: false });
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: {
      updateUserAccount: async (params: Record<string, unknown>) => ({ ...target, ...params }),
      createAuditLog: async (entry: Record<string, unknown>) => entry,
    } as any,
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      invalidatedSessions.push({ username, reason });
      return ["activity-ban-1", "activity-ban-2"];
    },
    requireManageableTarget: async () => target as any,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actor as any,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.updateManagedUserStatus(actor as any, target.id, {
    isBanned: true,
  });

  assert.equal(result.user.isBanned, true);
  assert.deepEqual(result.closedSessionIds, ["activity-ban-1", "activity-ban-2"]);
  assert.deepEqual(invalidatedSessions, [
    { username: target.username, reason: "BANNED" },
  ]);
});

test("AuthAccountManagedLifecycleOperations.deleteManagedUser invalidates sessions before deleting account", async () => {
  const actor = buildSuperuser();
  const target = buildManagedTarget();
  const events: string[] = [];
  const operations = new AuthAccountManagedLifecycleOperations({
    storage: {
      deleteManagedUserAccount: async () => {
        events.push("delete-account");
        return true;
      },
      createAuditLog: async (entry: Record<string, unknown>) => {
        events.push(String(entry.action || ""));
        return entry;
      },
    } as any,
    ensureUniqueIdentity: async () => undefined,
    invalidateUserSessions: async (username: string, reason: string) => {
      events.push(`invalidate:${username}:${reason}`);
      return ["activity-delete-1"];
    },
    requireManageableTarget: async () => target as any,
    requireManagedEmail: (email: string | null) => email || "",
    requireSuperuser: async () => actor as any,
    sendActivationEmail: async () => {
      throw new Error("not used");
    },
    sendPasswordResetEmail: async () => buildDelivery(),
    validateEmail: () => undefined,
    validateUsername: () => undefined,
  });

  const result = await operations.deleteManagedUser(actor as any, target.id);

  assert.equal(result.user.id, target.id);
  assert.deepEqual(result.closedSessionIds, ["activity-delete-1"]);
  assert.deepEqual(events, [
    `invalidate:${target.username}:ACCOUNT_DELETED`,
    "delete-account",
    "ACCOUNT_DELETED",
  ]);
});
