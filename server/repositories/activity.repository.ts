import crypto from "crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { InsertUserActivity, User, UserActivity } from "../../shared/schema-postgres";
import { userActivity, users } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

const QUERY_PAGE_LIMIT = 1000;

type ActivityRepositoryOptions = {
  ensureBannedSessionsTable: () => Promise<void>;
};

export class ActivityRepository {
  constructor(private readonly options: ActivityRepositoryOptions) {}

  private computeActivityStatus(activity: UserActivity): string {
    if (!activity.isActive) {
      if (activity.logoutReason === "KICKED") return "KICKED";
      if (activity.logoutReason === "BANNED") return "BANNED";
      return "LOGOUT";
    }

    if (activity.lastActivityTime) {
      const lastActive = new Date(activity.lastActivityTime).getTime();
      const diffMinutes = Math.floor((Date.now() - lastActive) / 60_000);
      if (diffMinutes >= 5) return "IDLE";
    }

    return "ONLINE";
  }

  async createActivity(data: InsertUserActivity): Promise<UserActivity> {
    const now = new Date();
    const result = await db
      .insert(userActivity)
      .values({
        id: crypto.randomUUID(),
        userId: data.userId,
        username: data.username,
        role: data.role,
        pcName: data.pcName ?? null,
        browser: data.browser ?? null,
        fingerprint: data.fingerprint ?? null,
        ipAddress: data.ipAddress ?? null,
        loginTime: now,
        logoutTime: null,
        lastActivityTime: now,
        isActive: true,
        logoutReason: null,
      })
      .returning();

    return result[0];
  }

  async touchActivity(activityId: string): Promise<void> {
    await db
      .update(userActivity)
      .set({ lastActivityTime: new Date() })
      .where(eq(userActivity.id, activityId));
  }

  async getActiveActivitiesByUsername(username: string): Promise<UserActivity[]> {
    const activities: UserActivity[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(userActivity)
        .where(and(eq(userActivity.username, username), eq(userActivity.isActive, true)))
        .orderBy(desc(userActivity.loginTime))
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      activities.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return activities;
  }

  async updateActivity(id: string, data: Partial<UserActivity>): Promise<UserActivity | undefined> {
    const updateData: Partial<typeof userActivity.$inferInsert> = {};
    if (data.lastActivityTime !== undefined) updateData.lastActivityTime = data.lastActivityTime;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.logoutTime !== undefined) updateData.logoutTime = data.logoutTime;
    if (data.logoutReason !== undefined) updateData.logoutReason = data.logoutReason;

    if (Object.keys(updateData).length > 0) {
      await db.update(userActivity).set(updateData).where(eq(userActivity.id, id));
    }

    const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
    return result[0];
  }

  async getActivityById(id: string): Promise<UserActivity | undefined> {
    const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
    return result[0];
  }

