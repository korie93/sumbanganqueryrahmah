import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_MANAGEMENT_CATEGORY_ID,
  BACKUP_SETTINGS_CATEGORY_ID,
  buildSettingsSidebarCategories,
  canAccessBackupCategory,
  findSettingsDisplayCategory,
  getSettingsCategoryLabel,
  resolveNextSelectedSettingsCategory,
} from "@/pages/settings/settings-controller-utils";
import type { SettingCategory } from "@/pages/settings/types";

function createCategory(id: string, name: string): SettingCategory {
  return {
    id,
    name,
    description: null,
    settings: [],
  };
}

test("Settings category labels distinguish backup policy and operations without changing IDs or other names", () => {
  const policy = createCategory("server-backup-category", "Backup & Restore");
  assert.equal(getSettingsCategoryLabel(policy), "Backup Settings");
  assert.equal(policy.id, "server-backup-category");
  assert.equal(policy.name, "Backup & Restore");
  assert.equal(getSettingsCategoryLabel(createCategory(BACKUP_SETTINGS_CATEGORY_ID, "Backup & Restore")), "Backup & Restore");
  assert.equal(getSettingsCategoryLabel(createCategory("general", "General")), "General");
  assert.equal(getSettingsCategoryLabel(createCategory("custom", "Custom settings")), "Custom settings");
});

test("canAccessBackupCategory allows superuser even when tab visibility disables backup", () => {
  assert.equal(
    canAccessBackupCategory("superuser", { backup: false } as never),
    true,
  );
});

test("canAccessBackupCategory blocks users when backup tab is hidden", () => {
  assert.equal(
    canAccessBackupCategory("admin", { backup: false } as never),
    false,
  );
});

test("buildSettingsSidebarCategories appends synthetic settings categories", () => {
  const categories = buildSettingsSidebarCategories({
    canAccessAccountManagement: true,
    canAccessBackupSection: true,
    categories: [createCategory("general", "General")],
  });

  assert.deepEqual(categories.map((category) => category.id), [
    "general",
    BACKUP_SETTINGS_CATEGORY_ID,
    ACCOUNT_MANAGEMENT_CATEGORY_ID,
  ]);
});

test("findSettingsDisplayCategory returns synthetic backup category when selected", () => {
  const sidebarCategories = buildSettingsSidebarCategories({
    canAccessAccountManagement: false,
    canAccessBackupSection: true,
    categories: [createCategory("general", "General")],
  });

  assert.equal(
    findSettingsDisplayCategory({
      currentCategory: createCategory("general", "General"),
      isAccountManagementCategory: false,
      isBackupCategory: true,
      sidebarCategories,
    })?.id,
    BACKUP_SETTINGS_CATEGORY_ID,
  );
});

test("resolveNextSelectedSettingsCategory prefers a valid requested section", () => {
  const sidebarCategories = [
    createCategory("general", "General"),
    createCategory("security", "Security"),
  ];

  assert.equal(
    resolveNextSelectedSettingsCategory({
      initialSectionId: "security",
      selectedCategory: "general",
      sidebarCategories,
    }),
    "security",
  );
});

test("resolveNextSelectedSettingsCategory falls back to the first available category", () => {
  const sidebarCategories = [
    createCategory("general", "General"),
    createCategory("security", "Security"),
  ];

  assert.equal(
    resolveNextSelectedSettingsCategory({
      selectedCategory: "missing",
      sidebarCategories,
    }),
    "general",
  );
});
