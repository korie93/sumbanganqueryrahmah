import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeNavigationPrefetchTarget,
  resolvePredictivePrefetchTargets,
} from "@/app/navigation-prefetch-utils";

test("normalizeNavigationPrefetchTarget resolves monitor and backup route aliases", () => {
  assert.equal(normalizeNavigationPrefetchTarget("dashboard"), "dashboard");
  assert.equal(normalizeNavigationPrefetchTarget("/monitor?section=analysis"), "analysis");
  assert.equal(normalizeNavigationPrefetchTarget("/monitor?section=audit"), "audit-logs");
  assert.equal(normalizeNavigationPrefetchTarget("/settings?section=backup-restore"), "backup");
  assert.equal(normalizeNavigationPrefetchTarget("/collection/save"), "collection-report");
});

test("resolvePredictivePrefetchTargets prioritizes likely operational modules from home", () => {
  assert.deepEqual(
    resolvePredictivePrefetchTargets({
      currentPage: "home",
      featureLockdown: false,
      monitorSection: null,
      tabVisibility: null,
      userRole: "superuser",
    }),
    ["general-search", "collection-report", "viewer", "saved"],
  );
});

test("resolvePredictivePrefetchTargets falls back to general search during feature lockdown", () => {
  assert.deepEqual(
    resolvePredictivePrefetchTargets({
      currentPage: "home",
      featureLockdown: true,
      monitorSection: null,
      tabVisibility: null,
      userRole: "admin",
    }),
    ["general-search"],
  );
  assert.deepEqual(
    resolvePredictivePrefetchTargets({
      currentPage: "general-search",
      featureLockdown: true,
      monitorSection: null,
      tabVisibility: null,
      userRole: "admin",
    }),
    [],
  );
});

test("resolvePredictivePrefetchTargets excludes the active monitor subsection", () => {
  const targets = resolvePredictivePrefetchTargets({
    currentPage: "monitor",
    featureLockdown: false,
    monitorSection: "dashboard",
    tabVisibility: null,
    userRole: "superuser",
  });

  assert.equal(targets.includes("dashboard"), false);
  assert.equal(targets[0], "general-search");
});
