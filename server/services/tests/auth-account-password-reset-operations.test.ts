import assert from "node:assert/strict";
import test from "node:test";
import { hashOpaqueToken, verifyPassword } from "../../auth/passwords";
import { ERROR_CODES } from "../../../shared/error-codes";
import { AuthAccountPasswordResetOperations } from "../auth-account-password-reset-operations";
import { AuthAccountError } from "../auth-account-types";
import type { AuthAccountRecoveryDeps } from "../auth-account-recovery-shared";

function buildResetUser() {
  return {
    id: "reset-user-1",
    username: "reset.user",
    fullName: "Reset User",
    email: "reset.user@example.com",
    role: "user",
    status: "active",
    passwordHash: "$2b$10$1VQv8s4QS6j3fAD/0VjV6euQkTQ6j3Q9T5o9pL7V4Q7ZQ6XnU6QKa",
    mustChangePassword: true,
    passwordResetBySuperuser: true,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lockedAt: new Date("2026-03-02T00:00:00.000Z"),
  };
}

function buildResetRecord(user: ReturnType<typeof buildResetUser>, usedAt: Date | null = null) {
  return {
    requestId: "reset-request-1",
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    isBanned: user.isBanned,
    activatedAt: user.activatedAt,
    expiresAt: new Date("2099-03-01T00:00:00.000Z"),
    usedAt,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  };
}

test("AuthAccountPasswordResetOperations consumes reset token before mutating account state", async () => {
  const token = "password-reset-token-test";
  const tokenHash = hashOpaqueToken(token);
  const user = buildResetUser();
  const record = buildResetRecord(user);
  const events: string[] = [];
  const storage = {
    getPasswordResetTokenRecordByHash: async (hash: string) => {
      events.push("lookup");
      return hash === tokenHash ? record : undefined;
    },
    consumePasswordResetRequestById: async (params: { requestId: string; now: Date }) => {
      events.push("consume");
      assert.equal(params.requestId, record.requestId);
      assert.ok(params.now instanceof Date);
      return true;
    },
    getUser: async (userId: string) => {
      events.push("getUser");
      assert.ok(events.includes("consume"));
      return userId === user.id ? user : null;
    },
    updateUserAccount: async (params: Record<string, unknown>) => {
      events.push("updateUser");
      assert.ok(events.includes("consume"));
      Object.assign(user, params);
      return user;
    },
    invalidateUnusedPasswordResetTokens: async () => {
      events.push("invalidateResetTokens");
    },
    createAuditLog: async () => {
      events.push("audit");
      return {};
    },
  } as unknown as AuthAccountRecoveryDeps["storage"];
  const invalidatedSessions: Array<{ username: string; reason: string }> = [];
  const operations = new AuthAccountPasswordResetOperations({
    storage,
    invalidateUserSessions: async (username: string, reason: string) => {
      events.push("invalidateSessions");
      invalidatedSessions.push({ username, reason });
      return ["session-1"];
    },
    requireManagedEmail: (email: string | null) => {
      if (!email) throw new Error("email required");
      return email;
    },
  });

  await operations.resetPasswordWithToken({
    token,
    newPassword: "ResetStrong123!",
    confirmPassword: "ResetStrong123!",
  });

  assert.ok(events.indexOf("consume") < events.indexOf("getUser"));
  assert.ok(events.indexOf("consume") < events.indexOf("updateUser"));
  assert.equal(await verifyPassword("ResetStrong123!", String(user.passwordHash)), true);
  assert.deepEqual(invalidatedSessions, [
    { username: user.username, reason: "PASSWORD_RESET_COMPLETED" },
  ]);
});

test("AuthAccountPasswordResetOperations rejects replay races before account mutation", async () => {
  const token = "password-reset-token-race";
  const tokenHash = hashOpaqueToken(token);
  const user = buildResetUser();
  const initialRecord = buildResetRecord(user);
  const consumedRecord = buildResetRecord(user, new Date("2026-03-02T00:00:00.000Z"));
  const events: string[] = [];
  let lookupCount = 0;
  const storage = {
    getPasswordResetTokenRecordByHash: async (hash: string) => {
      events.push("lookup");
      lookupCount += 1;
      if (hash !== tokenHash) {
        return undefined;
      }
      return lookupCount === 1 ? initialRecord : consumedRecord;
    },
    consumePasswordResetRequestById: async () => {
      events.push("consume");
      return false;
    },
    getUser: async () => {
      events.push("getUser");
      throw new Error("getUser must not run for replayed reset tokens");
    },
    updateUserAccount: async () => {
      events.push("updateUser");
      throw new Error("updateUserAccount must not run for replayed reset tokens");
    },
    invalidateUnusedPasswordResetTokens: async () => {
      events.push("invalidateResetTokens");
    },
    createAuditLog: async () => {
      events.push("audit");
      return {};
    },
  } as unknown as AuthAccountRecoveryDeps["storage"];
  const operations = new AuthAccountPasswordResetOperations({
    storage,
    invalidateUserSessions: async () => {
      events.push("invalidateSessions");
      return [];
    },
    requireManagedEmail: (email: string | null) => {
      if (!email) throw new Error("email required");
      return email;
    },
  });

  await assert.rejects(
    () => operations.resetPasswordWithToken({
      token,
      newPassword: "ResetStrong123!",
      confirmPassword: "ResetStrong123!",
    }),
    (error: unknown) => error instanceof AuthAccountError && error.code === ERROR_CODES.TOKEN_USED,
  );

  assert.deepEqual(events, ["lookup", "consume", "lookup"]);
});
