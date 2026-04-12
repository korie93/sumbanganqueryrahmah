import type {
  AccountActivationToken,
  InsertUser,
  PasswordResetRequest,
  User,
} from "../shared/schema-postgres";
import type {
  ActivationTokenRecord,
  ManagedUserRecord,
  PasswordResetTokenRecord,
  PendingPasswordResetRequestRecord,
} from "./repositories/auth.repository";

export type ManagedUserAccount = ManagedUserRecord;
export type PendingPasswordResetRequestSummary = PendingPasswordResetRequestRecord;
export type AccountActivationTokenSummary = ActivationTokenRecord;
export type PasswordResetTokenSummary = PasswordResetTokenRecord;

export interface AuthStorageContract {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createManagedUserAccount(params: {
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
  }): Promise<User>;
  updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
  }): Promise<User | undefined>;
  updateUserAccount(params: {
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
    twoFactorEnabled?: boolean;
    twoFactorSecretEncrypted?: string | null;
    twoFactorConfiguredAt?: Date | null;
    failedLoginAttempts?: number;
    lockedAt?: Date | null;
    lockedReason?: string | null;
    lockedBySystem?: boolean;
  }): Promise<User | undefined>;
  recordFailedLoginAttempt(params: {
    userId: string;
    maxAllowedAttempts: number;
    lockedReason: string;
    now?: Date;
  }): Promise<{
    user: User | undefined;
    failedLoginAttempts: number;
    locked: boolean;
    newlyLocked: boolean;
  }>;
  getUsersByRoles(roles: string[]): Promise<Array<{
    id: string;
    username: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    passwordChangedAt: Date | null;
    isBanned: boolean | null;
  }>>;
  getManagedUsers(): Promise<ManagedUserAccount[]>;
  listManagedUsersPage(params?: {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    role?: "all" | "admin" | "user" | undefined;
    status?:
      | "all"
      | "active"
      | "pending_activation"
      | "suspended"
      | "disabled"
      | "locked"
      | "banned"
      | undefined;
  }): Promise<{
    users: ManagedUserAccount[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
  deleteManagedUserAccount(userId: string): Promise<boolean>;
  updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void>;
  updateUserBan(username: string, isBanned: boolean): Promise<User | undefined>;
  touchLastLogin(userId: string, timestamp?: Date): Promise<void>;
  createActivationToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<AccountActivationToken>;
  invalidateUnusedActivationTokens(userId: string): Promise<void>;
  getActivationTokenRecordByHash(
    tokenHash: string,
  ): Promise<AccountActivationTokenSummary | undefined>;
  consumeActivationTokenById(params: {
    tokenId: string;
    now?: Date;
  }): Promise<boolean>;
  createPasswordResetRequest(params: {
    userId: string;
    requestedByUser: string | null;
    approvedBy?: string | null;
    resetType?: string;
    tokenHash?: string | null;
    expiresAt?: Date | null;
    usedAt?: Date | null;
  }): Promise<PasswordResetRequest>;
  updatePasswordResetRequest(params: {
    requestId: string;
    approvedBy?: string | null;
    resetType?: string;
    usedAt?: Date | null;
    tokenHash?: string | null;
    expiresAt?: Date | null;
  }): Promise<void>;
  resolvePendingPasswordResetRequestsForUser(params: {
    userId: string;
    approvedBy: string;
    resetType: string;
    usedAt?: Date | null;
  }): Promise<void>;
  invalidateUnusedPasswordResetTokens(userId: string, now?: Date): Promise<void>;
  getPasswordResetTokenRecordByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenSummary | undefined>;
  consumePasswordResetRequestById(params: {
    requestId: string;
    now?: Date;
  }): Promise<boolean>;
  listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestSummary[]>;
  listPendingPasswordResetRequestsPage(params?: {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    status?:
      | "all"
      | "active"
      | "pending_activation"
      | "suspended"
      | "disabled"
      | "locked"
      | "banned"
      | undefined;
  }): Promise<{
    requests: PendingPasswordResetRequestSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>;
  getAccounts(): Promise<Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }>>;
}
