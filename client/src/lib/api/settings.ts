import { apiRequest, createApiHeaders } from "../queryClient";
import { getAuthHeader } from "./shared";

export async function getSettings() {
  const response = await apiRequest("GET", "/api/settings");
  return response.json();
}

export async function getAppConfig() {
  const response = await apiRequest("GET", "/api/app-config");
  return response.json();
}

export async function getTabVisibility() {
  const response = await apiRequest("GET", "/api/settings/tab-visibility");
  return response.json();
}

export async function updateSetting(payload: {
  key: string;
  value: string | number | boolean | null;
  confirmCritical?: boolean;
}) {
  const response = await apiRequest("PATCH", "/api/settings", payload);
  return response.json();
}

export async function getMaintenanceStatus() {
  const response = await fetch("/api/maintenance-status", {
    credentials: "include",
    headers: createApiHeaders({
      ...getAuthHeader(),
    }),
  });
  return response.json();
}
