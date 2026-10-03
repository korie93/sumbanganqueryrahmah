import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewActivitySection,
  canViewAuditSection,
  canViewDashboardSection,
  canViewMonitorSection,
  getDefaultMonitorSection,
  getDefaultPageForRole,
  isSuperuserFeatureOffMode,
  isPageEnabled,
} from "./monitorAccess";

test("user Home remains the landing shell without granting disabled data modules", () => {
  const tabs = { home: false, "general-search": true, "collection-report": false, dashboard: false };
  assert.equal(getDefaultPageForRole("user", tabs, true), "home");
  assert.equal(isPageEnabled("user", "home", tabs, true), true);
  assert.equal(isSuperuserFeatureOffMode("user", tabs, true), false);
  assert.equal(isPageEnabled("user", "collection-report", tabs, true), false);
  assert.equal(isPageEnabled("user", "dashboard", tabs, true), false);
  assert.equal(isPageEnabled("user", "home", null, false), false);
  assert.equal(isPageEnabled("user", "home", null, true), true);
  assert.equal(isPageEnabled("user", "collection-report", null, true), false);
  assert.equal(isPageEnabled("admin", "home", tabs, true), false);
  assert.equal(isPageEnabled("manager", "home", tabs, true), false);
});

test("manager can open dashboard and analysis without gaining monitor or audit access", () => {
  const tabs = {
    dashboard: true,
    analysis: true,
    activity: true,
    monitor: true,
    audit: true,
  };

  assert.equal(canViewDashboardSection("manager", tabs), true);
  assert.equal(canViewActivitySection("manager", tabs), true);
  assert.equal(canViewMonitorSection("manager", tabs, true), false);
  assert.equal(canViewAuditSection("manager", tabs), false);
  assert.equal(getDefaultMonitorSection("manager", tabs, true), "dashboard");
});

test("manager page guard denies every module outside the approved allowlist", () => {
  const tabs = { home: true, import: true, "general-search": true, "collection-report": true, dashboard: true, analysis: true };
  const allowedPages = [
    "home",
    "import",
    "general-search",
    "collection-report",
    "dashboard",
    "analysis",
    "monitor",
  ];
  const deniedPages = [
    "saved",
    "viewer",
    "activity",
    "audit",
    "audit-logs",
    "settings",
    "backup",
  ];

  for (const page of allowedPages) {
    assert.equal(isPageEnabled("manager", page, tabs, true), true, `${page} should be allowed`);
  }
  for (const page of deniedPages) {
    assert.equal(isPageEnabled("manager", page, tabs, true), false, `${page} should be denied`);
  }
});
