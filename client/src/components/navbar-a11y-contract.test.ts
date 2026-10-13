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

test("expanded sidebar uses the transparent original Q in both light and dark themes", () => {
  const parts = readSource("NavbarParts.tsx");
  const mark = parts.match(/<div className="workspace-brand-mark">[\s\S]*?<\/div>/)?.[0];
  assert.ok(mark);
  assert.match(mark, /<BrandLogo variant="icon" theme="light" decorative priority/);
  assert.doesNotMatch(mark, /theme="(?:auto|dark)"|bg-|background/);
});

test("desktop sidebar toggle preserves immediate actions and exposes the correct expanded and collapsed icons", () => {
  const navbar = readSource("Navbar.tsx");
  const desktopButton = navbar.match(/<button ref=\{desktopNavigationTriggerRef\}[\s\S]*?<\/button>/)?.[0];
  assert.ok(desktopButton, "Keep the existing desktop toggle and focus reference");
  assert.match(desktopButton, /aria-label=\{sidebarCollapsed \? "Expand navigation" : "Collapse navigation"\}/);
  assert.match(desktopButton, /getAriaExpandedProps\(!sidebarCollapsed\)/);
  assert.match(desktopButton, /onClick=\{toggleSidebar\}/);
  assert.match(desktopButton, /data-testid="button-toggle-sidebar"/);
  assert.match(desktopButton, /sidebarCollapsed \? <>/);
  assert.match(desktopButton, /desktop && <Suspense/);
  assert.match(desktopButton, /<SidebarAnimatedQ\s*\/>/);
  assert.match(desktopButton, /<PanelLeftOpen className="workspace-sidebar-expand-icon h-5 w-5" aria-hidden="true"/);
  assert.match(desktopButton, /: <PanelLeftClose className="h-5 w-5" aria-hidden="true"/);
  assert.doesNotMatch(desktopButton, /<BrandLogo|<Menu|offline|filter|transform|onMouseEnter|onPointerEnter/);
  const action = navbar.match(/const toggleSidebar = useCallback\(\(\) => \{[^}]+\}/)?.[0];
  assert.ok(action);
  assert.match(action, /onSidebarCollapsedChange\?\.\(!sidebarCollapsed\)/);
  assert.doesNotMatch(action, /setTimeout|setInterval|requestAnimationFrame/);

  const mobileButton = navbar.match(/<button ref=\{mobileNavigationTriggerRef\}[\s\S]*?<\/button>/)?.[0];
  assert.ok(mobileButton);
  assert.match(mobileButton, /data-testid="button-open-mobile-nav"/);
  assert.match(mobileButton, /<Menu className="h-4 w-4" aria-hidden="true"/);
  assert.doesNotMatch(mobileButton, /BrandLogo|SidebarAnimatedQ|PanelLeft|workspace-sidebar-toggle-logo/);

  const css = readSource("../app/workspace-navigation.css");
  const toggleStyles = css.match(/\.workspace-sidebar-toggle \{[^}]+\}/)?.[0];
  assert.ok(toggleStyles);
  assert.match(toggleStyles, /width: 44px/);
  assert.match(toggleStyles, /height: 44px/);
  assert.match(toggleStyles, /min-height: 44px/);
  assert.match(toggleStyles, /padding: var\(--spacing-1\)/);
  assert.match(css, /\.workspace-sidebar-toggle-logo \{\s*width: 32px;\s*height: 32px;\s*flex-shrink: 0;/);
  assert.match(css, /\.workspace-sidebar-toggle:focus-visible \{\s*outline: 2px solid hsl\(var\(--ring\)\)/);
});

test("collapsed desktop artwork lazy loads behind a genuine static Q instead of increasing every initial shell", () => {
  const navbar = readSource("Navbar.tsx");
  assert.match(navbar, /const SidebarAnimatedQ = lazy\(/);
  assert.match(navbar, /import\("@\/components\/SidebarAnimatedQ"\)/);
  assert.match(navbar, /default:\s*\w+\.SidebarAnimatedQ/);
  assert.doesNotMatch(navbar, /import\s*\{\s*SidebarAnimatedQ\s*\}\s*from/);
  assert.match(navbar, /desktop && <Suspense fallback=\{/);
  assert.match(navbar, /className="workspace-sidebar-toggle-logo[^"\n]*"[^>]*aria-hidden="true"/);
  assert.match(navbar, /src="\/brand\/sidebar-q-static\.png"/);
  assert.match(navbar, /alt=""/);

  const artwork = readSource("SidebarAnimatedQ.tsx");
  assert.match(artwork, /className="workspace-sidebar-toggle-logo sidebar-q-artwork"/);
  assert.match(artwork, /aria-hidden="true" data-motion=\{state\}/);
  assert.match(artwork, /className="sidebar-q-static" src="\/brand\/sidebar-q-static\.png"/);
  assert.match(artwork, /const ready = loaded === ALL_LOADED && !failed/);
  assert.match(artwork, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(artwork, /!failed && <span className="sidebar-q-layers"/);
  assert.doesNotMatch(artwork, /favicon|offline|fetch\(|WebSocket|<svg|<canvas/);
});

test("desktop Q hover and keyboard focus reveal the action while pausing decorative motion", () => {
  const css = readSource("../app/workspace-navigation.css");
  assert.match(css, /\.workspace-sidebar-toggle:is\(:hover, :focus-visible\) \.workspace-sidebar-toggle-logo \{\s*opacity: 0;/);
  assert.match(css, /\.workspace-sidebar-toggle:is\(:hover, :focus-visible\) \.workspace-sidebar-expand-icon \{\s*opacity: 1;/);
  const motionCss = readSource("SidebarAnimatedQ.css");
  assert.match(motionCss, /\.workspace-sidebar-toggle:is\(:hover, :focus-visible\) :is\(\.sidebar-q-dot, \.sidebar-q-sheen\) \{\s*animation-play-state: paused;/);
  assert.match(motionCss, /data-motion="playing"[^}]+animation-play-state: running/);
  assert.match(motionCss, /data-motion="reduced"[^}]+animation: none/);
  assert.match(motionCss, /prefers-reduced-motion: reduce/);
  assert.match(motionCss, /mask: url\("\/brand\/sidebar-q-body\.png"\)/);

  const artwork = readSource("SidebarAnimatedQ.tsx");
  assert.match(artwork, /new IntersectionObserver/);
  assert.match(artwork, /document\.visibilityState === "visible"/);
  assert.match(artwork, /observer\?\.disconnect\(\)/);
  assert.match(artwork, /media\.removeEventListener\("change", update\)/);
  assert.match(artwork, /document\.removeEventListener\("visibilitychange", update\)/);
  assert.doesNotMatch(artwork, /requestAnimationFrame|setInterval|setTimeout/);
});

test("shared drawer motion remains subtle and unchanged", () => {
  const source = readSource("ui/sheet.tsx");
  assert.match(source, /data-\[state=closed\]:duration-200 data-\[state=open\]:duration-200/);
  assert.match(source, /bg-black\/80 duration-200/);
  assert.doesNotMatch(source, /duration-(?:300|500)/);
});
