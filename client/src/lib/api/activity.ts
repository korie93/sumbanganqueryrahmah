import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";
import {
  activityBannedUsersResponseSchema,
  activityBulkDeleteResponseSchema,
  activityCleanupResponseSchema,
  activityInvestigationResponseSchema,
  activityListResponseSchema,
  activityMutationSuccessResponseSchema,
  activityPageResponseSchema,
  activityRetentionResponseSchema,
  type ActivityInvestigationContract,
  type ActivityRetentionStatusContract,
} from "@shared/api-contracts";

type ActivityRequestOptions = {
  signal?: AbortSignal | undefined;
};

type ActivityInvestigationRequestOptions = ActivityRequestOptions & {
  relatedPage?: number | undefined;
  relatedPageSize?: number | undefined;
};

export type ActivityLoginPayload = {
  username: string;
  role: string;
  pcName?: string | undefined;
  browser?: string | undefined;
  fingerprint?: string | undefined;
};

export interface ActivityFilters {
  status?: string[] | undefined;
  username?: string | undefined;
  ipAddress?: string | undefined;
  browser?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export async function activityLogin(data: ActivityLoginPayload) {
  const response = await apiRequest("POST", "/api/activity/login", data);
  return response.json();
}

export async function activityLogout(activityId?: string) {
  const payload = activityId ? { activityId } : {};
  const response = await apiRequest("POST", "/api/activity/logout", payload);
  return response.json();
}

export async function activityHeartbeat(payload?: {
  activityId?: string | undefined;
  pcName?: string | undefined;
  browser?: string | undefined;
  fingerprint?: string | undefined;
}, options?: ActivityRequestOptions) {
  return apiRequest("POST", "/api/activity/heartbeat", payload || {}, {
    signal: options?.signal,
  });
}

export type ActivityStatus = "ONLINE" | "IDLE" | "LOGOUT" | "KICKED" | "BANNED";
export type ActivitySortBy = "duration" | "loginTime" | "status" | "username";
export type ActivitySortOrder = "asc" | "desc";

export interface ActivityApiRecord {
  id: string;
  username: string;
  role: string;
  status: ActivityStatus;
  pcName?: string | undefined;
  browser?: string | undefined;
  deviceType?: "desktop" | "mobile" | "tablet" | "unknown" | undefined;
  platform?: string | undefined;
  fingerprint?: string | undefined;
  ipAddress?: string | undefined;
  loginTime: string;
  logoutTime?: string | undefined;
  lastActivityTime?: string | undefined;
  isActive: boolean;
  logoutReason?: string | undefined;
}

export interface ActivityPageQuery extends ActivityFilters {
  page: number;
  pageSize: number;
  sortBy: ActivitySortBy;
  sortOrder: ActivitySortOrder;
}

export interface ActivityPageResponse {
  activities: ActivityApiRecord[];
  summary: {
    idleCount: number;
    kickedCount: number;
    logoutCount: number;
    onlineCount: number;
  };
  pagination: {
    mode: "offset";
    page: number;
    pageSize: number;
    limit: number;
    offset: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export type ActivityInvestigation = ActivityInvestigationContract;

export type ActivityRetentionStatus = ActivityRetentionStatusContract;

export async function activityHeartbeatLight(options?: ActivityRequestOptions) {
  return apiRequest("POST", "/api/activity/heartbeat", {}, {
    signal: options?.signal,
  });
}

export async function getAllActivity(options?: ActivityRequestOptions) {
  const response = await apiRequest("GET", "/api/activity/all", undefined, options);
  return parseApiJson(response, activityListResponseSchema, "/api/activity/all");
}

export async function getFilteredActivity(filters: ActivityFilters, options?: ActivityRequestOptions) {
  const params = new URLSearchParams();
  if (filters.status && filters.status.length > 0) {
    params.set("status", filters.status.join(","));
  }
  if (filters.username) params.set("username", filters.username);
  if (filters.ipAddress) params.set("ipAddress", filters.ipAddress);
  if (filters.browser) params.set("browser", filters.browser);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const queryString = params.toString();
  const url = queryString ? `/api/activity/filter?${queryString}` : "/api/activity/filter";
  const response = await apiRequest("GET", url, undefined, options);
  return parseApiJson(response, activityListResponseSchema, "/api/activity/filter");
}

export async function deleteActivityLog(activityId: string) {
  const response = await apiRequest("DELETE", `/api/activity/${encodeURIComponent(activityId)}`);
  return parseApiJson(response, activityMutationSuccessResponseSchema, "/api/activity/:id");
}

export async function deleteActivityLogsBulk(activityIds: string[]) {
  const response = await apiRequest("DELETE", "/api/activity/logs/bulk-delete", {
    activityIds,
  });
  return parseApiJson(
    response,
    activityBulkDeleteResponseSchema,
    "/api/activity/logs/bulk-delete",
  );
}

export async function getActivityPage(
  query: ActivityPageQuery,
  options?: ActivityRequestOptions,
): Promise<ActivityPageResponse> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  if (query.status && query.status.length > 0) {
    params.set("status", query.status.join(","));
  }
  if (query.username) params.set("username", query.username);
  if (query.ipAddress) params.set("ipAddress", query.ipAddress);
  if (query.browser) params.set("browser", query.browser);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);

