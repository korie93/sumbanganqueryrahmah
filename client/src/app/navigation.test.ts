import assert from "node:assert/strict";
import test from "node:test";
import { resolveActiveNavigationItemId } from "@/app/navigation";

test("resolveActiveNavigationItemId maps monitor subsections to their specific nav entries", () => {
  assert.equal(resolveActiveNavigationItemId("monitor", { monitorSection: "dashboard" }), "dashboard");
  assert.equal(resolveActiveNavigationItemId("monitor", { monitorSection: "activity" }), "activity");
  assert.equal(resolveActiveNavigationItemId("monitor", { monitorSection: "analysis" }), "analysis");
  assert.equal(resolveActiveNavigationItemId("monitor", { monitorSection: "audit" }), "audit-logs");
});

test("resolveActiveNavigationItemId can recover active nav state from URL query details", () => {
  assert.equal(
    resolveActiveNavigationItemId("monitor", {
      pathname: "/monitor",
      search: "?section=dashboard",
    }),
    "dashboard",
  );
  assert.equal(
    resolveActiveNavigationItemId("settings", {
      pathname: "/settings",
      search: "?section=backup-restore",
    }),
    "backup",
  );
});

test("resolveActiveNavigationItemId keeps ordinary pages stable", () => {
  assert.equal(resolveActiveNavigationItemId("home"), "home");
  assert.equal(resolveActiveNavigationItemId("saved"), "saved");
  assert.equal(resolveActiveNavigationItemId("audit"), "audit-logs");
});
