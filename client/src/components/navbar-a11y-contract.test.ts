import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (filename: string) => readFileSync(new URL(filename, import.meta.url), "utf8");

test("V7.9 shell derives every navigation surface from the production permission registry", () => {
  const source = readSource("Navbar.tsx");
  for (const selector of ["getVisibleNavItems", "getVisiblePrimaryNavItems", "getVisibleNavigationGroups"]) {
    assert.ok(source.includes(selector));
  }
  assert.match(source, /items=\{allItems\}/);
  assert.match(source, /canAccessSettings = allItems\.some\(\(item\) => item\.id === "settings"\)/);
  assert.match(source, /canAccessSettings=\{canAccessSettings\}/);
  assert.match(source, /onAccount=\{\(\) => navigateProfile\("account"\)\}/);
  assert.match(source, /onSecurity=\{\(\) => navigateProfile\("security"\)\}/);
  assert.doesNotMatch(source, /canAccessAccount/);
  assert.doesNotMatch(source, /userRole === "(?:superuser|admin|manager|user)"/);
  assert.match(source, /resolveNavigationTarget\(itemId\)/);
  // Wouter's location hook is pathname-only; Settings child selection needs its query hook.
  assert.match(source, /const routerSearch = useSearch\(\)/);
  assert.match(source, /search: queryIndex < 0 \? routerSearch : routerLocation\.slice\(queryIndex\)/);
});

test("desktop flyouts are nonmodal navigation regions with full-row keyboard controls", () => {
  const source = readSource("NavbarDesktopNavigation.tsx");
  assert.match(source, /<Popover[^>]*modal=\{false\}/);
  assert.match(source, /<PopoverContent asChild side="right"/);
  assert.match(source, /<nav role="navigation"/);
  assert.match(source, /aria-controls=\{panelId\} \{\.\.\.getAriaExpandedProps\(open\)\}/);
  assert.match(source, /event\.key === "ArrowRight"/);
  assert.match(source, /onGroupChange\(group\.id, true\)/);
  assert.match(source, /querySelector<HTMLButtonElement>\("button"\)\?\.focus/);
  assert.match(source, /groupTriggerRefs\.current\.get\(group\.id\)\?\.focus/);
  assert.doesNotMatch(source, /DropdownMenu|role="dialog"|aria-modal/);
});

test("collapsed anchored layers await measured stable geometry and cancel abandoned requests", () => {
  const source = readSource("useSidebarExpansion.ts");
  assert.match(source, /getBoundingClientRect\(\)\.width/);
  assert.match(source, /stableFrames >= 2/);
  assert.match(source, /pendingAction\.current = action/);
  assert.match(source, /onCollapsedChange\?\.\(false\)/);
  assert.match(source, /window\.cancelAnimationFrame/);
  assert.match(source, /useEffect\(\(\) => cancel/);
  const navbar = readSource("Navbar.tsx");
  assert.match(navbar, /afterExpansion\(\(\) =>/);
  assert.match(navbar, /cancelOutsideExpansion/);
  assert.match(navbar, /cancelPendingOnEscape/);
});

test("mobile navigation retains a modal drawer with inline mutually exclusive submenus", () => {
  const source = readSource("NavbarMobileNavigation.tsx");
  assert.match(source, /<Sheet open=\{open\} onOpenChange=\{onOpenChange\}/);
  assert.match(source, /id="mobile-navigation-drawer"/);
  assert.match(source, /aria-label="Mobile navigation"/);
  assert.match(source, /getAriaExpandedProps\(expanded\)\} aria-controls/);
  assert.match(source, /setActiveGroup\(expanded \? null : group\.id\)/);
  assert.match(source, /if \(activeGroup\) \{\s*event\.preventDefault\(\)/);
  assert.match(source, /groupRefs\.current\.get\(activeGroup\)\?\.focus/);
  assert.match(source, /onCloseAutoFocus=\{onCloseAutoFocus\}/);
  assert.doesNotMatch(source, /Popover|workspace-nav-flyout/);
  assert.match(source, /bg-primary px-1\.5 py-0\.5 text-xs font-medium text-primary-foreground/);
});

test("utility layers preserve session notifications and production logout", () => {
  const navbar = readSource("Navbar.tsx");
  const profile = readSource("NavbarUserMenuContent.tsx");
  const notifications = readSource("NavbarNotificationCenter.tsx");
  assert.match(navbar, /useNotificationHistoryState\(\)/);
  assert.match(navbar, /removeNotificationHistoryEntry/);
  assert.match(navbar, /workspace-sidebar-footer">\{profile\("desktop"\)\}/);
  assert.match(navbar, /Switch to light mode/);
  assert.match(navbar, /Switch to dark mode/);
  assert.match(profile, /void onLogout\(\)/);
  assert.match(profile, /data-testid="button-logout"/);
  assert.match(profile, /<span>Logout<\/span>/);
  assert.equal((profile.match(/data-testid="button-logout"/g) ?? []).length, 1);
  assert.match(profile, /canAccessSettings \? <DropdownMenuItem onSelect=\{onSettings\}/);
  assert.doesNotMatch(profile, /clearAuthenticatedUserStorage|localStorage\.clear|window\.location/);
  assert.match(notifications, /aria-label=\{triggerLabel\}/);
  assert.match(notifications, /aria-controls=/);
  assert.match(notifications, /sideOffset=\{8\}/);
  assert.match(notifications, /collisionPadding=\{12\}/);
  assert.match(notifications, /NOTIFICATION_CENTER_RENDER_LIMIT = NOTIFICATION_HISTORY_LIMIT/);
  assert.match(notifications, /onMarkRead\(\)/);
  assert.doesNotMatch(notifications, /localStorage|sessionStorage|setInterval|setTimeout/);
});

test("responsive shell closes transient layers on resize and restores visible navigation focus", () => {
  const source = readSource("Navbar.tsx");
  assert.match(source, /window\.matchMedia\(LARGE_UP_MEDIA_QUERY\)/);
  assert.match(source, /if \(media\.matches\) setMobileNavOpen\(false\)/);
  assert.match(source, /window\.addEventListener\("resize", resize\)/);
  assert.match(source, /window\.removeEventListener\("resize", resize\)/);
  assert.match(source, /desktopNavigationTriggerRef\.current\?\.focus/);
  assert.match(source, /mobileNavigationTriggerRef\.current\?\.focus/);
  const styles = readSource("Navbar.css");
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.workspace-nav-flyout\[data-state="closed"\][\s\S]*pointer-events: none/);
  assert.match(styles, /@media \(max-width: 1023px\)/);
});

test("shared drawer motion remains subtle and unchanged", () => {
  const source = readSource("ui/sheet.tsx");
  assert.match(source, /data-\[state=closed\]:duration-200 data-\[state=open\]:duration-200/);
  assert.match(source, /bg-black\/80 duration-200/);
  assert.doesNotMatch(source, /duration-(?:300|500)/);
});
