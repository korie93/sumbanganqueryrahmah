export interface User {
  id?: string | undefined;
  username: string;
  role: string;
  fullName?: string | null | undefined;
  email?: string | null | undefined;
  status?: string | undefined;
  mustChangePassword?: boolean | undefined;
  passwordResetBySuperuser?: boolean | undefined;
  isBanned?: boolean | null | undefined;
  twoFactorEnabled?: boolean | undefined;
  twoFactorPendingSetup?: boolean | undefined;
  twoFactorConfiguredAt?: string | null | undefined;
}

export const APP_PAGE_NAMES = [
  "home",
  "login",
  "banned",
  "maintenance",
  "forgot-password",
  "activate-account",
  "reset-password",
  "change-password",
  "settings",
  "backup",
  "collection-report",
  "general-search",
  "import",
  "saved",
  "viewer",
  "ai",
  "monitor",
  "dashboard",
  "activity",
  "analysis",
  "audit",
  "audit-logs",
  "forbidden",
  "not-found",
] as const;

export type PageName = (typeof APP_PAGE_NAMES)[number];
const PAGE_NAME_SET = new Set<string>(APP_PAGE_NAMES);

export function isPageName(value: string): value is PageName {
  return PAGE_NAME_SET.has(value);
}

export type MonitorSection = "dashboard" | "activity" | "monitor" | "analysis" | "audit";

export type TabVisibility = Record<string, boolean> | null;

export type MonitorSectionVisibility = Record<MonitorSection, boolean>;

export type AppRuntimeConfig = {
  sessionTimeoutMinutes: number;
  heartbeatIntervalMinutes: number;
  aiTimeoutMs: number;
  aiEnabled: boolean;
  searchResultLimit: number;
  viewerRowsPerPage: number;
  importUploadLimitBytes: number;
};
