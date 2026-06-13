import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  auditLogs,
  bannedSessions,
  userActivity,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  computeActivityStatus,
  type ActivityInvestigationRecord,
  type ActivityInvestigationRelatedSessionsPageParams,
  type ActivityRepositoryOptions,
} from "./activity-repository-shared";

const ACTIVITY_INVESTIGATION_AUDIT_LIMIT = 20;

async function countActivityRows(condition: SQL): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(userActivity)
    .where(condition);
  return Number(rows[0]?.count ?? 0);
}

async function countDistinctActivityAccounts(condition: SQL): Promise<number> {
  const rows = await db
    .select({ count: countDistinct(userActivity.userId) })
    .from(userActivity)
    .where(condition);
  return Number(rows[0]?.count ?? 0);
}

export async function getActivityInvestigation(
  options: ActivityRepositoryOptions,
  activityId: string,
  relatedPage: ActivityInvestigationRelatedSessionsPageParams,
): Promise<ActivityInvestigationRecord | undefined> {
  await options.ensureBannedSessionsTable();

  const activityRows = await db
    .select()
    .from(userActivity)
    .where(eq(userActivity.id, activityId))
    .limit(1);
  const activity = activityRows[0];
  if (!activity) {
    return undefined;
  }

  const ipAddress = String(activity.ipAddress || "").trim();
  const fingerprint = String(activity.fingerprint || "").trim();
  const relatedConditions: SQL[] = [eq(userActivity.userId, activity.userId)];
  if (ipAddress) {
    relatedConditions.push(eq(userActivity.ipAddress, ipAddress));
  }
  if (fingerprint) {
    relatedConditions.push(eq(userActivity.fingerprint, fingerprint));
  }
  const relatedSessionCondition = and(
    ne(userActivity.id, activityId),
    or(...relatedConditions),
  );
  if (!relatedSessionCondition) {
    throw new Error("Activity investigation related session condition could not be created");
  }
  const relatedSessionsTotal = await countActivityRows(relatedSessionCondition);
  const relatedSessionsTotalPages = Math.max(
    1,
    Math.ceil(relatedSessionsTotal / relatedPage.pageSize),
  );
  const relatedSessionsPage = Math.min(relatedPage.page, relatedSessionsTotalPages);
  const relatedSessionsOffset = (relatedSessionsPage - 1) * relatedPage.pageSize;

  const previousSessionCondition = activity.loginTime
    ? and(
        eq(userActivity.userId, activity.userId),
        ne(userActivity.id, activityId),
        lt(userActivity.loginTime, activity.loginTime),
      )
    : and(
        eq(userActivity.userId, activity.userId),
        ne(userActivity.id, activityId),
      );
  if (!previousSessionCondition) {
    throw new Error("Activity investigation history condition could not be created");
  }

  const [
    banRows,
    relatedRows,
    priorSessionCount,
    priorMatchingIpCount,
    priorMatchingFingerprintCount,
    activeConcurrentSessionCount,
    sharedIpAccountCount,
    sharedFingerprintAccountCount,
  ] = await Promise.all([
    db
      .select({
        banId: bannedSessions.id,
        bannedAt: bannedSessions.bannedAt,
      })
      .from(bannedSessions)
      .where(eq(bannedSessions.activityId, activityId))
      .orderBy(desc(bannedSessions.bannedAt))
      .limit(1),
    db
      .select()
      .from(userActivity)
      .where(relatedSessionCondition)
      .orderBy(desc(userActivity.loginTime))
      .limit(relatedPage.pageSize)
      .offset(relatedSessionsOffset),
    countActivityRows(previousSessionCondition),
    ipAddress
      ? countActivityRows(and(previousSessionCondition, eq(userActivity.ipAddress, ipAddress))!)
      : Promise.resolve(0),
    fingerprint
      ? countActivityRows(
          and(previousSessionCondition, eq(userActivity.fingerprint, fingerprint))!,
        )
      : Promise.resolve(0),
    countActivityRows(
      and(
        eq(userActivity.userId, activity.userId),
        ne(userActivity.id, activityId),
        eq(userActivity.isActive, true),
      )!,
    ),
    ipAddress
      ? countDistinctActivityAccounts(
          and(
            eq(userActivity.ipAddress, ipAddress),
            ne(userActivity.userId, activity.userId),
          )!,
        )
      : Promise.resolve(0),
    fingerprint
      ? countDistinctActivityAccounts(
          and(
            eq(userActivity.fingerprint, fingerprint),
            ne(userActivity.userId, activity.userId),
          )!,
        )
      : Promise.resolve(0),
  ]);

  const targetResource = `activity:${activityId}`;
  let auditEventRows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      performedBy: auditLogs.performedBy,
      requestId: auditLogs.requestId,
      timestamp: auditLogs.timestamp,
    })
    .from(auditLogs)
    .where(eq(auditLogs.targetResource, targetResource))
    .orderBy(desc(auditLogs.timestamp))
    .limit(ACTIVITY_INVESTIGATION_AUDIT_LIMIT);

  if (auditEventRows.length === 0) {
    const legacyActivityMarker = `activityId=${activityId}`;
    auditEventRows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        performedBy: auditLogs.performedBy,
        requestId: auditLogs.requestId,
        timestamp: auditLogs.timestamp,
      })
      .from(auditLogs)
      .where(
        sql<boolean>`position(${legacyActivityMarker} in coalesce(${auditLogs.details}, '')) > 0`,
      )
      .orderBy(desc(auditLogs.timestamp))
      .limit(ACTIVITY_INVESTIGATION_AUDIT_LIMIT);
  }

  const activeBan = banRows[0];
  return {
    activity: {
      ...activity,
      status: computeActivityStatus(activity),
    },
    activeBan: activeBan
      ? {
          banId: activeBan.banId,
          bannedAt: activeBan.bannedAt,
        }
      : null,
    auditEvents: auditEventRows,
    history: {
      activeConcurrentSessionCount,
      priorMatchingFingerprintCount,
      priorMatchingIpCount,
      priorSessionCount,
      sharedFingerprintAccountCount,
      sharedIpAccountCount,
    },
    relatedSessions: relatedRows.map((relatedActivity) => ({
      ...relatedActivity,
      status: computeActivityStatus(relatedActivity),
    })),
    relatedSessionsPagination: {
      page: relatedSessionsPage,
      pageSize: relatedPage.pageSize,
      total: relatedSessionsTotal,
      totalPages: relatedSessionsTotalPages,
    },
  };
}
