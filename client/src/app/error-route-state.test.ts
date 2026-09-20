import assert from "node:assert/strict";
import test from "node:test";
import { resolveRouteFromLocation } from "@/app/routing";
import { resolveAuthenticatedEntryPage } from "@/app/usePublicAppState";
import { isKnownAppDocumentPath, isRequestNamespace } from "@shared/app-document-routes";

test("unknown and explicit404 routes remain not-found for each authenticated role", () => {
  for (const role of ["user", "manager", "admin", "superuser"]) {
    for (const route of [null, { page: "not-found" }]) {
      assert.equal(resolveAuthenticatedEntryPage(route, { username: "synthetic-user", role }).currentPage, "not-found");
      assert.equal(resolveAuthenticatedEntryPage(route, { username: "synthetic-user", role, mustChangePassword: true }).currentPage, "change-password");
    }
  }
});

test("server document validity and client resolution agree for supported nested routes and reject typos", () => {
  for (const route of ["/", "/login", "/reset-password", "/general-search", "/viewer", "/settings", "/403", "/404", "/collection/save", "/collection/records", "/collection/nicknames", "/collection/nickname-summary", "/collection/daily", "/collection/billing-principal", "/collection/monthly-comparison", "/collection/summary"]) {
    assert.equal(isKnownAppDocumentPath(route), true, route);
    assert.notEqual(resolveRouteFromLocation(route, ""), null, route);
  }
  for (const route of ["/unknown", "/collection/unknown", "/collection/daily-typo", "/api/missing", "/internal/missing", "/ws", "/socket.io/"]) {
    assert.equal(isKnownAppDocumentPath(route), false, route);
    assert.equal(resolveRouteFromLocation(route, ""), null, route);
  }
  assert.equal(isRequestNamespace("/API/test", "/api"), true);
  assert.equal(isRequestNamespace("/apiculture", "/api"), false);
  assert.equal(isRequestNamespace("/wsoops", "/ws"), false);
});

test("recognized authenticated deep links are preserved", () => {
  for (const route of ["/viewer", "/settings", "/collection/billing-principal", "/general-search", "/monitor"]) {
    const resolved = resolveRouteFromLocation(route, "?section=audit");
    assert.equal(resolveAuthenticatedEntryPage(resolved, { username: "synthetic", role: "admin" }).currentPage, resolved?.page);
  }
});
