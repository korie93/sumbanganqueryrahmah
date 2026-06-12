import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { InsertUserActivity, UserActivity } from "../../shared/schema-postgres";
import { auditLogs, collectionNicknameSessions, userActivity } from "../../shared/schema-postgres";
import { ACTIVITY_IDLE_STATUS_THRESHOLD_MINUTES } from "../activity/activity-session-policy";
import { db } from "../db-postgres";
import {
  ACTIVITY_QUERY_PAGE_LIMIT,
  type ActivityPageFilters,
  type ActivityPageParams,
  type ActivityPageResult,
  type ActivityPageSortBy,
  type ActivityPageSortOrder,
  type ActivityRetentionCleanupParams,
  type ActivityRetentionCleanupResult,
  type ActivityRetentionPreview,
  type ActivityRetentionPreviewParams,
  type ActivityStatusSummary,
  computeActivityStatus,
  type ActivityWithStatus,
} from "./activity-repository-shared";
import {
  buildCreateActivityValues,
  buildUpdateActivityValues,
  createCurrentTimestampSql,
} from "./activity-repository-timestamp-utils";

async function loadActivityPages(whereCondition?: SQL): Promise<UserActivity[]> {
  const activities: UserActivity[] = [];
  let offset = 0;

  while (true) {
    const chunk = await db
      .select()
      .from(userActivity)
      .where(whereCondition)
      .orderBy(desc(userActivity.loginTime))
      .limit(ACTIVITY_QUERY_PAGE_LIMIT)
      .offset(offset);

    if (!chunk.length) break;
    activities.push(...chunk);
    if (chunk.length < ACTIVITY_QUERY_PAGE_LIMIT) break;
    offset += chunk.length;
  }

  return activities;
}

export async function createActivity(data: InsertUserActivity): Promise<UserActivity> {
  const result = await db
    .insert(userActivity)
    .values(buildCreateActivityValues(data))
    .returning();

  return result[0];
}

export async function touchActivity(activityId: string): Promise<void> {
  await db
    .update(userActivity)
    .set({ lastActivityTime: createCurrentTimestampSql() })
    .where(eq(userActivity.id, activityId));
}

export async function touchAuthenticatedActivity(activityId: string): Promise<UserActivity | undefined> {
  const updatedRows = await db
    .update(userActivity)
    .set({ lastActivityTime: createCurrentTimestampSql() })
    .where(
      and(
        eq(userActivity.id, activityId),
        eq(userActivity.isActive, true),
        isNull(userActivity.logoutTime),
      ),
    )
    .returning();

  return updatedRows[0];
}

export async function getActiveActivitiesByUsername(username: string): Promise<UserActivity[]> {
  return loadActivityPages(and(eq(userActivity.username, username), eq(userActivity.isActive, true)));
}

export async function updateActivity(
  id: string,
  data: Partial<UserActivity>,
): Promise<UserActivity | undefined> {
  const updateData = buildUpdateActivityValues(data);

  if (Object.keys(updateData).length > 0) {
    await db
      .update(userActivity)
      .set(updateData as Partial<typeof userActivity.$inferInsert>)
      .where(eq(userActivity.id, id));
  }

  const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
  return result[0];
}

export async function expireIdleActivitySession(params: {
  activityId: string;
  idleCutoff: Date;
  idleMinutes: number;
}): Promise<UserActivity | undefined> {
  const logoutTime = new Date();
  let expiredActivity: UserActivity | undefined;

  await db.transaction(async (tx) => {
    const updatedRows = await tx
      .update(userActivity)
      .set({
        isActive: false,
        logoutTime: createCurrentTimestampSql(),
        logoutReason: "IDLE_TIMEOUT",
      })
      .where(
        and(
          eq(userActivity.id, params.activityId),
          eq(userActivity.isActive, true),
          lte(userActivity.lastActivityTime, params.idleCutoff),
        ),
      )
      .returning();

    expiredActivity = updatedRows[0];
    if (!expiredActivity) {
      return;
    }

    await tx
      .delete(collectionNicknameSessions)
      .where(eq(collectionNicknameSessions.activityId, params.activityId));

    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      action: "SESSION_IDLE_TIMEOUT",
      performedBy: expiredActivity.username,
      targetUser: null,
      targetResource: null,
      requestId: null,
      details: `Auto logout after ${params.idleMinutes} minutes idle`,
      timestamp: logoutTime,
    });
  });

  return expiredActivity;
}

