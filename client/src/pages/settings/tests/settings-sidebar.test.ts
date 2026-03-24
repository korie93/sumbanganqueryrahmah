import assert from "node:assert/strict";
import test from "node:test";
import { getSettingsCategoryIcon } from "@/pages/settings/settings-sidebar-icons";
import type { SettingCategory } from "@/pages/settings/types";

function createCategory(id: string, name: string): SettingCategory {
  return {
    id,
    name,
    description: `${name} description`,
    settings: [],
  };
}

test("getSettingsCategoryIcon maps each primary settings category to a distinct icon", () => {
  const categories = [
    createCategory("general", "General"),
    createCategory("security", "Security"),
    createCategory("ai-search", "AI & Search"),
    createCategory("data-management", "Data Management"),
    createCategory("backup-restore", "Backup & Restore"),
    createCategory("roles-permissions", "Roles & Permissions"),
    createCategory("system-monitoring", "System Monitoring"),
    createCategory("account-management", "Account Management"),
  ];

  const icons = categories.map((category) => getSettingsCategoryIcon(category));
  assert.equal(new Set(icons).size, categories.length);
});

test("getSettingsCategoryIcon falls back to category name when the id is not recognized", () => {
  const icon = getSettingsCategoryIcon(createCategory("security-controls", "Security"));
  const securityIcon = getSettingsCategoryIcon(createCategory("security", "Security"));

  assert.equal(icon, securityIcon);
});

test("getSettingsCategoryIcon uses the generic settings icon for unknown categories", () => {
  const unknownIcon = getSettingsCategoryIcon(createCategory("custom-category", "Custom Category"));
  const generalIcon = getSettingsCategoryIcon(createCategory("general", "General"));

  assert.notEqual(unknownIcon, generalIcon);
});
