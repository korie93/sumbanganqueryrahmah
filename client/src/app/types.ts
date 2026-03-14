export interface User {
  id?: string;
  username: string;
  role: string;
  fullName?: string | null;
  email?: string | null;
  status?: string;
  mustChangePassword?: boolean;
  passwordResetBySuperuser?: boolean;
  isBanned?: boolean | null;
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
};
