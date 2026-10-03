import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthenticatedEntryPage } from "./usePublicAppState";
import { canAccessRoleFeature, isRoleFeatureConfigurable } from "@shared/role-feature-access";

test("user authentication entry ignores stale saved pages and enters Home", () => {
  for (const savedPage of ["general-search", "settings", "backup", "monitor", null]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => savedPage } });
    try {
      for (const page of ["login", "activate-account", "reset-password"]) {
        assert.equal(resolveAuthenticatedEntryPage({ page }, { username: "staff", role: "user" }).currentPage, "home");
        assert.equal(resolveAuthenticatedEntryPage({ page }, { username: "staff", role: "user", mustChangePassword: true }).currentPage, "change-password");
      }
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});

test("refreshing an authenticated deep link is not treated as a fresh login", () => {
  assert.equal(resolveAuthenticatedEntryPage({ page: "general-search" }, { username: "staff", role: "user" }).currentPage, "general-search");
});

test("mandatory Home is not a grant to analytics, Collection or protected settings", () => {
  assert.equal(canAccessRoleFeature("user", "home", { home: false }), true);
  assert.equal(isRoleFeatureConfigurable("user", "home"), false);
  for (const feature of ["dashboard", "collection-report", "general-search", "settings", "backup", "audit-logs"]) {
    assert.equal(canAccessRoleFeature("user", feature, null), false);
  }
  assert.equal(isRoleFeatureConfigurable("admin", "home"), true);
  assert.equal(isRoleFeatureConfigurable("manager", "home"), true);
  assert.equal(canAccessRoleFeature("unknown", "home", { home: true }), false);
});
