import type {
  RolePermissionImpact,
  SettingCategory,
  SettingChangeSummary,
  SettingItem,
} from "@/pages/settings/types";
import {
  getRoleSettingOrder,
  settingsCategoryOrder,
} from "@/pages/settings/utils";

export type SettingsRoleSections = {
  admin: SettingItem[];
  manager: SettingItem[];
  user: SettingItem[];
  other: SettingItem[];
};

const rolePermissionKeyPattern = /^tab_(admin|manager|user)_(.+)_enabled$/;
const sensitivePermissionPattern =
  /(account|backup|permission|restore|role|security|setting|system)/i;

export function sortSettingsCategories(categories: SettingCategory[]) {
  return [...categories].sort((left, right) => {
    const leftIndex = settingsCategoryOrder.indexOf(left.name);
    const rightIndex = settingsCategoryOrder.indexOf(right.name);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.name.localeCompare(right.name);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export function buildSettingMap(categories: SettingCategory[]) {
  const map = new Map<string, SettingItem>();
  for (const category of categories) {
    for (const setting of category.settings) {
      map.set(setting.key, setting);
    }
  }
  return map;
}

function formatSettingSummaryValue(setting: SettingItem, value: unknown): string {
  if (setting.type === "boolean") {
    return String(value).trim().toLowerCase() === "true" ? "Enabled" : "Blocked";
  }

  const normalized = String(value ?? "").trim();
  if (!normalized) return "Empty";

  const option = setting.options.find((item) => item.value === normalized);
  return option?.label ?? normalized;
}

export function buildSettingChangeSummary(
  settingMap: Map<string, SettingItem>,
  dirtyKeys: Set<string>,
  draftValues: Record<string, string | number | boolean | null>,
): SettingChangeSummary[] {
  return Array.from(dirtyKeys)
    .map((key) => {
      const setting = settingMap.get(key);
      if (!setting) return null;
      const nextRawValue = Object.prototype.hasOwnProperty.call(draftValues, key)
        ? draftValues[key]
        : setting.value;

      return {
        key,
        label: setting.label,
        nextValue: formatSettingSummaryValue(setting, nextRawValue),
        previousValue: formatSettingSummaryValue(setting, setting.value),
      };
    })
    .filter((item): item is SettingChangeSummary => item !== null);
}

function formatRoleLabel(role: string): RolePermissionImpact["role"] {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "User";
}

function formatPermissionModuleLabel(setting: SettingItem, suffix: string): string {
  const label = setting.label.replace(/^(Admin|Manager|User) Tab:\s*/i, "").trim();
  if (label) return label;
  return suffix.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildRolePermissionImpacts(
  settingMap: Map<string, SettingItem>,
  dirtyKeys: Set<string>,
  draftValues: Record<string, string | number | boolean | null>,
): RolePermissionImpact[] {
  return Array.from(dirtyKeys)
    .map((key) => {
      const setting = settingMap.get(key);
      if (!setting) return null;

      const parsed = key.match(rolePermissionKeyPattern);
      if (!parsed) return null;

      const previousAllowed = String(setting.value).trim().toLowerCase() === "true";
      const nextValue = Object.prototype.hasOwnProperty.call(draftValues, key)
        ? draftValues[key]
        : setting.value;
      const nextAllowed = String(nextValue).trim().toLowerCase() === "true";
      if (previousAllowed === nextAllowed) return null;

      const moduleLabel = formatPermissionModuleLabel(setting, parsed[2] ?? key);
      const sensitiveText = `${moduleLabel} ${setting.description ?? ""}`;

      return {
        key,
        role: formatRoleLabel(parsed[1] ?? "user"),
        moduleLabel,
        action: nextAllowed ? "grant" : "block",
        severity: sensitivePermissionPattern.test(sensitiveText) ? "sensitive" : "standard",
      };
    })
    .filter((item): item is RolePermissionImpact => item !== null)
    .sort(
      (left, right) =>
        left.role.localeCompare(right.role)
        || left.moduleLabel.localeCompare(right.moduleLabel),
    );
}

export function buildCategoryDirtyMap(categories: SettingCategory[], dirtyKeys: Set<string>) {
  const next = new Map<string, number>();
  if (dirtyKeys.size === 0) return next;

  for (const category of categories) {
    let count = 0;
    for (const setting of category.settings) {
      if (dirtyKeys.has(setting.key)) count += 1;
    }
    if (count > 0) {
      next.set(category.id, count);
    }
  }

  return next;
}

export function buildSettingsRoleSections(
  currentCategory: SettingCategory | null,
  isRolePermissionCategory: boolean,
): SettingsRoleSections | null {
  if (!isRolePermissionCategory || !currentCategory) return null;

  const isObsoleteAiToggle = (setting: SettingItem) =>
    setting.key === "tab_admin_ai_enabled"
    || setting.key === "tab_manager_ai_enabled"
    || setting.key === "tab_user_ai_enabled";

  const sortRoleSettings = (settings: SettingItem[]) =>
    settings
      .filter((setting) => !isObsoleteAiToggle(setting))
      .sort(
        (left, right) =>
          getRoleSettingOrder(left.key) - getRoleSettingOrder(right.key)
          || left.label.localeCompare(right.label),
      );

  const admin = sortRoleSettings(
    currentCategory.settings.filter(
      (setting) =>
        setting.key.startsWith("tab_admin_")
        || setting.key === "canViewSystemPerformance",
    ),
  );

  const manager = sortRoleSettings(
    currentCategory.settings.filter((setting) => setting.key.startsWith("tab_manager_")),
  );

  const user = sortRoleSettings(
    currentCategory.settings.filter((setting) => setting.key.startsWith("tab_user_")),
  );

  const other = currentCategory.settings
    .filter(
      (setting) =>
        !setting.key.startsWith("tab_admin_")
        && !setting.key.startsWith("tab_manager_")
        && !setting.key.startsWith("tab_user_")
        && setting.key !== "canViewSystemPerformance",
    )
    .filter((setting) => !isObsoleteAiToggle(setting))
    .sort((left, right) => left.label.localeCompare(right.label));

  return { admin, manager, user, other };
}
