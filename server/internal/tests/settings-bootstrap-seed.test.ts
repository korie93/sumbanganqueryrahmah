import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_TAB_SETTINGS, roleTabSettingKey } from "../../config/system-settings";
import {
  ADMIN_EDITABLE_SETTING_KEYS,
  MAINTENANCE_TYPE_OPTIONS,
  SETTINGS_CATEGORIES,
  buildSettingsSeedItems,
} from "../settings-bootstrap-seed";

test("settings bootstrap seed includes base categories and maintenance options", () => {
  assert.deepEqual(
    SETTINGS_CATEGORIES.map((category) => category.name),
    [
      "General",
      "Security",
      "AI & Search",
      "Data Management",
      "Backup & Restore",
      "Roles & Permissions",
      "System Monitoring",
    ],
  );
  assert.deepEqual(
    MAINTENANCE_TYPE_OPTIONS.map((option) => option.value),
    ["soft", "hard"],
  );
});

test("settings bootstrap seed includes generated role tab settings", () => {
  const seed = buildSettingsSeedItems();
  const keys = new Set(seed.map((setting) => setting.key));
  const roleTabCount = ROLE_TAB_SETTINGS.admin.length + ROLE_TAB_SETTINGS.user.length;

  assert.ok(keys.has("maintenance_type"));
  assert.ok(keys.has(roleTabSettingKey("admin", "monitor")));
  assert.ok(keys.has(roleTabSettingKey("user", "general_search")));
  assert.equal(seed.filter((setting) => setting.categoryName === "Roles & Permissions").length, 2 + roleTabCount);
});

test("settings bootstrap seed keeps admin editable allowlist intentional", () => {
  assert.equal(ADMIN_EDITABLE_SETTING_KEYS.has("system_name"), true);
  assert.equal(ADMIN_EDITABLE_SETTING_KEYS.has("maintenance_message"), true);
  assert.equal(ADMIN_EDITABLE_SETTING_KEYS.has("maintenance_mode"), false);
  assert.equal(ADMIN_EDITABLE_SETTING_KEYS.has("jwt_expiry_hours"), false);
});
