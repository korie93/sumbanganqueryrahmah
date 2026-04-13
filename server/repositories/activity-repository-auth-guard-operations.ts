import { eq, sql } from "drizzle-orm";
import { bannedSessions, userActivity, users } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import type {
  ActivityRepositoryOptions,
  AuthenticatedSessionSnapshot,
} from "./activity-repository-shared";

export async function getAuthenticatedSessionSnapshot(
  options: ActivityRepositoryOptions,
  activityId: string,
): Promise<AuthenticatedSessionSnapshot | undefined> {
  await options.ensureBannedSessionsTable();

  const result = await db
    .select({
      activity: userActivity,
      user: users,
      isVisitorBanned: sql<boolean>`exists(
        select 1
        from ${bannedSessions}
        where lower(${bannedSessions.username}) = lower(${userActivity.username})
          and (
            (${userActivity.fingerprint} is not null and ${bannedSessions.fingerprint} = ${userActivity.fingerprint})
            or (${userActivity.ipAddress} is not null and ${bannedSessions.ipAddress} = ${userActivity.ipAddress})
          )
      )`,
    })
    .from(userActivity)
    .leftJoin(users, eq(users.id, userActivity.userId))
    .where(eq(userActivity.id, activityId))
    .limit(1);

  const row = result[0];
  if (!row) {
    return undefined;
  }

  return {
    activity: row.activity,
    user: row.user ?? undefined,
    isVisitorBanned: row.isVisitorBanned === true,
  };
}
