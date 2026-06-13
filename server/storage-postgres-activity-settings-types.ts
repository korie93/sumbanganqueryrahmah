import type { User, UserActivity, InsertUserActivity } from "../shared/schema-postgres";
import type {
  ActivityPageParams,
  ActivityPageResult,
  ActivityInvestigationRecord,
  ActivityInvestigationRelatedSessionsPageParams,
  ActivityRetentionCleanupParams,
  ActivityRetentionCleanupResult,
  ActivityRetentionPolicy,
  ActivityRetentionPreview,
  ActivityRetentionPreviewParams,
} from "./repositories/activity.repository";
import type {
  MaintenanceState,
  SystemSettingCategory,
  SystemSettingItem,
} from "./config/system-settings";

export interface ActivitySettingsStorageContract {
  createActivity(data: InsertUserActivity): Promise<UserActivity>;
  getActiveActivitiesByUsername(username: string): Promise<UserActivity[]>;
  touchAuthenticatedActivity(activityId: string): Promise<UserActivity | undefined>;
  updateActivity(
    id: string,
    data: Partial<UserActivity>,
  ): Promise<UserActivity | undefined>;
  expireIdleActivitySession(params: {
    activityId: string;
    idleCutoff: Date;
    idleMinutes: number;
  }): Promise<UserActivity | undefined>;
  getActivityById(id: string): Promise<UserActivity | undefined>;
  getActivityInvestigation(
    id: string,
    relatedPage: ActivityInvestigationRelatedSessionsPageParams,
  ): Promise<ActivityInvestigationRecord | undefined>;
  getActiveActivities(): Promise<UserActivity[]>;
  getAllActivities(): Promise<UserActivity[]>;
  listActivityPage(params: ActivityPageParams): Promise<ActivityPageResult>;
  deleteActivity(id: string): Promise<boolean>;
  deleteEndedActivitiesBefore(params: {
    cutoff: Date;
    limit: number;
  }): Promise<string[]>;
  getActivityRetentionPreview(
    params: ActivityRetentionPreviewParams,
  ): Promise<ActivityRetentionPreview>;
  cleanupActivityRetention(
    params: ActivityRetentionCleanupParams,
  ): Promise<ActivityRetentionCleanupResult>;
  getFilteredActivities(filters: {
    status?: string[] | undefined;
    username?: string | undefined;
    ipAddress?: string | undefined;
    browser?: string | undefined;
    dateFrom?: Date | undefined;
    dateTo?: Date | undefined;
  }): Promise<UserActivity[]>;
  deactivateUserActivities(username: string, reason?: string): Promise<void>;
  deactivateUserSessionsByFingerprint(
    username: string,
    fingerprint: string,
  ): Promise<void>;
  getBannedUsers(): Promise<
    Array<
      User & {
        banInfo?:
          | {
              ipAddress: string | null;
              browser: string | null;
              bannedAt: Date | null;
            }
          | undefined;
      }
    >
  >;
  isVisitorBanned(
    fingerprint?: string | null,
    ipAddress?: string | null,
    username?: string | null,
  ): Promise<boolean>;
  banVisitor(params: {
    username: string;
    role: string;
    activityId: string;
    fingerprint?: string | null;
    ipAddress?: string | null;
    browser?: string | null;
    pcName?: string | null;
    deviceType?: string | null;
    platform?: string | null;
  }): Promise<void>;
  unbanVisitor(banId: string): Promise<void>;
  getBannedSessions(): Promise<
    Array<{
      banId: string;
      username: string;
      role: string;
      fingerprint: string | null;
      ipAddress: string | null;
      browser: string | null;
      bannedAt: Date | null;
    }>
  >;

  getSettingsForRole(role: string): Promise<SystemSettingCategory[]>;
  getBooleanSystemSetting(key: string, fallback?: boolean): Promise<boolean>;
  getRoleTabVisibility(role: string): Promise<Record<string, boolean>>;
  updateSystemSetting(params: {
    role: string;
    settingKey: string;
    value: string | number | boolean | null;
    confirmCritical?: boolean;
    updatedBy: string;
  }): Promise<{
    status:
      | "updated"
      | "unchanged"
      | "forbidden"
      | "not_found"
      | "requires_confirmation"
      | "invalid";
    message: string;
    setting?: SystemSettingItem;
    shouldBroadcast?: boolean;
  }>;
  getMaintenanceState(now?: Date): Promise<MaintenanceState>;
  getActivityRetentionPolicy(): Promise<ActivityRetentionPolicy>;
  getAppConfig(): Promise<{
    systemName: string;
    sessionTimeoutMinutes: number;
    heartbeatIntervalMinutes: number;
    wsIdleMinutes: number;
    aiEnabled: boolean;
    semanticSearchEnabled: boolean;
    aiTimeoutMs: number;
    searchResultLimit: number;
    viewerRowsPerPage: number;
  }>;
}
