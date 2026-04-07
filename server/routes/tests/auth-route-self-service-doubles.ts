import type { PostgresStorage } from "../../storage-postgres";
import type { AuditEntry } from "./auth-route-auth-flow-shared";

export function createOwnCredentialsStorageDouble(options?: {
  user?: Record<string, any>;
  existingUsersByUsername?: Record<string, any>;
}) {
  const auditLogs: AuditEntry[] = [];
  const credentialUpdates: Array<Record<string, unknown>> = [];
  const accountUpdates: Array<Record<string, unknown>> = [];
  const activityUsernameUpdates: Array<{ previousUsername: string; nextUsername: string }> = [];
  const user: Record<string, any> & {
    id: string;
    username: string;
    role: string;
    mustChangePassword: boolean;
    passwordHash: string;
  } = {
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
    updateUserAccount: async (params: Record<string, any>) => {
      accountUpdates.push(params);

      if (params.passwordHash) {
        user.passwordHash = params.passwordHash;
      }
      if (Object.prototype.hasOwnProperty.call(params, "passwordChangedAt")) {
        user.passwordChangedAt = params.passwordChangedAt;
      }
      if (Object.prototype.hasOwnProperty.call(params, "mustChangePassword")) {
        user.mustChangePassword = params.mustChangePassword;
      }
      if (Object.prototype.hasOwnProperty.call(params, "passwordResetBySuperuser")) {
        user.passwordResetBySuperuser = params.passwordResetBySuperuser;
      }
      if (Object.prototype.hasOwnProperty.call(params, "failedLoginAttempts")) {
        user.failedLoginAttempts = params.failedLoginAttempts;
      }
      if (Object.prototype.hasOwnProperty.call(params, "lockedAt")) {
        user.lockedAt = params.lockedAt;
      }
      if (Object.prototype.hasOwnProperty.call(params, "lockedReason")) {
        user.lockedReason = params.lockedReason;
      }
      if (Object.prototype.hasOwnProperty.call(params, "lockedBySystem")) {
        user.lockedBySystem = params.lockedBySystem;
      }

      return user;
    },
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

  return { storage, user, auditLogs, credentialUpdates, accountUpdates, activityUsernameUpdates };
}
