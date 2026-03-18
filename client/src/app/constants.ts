import type { AppRuntimeConfig } from "@/app/types";

export const DEFAULT_SYSTEM_NAME = "SQR System";

export const DEFAULT_RUNTIME_CONFIG: AppRuntimeConfig = {
  sessionTimeoutMinutes: 30,
  heartbeatIntervalMinutes: 5,
  aiTimeoutMs: 6000,
  aiEnabled: true,
  searchResultLimit: 200,
  viewerRowsPerPage: 100,
};

export const ACTIVE_SETTINGS_SECTION_KEY = "activeSettingsSection";

export const LOCAL_STORAGE_KEYS_TO_CLEAR = [
  "token",
  "user",
  "username",
  "role",
  "forcePasswordChange",
  "activityId",
  "activeTab",
  "lastPage",
  ACTIVE_SETTINGS_SECTION_KEY,
  "selectedImportId",
  "selectedImportName",
  "fingerprint",
] as const;

export const SESSION_STORAGE_KEYS_TO_CLEAR = [
  "collection_staff_nickname",
  "collection_staff_nickname_auth",
] as const;
