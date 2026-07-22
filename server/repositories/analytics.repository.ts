import { count, eq, gte, sql, type SQL } from "drizzle-orm";
import { auditLogs, dataRows, imports, userActivity, users } from "../../shared/schema-postgres";
import { dbRead } from "../db-postgres";
import {
  ANALYTICS_TZ,
  BACKUP_ACTIVITY_ACTIONS,
  buildAuditActionList,
  COLLECTION_RECORD_VERSION_CONFLICT_ACTION,
  LOGIN_FAILURE_ACTIONS,
  resolveAnalyticsIpAddress,
  sanitizeAnalyticsShortText,
  summarizeAnalyticsBrowser,
  type RecentLoginActivity,
  type RecentLoginActivityFilter,
  type RecentLoginActivityPage,
  type RecentLoginActivityPageOptions,
  type RecentLoginActivityRow,
  type RecentLoginActivitySortBy,
  type RecentLoginActivitySortOrder,
  serializeAnalyticsTimestamp,
  type TopActiveUserRow,
} from "./analytics-repository-shared";

export { serializeAnalyticsTimestamp } from "./analytics-repository-shared";

export class AnalyticsRepository {
  private mapRecentLoginActivityRow(
    row: RecentLoginActivityRow,
    options: {
      includeExactIpAddress?: boolean | undefined;
      includeInternalReason?: boolean | undefined;
    } = {},
  ): RecentLoginActivity {
    const status = row.status ?? (row.isActive ? "active" : "ended");
    const eventType = row.eventType === "failure" || status === "failed" ? "failure" : "success";

    return {
      browser: summarizeAnalyticsBrowser(row.browser),
      eventType,
      failureReason: options.includeInternalReason
        ? sanitizeAnalyticsShortText(row.failureReason, 80)
        : null,
      id: row.id,
      ipAddress: resolveAnalyticsIpAddress(row.ipAddress, options.includeExactIpAddress),
      lastActivityTime: serializeAnalyticsTimestamp(row.lastActivityTime),
      loginTime: serializeAnalyticsTimestamp(row.loginTime),
      logoutReason: status === "failed"
        ? "Login attempt rejected"
        : sanitizeAnalyticsShortText(row.logoutReason),
      logoutTime: serializeAnalyticsTimestamp(row.logoutTime),
      platform: sanitizeAnalyticsShortText(row.platform, 48),
      role: row.role,
      status,
      userAgentSummary: sanitizeAnalyticsShortText(row.userAgentSummary, 100),
      username: row.username,
    };
  }

  private buildRecentLoginEventsCte() {
    return sql`
      WITH login_events AS (
        SELECT
          id,
          username,
          role,
          login_time AS "loginTime",
          last_activity_time AS "lastActivityTime",
          logout_time AS "logoutTime",
          is_active AS "isActive",
          browser,
          ip_address AS "ipAddress",
          logout_reason AS "logoutReason",
          NULL::text AS "failureReason",
          NULL::text AS platform,
          browser AS "userAgentSummary",
          'success'::text AS "eventType",
          CASE WHEN is_active IS TRUE THEN 'active' ELSE 'ended' END::text AS status,
          COALESCE(login_time, last_activity_time, logout_time) AS "eventTime"
        FROM public.user_activity

        UNION ALL

        SELECT
          'audit:' || failure.id AS id,
          failure.performed_by AS username,
          COALESCE(
            NULLIF(failure.audit_data #>> '{security_audit,metadata,role}', ''),
            matched_user.role,
            'unknown'
          ) AS role,
          failure.timestamp AS "loginTime",
          NULL::timestamptz AS "lastActivityTime",
          NULL::timestamptz AS "logoutTime",
          FALSE AS "isActive",
          NULLIF(failure.audit_data #>> '{security_audit,metadata,browser}', '') AS browser,
          NULLIF(failure.audit_data #>> '{security_audit,metadata,network}', '') AS "ipAddress",
          NULL::text AS "logoutReason",
          NULLIF(
            failure.audit_data #>> '{security_audit,metadata,failure_reason}',
            ''
          ) AS "failureReason",
          NULLIF(failure.audit_data #>> '{security_audit,metadata,platform}', '') AS platform,
          NULLIF(
            failure.audit_data #>> '{security_audit,metadata,user_agent_summary}',
            ''
          ) AS "userAgentSummary",
          'failure'::text AS "eventType",
          'failed'::text AS status,
          failure.timestamp AS "eventTime"
        FROM (
          SELECT
            id,
            performed_by,
            target_user,
            timestamp,
            CASE
              WHEN details LIKE '{"security_audit":%'
              THEN details::jsonb
              ELSE NULL
            END AS audit_data
          FROM public.audit_logs
          WHERE action IN (${buildAuditActionList(LOGIN_FAILURE_ACTIONS)})
        ) failure
        LEFT JOIN public.users matched_user
          ON matched_user.id = failure.target_user
        WHERE failure.audit_data IS NOT NULL
      )
    `;
  }

