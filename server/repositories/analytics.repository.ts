import { count, eq, gte, sql } from "drizzle-orm";
import { auditLogs, dataRows, imports, userActivity, users } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

const ANALYTICS_TZ = process.env.ANALYTICS_TZ || "Asia/Kuala_Lumpur";
const COLLECTION_RECORD_VERSION_CONFLICT_ACTION = "COLLECTION_RECORD_VERSION_CONFLICT";

type TopActiveUserRow = {
  username: string;
  role: string;
  loginCount: number;
  lastLogin: Date | null;
};

export class AnalyticsRepository {
  async getDashboardSummary(): Promise<{
    totalUsers: number;
    activeSessions: number;
    loginsToday: number;
    totalDataRows: number;
    totalImports: number;
    bannedUsers: number;
    collectionRecordVersionConflicts24h: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeSessions,
      loginsToday,
      totalDataRows,
      totalImports,
      bannedUsers,
      collectionRecordVersionConflicts24h,
    ] = await Promise.all([
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(userActivity).where(eq(userActivity.isActive, true)),
      db.select({ value: count() }).from(userActivity).where(gte(userActivity.loginTime, today)),
      db.select({ value: count() }).from(dataRows),
      db.select({ value: count() }).from(imports).where(eq(imports.isDeleted, false)),
      db.select({ value: count() }).from(users).where(eq(users.isBanned, true)),
      db.select({ value: count() }).from(auditLogs).where(sql`
        action = ${COLLECTION_RECORD_VERSION_CONFLICT_ACTION}
        AND timestamp >= NOW() - INTERVAL '24 hours'
      `),
    ]);

    return {
      totalUsers: totalUsers[0]?.value || 0,
      activeSessions: activeSessions[0]?.value || 0,
      loginsToday: loginsToday[0]?.value || 0,
      totalDataRows: totalDataRows[0]?.value || 0,
      totalImports: totalImports[0]?.value || 0,
      bannedUsers: bannedUsers[0]?.value || 0,
      collectionRecordVersionConflicts24h: collectionRecordVersionConflicts24h[0]?.value || 0,
    };
  }

  async getLoginTrends(days = 7): Promise<Array<{ date: string; logins: number; logouts: number }>> {
    const result = await db.execute(sql`
      WITH bounds AS (
        SELECT (NOW() AT TIME ZONE ${ANALYTICS_TZ})::date AS end_date
      ),
      days AS (
        SELECT generate_series(
          (SELECT end_date FROM bounds) - (${days} - 1) * INTERVAL '1 day',
          (SELECT end_date FROM bounds),
          INTERVAL '1 day'
        )::date AS day
      ),
      logins AS (
        SELECT
          (login_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
          COUNT(*)::int AS logins
        FROM public.user_activity
        WHERE login_time IS NOT NULL
        GROUP BY day
      ),
      logouts AS (
        SELECT
          (logout_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
          COUNT(*)::int AS logouts
        FROM public.user_activity
        WHERE logout_time IS NOT NULL
        GROUP BY day
      )
      SELECT
        days.day AS date,
        COALESCE(logins.logins, 0)::int AS logins,
        COALESCE(logouts.logouts, 0)::int AS logouts
      FROM days
      LEFT JOIN logins ON logins.day = days.day
      LEFT JOIN logouts ON logouts.day = days.day
      ORDER BY days.day ASC
    `);

    return (result.rows || []) as Array<{ date: string; logins: number; logouts: number }>;
  }

  async getTopActiveUsers(limit = 10): Promise<Array<{
    username: string;
    role: string;
    loginCount: number;
    lastLogin: string | null;
  }>> {
    const result = await db.execute(sql`
      SELECT
        username,
        role,
        COUNT(*)::int AS "loginCount",
        MAX(login_time) AS "lastLogin"
      FROM public.user_activity
      GROUP BY username, role
      ORDER BY "loginCount" DESC
      LIMIT ${limit}
    `);

    return (result.rows as TopActiveUserRow[]).map((row) => ({
      username: row.username,
      role: row.role,
      loginCount: row.loginCount,
      lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : null,
    }));
  }

  async getPeakHours(): Promise<Array<{ hour: number; count: number }>> {
    const result = await db.execute(sql`
      SELECT
        EXTRACT(HOUR FROM (login_time AT TIME ZONE 'UTC' AT TIME ZONE ${ANALYTICS_TZ}))::int AS hour,
        COUNT(*)::int AS count
      FROM public.user_activity
      WHERE login_time IS NOT NULL
      GROUP BY hour
      ORDER BY hour ASC
    `);

    const hoursMap = new Map<number, number>();
    for (let hour = 0; hour < 24; hour += 1) {
      hoursMap.set(hour, 0);
    }

    for (const row of result.rows as Array<{ hour: number; count: number }>) {
      hoursMap.set(row.hour, row.count);
    }

    return Array.from(hoursMap.entries()).map(([hour, count]) => ({
      hour,
      count,
    }));
  }

  async getRoleDistribution(): Promise<Array<{ role: string; count: number }>> {
    const result = await db.execute(sql`
      SELECT role, COUNT(*)::int AS count
      FROM public.users
      GROUP BY role
      ORDER BY role ASC
    `);

    return (result.rows || []) as Array<{ role: string; count: number }>;
  }
}