export async function expireIdleActivitySessions(params: {
  idleCutoff: Date;
  idleMinutes: number;
}): Promise<UserActivity[]> {
  const logoutTime = new Date();
  let expiredActivities: UserActivity[] = [];

  await db.transaction(async (tx) => {
    const updatedRows = await tx
      .update(userActivity)
      .set({
        isActive: false,
        logoutTime: createCurrentTimestampSql(),
        logoutReason: "IDLE_TIMEOUT",
      })
      .where(
        and(
          eq(userActivity.isActive, true),
          lte(userActivity.lastActivityTime, params.idleCutoff),
        ),
      )
      .returning();

    expiredActivities = updatedRows;
    if (expiredActivities.length === 0) {
      return;
    }

    const expiredActivityIds = expiredActivities.map((activity) => activity.id);

    await tx
      .delete(collectionNicknameSessions)
      .where(inArray(collectionNicknameSessions.activityId, expiredActivityIds));

    await tx.insert(auditLogs).values(
      expiredActivities.map((activity) => ({
        id: crypto.randomUUID(),
        action: "SESSION_IDLE_TIMEOUT",
        performedBy: activity.username,
        targetUser: null,
        targetResource: null,
        requestId: null,
        details: `Auto logout after ${params.idleMinutes} minutes idle`,
        timestamp: logoutTime,
      })),
    );
  });

  return expiredActivities;
}

export async function getActivityById(id: string): Promise<UserActivity | undefined> {
  const result = await db.select().from(userActivity).where(eq(userActivity.id, id)).limit(1);
  return result[0];
}

export async function getActiveActivities(): Promise<UserActivity[]> {
  return loadActivityPages(eq(userActivity.isActive, true));
}

export async function getAllActivities(): Promise<ActivityWithStatus[]> {
  const activities = await loadActivityPages();
  return activities.map((activity) => ({
    ...activity,
    status: computeActivityStatus(activity),
  }));
}

function buildActivityStatusExpression(currentActivityId?: string): SQL<string> {
  const currentSessionClause = currentActivityId
    ? sql`WHEN ${userActivity.id} = ${currentActivityId} THEN 'ONLINE'`
    : sql``;

  return sql<string>`
    CASE
      WHEN ${userActivity.isActive} IS FALSE THEN
        CASE
          WHEN ${userActivity.logoutReason} = 'KICKED' THEN 'KICKED'
          WHEN ${userActivity.logoutReason} = 'BANNED' THEN 'BANNED'
          ELSE 'LOGOUT'
        END
      ${currentSessionClause}
      WHEN ${userActivity.lastActivityTime} IS NOT NULL
        AND ${userActivity.lastActivityTime}
          <= NOW() - (${ACTIVITY_IDLE_STATUS_THRESHOLD_MINUTES} * INTERVAL '1 minute')
        THEN 'IDLE'
      ELSE 'ONLINE'
    END
  `;
}

function buildActivityPageWhere(
  filters: ActivityPageFilters | undefined,
  statusExpression: SQL<string>,
): SQL | undefined {
  if (!filters) {
    return undefined;
  }

  const conditions: SQL[] = [];
  if (filters.username) conditions.push(eq(userActivity.username, filters.username));
  if (filters.ipAddress) conditions.push(eq(userActivity.ipAddress, filters.ipAddress));
  if (filters.browser) conditions.push(eq(userActivity.browser, filters.browser));
  if (filters.dateFrom) conditions.push(gte(userActivity.loginTime, filters.dateFrom));
  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(userActivity.loginTime, endOfDay));
  }
  if (filters.status?.length) {
    conditions.push(inArray(statusExpression, filters.status));
  }

  return conditions.length ? and(...conditions) : undefined;
}

function buildActivityPageOrder(
  sortBy: ActivityPageSortBy,
  sortOrder: ActivityPageSortOrder,
  statusExpression: SQL<string>,
): SQL[] {
  const direction = sortOrder === "asc" ? asc : desc;
  const loginTimeFallback = desc(userActivity.loginTime);
  const idFallback = asc(userActivity.id);

  if (sortBy === "username") {
    return [direction(userActivity.username), loginTimeFallback, idFallback];
  }
  if (sortBy === "status") {
    return [direction(statusExpression), loginTimeFallback, idFallback];
  }
  if (sortBy === "duration") {
    const durationExpression = sql<number>`
      EXTRACT(EPOCH FROM (
        COALESCE(${userActivity.logoutTime}, NOW()) - ${userActivity.loginTime}
      ))
    `;
    return [
      asc(sql`${durationExpression} IS NULL`),
      direction(durationExpression),
      loginTimeFallback,
      idFallback,
    ];
  }

  return [direction(userActivity.loginTime), idFallback];
}

