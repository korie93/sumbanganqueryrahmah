import { hashOpaqueToken, hashPassword } from "../../auth/passwords";
import type { PostgresStorage } from "../../storage-postgres";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetUser?: string;
  details?: string;
};

type ActivationRecord = {
  tokenId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type PasswordResetRecord = {
  requestId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export function createAuthStorageDouble(options?: {
  userByUsername?: Record<string, any>;
  userByEmail?: Record<string, any>;
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
  user?: Record<string, any>;
}) {
  const now = new Date();
  const rawToken = "activation-token-test-123";
  const tokenHash = hashOpaqueToken(rawToken);
  const auditLogs: AuditEntry[] = [];
  const invalidateCalls: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const user = {
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
    updateUserAccount: async (params: Record<string, any>) => {
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
  user?: Record<string, any>;
}) {
  const now = new Date();
  const rawToken = "password-reset-token-test-456";
  const tokenHash = hashOpaqueToken(rawToken);
  const auditLogs: AuditEntry[] = [];
  const invalidateCalls: Array<{ userId: string; now: Date }> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const deactivatedSessions: Array<{ username: string; reason: string }> = [];
  const user = {
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
    updateUserAccount: async (params: Record<string, any>) => {
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

export function createCookieAuthStorageDouble() {
  const user = {
    id: "cookie-user-1",
    username: "cookie.user",
    fullName: "Cookie User",
    email: "cookie.user@example.com",
    role: "admin",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const activity = {
    id: "activity-cookie-1",
    userId: user.id,
    username: user.username,
    role: user.role,
    isActive: true,
    logoutTime: null,
    fingerprint: "fingerprint-cookie",
    ipAddress: "127.0.0.1",
  };

  const storage = {
    getActivityById: async (activityId: string) => (activityId === activity.id ? activity : null),
    getUser: async (userId: string) => (userId === user.id ? user : null),
    getUserByUsername: async (username: string) => (username === user.username ? user : null),
    isVisitorBanned: async () => false,
    updateActivity: async () => activity,
    getRoleTabVisibility: async () => ({}),
  } as unknown as PostgresStorage;

  return { storage, user, activity };
}

export async function createLoginStorageDouble() {
  const passwordHash = await hashPassword("StrongPass123!");
  const auditLogs: AuditEntry[] = [];
  const user = {
    id: "login-user-1",
    username: "login.user",
    fullName: "Login User",
    email: "login.user@example.com",
    role: "user",
    status: "active",
    passwordHash,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-03-01T00:00:00.000Z"),
    lastLoginAt: null,
  };
  const activity = {
    id: "activity-login-1",
    userId: user.id,
    username: user.username,
    role: user.role,
    isActive: true,
    logoutTime: null,
    fingerprint: "fingerprint-login",
    ipAddress: "127.0.0.1",
  };

  const storage = {
    getUserByUsername: async (username: string) => (username === user.username ? user : null),
    isVisitorBanned: async () => false,
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    createActivity: async () => activity,
    touchLastLogin: async () => undefined,
  } as unknown as PostgresStorage;

  return { storage, user, activity, auditLogs };
}

export function authenticateAs(user: {
  id?: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
}) {
  return (req: any, _res: any, next: () => void) => {
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
      activityId: "activity-auth-test-1",
      mustChangePassword: user.mustChangePassword ?? false,
    };
    next();
  };
}

export function createOwnCredentialsStorageDouble(options?: {
  user?: Record<string, any>;
  existingUsersByUsername?: Record<string, any>;
}) {
  const auditLogs: AuditEntry[] = [];
  const credentialUpdates: Array<Record<string, unknown>> = [];
  const activityUsernameUpdates: Array<{ previousUsername: string; nextUsername: string }> = [];
  const user = {
    id: "credential-user-1",
    username: "credential.user",
    fullName: "Credential User",
    email: "credential.user@example.com",
    role: "user",
    status: "active",
    passwordHash: "$2b$10$1VQv8s4QS6j3fAD/0VjV6euQkTQ6j3Q9T5o9pL7V4Q7ZQ6XnU6QKa",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
    ...options?.user,
  };
  const usersByUsername = new Map<string, Record<string, any>>(Object.entries(options?.existingUsersByUsername || {}));
  usersByUsername.set(user.username, user);

  const storage = {
    getUser: async (userId: string) => (userId === user.id ? user : null),
    getUserByUsername: async (username: string) => usersByUsername.get(username) ?? null,
    updateUserCredentials: async (params: Record<string, any>) => {
      credentialUpdates.push(params);

      if (typeof params.newUsername === "string" && params.newUsername) {
        usersByUsername.delete(user.username);
        user.username = params.newUsername;
        usersByUsername.set(user.username, user);
      }

      if (typeof params.newPasswordHash === "string" && params.newPasswordHash) {
        user.passwordHash = params.newPasswordHash;
        user.passwordChangedAt = params.passwordChangedAt ?? user.passwordChangedAt;
        user.mustChangePassword = params.mustChangePassword ?? user.mustChangePassword;
        user.passwordResetBySuperuser = params.passwordResetBySuperuser ?? user.passwordResetBySuperuser;
      }

      return user;
    },
    updateActivitiesUsername: async (previousUsername: string, nextUsername: string) => {
      activityUsernameUpdates.push({ previousUsername, nextUsername });
    },
    getActiveActivitiesByUsername: async () => [],
    deactivateUserActivities: async () => undefined,
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return { storage, user, auditLogs, credentialUpdates, activityUsernameUpdates };
}
