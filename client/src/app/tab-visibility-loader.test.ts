import assert from "node:assert/strict";
import test from "node:test";
import { createTabVisibilityLoader, isRelevantRoleSettingsUpdate } from "./tab-visibility-loader";
import { getVisibleNavItems } from "./navigation";
import { isPageEnabled, canViewActivitySection } from "./monitorAccess";

test("configurable features agree across menu and direct pages for every supported role, ON and OFF", () => {
  for (const role of ["manager", "admin", "user"]) {
    for (const feature of ["activity", "general-search", "home", "import", "collection-report", "analysis", "dashboard"]) {
      for (const enabled of [true, false]) {
        const tabs = { [feature]: enabled };
        assert.equal(getVisibleNavItems(role, tabs, false).some((item) => item.id === feature), enabled, `${role}/${feature}/menu`);
        assert.equal(isPageEnabled(role, feature, tabs, true), enabled, `${role}/${feature}/page`);
      }
    }
    assert.deepEqual(getVisibleNavItems(role, null, false), []);
    assert.equal(isPageEnabled(role, "home", { home: true }, false), false);
    assert.equal(isPageEnabled(role, "backup", { backup: true }, true), false);
  }
  assert.equal(canViewActivitySection("manager", { activity: true }), true);
  assert.equal(isPageEnabled("manager", "settings", { settings: true }, true), false);
});

test("latest permission refresh wins and failure/disposal never grants stale permissions", async () => {
  const pending: Array<{ resolve: (value: { tabs: Record<string, boolean> }) => void; reject: (error: Error) => void }> = [];
  const loaded: unknown[] = [];
  const loader = createTabVisibilityLoader({ load: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), onLoaded: (tabs) => loaded.push(tabs) });
  const first = loader.refresh();
  const second = loader.refresh();
  pending[1].resolve({ tabs: { activity: false } });
  await second;
  pending[0].resolve({ tabs: { activity: true } });
  await first;
  assert.deepEqual(loaded, [{ activity: false }]);
  const failed = loader.refresh();
  pending[2].reject(new Error("offline"));
  await failed;
  assert.deepEqual(loaded, [{ activity: false }, null]);
  const disposed = loader.refresh();
  loader.dispose();
  pending[3].resolve({ tabs: { activity: true } });
  await disposed;
  assert.equal(loaded.length, 2);
});

test("role-specific permission notifications do not invalidate another role", () => {
  assert.equal(isRelevantRoleSettingsUpdate("manager", { key: "tab_manager_activity_enabled" }), true);
  assert.equal(isRelevantRoleSettingsUpdate("user", { key: "tab_manager_activity_enabled" }), false);
  assert.equal(isRelevantRoleSettingsUpdate("admin", { key: "canViewSystemPerformance" }), true);
  assert.equal(isRelevantRoleSettingsUpdate("user", { key: "canViewSystemPerformance" }), false);
});
