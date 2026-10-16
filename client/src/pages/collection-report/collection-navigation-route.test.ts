import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router, type BaseLocationHook } from "wouter";
import { isCollectionNavigationPath, useCollectionReportNavigation, type CollectionReportNavigationValue } from "./useCollectionReportNavigation";
import type { CollectionSubPage } from "./types";
import { getPathForSubPage, getSubPageFromPath } from "./utils";

const routeEntries: Array<[CollectionSubPage, string]> = [
  ["save", "/collection/save"],
  ["records", "/collection/records"],
  ["summary", "/collection/summary"],
  ["monthly-comparison", "/collection/monthly-comparison"],
  ["daily", "/collection/daily"],
  ["billing-principal", "/collection/billing-principal"],
  ["nickname-summary", "/collection/nickname-summary"],
  ["manage-nicknames", "/collection/nicknames"],
];

function navigationHarness(initialPath: string, role: "user" | "admin" | "manager" | "superuser") {
  let pathname = initialPath;
  const visits: Array<{ path: string; replace: boolean }> = [];
  const locationHook: BaseLocationHook = () => [pathname, (path: string, options?: { replace?: boolean }) => {
    pathname = path;
    visits.push({ path, replace: Boolean(options?.replace) });
  }];
  const flags = {
    canAccessBilling: role !== "user",
    canAccessNicknameSummary: role !== "user",
    isReadOnlyManager: role === "manager",
    isSuperuser: role === "superuser",
  };

  function readNavigation() {
    const results: CollectionReportNavigationValue[] = [];
    function Probe() {
      results.push(useCollectionReportNavigation(flags));
      return null;
    }
    renderToStaticMarkup(createElement(Router, { hook: locationHook, children: createElement(Probe) }));
    assert.equal(results.length, 1);
    return results[0]!;
  }

  return { readNavigation, visits, changePath: (path: string) => { pathname = path; } };
}

test("every existing Collection route round-trips without changing its route key", () => {
  for (const [key, path] of routeEntries) {
    assert.equal(getPathForSubPage(key), path);
    assert.equal(getSubPageFromPath(path), key);
    const navigation = navigationHarness(path, "superuser").readNavigation();
    assert.equal(navigation.subPage, key);
    assert.equal(navigation.activeSidebarItem?.key, key);
  }
});

test("Collection selection follows the router pathname rather than a stale local default", () => {
  const harness = navigationHarness("/collection/records", "superuser");
  assert.equal(harness.readNavigation().subPage, "records");
  for (const [key, path] of routeEntries) {
    harness.changePath(path);
    const navigation = harness.readNavigation();
    assert.equal(navigation.subPage, key);
    assert.equal(navigation.activeSidebarItem?.key, key);
  }
  assert.deepEqual(harness.visits, [], "Reading a valid route does not navigate during render");
});

test("Collection section visibility retains all existing role-authorized modules", () => {
  const expected: Record<"user" | "admin" | "manager" | "superuser", CollectionSubPage[]> = {
    user: ["save", "records", "summary", "monthly-comparison", "daily"],
    admin: ["save", "records", "summary", "monthly-comparison", "daily", "billing-principal", "nickname-summary"],
    manager: ["records", "summary", "monthly-comparison", "daily", "billing-principal", "nickname-summary"],
    superuser: routeEntries.map(([key]) => key),
  };
  for (const role of ["user", "admin", "manager", "superuser"] as const) {
    const navigation = navigationHarness("/collection/records", role).readNavigation();
    assert.deepEqual(navigation.sidebarItems.map((item) => item.key), expected[role]);
  }
});

test("forbidden direct routes resolve to the same authorized fallback before render", () => {
  for (const path of ["/collection/billing-principal", "/collection/nickname-summary", "/collection/nicknames"]) {
    const navigation = navigationHarness(path, "user").readNavigation();
    assert.equal(navigation.subPage, "save");
    assert.equal(navigation.activeSidebarItem?.key, "save");
  }
  assert.equal(navigationHarness("/collection/nicknames", "admin").readNavigation().subPage, "save");
  for (const path of ["/collection/save", "/collection/nicknames"]) {
    const navigation = navigationHarness(path, "manager").readNavigation();
    assert.equal(navigation.subPage, "records");
    assert.equal(navigation.activeSidebarItem?.key, "records");
  }
});

test("tab clicks push authorized routes and do not add duplicate entries for the current section", () => {
  const harness = navigationHarness("/collection/save", "superuser");
  harness.readNavigation().handleSelectSubPage("records");
  assert.deepEqual(harness.visits, [{ path: "/collection/records", replace: false }]);
  assert.equal(harness.readNavigation().subPage, "records");
  harness.readNavigation().handleSelectSubPage("records");
  assert.equal(harness.visits.length, 1);
  harness.readNavigation().handleSelectSubPage("summary");
  assert.deepEqual(harness.visits[1], { path: "/collection/summary", replace: false });
});

test("hidden or forbidden section callbacks cannot create history entries", () => {
  for (const [role, forbidden] of [
    ["user", ["billing-principal", "nickname-summary", "manage-nicknames"]],
    ["admin", ["manage-nicknames"]],
    ["manager", ["save", "manage-nicknames"]],
  ] as const) {
    const harness = navigationHarness("/collection/records", role);
    for (const key of forbidden) harness.readNavigation().handleSelectSubPage(key);
    assert.deepEqual(harness.visits, []);
    assert.equal(harness.readNavigation().subPage, "records");
  }
});

test("Collection-only corrections do not intercept external or lookalike global routes", () => {
  for (const path of ["/collection", "/collection-report", ...routeEntries.map(([, path]) => path)]) {
    assert.equal(isCollectionNavigationPath(path), true, path);
    assert.equal(isCollectionNavigationPath(path.toUpperCase()), true, path);
  }
  for (const path of ["/", "/general-search", "/settings", "/collection-report-other", "/collectioning", "/collections/save"]) {
    assert.equal(isCollectionNavigationPath(path), false, path);
  }
});

test("route corrections replace history and selected state has no second local source", () => {
  const source = readFileSync(new URL("./useCollectionReportNavigation.ts", import.meta.url), "utf8");
  assert.match(source, /const \[pathname, navigate\] = useLocation\(\)/);
  assert.match(source, /getSubPageFromPath\(pathname/);
  assert.match(source, /if \(typeof window === "undefined" \|\| !isCollectionNavigationPath\(pathname\)\) return/);
  assert.match(source, /navigate\(targetPath, \{ replace: true \}\)/);
  assert.doesNotMatch(source, /setSubPage|window\.history|addEventListener\("popstate"/);
});
