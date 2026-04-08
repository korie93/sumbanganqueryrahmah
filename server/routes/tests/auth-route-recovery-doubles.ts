import { hashOpaqueToken } from "../../auth/passwords";
import type { PostgresStorage } from "../../storage-postgres";
import type {
  ActivationRecord,
  AuditEntry,
  PasswordResetRecord,
  TestAuthRouteUser,
} from "./auth-route-auth-flow-shared";

export function createAuthStorageDouble(options?: {
  userByUsername?: Record<string, TestAuthRouteUser>;
  userByEmail?: Record<string, TestAuthRouteUser>;
}) {
  const resetRequests: Array<{ userId: string; requestedByUser: string }> = [];
  const auditLogs: AuditEntry[] = [];

  const storage = {
    getUserByUsername: async (username: string) => options?.userByUsername?.[username] ?? null,
    getUserByEmail: async (email: string) => options?.userByEmail?.[email] ?? null,
    createPasswordResetRequest: async (payload: { userId: string; requestedByUser: string }) => {
      resetRequests.push(payload);
      return { id: `reset-${resetRequests.length}`, ...payload };
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return { storage, resetRequests, auditLogs };
}

export function createActivationStorageDouble(options?: {
  activationRecord?: Partial<ActivationRecord>;
  user?: Partial<TestAuthRouteUser>;
}) {
  const now = new Date();
  const rawToken = "activation-token-test-123";
  const tokenHash = hashOpaqueToken(rawToken);
  const auditLogs: AuditEntry[] = [];
  const invalidateCalls: string[] = [];
  const updateCalls: Array<Parameters<PostgresStorage["updateUserAccount"]>[0]> = [];
  const user: TestAuthRouteUser = {
    id: "user-activate-1",
    username: "pending.user",
    fullName: "Pending User",
    email: "pending.user@example.com",
    role: "user",
    status: "pending_activation",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: null,
    passwordChangedAt: null,
    lastLoginAt: null,
    ...options?.user,
  };
  const activationRecord: ActivationRecord = {
    tokenId: "token-1",
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: "pending_activation",
    isBanned: false,
    activatedAt: null,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: now,
    ...options?.activationRecord,
  };

  const recordByHash = new Map<string, ActivationRecord>([[tokenHash, activationRecord]]);

  const storage = {
    getActivationTokenRecordByHash: async (hash: string) => recordByHash.get(hash) ?? null,
    consumeActivationTokenById: async ({ tokenId, now: consumedAt }: { tokenId: string; now: Date }) => {
      const record = Array.from(recordByHash.values()).find((entry) => entry.tokenId === tokenId) ?? null;
      if (!record || record.usedAt) {
        return false;
      }
      record.usedAt = consumedAt;
      return true;
    },
    getUser: async (userId: string) => (userId === user.id ? user : null),
    updateUserAccount: async (params: Parameters<PostgresStorage["updateUserAccount"]>[0]) => {
      updateCalls.push(params);
      Object.assign(user, {
        passwordHash: params.passwordHash,
        status: params.status,
        mustChangePassword: params.mustChangePassword,
        passwordResetBySuperuser: params.passwordResetBySuperuser,
        activatedAt: params.activatedAt,
        passwordChangedAt: params.passwordChangedAt,
      });
      return user;
    },
    invalidateUnusedActivationTokens: async (userId: string) => {
      invalidateCalls.push(userId);
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return { storage, rawToken, user, auditLogs, invalidateCalls, updateCalls };
}

export function createPasswordResetStorageDouble(options?: {
  resetRecord?: Partial<PasswordResetRecord>;
  user?: Partial<TestAuthRouteUser>;
}) {
  const now = new Date();
  const rawToken = "password-reset-token-test-456";
  const tokenHash = hashOpaqueToken(rawToken);
  const auditLogs: AuditEntry[] = [];
  const invalidateCalls: Array<{ userId: string; now: Date }> = [];
  const updateCalls: Array<Parameters<PostgresStorage["updateUserAccount"]>[0]> = [];
  const deactivatedSessions: Array<{ username: string; reason: string }> = [];
  const user: TestAuthRouteUser = {
    id: "user-reset-1",
    username: "reset.user",
    fullName: "Reset User",
    email: "reset.user@example.com",
    role: "user",
    status: "active",
    passwordHash: "$2b$10$1VQv8s4QS6j3fAD/0VjV6euQkTQ6j3Q9T5o9pL7V4Q7ZQ6XnU6QKa",
    mustChangePassword: true,
    passwordResetBySuperuser: true,
    isBanned: false,
    activatedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    passwordChangedAt: null,
    lastLoginAt: null,
    ...options?.user,
  };
  const resetRecord: PasswordResetRecord = {
    requestId: "reset-request-1",
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    isBanned: false,
    activatedAt: user.activatedAt,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: now,
    ...options?.resetRecord,
  };

  const recordByHash = new Map<string, PasswordResetRecord>([[tokenHash, resetRecord]]);

  const storage = {
    getPasswordResetTokenRecordByHash: async (hash: string) => recordByHash.get(hash) ?? null,
    consumePasswordResetRequestById: async ({ requestId, now: consumedAt }: { requestId: string; now: Date }) => {
      const record = Array.from(recordByHash.values()).find((entry) => entry.requestId === requestId) ?? null;
      if (!record || record.usedAt) {
        return false;
      }
      record.usedAt = consumedAt;
      return true;
    },
    getUser: async (userId: string) => (userId === user.id ? user : null),
    updateUserAccount: async (params: Parameters<PostgresStorage["updateUserAccount"]>[0]) => {
      updateCalls.push(params);
      Object.assign(user, {
        passwordHash: params.passwordHash,
        status: user.status,
        mustChangePassword: params.mustChangePassword,
        passwordResetBySuperuser: params.passwordResetBySuperuser,
        activatedAt: params.activatedAt,
        passwordChangedAt: params.passwordChangedAt,
      });
      return user;
    },
    invalidateUnusedPasswordResetTokens: async (userId: string, invalidatedAt: Date) => {
      invalidateCalls.push({ userId, now: invalidatedAt });
    },
    getActiveActivitiesByUsername: async (username: string) => (username === user.username
      ? [{ id: "activity-1" }, { id: "activity-2" }]
      : []),
    deactivateUserActivities: async (username: string, reason: string) => {
      deactivatedSessions.push({ username, reason });
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return { storage, rawToken, user, auditLogs, invalidateCalls, updateCalls, deactivatedSessions };
}
