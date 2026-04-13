import type { AppRuntimeConfig } from "@/app/types";

export const DEFAULT_SYSTEM_NAME = "SQR System";

export const DEFAULT_RUNTIME_CONFIG: AppRuntimeConfig = {
  sessionTimeoutMinutes: 30,
  heartbeatIntervalMinutes: 5,
  aiTimeoutMs: 6000,
  aiEnabled: true,
  searchResultLimit: 200,
  viewerRowsPerPage: 100,
  importUploadLimitBytes: 96 * 1024 * 1024,
};

export const ACTIVE_SETTINGS_SECTION_KEY = "activeSettingsSection";

export const LEGACY_AUTH_LOCAL_STORAGE_KEYS = [
  "token",
  "user",
  "username",
  "role",
  "forcePasswordChange",
  "activityId",
  "banned",
  "fingerprint",
] as const;

export const PERSISTED_UI_LOCAL_STORAGE_KEYS = [
  "activeTab",
  "lastPage",
  ACTIVE_SETTINGS_SECTION_KEY,
  "selectedImportId",
  "selectedImportName",
] as const;

export const LOCAL_STORAGE_KEYS_TO_CLEAR = [
  ...LEGACY_AUTH_LOCAL_STORAGE_KEYS,
  ...PERSISTED_UI_LOCAL_STORAGE_KEYS,
] as const;

export const SESSION_STORAGE_KEYS_TO_CLEAR = [
  "collection_staff_nickname",
  "collection_staff_nickname_auth",
] as const;
