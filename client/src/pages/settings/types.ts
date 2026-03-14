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
  fullName?: string | null;
  email?: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  passwordResetBySuperuser?: boolean;
  isBanned?: boolean | null;
};

export type ManagedUser = {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  passwordResetBySuperuser: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  isBanned: boolean | null;
};

export type PendingPasswordResetRequest = {
  id: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  requestedByUser: string | null;
  approvedBy: string | null;
  resetType: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
};

export type DevMailOutboxPreview = {
  createdAt: string;
  id: string;
  previewUrl: string;
  subject: string;
  to: string;
};

export type UserAccountManagementTabId =
  | "create-closed-account"
  | "local-mail-outbox"
  | "managed-account"
  | "pending-password-reset-requests";

export type NormalizedSettingsError = {
  message: string;
  requiresConfirmation?: boolean;
  code?: string;
};
