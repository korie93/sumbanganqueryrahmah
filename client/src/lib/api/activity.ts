import { apiRequest } from "../queryClient";
import { getCsrfHeader } from "./shared";

export type ActivityLoginPayload = {
  username: string;
  role: string;
  pcName?: string;
  browser?: string;
  fingerprint?: string;
};

export interface ActivityFilters {
  status?: string[];
  username?: string;
  ipAddress?: string;
  browser?: string;
  dateFrom?: string;
  dateTo?: string;
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
  activityId?: string;
  pcName?: string;
  browser?: string;
  fingerprint?: string;
}) {
  return fetch("/api/activity/heartbeat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getCsrfHeader() as Record<string, string>),
    },
    credentials: "include",
    body: JSON.stringify(payload || {}),
  });
}

export async function activityHeartbeatLight() {
  return fetch("/api/activity/heartbeat", {
    method: "POST",
    headers: {
      ...(getCsrfHeader() as Record<string, string>),
    },
    credentials: "include",
  });
}

export async function getAllActivity() {
  const response = await apiRequest("GET", "/api/activity/all");
  return response.json();
}

export async function getFilteredActivity(filters: ActivityFilters) {
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
  const response = await apiRequest("GET", url);
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

export async function getBannedUsers() {
  const response = await apiRequest("GET", "/api/users/banned");
  return response.json();
}
