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
