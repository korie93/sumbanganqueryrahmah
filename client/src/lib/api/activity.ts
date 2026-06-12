import { apiRequest } from "../api-client";

type ActivityRequestOptions = {
  signal?: AbortSignal | undefined;
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

export async function activityHeartbeatLight(options?: ActivityRequestOptions) {
  return apiRequest("POST", "/api/activity/heartbeat", {}, {
    signal: options?.signal,
  });
}

export async function getAllActivity(options?: ActivityRequestOptions) {
  const response = await apiRequest("GET", "/api/activity/all", undefined, options);
  return response.json();
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
  return response.json();
}

export async function deleteActivityLog(activityId: string) {
  const response = await apiRequest("DELETE", `/api/activity/${activityId}`);
  return response.json();
}

export async function deleteActivityLogsBulk(activityIds: string[]) {
  const response = await apiRequest("DELETE", "/api/activity/logs/bulk-delete", {
    activityIds,
  });
  return response.json() as Promise<{
    success: boolean;
    deletedCount: number;
    requestedCount: number;
    notFoundIds: string[];
  }>;
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
  return response.json() as Promise<ActivityPageResponse>;
}

export async function cleanupEndedActivityLogs(options?: {
  limit?: number | undefined;
  olderThanDays?: number | undefined;
}) {
  const response = await apiRequest("DELETE", "/api/activity/logs/cleanup-ended", {
    limit: options?.limit,
    olderThanDays: options?.olderThanDays,
  });
  return response.json() as Promise<{
    cutoff: string;
    deletedCount: number;
    limit: number;
    ok: boolean;
    olderThanDays: number;
    success: boolean;
  }>;
}

export async function kickUser(activityId: string) {
  const response = await apiRequest("POST", "/api/activity/kick", { activityId });
  return response.json();
}

export async function banUser(activityId: string) {
  const response = await apiRequest("POST", "/api/activity/ban", { activityId });
  return response.json();
}

export async function unbanUser(banId: string) {
  const response = await apiRequest("POST", "/api/admin/unban", {
    banId,
  });
  return response.json();
}

export async function getBannedUsers(options?: ActivityRequestOptions) {
  const response = await apiRequest("GET", "/api/users/banned", undefined, options);
  return response.json();
}
