import type { SettingCategory, SettingItem } from "@/pages/settings/types";
import {
  getRoleSettingOrder,
  settingsCategoryOrder,
} from "@/pages/settings/utils";

export type SettingsRoleSections = {
  admin: SettingItem[];
  user: SettingItem[];
  other: SettingItem[];
};

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
    setting.key === "tab_admin_ai_enabled" || setting.key === "tab_user_ai_enabled";

  const admin = currentCategory.settings
    .filter(
      (setting) =>
        setting.key.startsWith("tab_admin_")
        || setting.key === "canViewSystemPerformance",
    )
    .filter((setting) => !isObsoleteAiToggle(setting))
    .sort(
      (left, right) =>
        getRoleSettingOrder(left.key) - getRoleSettingOrder(right.key)
        || left.label.localeCompare(right.label),
    );

  const user = currentCategory.settings
    .filter((setting) => setting.key.startsWith("tab_user_"))
    .filter((setting) => !isObsoleteAiToggle(setting))
    .sort(
      (left, right) =>
        getRoleSettingOrder(left.key) - getRoleSettingOrder(right.key)
        || left.label.localeCompare(right.label),
    );

  const other = currentCategory.settings
    .filter(
      (setting) =>
        !setting.key.startsWith("tab_admin_")
        && !setting.key.startsWith("tab_user_")
        && setting.key !== "canViewSystemPerformance",
    )
    .sort((left, right) => left.label.localeCompare(right.label));

  return { admin, user, other };
}
