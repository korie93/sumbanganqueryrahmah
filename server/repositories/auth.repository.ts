import bcrypt from "bcrypt";
import crypto from "crypto";
import { inArray, sql } from "drizzle-orm";
import type { InsertUser, User } from "../../shared/schema-postgres";
import { users, userActivity } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

const BCRYPT_COST = 12;
const QUERY_PAGE_LIMIT = 1000;

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

  async createUser(user: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    const now = new Date();
    const hashedPassword = await bcrypt.hash(user.password, BCRYPT_COST);

    await db.insert(users).values({
      id,
      username: user.username,
      passwordHash: hashedPassword,
      role: user.role ?? "user",
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: now,
      isBanned: false,
    });

    return (await this.getUser(id))!;
  }

  async updateUserCredentials(params: {
    userId: string;
    newUsername?: string;
    newPasswordHash?: string;
    passwordChangedAt?: Date | null;
  }): Promise<User | undefined> {
    const next: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof params.newUsername === "string" && params.newUsername.trim()) {
      next.username = params.newUsername.trim();
    }

    if (typeof params.newPasswordHash === "string" && params.newPasswordHash.trim()) {
      next.passwordHash = params.newPasswordHash.trim();
      next.passwordChangedAt = params.passwordChangedAt ?? new Date();
    } else if (params.passwordChangedAt !== undefined) {
      next.passwordChangedAt = params.passwordChangedAt;
    }

    await db.update(users).set(next).where(sql`${users.id} = ${params.userId}`);
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

    const result = await db
      .select()
      .from(users)
      .where(sql`${users.username} = ${username}`)
      .limit(1);

    return result[0];
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
