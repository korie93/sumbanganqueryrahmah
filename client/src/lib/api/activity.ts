import { apiRequest, createApiHeaders } from "../api-client";
import { getCsrfHeader } from "./shared";

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
  return fetch("/api/activity/heartbeat", {
    method: "POST",
    headers: createApiHeaders({
      "Content-Type": "application/json",
      ...(getCsrfHeader() as Record<string, string>),
    }),
    credentials: "include",
    body: JSON.stringify(payload || {}),
    signal: options?.signal ?? null,
  });
}

export async function activityHeartbeatLight(options?: ActivityRequestOptions) {
  return fetch("/api/activity/heartbeat", {
    method: "POST",
    headers: createApiHeaders({
      ...(getCsrfHeader() as Record<string, string>),
    }),
    credentials: "include",
    signal: options?.signal ?? null,
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
