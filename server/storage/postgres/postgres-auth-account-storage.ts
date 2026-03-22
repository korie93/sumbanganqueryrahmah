import type {
  AccountActivationToken,
  InsertUser,
  PasswordResetRequest,
  User,
} from "../../../shared/schema-postgres";
import type {
  AccountActivationTokenSummary,
  ManagedUserAccount,
  PasswordResetTokenSummary,
  PendingPasswordResetRequestSummary,
} from "../../storage-postgres";
import { PostgresStorageCore } from "./postgres-storage-core";

export class PostgresAuthAccountStorage extends PostgresStorageCore {
  async getUser(id: string): Promise<User | undefined> {
    return this.authRepository.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.authRepository.getUserByUsername(username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.authRepository.getUserByEmail(email);
  }

  async createUser(user: InsertUser): Promise<User> {
    return this.authRepository.createUser(user);
  }

  async createManagedUserAccount(params: {
    username: string;
    fullName?: string | null;
    email?: string | null;
    role: "admin" | "user";
    passwordHash: string;
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    createdBy: string;
    activatedAt?: Date | null;
    passwordChangedAt?: Date | null;
  }): Promise<User> {
    return this.authRepository.createManagedUserAccount(params);
  }

  async updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
  }): Promise<User | undefined> {
    return this.authRepository.updateUserCredentials(params);
  }

  async updateUserAccount(params: {
    userId: string;
    username?: string;
    fullName?: string | null;
    email?: string | null;
    role?: "admin" | "user";
    status?: "pending_activation" | "active" | "suspended" | "disabled";
    isBanned?: boolean;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    passwordHash?: string;
    passwordChangedAt?: Date | null;
    activatedAt?: Date | null;
    lastLoginAt?: Date | null;
  }): Promise<User | undefined> {
    return this.authRepository.updateUserAccount(params);
  }

  async getUsersByRoles(roles: string[]): Promise<
    Array<{
      id: string;
      username: string;
      role: string;
      createdAt: Date;
      updatedAt: Date;
      passwordChangedAt: Date | null;
      isBanned: boolean | null;
    }>
  > {
    return this.authRepository.getUsersByRoles(roles);
  }

  async getManagedUsers(): Promise<ManagedUserAccount[]> {
    return this.authRepository.getManagedUsers();
  }

  async listManagedUsersPage(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: "all" | "admin" | "user";
    status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "banned";
  }): Promise<{
    users: ManagedUserAccount[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    return this.authRepository.listManagedUsersPage(params);
  }

  async deleteManagedUserAccount(userId: string): Promise<boolean> {
    return this.authRepository.deleteManagedUserAccount(userId);
  }

  async updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void> {
    return this.authRepository.updateActivitiesUsername(oldUsername, newUsername);
  }

  async updateUserBan(username: string, isBanned: boolean): Promise<User | undefined> {
    return this.authRepository.updateUserBan(username, isBanned);
  }

  async touchLastLogin(userId: string, timestamp: Date = new Date()): Promise<void> {
    return this.authRepository.touchLastLogin(userId, timestamp);
  }

  async createActivationToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<AccountActivationToken> {
    return this.authRepository.createActivationToken(params);
  }

  async invalidateUnusedActivationTokens(userId: string): Promise<void> {
    return this.authRepository.invalidateUnusedActivationTokens(userId);
  }

  async getActivationTokenRecordByHash(
    tokenHash: string,
  ): Promise<AccountActivationTokenSummary | undefined> {
    return this.authRepository.getActivationTokenRecordByHash(tokenHash);
  }

  async consumeActivationTokenById(params: { tokenId: string; now?: Date }): Promise<boolean> {
    return this.authRepository.consumeActivationTokenById(params);
  }

  async createPasswordResetRequest(params: {
    userId: string;
    requestedByUser: string | null;
    approvedBy?: string | null;
    resetType?: string;
    tokenHash?: string | null;
    expiresAt?: Date | null;
    usedAt?: Date | null;
  }): Promise<PasswordResetRequest> {
    return this.authRepository.createPasswordResetRequest(params);
  }

  async updatePasswordResetRequest(params: {
    requestId: string;
    approvedBy?: string | null;
    resetType?: string;
    usedAt?: Date | null;
    tokenHash?: string | null;
    expiresAt?: Date | null;
  }): Promise<void> {
    return this.authRepository.updatePasswordResetRequest(params);
  }

  async resolvePendingPasswordResetRequestsForUser(params: {
    userId: string;
    approvedBy: string;
    resetType: string;
    usedAt?: Date | null;
  }): Promise<void> {
    return this.authRepository.resolvePendingPasswordResetRequestsForUser(params);
  }

  async invalidateUnusedPasswordResetTokens(userId: string, now?: Date): Promise<void> {
    return this.authRepository.invalidateUnusedPasswordResetTokens(userId, now);
  }

  async getPasswordResetTokenRecordByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenSummary | undefined> {
    return this.authRepository.getPasswordResetTokenRecordByHash(tokenHash);
  }

  async consumePasswordResetRequestById(params: {
    requestId: string;
    now?: Date;
  }): Promise<boolean> {
    return this.authRepository.consumePasswordResetRequestById(params);
  }

  async listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestSummary[]> {
    return this.authRepository.listPendingPasswordResetRequests();
  }

  async listPendingPasswordResetRequestsPage(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "banned";
  }): Promise<{
    requests: PendingPasswordResetRequestSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    return this.authRepository.listPendingPasswordResetRequestsPage(params);
  }

  async getAccounts(): Promise<
    Array<{
      username: string;
      role: string;
      isBanned: boolean | null;
    }>
  > {
    return this.authRepository.getAccounts();
  }
}