  async getActiveActivities(): Promise<UserActivity[]> {
    const activities: UserActivity[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(userActivity)
        .where(eq(userActivity.isActive, true))
        .orderBy(desc(userActivity.loginTime))
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      activities.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return activities;
  }

  async getAllActivities(): Promise<Array<UserActivity & { status: string }>> {
    const activities: UserActivity[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(userActivity)
        .orderBy(desc(userActivity.loginTime))
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      activities.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return activities.map((activity) => ({
      ...activity,
      status: this.computeActivityStatus(activity),
    }));
  }

  async deleteActivity(id: string): Promise<boolean> {
    await db.delete(userActivity).where(eq(userActivity.id, id));
    return true;
  }

  async getFilteredActivities(filters: {
    status?: string[];
    username?: string;
    ipAddress?: string;
    browser?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Array<UserActivity & { status: string }>> {
    const whereConditions = [];

    if (filters.username) whereConditions.push(eq(userActivity.username, filters.username));
    if (filters.ipAddress) whereConditions.push(eq(userActivity.ipAddress, filters.ipAddress));
    if (filters.browser) whereConditions.push(eq(userActivity.browser, filters.browser));
    if (filters.dateFrom) whereConditions.push(gte(userActivity.loginTime, filters.dateFrom));
    if (filters.dateTo) {
      const endOfDay = new Date(filters.dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      whereConditions.push(lte(userActivity.loginTime, endOfDay));
    }

    const activities: UserActivity[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(userActivity)
        .where(whereConditions.length ? and(...whereConditions) : undefined)
        .orderBy(desc(userActivity.loginTime))
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      activities.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    const enriched = activities.map((activity) => ({
      ...activity,
      status: this.computeActivityStatus(activity),
    }));

    if (filters.status?.length) {
      return enriched.filter((activity) => filters.status!.includes(activity.status));
    }

    return enriched;
  }

  async deactivateUserActivities(username: string, reason?: string): Promise<void> {
    const updateData: Partial<typeof userActivity.$inferInsert> = {
      isActive: false,
      logoutTime: new Date(),
    };

    if (reason) {
      updateData.logoutReason = reason;
    }

    await db
      .update(userActivity)
      .set(updateData)
      .where(and(eq(userActivity.isActive, true), eq(userActivity.username, username)));
  }

  async deactivateUserSessionsByFingerprint(username: string, fingerprint: string): Promise<void> {
    await db
      .update(userActivity)
      .set({
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "NEW_SESSION",
      })
      .where(
        and(
          eq(userActivity.username, username),
          eq(userActivity.fingerprint, fingerprint),
          eq(userActivity.isActive, true),
        ),
      );
  }

  async getBannedUsers(): Promise<Array<User & {
    banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null };
  }>> {
    const result = await db.execute(sql`
      SELECT
        u.*,
        ban.ip_address as "banIpAddress",
        ban.browser as "banBrowser",
        ban.logout_time as "banLogoutTime"
      FROM public.users u
      LEFT JOIN LATERAL (
        SELECT
          ua.ip_address,
          ua.browser,
          ua.logout_time
        FROM public.user_activity ua
        WHERE lower(ua.username) = lower(u.username)
          AND ua.logout_reason = 'BANNED'
        ORDER BY ua.logout_time DESC NULLS LAST
        LIMIT 1
      ) ban ON true
      WHERE u.is_banned = true
      ORDER BY u.username ASC
    `);

    return (result.rows || []).map((row: any) => ({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      passwordChangedAt: row.password_changed_at,
      isBanned: row.is_banned,
      banInfo: row.banLogoutTime
        ? {
          ipAddress: row.banIpAddress ?? null,
          browser: row.banBrowser ?? null,
          bannedAt: row.banLogoutTime ? new Date(row.banLogoutTime) : null,
        }
        : undefined,
    }));
  }

  async isVisitorBanned(fingerprint?: string | null, ipAddress?: string | null): Promise<boolean> {
    await this.options.ensureBannedSessionsTable();
    if (!fingerprint && !ipAddress) return false;

    const result = await db.execute(sql`
      SELECT id
      FROM public.banned_sessions
      WHERE (${fingerprint ?? null}::text IS NOT NULL AND fingerprint = ${fingerprint ?? null}::text)
         OR (${ipAddress ?? null}::text IS NOT NULL AND ip_address = ${ipAddress ?? null}::text)
      LIMIT 1
    `);

    return (result.rows?.length || 0) > 0;
  }

  async banVisitor(params: {
    username: string;
    role: string;
    activityId: string;
    fingerprint?: string | null;
    ipAddress?: string | null;
    browser?: string | null;
    pcName?: string | null;
  }): Promise<void> {
    await this.options.ensureBannedSessionsTable();
    const banId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO public.banned_sessions
        (id, username, role, activity_id, fingerprint, ip_address, browser, pc_name, banned_at)
      VALUES
        (${banId}, ${params.username}, ${params.role}, ${params.activityId},
         ${params.fingerprint ?? null}, ${params.ipAddress ?? null}, ${params.browser ?? null}, ${params.pcName ?? null},
         ${new Date()})
      ON CONFLICT DO NOTHING
    `);
  }

  async unbanVisitor(banId: string): Promise<void> {
    await this.options.ensureBannedSessionsTable();
    await db.execute(sql`DELETE FROM public.banned_sessions WHERE id = ${banId}`);
  }

  async getBannedSessions(): Promise<Array<{
    banId: string;
    username: string;
    role: string;
    fingerprint: string | null;
    ipAddress: string | null;
    browser: string | null;
    bannedAt: Date | null;
  }>> {
    await this.options.ensureBannedSessionsTable();
    const result = await db.execute(sql`
      SELECT
        id as "banId",
        username,
        role,
        fingerprint,
        ip_address as "ipAddress",
        browser,
        banned_at as "bannedAt"
      FROM public.banned_sessions
      ORDER BY banned_at DESC
    `);

    return (result.rows || []) as Array<{
      banId: string;
      username: string;
      role: string;
      fingerprint: string | null;
      ipAddress: string | null;
      browser: string | null;
      bannedAt: Date | null;
    }>;
  }
}
