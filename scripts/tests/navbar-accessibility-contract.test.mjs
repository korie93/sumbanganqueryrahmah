import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readComponent(relativePath) {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

test("navbar decorative icons stay hidden from assistive technology", () => {
  const navbar = readComponent("client/src/components/Navbar.tsx");
  const homeButton = readComponent("client/src/components/NavbarHomeButton.tsx");
  const desktopNavigation = readComponent("client/src/components/NavbarDesktopNavigation.tsx");
  const mobileNavigation = readComponent("client/src/components/NavbarMobileNavigation.tsx");
  const userMenu = readComponent("client/src/components/NavbarUserMenuContent.tsx");

  assert.match(navbar, /<Menu className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(navbar, /<ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" \/>/);
  assert.match(homeButton, /<Home className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(desktopNavigation, /<ChevronDown className="h-3\.5 w-3\.5 opacity-70" aria-hidden="true" \/>/);
  assert.match(mobileNavigation, /<Icon className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(userMenu, /<Sun className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(userMenu, /<Moon className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(userMenu, /<LogOut className="h-4 w-4" aria-hidden="true" \/>/);
});

test("navbar menu triggers expose expanded state and controlled content ids", () => {
  const navbar = readComponent("client/src/components/Navbar.tsx");

  assert.match(navbar, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(navbar, /aria-controls="mobile-navigation-drawer"/);
  assert.match(navbar, /aria-expanded=\{mobileUserMenuOpen\}/);
  assert.match(navbar, /aria-controls=\{mobileUserMenuId\}/);
  assert.match(navbar, /aria-expanded=\{desktopUserMenuOpen\}/);
  assert.match(navbar, /aria-controls=\{desktopUserMenuId\}/);
});
