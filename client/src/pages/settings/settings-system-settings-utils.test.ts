import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoryDirtyMap,
  buildRolePermissionImpacts,
  buildSettingChangeSummary,
  buildSettingsRoleSections,
  sortSettingsCategories,
} from "@/pages/settings/settings-system-settings-utils";
import type { SettingCategory } from "@/pages/settings/types";

function createCategory(id: string, name: string, keys: string[]): SettingCategory {
  return {
    id,
    name,
    description: null,
    settings: keys.map((key) => ({
      key,
      label: key,
      description: null,
      type: "boolean" as const,
      value: "false",
      defaultValue: null,
      isCritical: false,
      updatedAt: null,
      permission: {
        canView: true,
        canEdit: true,
      },
      options: [],
    })),
  };
}

test("sortSettingsCategories honors configured category order", () => {
  const sorted = sortSettingsCategories([
    createCategory("misc", "Zeta", []),
    createCategory("security", "Security", []),
    createCategory("general", "General", []),
  ]);

  assert.deepEqual(sorted.map((category) => category.name), [
    "General",
    "Security",
    "Zeta",
  ]);
});

test("buildCategoryDirtyMap only counts dirty settings per category", () => {
  const dirtyMap = buildCategoryDirtyMap(
    [
      createCategory("general", "General", ["site_name", "theme"]),
      createCategory("security", "Security", ["maintenance_mode"]),
    ],
    new Set(["theme", "maintenance_mode"]),
  );

  assert.equal(dirtyMap.get("general"), 1);
  assert.equal(dirtyMap.get("security"), 1);
  assert.equal(dirtyMap.has("missing"), false);
});

test("buildSettingChangeSummary formats dirty setting changes for save review", () => {
  const category = createCategory("roles", "Roles & Permissions", [
    "tab_manager_dashboard_enabled",
    "system_name",
  ]);
  category.settings[0]!.value = "false";
  category.settings[0]!.label = "Manager Tab: Dashboard";
  category.settings[1]!.value = "SQR";
  category.settings[1]!.label = "System Name";
  category.settings[1]!.type = "text";

  const settingMap = new Map(category.settings.map((setting) => [setting.key, setting]));
  const summary = buildSettingChangeSummary(
    settingMap,
    new Set(["tab_manager_dashboard_enabled", "system_name", "missing"]),
    {
      tab_manager_dashboard_enabled: true,
      system_name: "SQR Ops",
    },
  );

  assert.deepEqual(summary, [
    {
      key: "tab_manager_dashboard_enabled",
      label: "Manager Tab: Dashboard",
      previousValue: "Blocked",
      nextValue: "Enabled",
    },
    {
      key: "system_name",
      label: "System Name",
      previousValue: "SQR",
      nextValue: "SQR Ops",
    },
  ]);
});

test("buildRolePermissionImpacts summarizes pending grant and block changes", () => {
  const category = createCategory("roles", "Roles & Permissions", [
    "tab_manager_backup_enabled",
    "tab_user_dashboard_enabled",
    "system_name",
  ]);
  category.settings[0]!.value = "false";
  category.settings[0]!.label = "Manager Tab: Backup & Restore";
  category.settings[1]!.value = "true";
  category.settings[1]!.label = "User Tab: Dashboard";
  category.settings[2]!.value = "SQR";
  category.settings[2]!.label = "System Name";
  category.settings[2]!.type = "text";

  const settingMap = new Map(category.settings.map((setting) => [setting.key, setting]));
  const impacts = buildRolePermissionImpacts(
    settingMap,
    new Set(["tab_manager_backup_enabled", "tab_user_dashboard_enabled", "system_name"]),
    {
      tab_manager_backup_enabled: true,
      tab_user_dashboard_enabled: false,
      system_name: "SQR Ops",
    },
  );

  assert.deepEqual(impacts, [
    {
      key: "tab_manager_backup_enabled",
      role: "Manager",
      moduleLabel: "Backup & Restore",
      action: "grant",
      severity: "sensitive",
    },
    {
      key: "tab_user_dashboard_enabled",
      role: "User",
      moduleLabel: "Dashboard",
      action: "block",
      severity: "standard",
    },
  ]);
});

test("buildSettingsRoleSections filters obsolete AI toggles", () => {
    const sections = buildSettingsRoleSections(
      createCategory("roles", "Roles & Permissions", [
        "tab_admin_home_enabled",
        "tab_admin_ai_enabled",
        "tab_manager_dashboard_enabled",
        "tab_manager_ai_enabled",
        "tab_user_saved_enabled",
        "tab_user_ai_enabled",
        "canViewSystemPerformance",
        "misc_toggle",
      ]),
      true,
    );

    assert.ok(sections);
    assert.deepEqual(sections.admin.map((setting) => setting.key), [
      "tab_admin_home_enabled",
      "canViewSystemPerformance",
    ]);
    assert.deepEqual(sections.manager.map((setting) => setting.key), [
      "tab_manager_dashboard_enabled",
    ]);
    assert.deepEqual(sections.user.map((setting) => setting.key), [
      "tab_user_saved_enabled",
    ]);
    assert.deepEqual(sections.other.map((setting) => setting.key), [
      "misc_toggle",
    ]);
});
