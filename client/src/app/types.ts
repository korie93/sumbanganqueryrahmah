export interface User {
  username: string;
  role: string;
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
