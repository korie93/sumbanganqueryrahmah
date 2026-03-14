export type SettingType = "text" | "number" | "boolean" | "select" | "timestamp";

export type SettingOption = {
  value: string;
  label: string;
};

export type SettingItem = {
  key: string;
  label: string;
  description: string | null;
  type: SettingType;
  value: string;
  defaultValue: string | null;
  isCritical: boolean;
  updatedAt: string | null;
  permission: {
    canView: boolean;
    canEdit: boolean;
  };
  options: SettingOption[];
};

export type SettingCategory = {
  id: string;
  name: string;
  description: string | null;
  settings: SettingItem[];
};

export type CurrentUser = {
  id: string;
  username: string;
  role: string;
};

export type ManagedUser = {
  id: string;
  username: string;
  role: string;
};

export type NormalizedSettingsError = {
  message: string;
  requiresConfirmation?: boolean;
  code?: string;
};
