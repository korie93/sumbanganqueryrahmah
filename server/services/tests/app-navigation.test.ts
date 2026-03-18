import assert from "node:assert/strict";
import test from "node:test";
import {
  getVisibleNavigationGroups,
  getVisiblePrimaryNavItems,
  isNavigationItemActive,
  resolveNavigationTarget,
} from "../../../client/src/app/navigation";

test("primary navigation keeps backup out of the top-level action row", () => {
  const primaryItems = getVisiblePrimaryNavItems("admin", {
    backup: true,
    settings: true,
    "general-search": true,
    "collection-report": true,
  }, false);

  assert.deepEqual(primaryItems.map((item) => item.id), ["general-search", "collection-report"]);
});

test("settings group exposes backup when it is enabled and hides it when disabled", () => {
  const enabledGroups = getVisibleNavigationGroups("admin", {
    backup: true,
    settings: true,
  }, false);
  const enabledSettingsGroup = enabledGroups.find((group) => group.id === "settings-menu");
  assert.ok(enabledSettingsGroup);
  assert.deepEqual(enabledSettingsGroup.items.map((item) => item.id), ["settings", "backup"]);

  const disabledGroups = getVisibleNavigationGroups("user", {
    backup: false,
  }, false);
  const disabledSettingsGroup = disabledGroups.find((group) => group.id === "settings-menu");
  assert.equal(disabledSettingsGroup, undefined);
});

test("settings navigation stays active for legacy backup page state", () => {
  assert.equal(isNavigationItemActive("backup", "settings"), true);
  assert.equal(isNavigationItemActive("settings", "backup"), true);
  assert.equal(isNavigationItemActive("dashboard", "monitor"), true);
});

test("monitor sub-pages resolve to monitor section routes", () => {
  assert.equal(resolveNavigationTarget("dashboard"), "/monitor?section=dashboard");
  assert.equal(resolveNavigationTarget("audit-logs"), "/monitor?section=audit");
});
