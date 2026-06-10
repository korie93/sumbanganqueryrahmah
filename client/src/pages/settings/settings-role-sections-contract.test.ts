import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "client/src/pages/settings/SettingsRoleSections.tsx"),
  "utf8",
);

test("settings role permission UI exposes compact manager-first controls", () => {
  assert.match(source, /Role permission workspace/);
  assert.match(source, /Search permission or module/);
  assert.match(source, /Role Comparison/);
  assert.match(source, /Compare module access across Manager, Admin, and User/);
  assert.match(source, /Pending permission impact/);
  assert.match(source, /Pending role permission changes/);
  assert.match(source, /Will allow access/);
  assert.match(source, /Will block access/);
  assert.match(source, /Role permission comparison by module/);
  assert.match(source, /Dashboard & Home/);
  assert.match(source, /Monitoring & Audit/);
  assert.match(source, /Backup & Restore/);
  assert.match(source, /permission group/);
  assert.match(source, /Allowed/);
  assert.match(source, /Blocked/);
  assert.match(source, /const roleOrder: RolePermissionId\[\] = \["manager", "admin", "user"\]/);
  assert.match(source, /useState<RolePermissionId>\("manager"\)/);
  assert.match(source, /sticky top-3/);
  assert.match(source, /Compact role view/);
});

test("settings role permission UI keeps manager separate from admin and user", () => {
  assert.match(source, /Manager Permissions/);
  assert.match(source, /Read-focused operational access without superuser powers/);
  assert.match(source, /roleSections\.manager/);
  assert.match(source, /No permissions match this search/);
  assert.match(source, /Run the latest database migration/);
});
