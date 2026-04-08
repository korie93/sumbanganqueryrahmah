import { apiRequest, createApiHeaders } from "../api-client";
import { getAuthHeader } from "./shared";
import { parseApiJson } from "./contract";
import {
  settingsResponseSchema,
  settingsUpdateResponseSchema,
  tabVisibilityResponseSchema,
} from "@shared/api-contracts";

type SettingsRequestOptions = {
  signal?: AbortSignal | undefined;
};

export async function getSettings() {
  const response = await apiRequest("GET", "/api/settings");
  return parseApiJson(response, settingsResponseSchema, "/api/settings");
}

export async function getAppConfig() {
  const response = await apiRequest("GET", "/api/app-config");
  return response.json();
}

export async function getTabVisibility() {
  const response = await apiRequest("GET", "/api/settings/tab-visibility");
  return parseApiJson(response, tabVisibilityResponseSchema, "/api/settings/tab-visibility");
}

export async function updateSetting(payload: {
  key: string;
  value: string | number | boolean | null;
  confirmCritical?: boolean;
}) {
  const response = await apiRequest("PATCH", "/api/settings", payload);
  return parseApiJson(response, settingsUpdateResponseSchema, "/api/settings");
}

export async function getMaintenanceStatus(options?: SettingsRequestOptions) {
  const response = await fetch("/api/maintenance-status", {
    credentials: "include",
    headers: createApiHeaders({
      ...getAuthHeader(),
    }),
    signal: options?.signal ?? null,
  });
  return response.json();
}
