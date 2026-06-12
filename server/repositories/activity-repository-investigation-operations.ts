import { desc, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  bannedSessions,
  userActivity,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  computeActivityStatus,
  type ActivityInvestigationRecord,
  type ActivityRepositoryOptions,
} from "./activity-repository-shared";

const ACTIVITY_INVESTIGATION_AUDIT_LIMIT = 20;

export async function getActivityInvestigation(
  options: ActivityRepositoryOptions,
  activityId: string,
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

  const banRows = await db
    .select({
      banId: bannedSessions.id,
      bannedAt: bannedSessions.bannedAt,
    })
    .from(bannedSessions)
    .where(eq(bannedSessions.activityId, activityId))
    .orderBy(desc(bannedSessions.bannedAt))
    .limit(1);

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
  };
}
