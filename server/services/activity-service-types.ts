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
  | "deactivateUserActivities"
  | "deleteActivity"
  | "deleteEndedActivitiesBefore"
  | "getActiveActivities"
  | "getActiveActivitiesByUsername"
  | "getActivityById"
  | "getAllActivities"
  | "listActivityPage"
  | "getBannedSessions"
  | "getFilteredActivities"
  | "getUserByUsername"
  | "unbanVisitor"
  | "updateActivity"
  | "updateUserBan"
>;

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
