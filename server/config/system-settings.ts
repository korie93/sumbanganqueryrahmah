export type SettingInputType = "text" | "number" | "boolean" | "select" | "timestamp";

export type SettingsPermission = {
  canView: boolean;
  canEdit: boolean;
};

export type SettingsOption = {
  value: string;
  label: string;
};

export type SystemSettingItem = {
  key: string;
  label: string;
  description: string | null;
  type: SettingInputType;
  value: string;
  defaultValue: string | null;
  isCritical: boolean;
  updatedAt: Date | null;
  permission: SettingsPermission;
  options: SettingsOption[];
};

export type SystemSettingCategory = {
  id: string;
  name: string;
  description: string | null;
  settings: SystemSettingItem[];
};

export type MaintenanceState = {
  maintenance: boolean;
  message: string;
  type: "soft" | "hard";
  startTime: string | null;
  endTime: string | null;
};

export type RoleTabSetting = {
  pageId: string;
  suffix: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export const ROLE_TAB_SETTINGS: Record<"admin" | "user", RoleTabSetting[]> = {
  admin: [
    { pageId: "home", suffix: "home", label: "Admin Tab: Home", description: "Allow admin to open Home tab.", defaultEnabled: true },
    { pageId: "import", suffix: "import", label: "Admin Tab: Import", description: "Allow admin to open Import tab.", defaultEnabled: true },
    { pageId: "saved", suffix: "saved", label: "Admin Tab: Saved", description: "Allow admin to open Saved tab.", defaultEnabled: true },
    { pageId: "viewer", suffix: "viewer", label: "Admin Tab: Viewer", description: "Allow admin to open Viewer tab.", defaultEnabled: true },
    { pageId: "general-search", suffix: "general_search", label: "Admin Tab: Search", description: "Allow admin to open Search tab.", defaultEnabled: true },
    { pageId: "collection-report", suffix: "collection_report", label: "Admin Tab: Collection Report", description: "Allow admin to open Collection Report tab.", defaultEnabled: true },
    { pageId: "analysis", suffix: "analysis", label: "Admin Tab: Analysis", description: "Allow admin to open Analysis tab.", defaultEnabled: true },
    { pageId: "dashboard", suffix: "dashboard", label: "Admin Tab: Dashboard", description: "Allow admin to open Dashboard tab.", defaultEnabled: false },
    { pageId: "monitor", suffix: "monitor", label: "Admin Tab: System Monitor", description: "Allow admin to open System Monitor tab.", defaultEnabled: true },
    { pageId: "activity", suffix: "activity", label: "Admin Tab: Activity", description: "Allow admin to open Activity tab.", defaultEnabled: false },
    { pageId: "audit-logs", suffix: "audit_logs", label: "Admin Tab: Audit", description: "Allow admin to open Audit tab.", defaultEnabled: false },
    { pageId: "backup", suffix: "backup", label: "Admin Tab: Backup", description: "Allow admin to open Backup tab.", defaultEnabled: false },
    { pageId: "settings", suffix: "settings", label: "Admin Tab: Settings", description: "Allow admin to open Settings tab.", defaultEnabled: true },
  ],
  user: [
    { pageId: "home", suffix: "home", label: "User Tab: Home", description: "Allow user to open Home tab.", defaultEnabled: false },
    { pageId: "import", suffix: "import", label: "User Tab: Import", description: "Allow user to open Import tab.", defaultEnabled: false },
    { pageId: "saved", suffix: "saved", label: "User Tab: Saved", description: "Allow user to open Saved tab.", defaultEnabled: false },
    { pageId: "viewer", suffix: "viewer", label: "User Tab: Viewer", description: "Allow user to open Viewer tab.", defaultEnabled: false },
    { pageId: "general-search", suffix: "general_search", label: "User Tab: Search", description: "Allow user to open Search tab.", defaultEnabled: true },
    { pageId: "collection-report", suffix: "collection_report", label: "User Tab: Collection Report", description: "Allow user to open Collection Report tab.", defaultEnabled: true },
    { pageId: "analysis", suffix: "analysis", label: "User Tab: Analysis", description: "Allow user to open Analysis tab.", defaultEnabled: false },
    { pageId: "dashboard", suffix: "dashboard", label: "User Tab: Dashboard", description: "Allow user to open Dashboard tab.", defaultEnabled: false },
    { pageId: "monitor", suffix: "monitor", label: "User Tab: System Monitor", description: "Allow user to open System Monitor tab.", defaultEnabled: false },
    { pageId: "activity", suffix: "activity", label: "User Tab: Activity", description: "Allow user to open Activity tab.", defaultEnabled: false },
    { pageId: "audit-logs", suffix: "audit_logs", label: "User Tab: Audit", description: "Allow user to open Audit tab.", defaultEnabled: false },
    { pageId: "backup", suffix: "backup", label: "User Tab: Backup", description: "Allow user to open Backup tab.", defaultEnabled: false },
  ],
};

export const roleTabSettingKey = (role: "admin" | "user", suffix: string): string =>
  `tab_${role}_${suffix}_enabled`;