  private buildRecentLoginActivityOrderBy(
    sortBy: RecentLoginActivitySortBy,
    sortOrder: RecentLoginActivitySortOrder,
  ) {
    const direction = sortOrder === "asc" ? sql`ASC` : sql`DESC`;
    const column = sortBy === "username"
      ? sql`lower(username)`
      : sortBy === "role"
        ? sql`lower(role)`
        : sortBy === "status"
          ? sql`status`
          : sql`"eventTime"`;

    return sql`ORDER BY ${column} ${direction} NULLS LAST, "eventTime" DESC NULLS LAST, id ASC`;
  }

  async getDashboardSummary(): Promise<{
    totalUsers: number;
    activeSessions: number;
    loginsToday: number;
    totalDataRows: number;
    totalImports: number;
    bannedUsers: number;
    collectionRecordVersionConflicts24h: number;
    loginFailures24h: number;
    backupActions24h: number;
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
      loginFailures24h,
      backupActions24h,
    ] = await Promise.all([
      dbRead.select({ value: count() }).from(users),
      dbRead.select({ value: count() }).from(userActivity).where(eq(userActivity.isActive, true)),
      dbRead.select({ value: count() }).from(userActivity).where(gte(userActivity.loginTime, today)),
      dbRead.select({ value: count() }).from(dataRows),
      dbRead.select({ value: count() }).from(imports).where(eq(imports.isDeleted, false)),
      dbRead.select({ value: count() }).from(users).where(eq(users.isBanned, true)),
      dbRead.select({ value: count() }).from(auditLogs).where(sql`
        action = ${COLLECTION_RECORD_VERSION_CONFLICT_ACTION}
        AND timestamp >= NOW() - INTERVAL '24 hours'
      `),
      dbRead.select({ value: count() }).from(auditLogs).where(sql`
        action IN (${buildAuditActionList(LOGIN_FAILURE_ACTIONS)})
        AND timestamp >= NOW() - INTERVAL '24 hours'
      `),
      dbRead.select({ value: count() }).from(auditLogs).where(sql`
        action IN (${buildAuditActionList(BACKUP_ACTIVITY_ACTIONS)})
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
      loginFailures24h: loginFailures24h[0]?.value || 0,
      backupActions24h: backupActions24h[0]?.value || 0,
    };
  }

  async getLoginTrends(days = 7): Promise<Array<{ date: string; logins: number; logouts: number }>> {
    const result = await dbRead.execute(sql`
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
          (login_time AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
          COUNT(*)::int AS logins
        FROM public.user_activity
        WHERE login_time IS NOT NULL
        GROUP BY day
      ),
      logouts AS (
        SELECT
          (logout_time AT TIME ZONE ${ANALYTICS_TZ})::date AS day,
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
    const result = await dbRead.execute(sql`
      SELECT
        ua.username,
        ua.role,
        COUNT(*)::int AS "loginCount",
        COALESCE(
          GREATEST(
            MAX(u.last_login_at),
            MAX(ua.login_time)
          ),
          MAX(u.last_login_at),
          MAX(ua.login_time)
        ) AS "lastLogin"
      FROM public.user_activity ua
      LEFT JOIN public.users u
        ON u.id = ua.user_id
      GROUP BY ua.user_id, ua.username, ua.role
      ORDER BY "loginCount" DESC, "lastLogin" DESC NULLS LAST, ua.username ASC
      LIMIT ${limit}
    `);

    return (result.rows as TopActiveUserRow[]).map((row) => ({
      username: row.username,
      role: row.role,
      loginCount: row.loginCount,
      lastLogin: serializeAnalyticsTimestamp(row.lastLogin),
    }));
  }

  async getRecentLoginActivity(limit = 8): Promise<RecentLoginActivity[]> {
    const result = await dbRead.execute(sql`
      SELECT
        id,
        username,
        role,
        login_time AS "loginTime",
        last_activity_time AS "lastActivityTime",
        logout_time AS "logoutTime",
        is_active AS "isActive",
        browser,
        ip_address AS "ipAddress",
        logout_reason AS "logoutReason",
        'success'::text AS "eventType",
        CASE WHEN is_active IS TRUE THEN 'active' ELSE 'ended' END::text AS status
      FROM public.user_activity
      ORDER BY COALESCE(login_time, last_activity_time, logout_time) DESC NULLS LAST, username ASC
      LIMIT ${limit}
    `);

    return (result.rows as RecentLoginActivityRow[]).map((row) =>
      this.mapRecentLoginActivityRow(row));
  }

  async getRecentLoginActivityPage(
    options: RecentLoginActivityPageOptions,
  ): Promise<RecentLoginActivityPage> {
    const attentionPattern = "banned|blocked|expired|forced|idle|kicked|locked|revoked|timeout";
    const baseConditions: SQL[] = [];
    const normalizedSearch = options.search?.trim();

    if (normalizedSearch) {
      baseConditions.push(sql`(
        POSITION(lower(${normalizedSearch}) IN lower(username)) > 0
        OR POSITION(lower(${normalizedSearch}) IN lower(COALESCE(browser, ''))) > 0
        OR POSITION(lower(${normalizedSearch}) IN lower(COALESCE(platform, ''))) > 0
      )`);
    }
    if (options.role) {
      baseConditions.push(sql`lower(role) = lower(${options.role})`);
    }
    if (options.dateFrom) {
      baseConditions.push(sql`
        ("eventTime" AT TIME ZONE ${ANALYTICS_TZ})::date >= ${options.dateFrom}::date
      `);
    }
    if (options.dateTo) {
      baseConditions.push(sql`
        ("eventTime" AT TIME ZONE ${ANALYTICS_TZ})::date <= ${options.dateTo}::date
      `);
    }

    const baseWhereSql = baseConditions.length > 0
      ? sql`WHERE ${sql.join(baseConditions, sql` AND `)}`
      : sql``;
    const countResult = await dbRead.execute(sql`
      ${this.buildRecentLoginEventsCte()}
      SELECT
        COUNT(*)::int AS "allCount",
        COUNT(*) FILTER (WHERE status = 'active')::int AS "activeCount",
        COUNT(*) FILTER (WHERE status = 'ended')::int AS "endedCount",
        COUNT(*) FILTER (WHERE status = 'failed')::int AS "failedCount",
        COUNT(*) FILTER (
          WHERE status = 'failed'
            OR COALESCE("logoutReason", '') ~* ${attentionPattern}
        )::int AS "attentionCount"
      FROM login_events
      ${baseWhereSql}
    `);
    const countRow = countResult.rows?.[0] as Record<string, unknown> | undefined;
    const filterCounts: Record<RecentLoginActivityFilter, number> = {
      active: Number(countRow?.activeCount ?? 0),
      all: Number(countRow?.allCount ?? 0),
      attention: Number(countRow?.attentionCount ?? 0),
      ended: Number(countRow?.endedCount ?? 0),
      failed: Number(countRow?.failedCount ?? 0),
    };
    const totalItems = filterCounts[options.status];
    const totalPages = Math.max(1, Math.ceil(totalItems / options.pageSize));
    const page = Math.min(options.page, totalPages);
    const offset = (page - 1) * options.pageSize;
    const statusCondition = this.buildRecentLoginActivityStatusCondition(
      options.status,
      attentionPattern,
    );
    const rowConditions = statusCondition
      ? [...baseConditions, statusCondition]
      : baseConditions;
    const rowsWhereSql = rowConditions.length > 0
      ? sql`WHERE ${sql.join(rowConditions, sql` AND `)}`
      : sql``;
    const rowsResult = await dbRead.execute(sql`
      ${this.buildRecentLoginEventsCte()}
      SELECT
        id,
        username,
        role,
        "loginTime",
        "lastActivityTime",
        "logoutTime",
        "isActive",
        browser,
        "ipAddress",
        "logoutReason",
        "failureReason",
        platform,
        "userAgentSummary",
        "eventType",
        status
      FROM login_events
      ${rowsWhereSql}
      ${this.buildRecentLoginActivityOrderBy(options.sortBy, options.sortOrder)}
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `);

    return {
      activities: (rowsResult.rows as RecentLoginActivityRow[]).map((row) =>
        this.mapRecentLoginActivityRow(row, {
          includeExactIpAddress: options.includeExactIpAddress,
          includeInternalReason: options.includeInternalReason,
        })),
      filterCounts,
      pagination: {
        page,
        pageSize: options.pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  private buildRecentLoginActivityStatusCondition(
    status: RecentLoginActivityFilter,
    attentionPattern: string,
  ) {
    if (status === "active") {
      return sql`status = 'active'`;
    }
    if (status === "ended") {
      return sql`status = 'ended'`;
    }
    if (status === "failed") {
      return sql`status = 'failed'`;
    }
    if (status === "attention") {
      return sql`(status = 'failed' OR COALESCE("logoutReason", '') ~* ${attentionPattern})`;
    }
    return null;
  }

  async getPeakHours(): Promise<Array<{ hour: number; count: number }>> {
    const result = await dbRead.execute(sql`
      SELECT
        EXTRACT(HOUR FROM (login_time AT TIME ZONE ${ANALYTICS_TZ}))::int AS hour,
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
    const result = await dbRead.execute(sql`
      SELECT role, COUNT(*)::int AS count
      FROM public.users
      GROUP BY role
      ORDER BY role ASC
    `);

    return (result.rows || []) as Array<{ role: string; count: number }>;
  }
}
