import type { InsertUserActivity, UserActivity } from "../../shared/schema-postgres";
import {
  banVisitor,
  getBannedSessions,
  getBannedUsers,
  isVisitorBanned,
  unbanVisitor,
} from "./activity-repository-ban-operations";
import { getAuthenticatedSessionSnapshot } from "./activity-repository-auth-guard-operations";
import {
  createActivity,
  deactivateUserActivities,
  deactivateUserSessionsByFingerprint,
  deleteActivity,
  expireIdleActivitySession,
  expireIdleActivitySessions,
  getActiveActivities,
  getActiveActivitiesByUsername,
  getActivityById,
  getActivitiesByIds,
  getAllActivities,
  getFilteredActivities,
  touchActivity,
  updateActivity,
} from "./activity-repository-session-operations";
import type {
  ActivityRepositoryOptions,
  ActivityWithStatus,
  AuthenticatedSessionSnapshot,
  BannedUserWithInfo,
} from "./activity-repository-shared";

export class ActivityRepository {
  constructor(private readonly options: ActivityRepositoryOptions) {}

  readonly createActivity = createActivity;
  readonly touchActivity = touchActivity;
  readonly getActiveActivitiesByUsername = getActiveActivitiesByUsername;
  readonly updateActivity = updateActivity;
  readonly expireIdleActivitySession = expireIdleActivitySession;
  readonly expireIdleActivitySessions = expireIdleActivitySessions;
  readonly getActivityById = getActivityById;
  readonly getActivitiesByIds = getActivitiesByIds;
  readonly getActiveActivities = getActiveActivities;
  readonly getAllActivities = getAllActivities;
  readonly deleteActivity = deleteActivity;
  readonly getFilteredActivities = getFilteredActivities;
  readonly deactivateUserActivities = deactivateUserActivities;
  readonly deactivateUserSessionsByFingerprint = deactivateUserSessionsByFingerprint;
  readonly getBannedUsers = getBannedUsers;

  async getAuthenticatedSessionSnapshot(activityId: string): Promise<AuthenticatedSessionSnapshot | undefined> {
    return getAuthenticatedSessionSnapshot(this.options, activityId);
  }

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

export type {
  ActivityRepositoryOptions,
  ActivityWithStatus,
  AuthenticatedSessionSnapshot,
  BannedUserWithInfo,
  InsertUserActivity,
  UserActivity,
};
