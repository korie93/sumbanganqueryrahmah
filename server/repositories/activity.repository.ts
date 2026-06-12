import type { InsertUserActivity, UserActivity } from "../../shared/schema-postgres";
import {
  banVisitor,
  getBannedSessions,
  getBannedUsers,
  isVisitorBanned,
  unbanVisitor,
} from "./activity-repository-ban-operations";
import { getAuthenticatedSessionSnapshot } from "./activity-repository-auth-guard-operations";
import { getActivityInvestigation } from "./activity-repository-investigation-operations";
import {
  createActivity,
  cleanupActivityRetention,
  deactivateUserActivities,
  deactivateUserSessionsByFingerprint,
  deleteActivity,
  deleteEndedActivitiesBefore,
  expireIdleActivitySession,
  expireIdleActivitySessions,
  getActiveActivities,
  getActiveActivitiesByUsername,
  getActivityRetentionPreview,
  getActivityById,
  getAllActivities,
  getFilteredActivities,
  listActivityPage,
  touchActivity,
  touchAuthenticatedActivity,
  updateActivity,
} from "./activity-repository-session-operations";
import type {
  ActivityPageFilters,
  ActivityInvestigationAuditEvent,
  ActivityInvestigationRecord,
  ActivityPageParams,
  ActivityPageResult,
  ActivityPageSortBy,
  ActivityPageSortOrder,
  ActivityRetentionCleanupParams,
  ActivityRetentionCleanupResult,
  ActivityRetentionPolicy,
  ActivityRetentionPreview,
  ActivityRetentionPreviewParams,
  ActivityRepositoryOptions,
  ActivityStatusSummary,
  ActivityWithStatus,
  AuthenticatedSessionSnapshot,
  BannedUserWithInfo,
} from "./activity-repository-shared";

export class ActivityRepository {
  constructor(private readonly options: ActivityRepositoryOptions) {}

  readonly createActivity = createActivity;
  readonly cleanupActivityRetention = cleanupActivityRetention;
  readonly touchActivity = touchActivity;
  readonly touchAuthenticatedActivity = touchAuthenticatedActivity;
  readonly getActiveActivitiesByUsername = getActiveActivitiesByUsername;
  readonly getActivityRetentionPreview = getActivityRetentionPreview;
  readonly updateActivity = updateActivity;
  readonly expireIdleActivitySession = expireIdleActivitySession;
  readonly expireIdleActivitySessions = expireIdleActivitySessions;
  readonly getActivityById = getActivityById;
  readonly getActiveActivities = getActiveActivities;
  readonly getAllActivities = getAllActivities;
  readonly deleteActivity = deleteActivity;
  readonly deleteEndedActivitiesBefore = deleteEndedActivitiesBefore;
  readonly getFilteredActivities = getFilteredActivities;
  readonly listActivityPage = listActivityPage;
  readonly deactivateUserActivities = deactivateUserActivities;
  readonly deactivateUserSessionsByFingerprint = deactivateUserSessionsByFingerprint;
  readonly getBannedUsers = getBannedUsers;

  async getAuthenticatedSessionSnapshot(activityId: string): Promise<AuthenticatedSessionSnapshot | undefined> {
    return getAuthenticatedSessionSnapshot(this.options, activityId);
  }

  async getActivityInvestigation(activityId: string): Promise<ActivityInvestigationRecord | undefined> {
    return getActivityInvestigation(this.options, activityId);
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
  ActivityInvestigationAuditEvent,
  ActivityInvestigationRecord,
  ActivityPageFilters,
  ActivityPageParams,
  ActivityPageResult,
  ActivityPageSortBy,
  ActivityPageSortOrder,
  ActivityRetentionCleanupParams,
  ActivityRetentionCleanupResult,
  ActivityRetentionPolicy,
  ActivityRetentionPreview,
  ActivityRetentionPreviewParams,
  ActivityStatusSummary,
  ActivityWithStatus,
  AuthenticatedSessionSnapshot,
  BannedUserWithInfo,
  InsertUserActivity,
  UserActivity,
};
