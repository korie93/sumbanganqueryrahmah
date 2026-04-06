import { hashPassword } from "../../auth/passwords";
import type { PostgresStorage } from "../../storage-postgres";
import type { AuditEntry } from "./auth-route-auth-flow-shared";

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

export async function createLoginStorageDouble(options?: {
  user?: Record<string, any>;
  activeSessions?: Array<Record<string, any>>;
}) {
  const passwordHash = await hashPassword("StrongPass123!");
  const auditLogs: AuditEntry[] = [];
  const deactivatedSessions: Array<{ username: string; reason: string }> = [];
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
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    twoFactorConfiguredAt: null as Date | null,
    failedLoginAttempts: 0,
    lockedAt: null as Date | null,
    lockedReason: null as string | null,
    lockedBySystem: false,
    ...options?.user,
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
  const activeSessions = (options?.activeSessions || []).map((session, index) => ({
    id: `activity-existing-${index + 1}`,
    username: user.username,
    isActive: true,
    loginTime: new Date("2026-03-01T00:00:00.000Z"),
    lastActivityTime: new Date("2026-03-01T00:00:00.000Z"),
    ...session,
  }));

  const storage = {
    getUser: async (userId: string) => (userId === user.id ? user : null),
    getUserByUsername: async (username: string) => (username === user.username ? user : null),
    isVisitorBanned: async () => false,
    getBooleanSystemSetting: async () => false,
    getActiveActivitiesByUsername: async () => activeSessions,
    deactivateUserActivities: async (username: string, reason: string) => {
      deactivatedSessions.push({ username, reason });
    },
    deactivateUserSessionsByFingerprint: async () => undefined,
    clearCollectionNicknameSessionByActivity: async () => undefined,
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    createActivity: async () => activity,
    touchLastLogin: async () => undefined,
    updateUserAccount: async (params: Record<string, any>) => {
      Object.assign(user, {
        failedLoginAttempts:
          params.failedLoginAttempts === undefined ? user.failedLoginAttempts : params.failedLoginAttempts,
        lockedAt: params.lockedAt === undefined ? user.lockedAt : params.lockedAt,
        lockedReason: params.lockedReason === undefined ? user.lockedReason : params.lockedReason,
        lockedBySystem: params.lockedBySystem === undefined ? user.lockedBySystem : params.lockedBySystem,
        lastLoginAt: params.lastLoginAt === undefined ? user.lastLoginAt : params.lastLoginAt,
      });
      return user;
    },
    recordFailedLoginAttempt: async (params: Record<string, any>) => {
      user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
      const wasLocked = Boolean(user.lockedAt);
      const shouldLock = user.failedLoginAttempts > Number(params.maxAllowedAttempts || 0);
      if (shouldLock) {
        user.lockedAt = params.now instanceof Date ? params.now : new Date();
        user.lockedReason = String(params.lockedReason || "too_many_failed_password_attempts");
        user.lockedBySystem = true;
      }
      return {
        user,
        failedLoginAttempts: user.failedLoginAttempts,
        locked: shouldLock || Boolean(user.lockedAt),
        newlyLocked: shouldLock && !wasLocked,
      };
    },
  } as unknown as PostgresStorage;

  return { storage, user, activity, auditLogs, deactivatedSessions, activeSessions };
}
