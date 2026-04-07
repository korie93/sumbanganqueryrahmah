import type { InsertUserActivity, UserActivity } from "../../shared/schema-postgres";
import {
  banVisitor,
  getBannedSessions,
  getBannedUsers,
  isVisitorBanned,
  unbanVisitor,
} from "./activity-repository-ban-operations";
import {
  createActivity,
  deactivateUserActivities,
  deactivateUserSessionsByFingerprint,
  deleteActivity,
  expireIdleActivitySession,
  getActiveActivities,
  getActiveActivitiesByUsername,
  getActivityById,
  getAllActivities,
  getFilteredActivities,
  touchActivity,
  updateActivity,
} from "./activity-repository-session-operations";
import type {
  ActivityRepositoryOptions,
  ActivityWithStatus,
  BannedUserWithInfo,
} from "./activity-repository-shared";

export class ActivityRepository {
  constructor(private readonly options: ActivityRepositoryOptions) {}

  readonly createActivity = createActivity;
  readonly touchActivity = touchActivity;
  readonly getActiveActivitiesByUsername = getActiveActivitiesByUsername;
  readonly updateActivity = updateActivity;
  readonly expireIdleActivitySession = expireIdleActivitySession;
  readonly getActivityById = getActivityById;
  readonly getActiveActivities = getActiveActivities;
  readonly getAllActivities = getAllActivities;
  readonly deleteActivity = deleteActivity;
  readonly getFilteredActivities = getFilteredActivities;
  readonly deactivateUserActivities = deactivateUserActivities;
  readonly deactivateUserSessionsByFingerprint = deactivateUserSessionsByFingerprint;
  readonly getBannedUsers = getBannedUsers;

  async isVisitorBanned(
    fingerprint?: string | null,
    ipAddress?: string | null,
    username?: string | null,
  ): Promise<boolean> {
    return isVisitorBanned(this.options, fingerprint, ipAddress, username);
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
    await banVisitor(this.options, params);
  }

  async unbanVisitor(banId: string): Promise<void> {
    await unbanVisitor(this.options, banId);
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
    return getBannedSessions(this.options);
  }
}

export type { ActivityRepositoryOptions, ActivityWithStatus, BannedUserWithInfo, InsertUserActivity, UserActivity };
