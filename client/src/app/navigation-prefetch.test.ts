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
      tabVisibilityLoaded: true,
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
      tabVisibility: { "general-search": true },
      tabVisibilityLoaded: true,
      userRole: "admin",
    }),
    ["general-search"],
  );
  assert.deepEqual(
    resolvePredictivePrefetchTargets({
      currentPage: "general-search",
      featureLockdown: true,
      monitorSection: null,
      tabVisibility: { "general-search": true },
      tabVisibilityLoaded: true,
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
    tabVisibilityLoaded: true,
    userRole: "superuser",
  });

  assert.equal(targets.includes("dashboard"), false);
  assert.equal(targets[0], "general-search");
});

test("predictive prefetch only selects explicitly authorized user modules", () => {
  const options = {
    currentPage: "home", featureLockdown: false, tabVisibilityLoaded: true,
    tabVisibility: { home: false, "general-search": true, "collection-report": true, dashboard: false },
    userRole: "user",
  };
  assert.deepEqual(resolvePredictivePrefetchTargets(options), ["general-search", "collection-report"]);
  assert.deepEqual(resolvePredictivePrefetchTargets({ ...options, currentPage: "general-search" }), ["collection-report"]);
  assert.deepEqual(resolvePredictivePrefetchTargets({ ...options, tabVisibility: null }), []);
});

test("prefetch waits for permissions and mandatory password completion for every role", () => {
  for (const userRole of ["superuser", "manager", "admin", "user"]) {
    const options = { currentPage: "home", featureLockdown: false, tabVisibilityLoaded: true,
      tabVisibility: { "general-search": true, dashboard: true }, userRole };
    assert.deepEqual(resolvePredictivePrefetchTargets({ ...options, tabVisibilityLoaded: false }), []);
    assert.deepEqual(resolvePredictivePrefetchTargets({ ...options, mustChangePassword: true }), []);
  }
});

test("feature lockdown does not grant Search prefetch when permission is absent", () => {
  for (const tabVisibility of [null, {}, { "general-search": false }]) {
    assert.deepEqual(resolvePredictivePrefetchTargets({ currentPage: "home", featureLockdown: true,
      tabVisibilityLoaded: true, tabVisibility, userRole: "admin" }), []);
  }
});
