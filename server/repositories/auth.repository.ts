import type {
  InsertUser,
  User,
} from "../../shared/schema-postgres";
import type {
  AccountStatus,
  ManageableUserRole,
} from "../auth/account-lifecycle";
import {
  deleteManagedUserAccount,
  getAccounts,
  getManagedUsers,
  getUsersByRoles,
  listManagedUsersPage,
  listPendingPasswordResetRequests,
  listPendingPasswordResetRequestsPage,
  touchLastLogin,
  updateActivitiesUsername,
  updateUserBan,
} from "./auth-managed-user-utils";
import {
  consumeActivationTokenById,
  consumePasswordResetRequestById,
  createActivationToken,
  createPasswordResetRequest,
  getActivationTokenRecordByHash,
  getPasswordResetTokenRecordByHash,
  invalidateUnusedActivationTokens,
  invalidateUnusedPasswordResetTokens,
  resolvePendingPasswordResetRequestsForUser,
  updatePasswordResetRequest,
} from "./auth-token-repository-utils";
import type {
  ActivationTokenRecord,
  ManagedUserRecord,
  PasswordResetTokenRecord,
  PendingPasswordResetRequestRecord,
} from "./auth-repository-types";
import {
  type CreateManagedUserAccountParams,
  type RecordFailedLoginAttemptParams,
  type UpdateUserAccountParams,
  type UpdateUserCredentialsParams,
} from "./auth-user-repository-shared";
import {
  getAuthUser,
  getAuthUserByEmail,
  getAuthUserByUsername,
} from "./auth-user-repository-read-utils";
import {
  createLegacyAuthUser,
  createManagedAuthUserAccount,
  recordAuthFailedLoginAttempt,
  updateAuthUserAccount,
  updateAuthUserCredentials,
} from "./auth-user-repository-write-utils";

export type {
  ActivationTokenRecord,
  ManagedUserRecord,
  PasswordResetTokenRecord,
  PendingPasswordResetRequestRecord,
} from "./auth-repository-types";

export class AuthRepository {
  async getUser(id: string): Promise<User | undefined> {
    return getAuthUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return getAuthUserByUsername(username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return getAuthUserByEmail(email);
  }

  async createUser(user: InsertUser): Promise<User> {
    return createLegacyAuthUser(user);
  }

  async createManagedUserAccount(params: CreateManagedUserAccountParams): Promise<User> {
    return createManagedAuthUserAccount(params);
  }

  async updateUserCredentials(params: UpdateUserCredentialsParams): Promise<User | undefined> {
    return updateAuthUserCredentials(params);
  }

  async updateUserAccount(params: UpdateUserAccountParams): Promise<User | undefined> {
    return updateAuthUserAccount(params);
  }

  async recordFailedLoginAttempt(params: RecordFailedLoginAttemptParams): Promise<{
    user: User | undefined;
    failedLoginAttempts: number;
    locked: boolean;
    newlyLocked: boolean;
  }> {
    return recordAuthFailedLoginAttempt(params);
  }

  async getUsersByRoles(roles: string[]) {
    return getUsersByRoles(roles);
  }

  async getManagedUsers(): Promise<ManagedUserRecord[]> {
    return getManagedUsers();
  }

  async listManagedUsersPage(params = {}) {
    return listManagedUsersPage(params);
  }

  async deleteManagedUserAccount(userId: string): Promise<boolean> {
    return deleteManagedUserAccount(userId);
  }

  async updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void> {
    return updateActivitiesUsername(oldUsername, newUsername);
  }

  async updateUserBan(username: string, isBanned: boolean): Promise<User | undefined> {
    return updateUserBan(username, isBanned);
  }

  async touchLastLogin(userId: string, timestamp = new Date()): Promise<void> {
    return touchLastLogin(userId, timestamp);
  }

  async createActivationToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }) {
    return createActivationToken(params);
  }

  async invalidateUnusedActivationTokens(userId: string): Promise<void> {
    return invalidateUnusedActivationTokens(userId);
  }

  async getActivationTokenRecordByHash(
    tokenHash: string,
  ): Promise<ActivationTokenRecord | undefined> {
    return getActivationTokenRecordByHash(tokenHash);
  }

  async consumeActivationTokenById(params: {
    tokenId: string;
    now?: Date;
  }): Promise<boolean> {
    return consumeActivationTokenById(params);
  }

  async createPasswordResetRequest(params: {
    userId: string;
    requestedByUser: string | null;
    approvedBy?: string | null;
    resetType?: string;
    tokenHash?: string | null;
    expiresAt?: Date | null;
    usedAt?: Date | null;
  }) {
    return createPasswordResetRequest(params);
  }

  async updatePasswordResetRequest(params: {
    requestId: string;
    approvedBy?: string | null;
    resetType?: string;
    usedAt?: Date | null;
    tokenHash?: string | null;
    expiresAt?: Date | null;
  }): Promise<void> {
    return updatePasswordResetRequest(params);
  }

  async resolvePendingPasswordResetRequestsForUser(params: {
    userId: string;
    approvedBy: string;
    resetType: string;
    usedAt?: Date | null;
  }): Promise<void> {
    return resolvePendingPasswordResetRequestsForUser(params);
  }

  async invalidateUnusedPasswordResetTokens(userId: string, now = new Date()): Promise<void> {
    return invalidateUnusedPasswordResetTokens(userId, now);
  }

  async getPasswordResetTokenRecordByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | undefined> {
    return getPasswordResetTokenRecordByHash(tokenHash);
  }

  async consumePasswordResetRequestById(params: {
    requestId: string;
    now?: Date;
  }): Promise<boolean> {
    return consumePasswordResetRequestById(params);
  }

  async listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestRecord[]> {
    return listPendingPasswordResetRequests();
  }

  async listPendingPasswordResetRequestsPage(params = {}) {
    return listPendingPasswordResetRequestsPage(params);
  }

  async getAccounts() {
    return getAccounts();
  }
}
