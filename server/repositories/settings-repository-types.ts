import type { SystemSettingItem } from "../config/system-settings";

export type SettingsAppConfig = {
  systemName: string;
  sessionTimeoutMinutes: number;
  heartbeatIntervalMinutes: number;
  wsIdleMinutes: number;
  aiEnabled: boolean;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
  searchResultLimit: number;
  viewerRowsPerPage: number;
};

export type SettingsUpdateResult = {
  status: "updated" | "unchanged" | "forbidden" | "not_found" | "requires_confirmation" | "invalid";
  message: string;
  setting?: SystemSettingItem;
  shouldBroadcast?: boolean;
};
