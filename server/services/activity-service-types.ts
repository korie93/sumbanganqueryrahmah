import type { WebSocket } from "ws";
import type { PostgresStorage } from "../storage-postgres";
import type {
  ActivityPageSortBy,
  ActivityPageSortOrder,
} from "../repositories/activity.repository";

export type ActivityFilters = {
  status?: string[] | undefined;
  username?: string | undefined;
  ipAddress?: string | undefined;
  browser?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
};

export type ActivityPageOptions = {
  page: number;
  pageSize: number;
  sortBy: ActivityPageSortBy;
  sortOrder: ActivityPageSortOrder;
};

export type ActivityStorage = Pick<
  PostgresStorage,
  | "banVisitor"
  | "clearCollectionNicknameSessionByActivity"
  | "createAuditLog"
  | "cleanupActivityRetention"
  | "deactivateUserActivities"
  | "deleteActivity"
  | "deleteEndedActivitiesBefore"
  | "getActiveActivities"
  | "getActiveActivitiesByUsername"
  | "getActivityById"
  | "getActivityInvestigation"
  | "getActivityRetentionPolicy"
  | "getActivityRetentionPreview"
  | "getAllActivities"
  | "listActivityPage"
  | "getBannedSessions"
  | "getFilteredActivities"
  | "getUserByUsername"
  | "unbanVisitor"
  | "updateActivity"
  | "updateUserBan"
>;

export type ActivityRetentionCleanupSource = "automatic" | "manual";

export type ActivityRetentionStatus = {
  policy: {
    autoCleanupEnabled: boolean;
    batchSize: number;
    securityRetentionDays: number;
    standardRetentionDays: number;
  };
  preview: {
    protectedActiveBanCount: number;
    securityEligibleCount: number;
    standardEligibleCount: number;
    totalEligibleCount: number;
  };
  securityCutoff: string;
  standardCutoff: string;
};

export type ActivityClientRegistry = Map<string, WebSocket>;

export type KickActivityResult = {
  status: "ok" | "not_found";
};

export type BanActivityResult = {
  status: "ok" | "not_found" | "cannot_ban_superuser";
};

export type BanAccountResult = {
  status: "ok" | "not_found" | "cannot_ban_superuser";
};
