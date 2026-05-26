import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("navbar controls use Malay accessible labels and include username context", () => {
  const navbarSource = readSource("Navbar.tsx");
  const homeButtonSource = readSource("NavbarHomeButton.tsx");
  const desktopNavigationSource = readSource("NavbarDesktopNavigation.tsx");
  const userMenuSource = readSource("NavbarUserMenuContent.tsx");
  const mobileNavigationSource = readSource("NavbarMobileNavigation.tsx");
  const scrollHintSource = readSource("HorizontalScrollHint.tsx");
  const navbarStyles = readSource("Navbar.css");

  assert.match(navbarSource, /aria-label="Buka menu navigasi"/);
  assert.match(navbarSource, /<button[\s\S]*data-testid="button-open-mobile-nav"/);
  assert.doesNotMatch(navbarSource, /<div[^>]*data-testid="button-open-mobile-nav"/);
  assert.match(navbarSource, /aria-label=\{`Buka menu pengguna untuk \$\{username\}`\}/);
  assert.match(navbarSource, /onCloseAutoFocus=\{restoreDesktopUserMenuFocus\}/);
  assert.match(navbarSource, /onCloseAutoFocus=\{restoreMobileUserMenuFocus\}/);
  assert.match(navbarSource, /onEscapeKeyDown=\{scheduleDesktopUserMenuTriggerFocus\}/);
  assert.match(navbarSource, /onEscapeKeyDown=\{scheduleMobileUserMenuTriggerFocus\}/);
  assert.match(navbarSource, /pendingFocusTimeoutsRef/);
  assert.match(navbarSource, /navbarMountedRef/);
  assert.match(navbarSource, /clearPendingUserMenuFocusTimeouts\(\)/);
  assert.match(navbarSource, /globalThis\.clearTimeout\(timeoutHandle\)/);
  assert.match(navbarSource, /if \(!navbarMountedRef\.current\) \{/);
  assert.match(navbarSource, /desktopUserMenuTriggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(navbarSource, /\{\[\.\.\.username\]\[0\] \|\| ""\}/);
  assert.doesNotMatch(navbarSource, /window\.location/);
  assert.match(homeButtonSource, /aria-label="Utama"/);
  assert.match(homeButtonSource, />Utama<\/span>/);
  assert.match(desktopNavigationSource, /aria-label="Navigasi utama"/);
  assert.match(desktopNavigationSource, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(desktopNavigationSource, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(desktopNavigationSource, /aria-current=\{activeItem \? "page" : undefined\}/);
  assert.match(desktopNavigationSource, /onEscapeKeyDown=\{\(\) => \{/);
  assert.match(desktopNavigationSource, /onCloseAutoFocus=\{\(event\) => \{/);
  assert.match(desktopNavigationSource, /groupTriggerRefs\.current\.get\(groupId\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(desktopNavigationSource, /scheduleGroupTriggerFocus\(group\.id\)/);
  assert.match(desktopNavigationSource, /pendingGroupFocusTimeoutsRef/);
  assert.match(desktopNavigationSource, /clearPendingGroupTriggerFocusTimeouts\(\)/);
  assert.match(desktopNavigationSource, /globalThis\.clearTimeout\(timeoutHandle\)/);
  assert.match(desktopNavigationSource, /if \(!navMountedRef\.current\) \{/);
  assert.match(userMenuSource, /navbar-dropdown-content/);
  assert.match(navbarStyles, /\.navbar-dropdown-content\[data-state="closed"\]\s*\{[\s\S]*animation:\s*none/);
  assert.match(scrollHintSource, /hint = "Tatal untuk lagi"/);
  assert.match(navbarStyles, /\.navbar-scroll-hint/);
  assert.match(navbarStyles, /\.navbar-premium-glass\s*\{[\s\S]*scrollbar-width:\s*thin/);
  assert.match(navbarStyles, /\.navbar-premium-glass\s*\{[\s\S]*scrollbar-color:\s*hsl\(var\(--muted-foreground\) \/ 0\.42\) transparent/);
  assert.match(mobileNavigationSource, /<SheetTitle>Navigasi<\/SheetTitle>/);
  assert.match(mobileNavigationSource, /Bahagian semasa:/);
  assert.match(mobileNavigationSource, /aria-label="Navigasi mudah alih"/);
  assert.match(mobileNavigationSource, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(mobileNavigationSource, /border-primary bg-primary text-primary-foreground shadow-sm/);
  assert.match(mobileNavigationSource, /active \? "bg-primary-foreground text-primary" : "bg-primary\/10 text-primary"/);
  assert.match(mobileNavigationSource, /rounded-full bg-primary-foreground px-2 py-0\.5 text-\[10px\] font-semibold uppercase tracking-\[0\.08em\] text-primary/);
  assert.match(navbarStyles, /\.nav-pill\.nav-pill-active\s*\{[\s\S]*color:\s*hsl\(var\(--primary-foreground\)\);/);
  assert.match(navbarStyles, /\.user-menu-role\s*\{[\s\S]*color:\s*hsl\(var\(--primary-foreground\)\);/);
  assert.doesNotMatch(navbarSource, /Open user menu|Open navigation menu/);
  assert.doesNotMatch(desktopNavigationSource, /Primary navigation|Scroll for more/);
  assert.doesNotMatch(scrollHintSource, /Scroll for more/);
  assert.doesNotMatch(mobileNavigationSource, /Mobile navigation|Current section:/);
  assert.doesNotMatch(mobileNavigationSource, /border-primary\/35 bg-primary\/10 text-primary shadow-sm/);
});
