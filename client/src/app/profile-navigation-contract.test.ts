import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canAccessRoleFeature } from "@shared/role-feature-access";
import { isPageEnabled } from "./monitorAccess";
import { buildPathForPage, resolveRouteFromLocation } from "./routing";

test("profile account shortcut preserves production settings permission rules", () => {
  assert.equal(canAccessRoleFeature("superuser", "settings", null), true);
  assert.equal(canAccessRoleFeature("admin", "settings", { settings: true }), true);
  assert.equal(canAccessRoleFeature("admin", "settings", null), false);
  assert.equal(canAccessRoleFeature("admin", "settings", { settings: false }), false);
  for (const role of ["user", "manager", "unknown"]) {
    assert.equal(canAccessRoleFeature(role, "settings", { settings: true }), false);
  }
});

test("account shortcut is exact allowlisted and normalized before the unchanged page guards", () => {
  const source = readFileSync(new URL("./useAppShellNavigation.ts", import.meta.url), "utf8");
  assert.match(source, /systemSecurityTarget = page === "\/settings\?section=security"/);
  const normalize = source.indexOf('systemSecurityTarget ? "settings" : personalPage');
  const passwordGuard = source.indexOf('user?.mustChangePassword && requestedPage');
  const permissionGuard = source.indexOf('!isPageEnabled(user?.role, requestedPage');
  const navigate = source.indexOf('replaceHistory(systemSecurityTarget ?');
  assert.ok(normalize > 0 && passwordGuard > normalize && permissionGuard > passwordGuard && navigate > permissionGuard);
  assert.doesNotMatch(source, /replaceHistory\(page\)|location\.(assign|href)/);
});

test("Settings responds to profile section navigation without remounting account/security forms", () => {
  const source = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
  assert.match(source, /const search = useSearch\(\)/);
  assert.match(source, /new URLSearchParams\(search\)/);
  assert.match(source, /\[initialSectionId, search, storage\]/);
  assert.doesNotMatch(source, /AccountSecuritySection|MyAccountSecurityCard|canAccessAccountSecurity/);
  assert.match(source, /controller\.renderSettingCard/);
});

test("personal routes remain available independently of module permissions, never to unknown roles", () => {
  for (const page of ["account", "security"]) {
    assert.equal(buildPathForPage(page), `/${page}`);
    assert.deepEqual(resolveRouteFromLocation(`/${page}`, ""), { page });
    for (const role of ["user", "admin", "manager", "superuser"]) {
      assert.equal(isPageEnabled(role, page, null, false), true);
      assert.equal(isPageEnabled(role, page, { settings: false, [page]: false }, true), true);
    }
    assert.equal(isPageEnabled(undefined, page, null, false), false);
    assert.equal(isPageEnabled("unknown", page, null, true), false);
  }
});

test("legacy personal aliases redirect but system security stays administrative", () => {
  for (const section of ["account", "my-account"]) {
    assert.deepEqual(resolveRouteFromLocation("/settings", `?section=${section}`), { page: "account", normalizedPath: "/account" });
  }
  assert.deepEqual(resolveRouteFromLocation("/settings", "?section=account-security"), { page: "security", normalizedPath: "/security" });
  assert.deepEqual(resolveRouteFromLocation("/settings", "?section=security"), { page: "settings" });
});
