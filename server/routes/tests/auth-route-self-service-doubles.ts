import type { PostgresStorage } from "../../storage-postgres";
import type { AuditEntry, TestAuthRouteUser, TestAuthRouteUserSeed } from "./auth-route-auth-flow-shared";

type UpdateUserAccountParams = Parameters<PostgresStorage["updateUserAccount"]>[0];
type UpdateUserCredentialsParams = Parameters<PostgresStorage["updateUserCredentials"]>[0];

export function createOwnCredentialsStorageDouble(options?: {
  user?: Partial<TestAuthRouteUser>;
  existingUsersByUsername?: Record<string, TestAuthRouteUserSeed>;
}) {
  const auditLogs: AuditEntry[] = [];
  const credentialUpdates: UpdateUserCredentialsParams[] = [];
  const accountUpdates: UpdateUserAccountParams[] = [];
  const activityUsernameUpdates: Array<{ previousUsername: string; nextUsername: string }> = [];
  const user: TestAuthRouteUser = {
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
  const usersByUsername = new Map<string, TestAuthRouteUserSeed>(Object.entries(options?.existingUsersByUsername || {}));
  usersByUsername.set(user.username, user);

  const storage = {
    getUser: async (userId: string) => (userId === user.id ? user : null),
    getUserByUsername: async (username: string) => usersByUsername.get(username) ?? null,
    updateUserAccount: async (params: UpdateUserAccountParams) => {
      accountUpdates.push(params);

      if (params.passwordHash) {
        user.passwordHash = params.passwordHash;
      }
      if (params.passwordChangedAt !== undefined) {
        user.passwordChangedAt = params.passwordChangedAt;
      }
      if (params.mustChangePassword !== undefined) {
        user.mustChangePassword = params.mustChangePassword;
      }
      if (params.passwordResetBySuperuser !== undefined) {
        user.passwordResetBySuperuser = params.passwordResetBySuperuser;
      }
      if (params.failedLoginAttempts !== undefined) {
        user.failedLoginAttempts = params.failedLoginAttempts;
      }
      if (params.lockedAt !== undefined) {
        user.lockedAt = params.lockedAt;
      }
      if (params.lockedReason !== undefined) {
        user.lockedReason = params.lockedReason;
      }
      if (params.lockedBySystem !== undefined) {
        user.lockedBySystem = params.lockedBySystem;
      }

      return user;
    },
    updateUserCredentials: async (params: UpdateUserCredentialsParams) => {
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
