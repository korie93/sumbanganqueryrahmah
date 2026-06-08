import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewActivitySection,
  canViewAuditSection,
  canViewDashboardSection,
  canViewMonitorSection,
  getDefaultMonitorSection,
  isPageEnabled,
} from "./monitorAccess";

test("manager can open dashboard and analysis without gaining monitor or audit access", () => {
  const tabs = {
    dashboard: true,
    analysis: true,
    activity: true,
    monitor: true,
    audit: true,
  };

  assert.equal(canViewDashboardSection("manager", tabs), true);
  assert.equal(canViewActivitySection("manager", tabs), false);
  assert.equal(canViewMonitorSection("manager", tabs, true), false);
  assert.equal(canViewAuditSection("manager", tabs), false);
  assert.equal(getDefaultMonitorSection("manager", tabs, true), "dashboard");
});

test("manager page guard denies every module outside the approved allowlist", () => {
  const tabs = { dashboard: true, analysis: true };
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
