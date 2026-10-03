import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthenticatedRoleHomePage } from "./role-home-page";

test("every supported role lands on Home while unknown roles keep their restricted fallback", () => {
  assert.equal(resolveAuthenticatedRoleHomePage("user"), "home");
  assert.equal(resolveAuthenticatedRoleHomePage("admin"), "home");
  assert.equal(resolveAuthenticatedRoleHomePage("manager"), "home");
  assert.equal(resolveAuthenticatedRoleHomePage("superuser"), "home");
  assert.equal(resolveAuthenticatedRoleHomePage("auditor"), "general-search");
  assert.equal(resolveAuthenticatedRoleHomePage(null), "general-search");
});
