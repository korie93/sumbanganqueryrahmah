import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { InsertUserActivity, UserActivity } from "../../shared/schema-postgres";
import { auditLogs, collectionNicknameSessions, userActivity } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  ACTIVITY_QUERY_PAGE_LIMIT,
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

export async function deleteActivity(id: string): Promise<boolean> {
  await db.delete(userActivity).where(eq(userActivity.id, id));
  return true;
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
