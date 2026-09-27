import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsRoleSections } from "./SettingsRoleSections";
import type { RolePermissionImpact, SettingItem } from "./types";

type RoleSections = NonNullable<ComponentProps<typeof SettingsRoleSections>["roleSections"]>;

function setting(key: string, value = "false", canEdit = true): SettingItem {
  return {
    key, value, label: key.replace(/^tab_/, "").replace(/_enabled$/, ""),
    description: `Description for ${key}`, type: "boolean", defaultValue: "false",
    isCritical: false, updatedAt: null, permission: { canView: true, canEdit }, options: [],
  };
}

const roles: RoleSections = {
  manager: [
    setting("tab_manager_home_enabled", "true"),
    setting("tab_manager_collection_report_enabled", "false", false),
    setting("tab_manager_monitor_enabled"),
    setting("tab_manager_backup_enabled"),
    setting("tab_manager_settings_enabled"),
    setting("tab_manager_custom_enabled"),
  ],
  admin: [setting("tab_admin_home_enabled", "false"), setting("tab_admin_saved_enabled", "true")],
  user: [setting("tab_user_home_enabled", "true")],
  other: [setting("canViewSystemPerformance", "true", false)],
};

function render(roleSections: RoleSections | null = roles, rolePermissionImpacts: RolePermissionImpact[] = []) {
  const renderedSettings: SettingItem[] = [];
  const markup = renderToStaticMarkup(createElement(SettingsRoleSections, {
    roleSections,
    rolePermissionImpacts,
    renderSettingCard: (item) => {
      renderedSettings.push(item);
      return createElement("div", { key: item.key, "data-setting": item.key }, item.label);
    },
  }));
  return { markup, renderedSettings };
}

test("role search and manager-first tabs precede a collapsed native comparison disclosure", () => {
  const { markup } = render();
  assert.ok(markup.indexOf("Search permission or module") < markup.indexOf('role="tablist"'));
  assert.ok(markup.indexOf('role="tablist"') < markup.indexOf("<details"));
  assert.match(markup, /aria-label="Permission roles"/);
  assert.match(markup, /aria-selected="true"[^>]*[\s\S]*?>Manager<\/span>/);
  assert.equal((markup.match(/role="tab"/g) ?? []).length, 3);
  assert.doesNotMatch(markup, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(markup, /<summary[^>]*min-h-11[^>]*>[\s\S]*?<span>Role Comparison<\/span>/);
  assert.match(markup, /h-11 pl-9 md:h-9/);
  assert.match(markup, /for="role-permission-search"/);
  assert.match(markup, /id="role-permission-search"/);
  assert.match(markup, /min-h-11 gap-1\.5/);
  assert.doesNotMatch(markup, /shadcn-card|backdrop|min-w-\[560px\]/);
  const source = readFileSync(new URL("./SettingsRoleSections.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<Card|shadow-sm|bg-background\/55/);
});

test("comparison retains every module and Allowed, Blocked and Not set states with table headers", () => {
  const { markup } = render();
  const table = markup.match(/<table[\s\S]*?<\/table>/)?.[0];
  assert.ok(table);
  assert.match(table, /Role permission comparison by module/);
  assert.equal((table.match(/scope="col"/g) ?? []).length, 4);
  assert.equal((table.match(/scope="row"/g) ?? []).length, 7);
  for (const label of ["Allowed", "Blocked", "Not set", "Manager", "Admin", "User"]) assert.ok(table.includes(label));
  assert.match(table, /table-fixed/);
  assert.doesNotMatch(table, /min-w-/);
});

test("flat permission groups pass original settings and permission metadata to the same renderer", () => {
  const { markup, renderedSettings } = render();
  const expected = [...roles.manager, ...roles.admin, ...roles.user, ...roles.other];
  assert.equal(renderedSettings.length, expected.length);
  for (const item of expected) assert.ok(renderedSettings.includes(item), `Preserve the original ${item.key} object`);
  assert.equal(renderedSettings.find((item) => item.key === "tab_manager_collection_report_enabled")?.permission.canEdit, false);
  for (const name of ["Dashboard &amp; Home", "Collection", "Monitoring &amp; Audit", "Backup &amp; Restore", "Settings", "Other"]) {
    assert.ok(markup.includes(`aria-label="${name} permission group"`));
  }
  assert.match(markup, /Other Permission Settings/);
  assert.match(markup, /role="group" aria-label="Permission counts"/);
  assert.match(markup, /7\/10 shown/);
  assert.match(markup, /1 enabled/);
  assert.match(markup, /5 blocked/);
});

test("pending permission warnings remain outside the collapsed comparison with all counts and overflow notice", () => {
  const impacts: RolePermissionImpact[] = Array.from({ length: 5 }, (_, index) => ({
    key: `change-${index}`, role: index % 2 ? "Admin" : "Manager", moduleLabel: `Module ${index}`,
    action: index % 2 ? "block" : "grant", severity: index === 0 ? "sensitive" : "standard",
  }));
  const { markup } = render(roles, impacts);
  const warning = markup.match(/<section[^>]*aria-label="Pending permission impact"[\s\S]*?<\/section>/)?.[0];
  assert.ok(warning);
  assert.ok(markup.indexOf(warning) < markup.indexOf("<details"));
  assert.equal((warning.match(/<li /g) ?? []).length, 4);
  for (const label of ["3 grants", "2 blocks", "1 sensitive", "Will allow access", "Will block access", "Sensitive", "+1 more pending permission change."]) {
    assert.ok(warning.includes(label), label);
  }
  assert.doesNotMatch(render().markup, /Pending permission impact/);
});

test("empty and absent role data keep their established messages without inventing permission controls", () => {
  assert.equal(render(null).markup, "");
  const { markup, renderedSettings } = render({ manager: [], admin: [], user: [], other: [] });
  assert.equal(renderedSettings.length, 0);
  assert.match(markup, /Manager permission settings are not installed yet/);
  assert.match(markup, /Run the latest database migration/);
  assert.match(markup, /No role comparison rows match this search/);
  assert.match(markup, /0\/0 shown/);
  assert.doesNotMatch(markup, /aria-label="Other Permission Settings"/);
});

test("role and search callbacks, search fields and grouping pipelines retain their original semantics", () => {
  const source = readFileSync(new URL("./SettingsRoleSections.tsx", import.meta.url), "utf8");
  assert.match(source, /onValueChange=\{\(value\) => setActiveRole\(value as RolePermissionId\)\}/);
  assert.match(source, /onChange=\{\(event\) => setSearchQuery\(event\.target\.value\)\}/);
  assert.match(source, /setting\.key,\s+setting\.label,\s+setting\.description \?\? "",/);
  assert.match(source, /section\.settings\.filter\(\(setting\) => matchesPermissionSearch\(setting, searchQuery\)\)/);
  assert.match(source, /roleSections\?\.other\.filter\(\(setting\) => matchesPermissionSearch\(setting, searchQuery\)\)/);
  assert.match(source, /buildPermissionGroups\(sectionFilteredSettings\)\.map/);
  assert.match(source, /group\.settings\.map\(renderSettingCard\)/);
  assert.match(source, /otherSettings\.map\(renderSettingCard\)/);
  assert.match(source, /No permissions match this search for \$\{section\.shortLabel\}/);
});
