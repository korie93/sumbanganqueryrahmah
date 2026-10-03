import assert from "node:assert/strict";
import test from "node:test";
import { MANDATORY_ROLE_HOME_DESCRIPTION } from "../../../shared/role-feature-access";
import { db } from "../../db-postgres";
import { SettingsRepository } from "../settings.repository";
import { buildSystemSettingItem } from "../settings-repository-view-utils";
import { updateRolePermissions } from "../settings-role-permission-mutations";

test("mandatory user Home is shown enabled and immutable even for a legacy disabled row", () => {
  const row = {
    key: "tab_user_home_enabled", label: "User Tab: Home", description: "Legacy description",
    type: "boolean", value: "false", default_value: "false", can_view: true,
  };
  const result = buildSystemSettingItem({ row, canEdit: true });
  assert.equal(result.value, "true");
  assert.equal(result.defaultValue, "true");
  assert.equal(result.description, MANDATORY_ROLE_HOME_DESCRIPTION);
  assert.deepEqual(result.permission, { canView: true, canEdit: false });
  assert.equal(row.value, "false", "Presentation must not mutate the stored source row.");
});

test("mandatory Home does not change other role Home controls or protected feature restrictions", () => {
  for (const key of ["tab_admin_home_enabled", "tab_manager_home_enabled", "tab_user_general_search_enabled"]) {
    const result = buildSystemSettingItem({
      row: { key, label: key, type: "boolean", value: "false", default_value: "false" }, canEdit: true,
    });
    assert.equal(result.value, "false", key);
    assert.equal(result.defaultValue, "false", key);
    assert.equal(result.permission.canEdit, true, key);
  }
  const protectedFeature = buildSystemSettingItem({
    row: { key: "tab_user_backup_enabled", label: "Backup", type: "boolean", value: "true" }, canEdit: true,
  });
  assert.equal(protectedFeature.value, "false");
  assert.equal(protectedFeature.permission.canEdit, false);
});

test("effective role visibility enables only mandatory user Home without rewriting legacy settings", async (t) => {
  const storedRows = [
    { key: "tab_user_home_enabled", value: "false" },
    { key: "tab_user_general_search_enabled", value: "false" },
    { key: "tab_user_collection_report_enabled", value: "false" },
    { key: "tab_user_dashboard_enabled", value: "false" },
  ];
  const execute = t.mock.method(db, "execute", async () => ({ rows: storedRows }));
  const transaction = t.mock.method(db, "transaction", () => { throw new Error("No database writes expected."); });
  const visibility = await new SettingsRepository().getRoleTabVisibility("user");
  assert.equal(visibility.home, true);
  assert.equal(visibility["general-search"], false);
  assert.equal(visibility["collection-report"], false);
  assert.equal(visibility.dashboard, false);
  assert.equal(visibility.backup, false);
  assert.equal(execute.mock.callCount(), 1);
  assert.equal(transaction.mock.callCount(), 0);
  assert.equal(storedRows[0]?.value, "false");
});

test("both batch and legacy single-setting updates reject mandatory Home before any database writes", async (t) => {
  const execute = t.mock.method(db, "execute", () => { throw new Error("No database reads or writes expected."); });
  const transaction = t.mock.method(db, "transaction", () => { throw new Error("No database writes expected."); });
  for (const value of [false, true]) {
    const batch = await updateRolePermissions({
      role: "superuser", updatedBy: "fixture", confirmCritical: true,
      updates: [{ key: "tab_user_general_search_enabled", value: false }, { key: "tab_user_home_enabled", value }],
    });
    assert.equal(batch.status, "forbidden");
    assert.equal(batch.message, MANDATORY_ROLE_HOME_DESCRIPTION);
    const single = await new SettingsRepository().updateSystemSetting({
      role: "superuser", updatedBy: "fixture", confirmCritical: true, settingKey: "tab_user_home_enabled", value,
    });
    assert.equal(single.status, "forbidden");
    assert.equal(single.message, MANDATORY_ROLE_HOME_DESCRIPTION);
  }
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(transaction.mock.callCount(), 0);
});
