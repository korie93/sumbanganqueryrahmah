import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import type {
  InsertUser,
  User,
} from "../../shared/schema-postgres";
import { users } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  type AccountStatus,
  type ManageableUserRole,
  normalizeAccountStatus,
  normalizeManageableUserRole,
  normalizeUserRole,
} from "../auth/account-lifecycle";
import { hashPassword } from "../auth/passwords";
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

export type {
  ActivationTokenRecord,
  ManagedUserRecord,
  PasswordResetTokenRecord,
  PendingPasswordResetRequestRecord,
} from "./auth-repository-types";

export class AuthRepository {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(sql`${users.id} = ${id}`)
      .limit(1);

    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const normalized = String(username || "").trim();
    if (!normalized) return undefined;

    const result = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${normalized})`)
      .limit(1);

    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return undefined;

    const result = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${normalized})`)
      .limit(1);

    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    const now = new Date();
    const hashedPassword = await hashPassword(user.password);

    await db.insert(users).values({
      id,
      username: user.username,
      fullName: user.fullName?.trim() || null,
      email: user.email?.trim().toLowerCase() || null,
      passwordHash: hashedPassword,
      role: normalizeUserRole(user.role),
      status: "active",
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      createdBy: "legacy-create-user",
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: now,
      activatedAt: now,
      isBanned: false,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorConfiguredAt: null,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    });

    return (await this.getUser(id))!;
  }

  async createManagedUserAccount(params: {
    username: string;
    fullName?: string | null;
    email?: string | null;
    role: ManageableUserRole;
    passwordHash: string;
    status?: AccountStatus;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
    createdBy: string;
    activatedAt?: Date | null;
    passwordChangedAt?: Date | null;
  }): Promise<User> {
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(users).values({
      id,
      username: params.username.trim().toLowerCase(),
      fullName: String(params.fullName || "").trim() || null,
      email: String(params.email || "").trim().toLowerCase() || null,
      passwordHash: params.passwordHash,
      role: normalizeManageableUserRole(params.role),
      status: normalizeAccountStatus(params.status, "pending_activation"),
      mustChangePassword: params.mustChangePassword === true,
      passwordResetBySuperuser: params.passwordResetBySuperuser === true,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: params.passwordChangedAt ?? null,
      activatedAt: params.activatedAt ?? null,
      isBanned: false,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorConfiguredAt: null,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    });

    return (await this.getUser(id))!;
  }

  async updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
    mustChangePassword?: boolean;
    passwordResetBySuperuser?: boolean;
  }): Promise<User | undefined> {
    const next: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof params.newUsername === "string" && params.newUsername.trim()) {
      next.username = params.newUsername.trim().toLowerCase();
    }

    if (typeof params.newPasswordHash === "string" && params.newPasswordHash.trim()) {
      next.passwordHash = params.newPasswordHash.trim();
      next.passwordChangedAt = params.passwordChangedAt ?? new Date();
    } else if (params.passwordChangedAt !== undefined) {
      next.passwordChangedAt = params.passwordChangedAt;
    }

    if (params.mustChangePassword !== undefined) {
      next.mustChangePassword = params.mustChangePassword;
    }

    if (params.passwordResetBySuperuser !== undefined) {
      next.passwordResetBySuperuser = params.passwordResetBySuperuser;
    }

    await db.update(users).set(next).where(sql`${users.id} = ${params.userId}`);
    return this.getUser(params.userId);
  }

  async updateUserAccount(params: {
    userId: string;
    username?: string;
    fullName?: string | null;
    email?: string | null;
    role?: ManageableUserRole;
    status?: AccountStatus;
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
  }): Promise<User | undefined> {
    const next: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof params.username === "string" && params.username.trim()) {
      next.username = params.username.trim().toLowerCase();
    }

    if (params.fullName !== undefined) {
      next.fullName = String(params.fullName || "").trim() || null;
    }

    if (params.email !== undefined) {
      next.email = String(params.email || "").trim().toLowerCase() || null;
    }

    if (params.role !== undefined) {
      next.role = normalizeManageableUserRole(params.role);
    }

    if (params.status !== undefined) {
      next.status = normalizeAccountStatus(params.status);
    }

    if (params.isBanned !== undefined) {
      next.isBanned = params.isBanned;
    }

    if (params.mustChangePassword !== undefined) {
      next.mustChangePassword = params.mustChangePassword;
    }

    if (params.passwordResetBySuperuser !== undefined) {
      next.passwordResetBySuperuser = params.passwordResetBySuperuser;
    }

    if (params.passwordHash !== undefined) {
      next.passwordHash = params.passwordHash;
    }

    if (params.passwordChangedAt !== undefined) {
      next.passwordChangedAt = params.passwordChangedAt;
    }

    if (params.activatedAt !== undefined) {
      next.activatedAt = params.activatedAt;
    }

    if (params.lastLoginAt !== undefined) {
      next.lastLoginAt = params.lastLoginAt;
    }

    if (params.twoFactorEnabled !== undefined) {
      next.twoFactorEnabled = params.twoFactorEnabled;
    }

    if (params.twoFactorSecretEncrypted !== undefined) {
      next.twoFactorSecretEncrypted = params.twoFactorSecretEncrypted;
    }

    if (params.twoFactorConfiguredAt !== undefined) {
      next.twoFactorConfiguredAt = params.twoFactorConfiguredAt;
    }

    if (params.failedLoginAttempts !== undefined) {
      next.failedLoginAttempts = params.failedLoginAttempts;
    }

    if (params.lockedAt !== undefined) {
      next.lockedAt = params.lockedAt;
    }

    if (params.lockedReason !== undefined) {
      next.lockedReason = params.lockedReason;
    }

    if (params.lockedBySystem !== undefined) {
      next.lockedBySystem = params.lockedBySystem;
    }

    await db.update(users).set(next).where(eq(users.id, params.userId));
    return this.getUser(params.userId);
  }

  async recordFailedLoginAttempt(params: {
    userId: string;
    maxAllowedAttempts: number;
    lockedReason: string;
    now?: Date;
  }): Promise<{
    user: User | undefined;
    failedLoginAttempts: number;
    locked: boolean;
    newlyLocked: boolean;
  }> {
    const now = params.now ?? new Date();
    const maxAllowedAttempts = Math.max(0, Math.floor(Number(params.maxAllowedAttempts) || 0));

    return db.transaction(async (tx) => {
      const currentRows = await tx
        .select({
          failedLoginAttempts: users.failedLoginAttempts,
          lockedAt: users.lockedAt,
        })
        .from(users)
        .where(eq(users.id, params.userId))
        .for("update");

      const current = currentRows[0];
      if (!current) {
        return {
          user: undefined,
          failedLoginAttempts: 0,
          locked: false,
          newlyLocked: false,
        };
      }

      const previousAttempts = Math.max(0, Number(current.failedLoginAttempts || 0));
      const nextAttempts = previousAttempts + 1;
      const wasLocked = current.lockedAt instanceof Date
        ? !Number.isNaN(current.lockedAt.getTime())
        : Boolean(current.lockedAt);
      const shouldLock = wasLocked || nextAttempts > maxAllowedAttempts;
      const newlyLocked = !wasLocked && shouldLock;

      const updatedRows = await tx
        .update(users)
        .set({
          failedLoginAttempts: nextAttempts,
          lockedAt: shouldLock ? (current.lockedAt ?? now) : null,
          lockedReason: shouldLock ? params.lockedReason : null,
          lockedBySystem: shouldLock,
          updatedAt: now,
        })
        .where(eq(users.id, params.userId))
        .returning();

      return {
        user: updatedRows[0],
        failedLoginAttempts: nextAttempts,
        locked: shouldLock,
        newlyLocked,
      };
    });
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
