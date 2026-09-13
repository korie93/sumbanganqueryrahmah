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

test("AuthAccountPasswordResetOperations hashes before atomic completion and revokes sessions after commit", async () => {
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
    completeAccountRecovery: async (params: Parameters<AuthAccountRecoveryDeps["storage"]["completeAccountRecovery"]>[0]) => {
      events.push("complete");
      assert.equal(params.kind, "password_reset");
      assert.equal(params.tokenId, record.requestId);
      assert.equal(params.tokenHash, tokenHash);
      assert.equal(params.userId, user.id);
      assert.equal(await verifyPassword("ResetStrong123!", params.passwordHash), true);
      user.passwordHash = params.passwordHash;
      return { user, lockCleared: true, closedSessionIds: ["session-1"] };
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
      // A real transaction already deactivated these rows; an active-only
      // query can no longer return the IDs needed for WebSocket cleanup.
      return [];
    },
    requireManagedEmail: (email: string | null) => {
      if (!email) throw new Error("email required");
      return email;
    },
  });

  const result = await operations.resetPasswordWithToken({
    token,
    newPassword: "ResetStrong123!",
    confirmPassword: "ResetStrong123!",
  });

  assert.deepEqual(events, ["lookup", "complete", "invalidateSessions", "audit"]);
  assert.deepEqual(result.closedSessionIds, ["session-1"]);
  assert.equal(result.user, user);
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
    completeAccountRecovery: async () => {
      events.push("complete");
      return undefined;
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

  assert.deepEqual(events, ["lookup", "complete", "lookup"]);
});

test("failed atomic reset does not report success, audit success or revoke sessions", async () => {
  const user = buildResetUser();
  const events: string[] = [];
  const operations = new AuthAccountPasswordResetOperations({
    storage: {
      getPasswordResetTokenRecordByHash: async () => buildResetRecord(user),
      completeAccountRecovery: async () => { events.push("transaction"); throw new Error("fixture write failure"); },
      createAuditLog: async () => { events.push("audit"); },
    } as unknown as AuthAccountRecoveryDeps["storage"],
    invalidateUserSessions: async () => { events.push("sessions"); return []; },
    requireManagedEmail: () => "fixture@example.com",
  });
  await assert.rejects(operations.resetPasswordWithToken({
    token: "fixture-reset", newPassword: "ResetStrong123!", confirmPassword: "ResetStrong123!",
  }), /fixture write failure/);
  assert.deepEqual(events, ["transaction"]);
});
