import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPathForPage,
  isPublicAuthRoutePage,
  resolveRouteFromLocation,
} from "@/app/routing";

test("resolveRouteFromLocation supports landing and login routes", () => {
  assert.deepEqual(resolveRouteFromLocation("/", ""), { page: "home" });
  assert.deepEqual(resolveRouteFromLocation("/login", ""), { page: "login" });
});

test("buildPathForPage returns stable public paths", () => {
  assert.equal(buildPathForPage("home"), "/");
  assert.equal(buildPathForPage("login"), "/login");
});

test("isPublicAuthRoutePage identifies logged-out auth routes only", () => {
  assert.equal(isPublicAuthRoutePage("login"), true);
  assert.equal(isPublicAuthRoutePage("forgot-password"), true);
  assert.equal(isPublicAuthRoutePage("home"), false);
  assert.equal(isPublicAuthRoutePage("monitor"), false);
});

