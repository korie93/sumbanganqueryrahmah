import crypto from "crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  AccountActivationToken,
  InsertUser,
  PasswordResetRequest,
  User,
} from "../../shared/schema-postgres";
import {
  accountActivationTokens,
  passwordResetRequests,
  users,
  userActivity,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  type AccountStatus,
  type ManageableUserRole,
  normalizeAccountStatus,
  normalizeManageableUserRole,
  normalizeUserRole,
} from "../auth/account-lifecycle";
import { hashPassword } from "../auth/passwords";

const QUERY_PAGE_LIMIT = 1000;

export type ManagedUserRecord = {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  passwordResetBySuperuser: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  isBanned: boolean | null;
};

export type PendingPasswordResetRequestRecord = {
  id: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  requestedByUser: string | null;
  approvedBy: string | null;
  resetType: string;
  createdAt: Date;
  expiresAt: Date | null;
  usedAt: Date | null;
};

export type ActivationTokenRecord = {
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

export type PasswordResetTokenRecord = {
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

    await db.update(users).set(next).where(eq(users.id, params.userId));
    return this.getUser(params.userId);
  }

  async getUsersByRoles(roles: string[]): Promise<Array<{
    id: string;
    username: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    passwordChangedAt: Date | null;
    isBanned: boolean | null;
  }>> {
    if (!Array.isArray(roles) || roles.length === 0) return [];

    const results: Array<{
      id: string;
      username: string;
      role: string;
      createdAt: Date;
      updatedAt: Date;
      passwordChangedAt: Date | null;
      isBanned: boolean | null;
    }> = [];

    let offset = 0;
    while (true) {
      const chunk = await db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          passwordChangedAt: users.passwordChangedAt,
          isBanned: users.isBanned,
        })
        .from(users)
        .where(inArray(users.role, roles))
        .orderBy(users.role, users.username)
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      results.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return results;
  }

  async getManagedUsers(): Promise<ManagedUserRecord[]> {
    const rows: ManagedUserRecord[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
          status: users.status,
          mustChangePassword: users.mustChangePassword,
          passwordResetBySuperuser: users.passwordResetBySuperuser,
          createdBy: users.createdBy,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          activatedAt: users.activatedAt,
          lastLoginAt: users.lastLoginAt,
          passwordChangedAt: users.passwordChangedAt,
          isBanned: users.isBanned,
        })
        .from(users)
        .where(inArray(users.role, ["admin", "user"]))
        .orderBy(users.role, users.username)
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      rows.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return rows;
  }

  async updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void> {
    await db
      .update(userActivity)
      .set({ username: newUsername })
      .where(sql`${userActivity.username} = ${oldUsername}`);
  }

  async updateUserBan(username: string, isBanned: boolean): Promise<User | undefined> {
    await db
      .update(users)
      .set({ isBanned, updatedAt: new Date() })
      .where(sql`${users.username} = ${username}`);

    return this.getUserByUsername(username);
  }

  async touchLastLogin(userId: string, timestamp = new Date()): Promise<void> {
    await db
      .update(users)
      .set({
        lastLoginAt: timestamp,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async createActivationToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<AccountActivationToken> {
    const record = {
      id: crypto.randomUUID(),
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      usedAt: null,
      createdBy: params.createdBy,
      createdAt: new Date(),
    };

    await db.insert(accountActivationTokens).values(record);
    return record;
  }

  async invalidateUnusedActivationTokens(userId: string): Promise<void> {
    await db
      .update(accountActivationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(accountActivationTokens.userId, userId),
          isNull(accountActivationTokens.usedAt),
        ),
      );
  }

  async getActivationTokenRecordByHash(
    tokenHash: string,
  ): Promise<ActivationTokenRecord | undefined> {
    const normalizedHash = String(tokenHash || "").trim();
    if (!normalizedHash) {
      return undefined;
    }

    const result = await db.execute(sql`
      SELECT
        t.id as "tokenId",
        t.expires_at as "expiresAt",
        t.used_at as "usedAt",
        t.created_at as "createdAt",
        u.id as "userId",
        u.username,
        u.full_name as "fullName",
        u.email,
        u.role,
        u.status,
        u.is_banned as "isBanned",
        u.activated_at as "activatedAt"
      FROM public.account_activation_tokens t
      INNER JOIN public.users u ON u.id = t.user_id
      WHERE t.token_hash = ${normalizedHash}
      ORDER BY t.created_at DESC
      LIMIT 1
    `);

    return result.rows[0] as ActivationTokenRecord | undefined;
  }

  async consumeActivationTokenById(params: {
    tokenId: string;
    now?: Date;
  }): Promise<boolean> {
    const tokenId = String(params.tokenId || "").trim();
    if (!tokenId) {
      return false;
    }

    const now = params.now ?? new Date();
    const result = await db.execute(sql`
      UPDATE public.account_activation_tokens
      SET used_at = ${now}
      WHERE id = ${tokenId}
        AND used_at IS NULL
        AND expires_at > ${now}
      RETURNING id
    `);

    return (result.rows || []).length > 0;
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
    const record = {
      id: crypto.randomUUID(),
      userId: params.userId,
      requestedByUser: params.requestedByUser,
      approvedBy: params.approvedBy ?? null,
      resetType: params.resetType ?? "email_link",
      tokenHash: params.tokenHash ?? null,
      expiresAt: params.expiresAt ?? null,
      usedAt: params.usedAt ?? null,
      createdAt: new Date(),
    };

    await db.insert(passwordResetRequests).values(record);
    return record;
  }

  async updatePasswordResetRequest(params: {
    requestId: string;
    approvedBy?: string | null;
    resetType?: string;
    usedAt?: Date | null;
    tokenHash?: string | null;
    expiresAt?: Date | null;
  }): Promise<void> {
    await db
      .update(passwordResetRequests)
      .set({
        approvedBy: params.approvedBy,
        resetType: params.resetType,
        tokenHash: params.tokenHash ?? null,
        expiresAt: params.expiresAt ?? null,
        usedAt: params.usedAt ?? null,
      })
      .where(eq(passwordResetRequests.id, params.requestId));
  }

  async resolvePendingPasswordResetRequestsForUser(params: {
    userId: string;
    approvedBy: string;
    resetType: string;
    usedAt?: Date | null;
  }): Promise<void> {
    await db
      .update(passwordResetRequests)
      .set({
        approvedBy: params.approvedBy,
        resetType: params.resetType,
        usedAt: params.usedAt ?? new Date(),
      })
      .where(
        and(
          eq(passwordResetRequests.userId, params.userId),
          isNull(passwordResetRequests.approvedBy),
          isNull(passwordResetRequests.usedAt),
        ),
      );
  }

  async invalidateUnusedPasswordResetTokens(userId: string, now = new Date()): Promise<void> {
    await db
      .update(passwordResetRequests)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetRequests.userId, userId),
          isNull(passwordResetRequests.usedAt),
          sql`${passwordResetRequests.tokenHash} IS NOT NULL`,
        ),
      );
  }

  async getPasswordResetTokenRecordByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | undefined> {
    const normalizedHash = String(tokenHash || "").trim();
    if (!normalizedHash) {
      return undefined;
    }

    const result = await db.execute(sql`
      SELECT
        r.id as "requestId",
        r.user_id as "userId",
        r.expires_at as "expiresAt",
        r.used_at as "usedAt",
        r.created_at as "createdAt",
        u.username,
        u.full_name as "fullName",
        u.email,
        u.role,
        u.status,
        u.is_banned as "isBanned",
        u.activated_at as "activatedAt"
      FROM public.password_reset_requests r
      INNER JOIN public.users u ON u.id = r.user_id
      WHERE r.token_hash = ${normalizedHash}
      ORDER BY r.created_at DESC
      LIMIT 1
    `);

    return (result.rows?.[0] || undefined) as PasswordResetTokenRecord | undefined;
  }

  async consumePasswordResetRequestById(params: {
    requestId: string;
    now?: Date;
  }): Promise<boolean> {
    const requestId = String(params.requestId || "").trim();
    if (!requestId) {
      return false;
    }

    const now = params.now ?? new Date();
    const result = await db.execute(sql`
      UPDATE public.password_reset_requests
      SET used_at = ${now}
      WHERE id = ${requestId}
        AND used_at IS NULL
        AND expires_at > ${now}
      RETURNING id
    `);

    return (result.rows || []).length > 0;
  }

  async listPendingPasswordResetRequests(): Promise<PendingPasswordResetRequestRecord[]> {
    const result = await db.execute(sql`
      SELECT
        r.id,
        r.user_id as "userId",
        r.requested_by_user as "requestedByUser",
        r.approved_by as "approvedBy",
        r.reset_type as "resetType",
        r.created_at as "createdAt",
        r.expires_at as "expiresAt",
        r.used_at as "usedAt",
        u.username,
        u.full_name as "fullName",
        u.email,
        u.role,
        u.status,
        u.is_banned as "isBanned"
      FROM public.password_reset_requests r
      INNER JOIN public.users u ON u.id = r.user_id
      WHERE r.approved_by IS NULL
        AND r.used_at IS NULL
      ORDER BY r.created_at DESC
    `);

    return (result.rows || []) as PendingPasswordResetRequestRecord[];
  }

  async getAccounts(): Promise<Array<{
    username: string;
    role: string;
    isBanned: boolean | null;
  }>> {
    const rows: Array<{
      username: string;
      role: string;
      isBanned: boolean | null;
    }> = [];

    let offset = 0;
    while (true) {
      const chunk = await db
        .select({
          username: users.username,
          role: users.role,
          isBanned: users.isBanned,
        })
        .from(users)
        .orderBy(users.role, users.username)
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      rows.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return rows;
  }
}
