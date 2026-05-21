import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthenticatedRoleHomePage } from "./role-home-page";

test("resolveAuthenticatedRoleHomePage sends unknown roles to the general search workspace", () => {
  assert.equal(resolveAuthenticatedRoleHomePage("user"), "general-search");
  assert.equal(resolveAuthenticatedRoleHomePage("admin"), "home");
  assert.equal(resolveAuthenticatedRoleHomePage("superuser"), "home");
  assert.equal(resolveAuthenticatedRoleHomePage("auditor"), "general-search");
  assert.equal(resolveAuthenticatedRoleHomePage(null), "general-search");
});