function buildActivityStatusSummary(
  rows: Array<{ status: string; total: number }>,
): ActivityStatusSummary {
  const summary: ActivityStatusSummary = {
    idleCount: 0,
    kickedCount: 0,
    logoutCount: 0,
    onlineCount: 0,
  };

  for (const row of rows) {
    const total = Math.max(0, Number(row.total) || 0);
    if (row.status === "ONLINE") summary.onlineCount = total;
    if (row.status === "IDLE") summary.idleCount = total;
    if (row.status === "LOGOUT") summary.logoutCount = total;
    if (row.status === "KICKED") summary.kickedCount = total;
  }

  return summary;
}

export async function listActivityPage(params: ActivityPageParams): Promise<ActivityPageResult> {
  const pageSize = Math.max(1, Math.min(100, Math.trunc(params.pageSize)));
  const requestedPage = Math.max(1, Math.trunc(params.page));
  const statusExpression = buildActivityStatusExpression(params.currentActivityId);
  const whereCondition = buildActivityPageWhere(params.filters, statusExpression);
  const statusSource = db
    .select({
      status: statusExpression.as("status"),
    })
    .from(userActivity)
    .where(whereCondition)
    .as("activity_status_source");

  const statusRows = await db
    .select({
      status: statusSource.status,
      total: sql<number>`count(*)::integer`,
    })
    .from(statusSource)
    .groupBy(statusSource.status);

  const normalizedStatusRows = statusRows.map((row) => ({
    status: String(row.status),
    total: Number(row.total),
  }));
  const total = normalizedStatusRows.reduce((sum, row) => sum + row.total, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const orderBy = buildActivityPageOrder(params.sortBy, params.sortOrder, statusExpression);

  const rows = await db
    .select({
      activity: userActivity,
      status: statusExpression,
    })
    .from(userActivity)
    .where(whereCondition)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  return {
    activities: rows.map((row) => ({
      ...row.activity,
      status: String(row.status),
    })),
    page,
    pageSize,
    total,
    totalPages,
    summary: buildActivityStatusSummary(normalizedStatusRows),
  };
}

export async function deleteActivity(id: string): Promise<boolean> {
  const result = await db.execute(sql`
    DELETE FROM public.user_activity activity
    WHERE activity.id = ${id}
      AND NOT EXISTS (
        SELECT 1
        FROM public.banned_sessions ban
        WHERE ban.activity_id = activity.id
      )
    RETURNING activity.id
  `);
  return (result.rows?.length ?? 0) > 0;
}

export async function deleteEndedActivitiesBefore(params: {
  cutoff: Date;
  limit: number;
}): Promise<string[]> {
  const result = await db.execute(sql`
    WITH cleanup_candidates AS (
      SELECT id
      FROM public.user_activity
      WHERE is_active IS FALSE
        AND COALESCE(logout_reason, '') NOT IN ('BANNED', 'KICKED')
        AND COALESCE(logout_time, last_activity_time, login_time) < ${params.cutoff}
      ORDER BY COALESCE(logout_time, last_activity_time, login_time) ASC NULLS LAST, id ASC
      LIMIT ${params.limit}
    )
    DELETE FROM public.user_activity activity
    USING cleanup_candidates
    WHERE activity.id = cleanup_candidates.id
    RETURNING activity.id
  `);

  return ((result.rows ?? []) as Array<{ id?: unknown }>)
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
}

export async function getActivityRetentionPreview(
  params: ActivityRetentionPreviewParams,
): Promise<ActivityRetentionPreview> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE activity.is_active IS FALSE
          AND COALESCE(activity.logout_reason, '') NOT IN ('BANNED', 'KICKED')
          AND COALESCE(activity.logout_time, activity.last_activity_time, activity.login_time)
            < ${params.standardCutoff}
      )::integer AS standard_eligible_count,
      COUNT(*) FILTER (
        WHERE activity.is_active IS FALSE
          AND COALESCE(activity.logout_time, activity.last_activity_time, activity.login_time)
            < ${params.securityCutoff}
          AND (
            activity.logout_reason = 'KICKED'
            OR (
              activity.logout_reason = 'BANNED'
              AND NOT EXISTS (
                SELECT 1
                FROM public.banned_sessions ban
                WHERE ban.activity_id = activity.id
              )
            )
          )
      )::integer AS security_eligible_count,
      COUNT(*) FILTER (
        WHERE activity.is_active IS FALSE
          AND activity.logout_reason = 'BANNED'
          AND EXISTS (
            SELECT 1
            FROM public.banned_sessions ban
            WHERE ban.activity_id = activity.id
          )
      )::integer AS protected_active_ban_count
    FROM public.user_activity activity
  `);

  const row = (result.rows?.[0] ?? {}) as Record<string, unknown>;
  const standardEligibleCount = Math.max(0, Number(row.standard_eligible_count) || 0);
  const securityEligibleCount = Math.max(0, Number(row.security_eligible_count) || 0);

  return {
    protectedActiveBanCount: Math.max(0, Number(row.protected_active_ban_count) || 0),
    securityEligibleCount,
    standardEligibleCount,
    totalEligibleCount: standardEligibleCount + securityEligibleCount,
  };
}

export async function cleanupActivityRetention(
  params: ActivityRetentionCleanupParams,
): Promise<ActivityRetentionCleanupResult> {
  return db.transaction(async (tx) => {
    const lockResult = await tx.execute(sql`
      SELECT pg_try_advisory_xact_lock(
        hashtext('sqr_activity_retention_cleanup')
      ) AS acquired
    `);
    const lockAcquired = lockResult.rows?.[0]?.acquired === true;
    if (!lockAcquired) {
      return {
        deletedIds: [],
        lockAcquired: false,
        securityDeletedCount: 0,
        standardDeletedCount: 0,
      };
    }

    const result = await tx.execute(sql`
      WITH cleanup_candidates AS (
        SELECT
          activity.id,
          CASE
            WHEN activity.logout_reason IN ('BANNED', 'KICKED') THEN 'security'
            ELSE 'standard'
          END AS retention_class
        FROM public.user_activity activity
        WHERE activity.is_active IS FALSE
          AND (
            (
              COALESCE(activity.logout_reason, '') NOT IN ('BANNED', 'KICKED')
              AND COALESCE(activity.logout_time, activity.last_activity_time, activity.login_time)
                < ${params.standardCutoff}
            )
            OR (
              COALESCE(activity.logout_time, activity.last_activity_time, activity.login_time)
                < ${params.securityCutoff}
              AND (
                activity.logout_reason = 'KICKED'
                OR (
                  activity.logout_reason = 'BANNED'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM public.banned_sessions ban
                    WHERE ban.activity_id = activity.id
                  )
                )
              )
            )
          )
        ORDER BY
          COALESCE(activity.logout_time, activity.last_activity_time, activity.login_time)
            ASC NULLS LAST,
          activity.id ASC
        FOR UPDATE OF activity SKIP LOCKED
        LIMIT ${params.limit}
      ),
      deleted AS (
        DELETE FROM public.user_activity activity
        USING cleanup_candidates candidate
        WHERE activity.id = candidate.id
        RETURNING activity.id, candidate.retention_class
      )
      SELECT id, retention_class
      FROM deleted
    `);

    const rows = (result.rows ?? []) as Array<{
      id?: unknown;
      retention_class?: unknown;
    }>;
    const deletedIds: string[] = [];
    let securityDeletedCount = 0;
    let standardDeletedCount = 0;

    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      deletedIds.push(id);
      if (row.retention_class === "security") {
        securityDeletedCount += 1;
      } else {
        standardDeletedCount += 1;
      }
    }

    return {
      deletedIds,
      lockAcquired: true,
      securityDeletedCount,
      standardDeletedCount,
    };
  });
}

export async function getFilteredActivities(filters: {
  status?: string[] | undefined;
  username?: string | undefined;
  ipAddress?: string | undefined;
  browser?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
}): Promise<ActivityWithStatus[]> {
  const whereConditions: SQL[] = [];

  if (filters.username) whereConditions.push(eq(userActivity.username, filters.username));
  if (filters.ipAddress) whereConditions.push(eq(userActivity.ipAddress, filters.ipAddress));
  if (filters.browser) whereConditions.push(eq(userActivity.browser, filters.browser));
  if (filters.dateFrom) whereConditions.push(gte(userActivity.loginTime, filters.dateFrom));
  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    whereConditions.push(lte(userActivity.loginTime, endOfDay));
  }

  const activities = await loadActivityPages(whereConditions.length ? and(...whereConditions) : undefined);
  const enriched = activities.map((activity) => ({
    ...activity,
    status: computeActivityStatus(activity),
  }));

  if (filters.status?.length) {
    return enriched.filter((activity) => filters.status!.includes(activity.status));
  }

  return enriched;
}

export async function deactivateUserActivities(username: string, reason?: string): Promise<void> {
  const updateData: Record<string, unknown> = {
    isActive: false,
    logoutTime: createCurrentTimestampSql(),
  };

  if (reason) {
    updateData.logoutReason = reason;
  }

  await db
    .update(userActivity)
    .set(updateData as Partial<typeof userActivity.$inferInsert>)
    .where(and(eq(userActivity.isActive, true), eq(userActivity.username, username)));
}

export async function deactivateUserSessionsByFingerprint(
  username: string,
  fingerprint: string,
): Promise<void> {
  await db
    .update(userActivity)
    .set({
      isActive: false,
      logoutTime: createCurrentTimestampSql(),
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