  const response = await apiRequest(
    "GET",
    `/api/activity/page?${params.toString()}`,
    undefined,
    options,
  );
  return parseApiJson(response, activityPageResponseSchema, "/api/activity/page");
}

export async function getActivityInvestigation(
  activityId: string,
  options?: ActivityInvestigationRequestOptions,
): Promise<ActivityInvestigation> {
  const params = new URLSearchParams({
    relatedPage: String(options?.relatedPage ?? 1),
    relatedPageSize: String(options?.relatedPageSize ?? 5),
  });
  const response = await apiRequest(
    "GET",
    `/api/activity/${encodeURIComponent(activityId)}/investigation?${params.toString()}`,
    undefined,
    { signal: options?.signal },
  );
  const payload = await parseApiJson(
    response,
    activityInvestigationResponseSchema,
    "/api/activity/:id/investigation",
  );
  return payload.investigation;
}

export async function cleanupEndedActivityLogs(options?: {
  limit?: number | undefined;
  olderThanDays?: number | undefined;
}, requestOptions?: ActivityRequestOptions) {
  const response = await apiRequest("DELETE", "/api/activity/logs/cleanup-ended", {
    limit: options?.limit,
    olderThanDays: options?.olderThanDays,
  }, {
    signal: requestOptions?.signal,
  });
  return parseApiJson(
    response,
    activityCleanupResponseSchema,
    "/api/activity/logs/cleanup-ended",
  );
}

export async function getActivityRetentionStatus(
  options?: ActivityRequestOptions,
): Promise<ActivityRetentionStatus> {
  const response = await apiRequest(
    "GET",
    "/api/activity/retention",
    undefined,
    options,
  );
  const payload = await parseApiJson(
    response,
    activityRetentionResponseSchema,
    "/api/activity/retention",
  );
  return payload.retention;
}

export async function kickUser(activityId: string) {
  const response = await apiRequest("POST", "/api/activity/kick", { activityId });
  return parseApiJson(response, activityMutationSuccessResponseSchema, "/api/activity/kick");
}

export async function banUser(activityId: string) {
  const response = await apiRequest("POST", "/api/activity/ban", { activityId });
  return parseApiJson(response, activityMutationSuccessResponseSchema, "/api/activity/ban");
}

export async function unbanUser(banId: string) {
  const response = await apiRequest("POST", "/api/admin/unban", {
    banId,
  });
  return parseApiJson(response, activityMutationSuccessResponseSchema, "/api/admin/unban");
}

export async function getBannedUsers(options?: ActivityRequestOptions) {
  const response = await apiRequest("GET", "/api/users/banned", undefined, options);
  return parseApiJson(response, activityBannedUsersResponseSchema, "/api/users/banned");
}
