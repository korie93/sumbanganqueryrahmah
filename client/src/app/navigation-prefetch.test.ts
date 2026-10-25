import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNavigationPrefetchTarget } from "@/app/navigation-prefetch-utils";

test("navigation intent resolves monitor and backup route aliases", () => {
  assert.equal(normalizeNavigationPrefetchTarget("dashboard"), "dashboard");
  assert.equal(normalizeNavigationPrefetchTarget("/monitor?section=analysis"), "analysis");
  assert.equal(normalizeNavigationPrefetchTarget("/monitor?section=audit"), "audit-logs");
  assert.equal(normalizeNavigationPrefetchTarget("/settings?section=backup-restore"), "backup");
  assert.equal(normalizeNavigationPrefetchTarget("/collection/save"), "collection-report");
});

test("navigation intent keeps each supported destination independently addressable", () => {
  for (const target of [
    "home", "import", "saved", "viewer", "general-search", "collection-report",
    "dashboard", "activity", "monitor", "analysis", "audit-logs", "settings", "backup", "ai",
  ]) {
    assert.equal(normalizeNavigationPrefetchTarget(target), target);
  }
});

test("collection subroutes share their route bundle and Home retains its root alias", () => {
  for (const target of ["/collection/records", "/collection/monthly-comparison", "/collection/daily"]) {
    assert.equal(normalizeNavigationPrefetchTarget(target), "collection-report");
  }
  assert.equal(normalizeNavigationPrefetchTarget("/"), "home");
  assert.equal(normalizeNavigationPrefetchTarget("/settings?section=users"), "settings");
});

test("unknown navigation intent does not select a bundle", () => {
  for (const target of ["", "   ", "unknown", "/unknown", "https://example.test/", "javascript:alert(1)"]) {
    assert.equal(normalizeNavigationPrefetchTarget(target), null);
  }
});
