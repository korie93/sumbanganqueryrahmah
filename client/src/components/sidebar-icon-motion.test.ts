import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOME_NAV_ITEM, getVisibleNavigationGroups, getVisiblePrimaryNavItems } from "@/app/navigation";
import { getSidebarIconMotion, SIDEBAR_ICON_MOTION_BY_ID } from "./sidebar-icon-motion";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const css = source("./SidebarIconMotion.css");
const desktop = source("./NavbarDesktopNavigation.tsx");
const home = source("./NavbarHomeButton.tsx");
const mobile = source("./NavbarMobileNavigation.tsx");

test("every permitted desktop menu, group and flyout icon has an explicit bounded motion", () => {
  const groups = getVisibleNavigationGroups("superuser", null, false);
  const ids = [HOME_NAV_ITEM.id, ...getVisiblePrimaryNavItems("superuser", null, false).map(({ id }) => id),
    ...groups.flatMap((group) => [group.id, ...group.items.map(({ id }) => id)])];
  assert.equal(new Set(ids).size, 16);
  assert.deepEqual(Object.keys(SIDEBAR_ICON_MOTION_BY_ID).sort(), ids.sort());
  for (const id of ids) assert.ok(["lift", "inspect", "tilt"].includes(getSidebarIconMotion(id)), id);
  assert.equal(getSidebarIconMotion("general-search"), "inspect");
  assert.equal(getSidebarIconMotion("settings-menu"), "tilt");
  assert.equal(getSidebarIconMotion("settings"), "tilt");
});

test("new or prototype-looking IDs use the safe finite fallback, not object properties", () => {
  for (const id of ["future-menu", "", "constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(getSidebarIconMotion(id), "lift", id);
  }
  assert.doesNotMatch(source("./sidebar-icon-motion.ts"), /navigator|hardwareConcurrency|deviceMemory|userAgent|matchMedia|setTimeout|setInterval|requestAnimationFrame/);
});

test("the CSS starts one short gesture only for an enabled interacted desktop menu icon", () => {
  assert.match(css, /@media \(min-width: 1024px\) and \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /:is\(\.workspace-sidebar \.nav-pill, \.workspace-nav-flyout \.workspace-flyout-item\):not\(:disabled\):not\(\[aria-disabled="true"\]\):is\(:hover, :focus-visible\) \.sidebar-menu-icon-motion/);
  // The scoped important declarations outrank the existing low-spec reset;
  // they remain gated by desktop size and the accessibility media preference.
  assert.match(css, /animation-duration:\s*220ms !important;/);
  assert.match(css, /animation-iteration-count:\s*1 !important;/);
  assert.match(css, /animation-fill-mode:\s*none !important;/);
  assert.match(source("../styles/tokens/_animations.css"), /\.low-spec \*[\s\S]*animation:\s*none !important;/);
  assert.match(css, /transform-box:\s*fill-box;/);
  assert.match(css, /transform-origin:\s*center;/);
  assert.equal((css.match(/animation-name:/g) ?? []).length, 3);
  assert.doesNotMatch(css, /infinite|will-change|url\(|@import/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:width|height|margin|padding|filter|box-shadow|pointer-events)\s*:/m);
});

test("all three keyframes animate only transform and restore the exact static icon at both ends", () => {
  for (const name of ["lift", "inspect", "tilt"]) {
    const start = css.indexOf(`@keyframes sidebar-icon-${name}`);
    assert.ok(start >= 0, name);
    let level = 0;
    let end = start;
    const opening = css.indexOf("{", start);
    for (end = opening; end < css.length; end++) {
      if (css[end] === "{") level++;
      if (css[end] === "}" && --level === 0) break;
    }
    const keyframes = css.slice(opening + 1, end);
    assert.match(keyframes, /0%,\s*100%\s*\{\s*transform:\s*none;\s*\}/);
    assert.deepEqual([...keyframes.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]),
      Array((keyframes.match(/transform:/g) ?? []).length).fill("transform"));
    assert.match(css, new RegExp(`animation-name:\\s*sidebar-icon-${name} !important;`));
  }
});

test("motion decorates existing SVGs without replacing native handlers, labels or flyout focus guards", () => {
  assert.equal((desktop.match(/data-sidebar-icon-motion=/g) ?? []).length, 3);
  assert.equal((home.match(/data-sidebar-icon-motion=/g) ?? []).length, 1);
  assert.match(desktop, /getSidebarIconMotion\(item\.id\)/);
  assert.match(desktop, /getSidebarIconMotion\(group\.id\)/);
  assert.match(home, /getSidebarIconMotion\(HOME_NAV_ITEM\.id\)/);
  assert.match(home, /onClick=\{\(\) => onNavigate\(HOME_NAV_ITEM\.id\)\}/);
  assert.equal((desktop.match(/onClick=\{\(\) => onNavigate\(item\.id\)\}/g) ?? []).length, 2);
  assert.match(desktop, /onMouseEnter=\{\(\) => onPrefetch\(item\.id\)\}/);
  assert.match(desktop, /onFocus=\{\(\) => onPrefetch\(item\.id\)\}/);
  assert.match(desktop, /event\.key === "ArrowRight"/);
  assert.match(desktop, /onEscapeKeyDown=\{\(\) => \{ restoreFocus\.current = true; \}\}/);
  assert.match(desktop, /groupTriggerRefs\.current\.get\(group\.id\)\?\.focus\(\{ preventScroll: true \}\)/);
  for (const content of [home, desktop]) {
    assert.doesNotMatch(content, /onAnimationEnd|onAnimationStart|requestAnimationFrame|setTimeout|setInterval|style=\{/);
  }
  assert.doesNotMatch(mobile, /sidebar-menu-icon-motion|getSidebarIconMotion|SidebarIconMotion/);
});

test("decorative motion leaves role restrictions and feature lockdown untouched", () => {
  const tabs = Object.fromEntries(Object.keys(SIDEBAR_ICON_MOTION_BY_ID).map((id) => [id, true]));
  for (const role of ["user", "admin"] as const) {
    const ids = getVisibleNavigationGroups(role, tabs, false).flatMap(({ items }) => items.map(({ id }) => id));
    assert.equal(ids.includes("backup"), false);
    assert.equal(ids.includes("audit-logs"), false);
    assert.equal(ids.includes("settings"), role === "admin");
  }
  assert.deepEqual(getVisibleNavigationGroups("superuser", tabs, true), []);
  assert.deepEqual(getVisiblePrimaryNavItems("superuser", tabs, true).map(({ id }) => id), ["general-search"]);
});
