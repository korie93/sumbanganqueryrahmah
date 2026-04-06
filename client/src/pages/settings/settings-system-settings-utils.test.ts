import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoryDirtyMap,
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

test("buildSettingsRoleSections filters obsolete AI toggles", () => {
    const sections = buildSettingsRoleSections(
      createCategory("roles", "Roles & Permissions", [
        "tab_admin_home_enabled",
        "tab_admin_ai_enabled",
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
    assert.deepEqual(sections.user.map((setting) => setting.key), [
      "tab_user_saved_enabled",
    ]);
    assert.deepEqual(sections.other.map((setting) => setting.key), [
      "misc_toggle",
    ]);
});
