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
  assert.deepEqual(resolveRouteFromLocation("/banned", ""), { page: "banned" });
  assert.deepEqual(resolveRouteFromLocation("/404", ""), { page: "not-found" });
  assert.equal(resolveRouteFromLocation("/missing-page", ""), null);
});

test("resolveRouteFromLocation supports direct app route aliases inside the authenticated shell", () => {
  assert.deepEqual(resolveRouteFromLocation("/search", ""), { page: "general-search" });
  assert.deepEqual(resolveRouteFromLocation("/general-search", ""), { page: "general-search" });
  assert.deepEqual(resolveRouteFromLocation("/import", ""), { page: "import" });
  assert.deepEqual(resolveRouteFromLocation("/saved", ""), { page: "saved" });
  assert.deepEqual(resolveRouteFromLocation("/viewer", ""), { page: "viewer" });
  assert.deepEqual(resolveRouteFromLocation("/ai", ""), { page: "ai" });
});

test("buildPathForPage keeps authenticated app pages out of the public landing route", () => {
  assert.equal(buildPathForPage("general-search"), "/general-search");
  assert.equal(buildPathForPage("import"), "/import");
  assert.equal(buildPathForPage("saved"), "/saved");
  assert.equal(buildPathForPage("viewer"), "/viewer");
  assert.equal(buildPathForPage("ai"), "/ai");
});

test("buildPathForPage maps monitor pages to canonical monitor URLs", () => {
  assert.equal(buildPathForPage("dashboard"), "/monitor?section=dashboard");
  assert.equal(buildPathForPage("activity"), "/monitor?section=activity");
  assert.equal(buildPathForPage("analysis"), "/monitor?section=analysis");
  assert.equal(buildPathForPage("audit"), "/monitor?section=audit");
  assert.equal(buildPathForPage("audit-logs"), "/monitor?section=audit");
});

test("buildPathForPage returns stable public paths", () => {
  assert.equal(buildPathForPage("home"), "/");
  assert.equal(buildPathForPage("login"), "/login");
  assert.equal(buildPathForPage("banned"), "/banned");
  assert.equal(buildPathForPage("not-found"), "/404");
});

test("isPublicAuthRoutePage identifies logged-out auth routes only", () => {
  assert.equal(isPublicAuthRoutePage("login"), true);
  assert.equal(isPublicAuthRoutePage("banned"), true);
  assert.equal(isPublicAuthRoutePage("forgot-password"), true);
  assert.equal(isPublicAuthRoutePage("home"), false);
  assert.equal(isPublicAuthRoutePage("monitor"), false);
});

