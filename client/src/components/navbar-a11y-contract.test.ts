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
  const mobileNavigationSource = readSource("NavbarMobileNavigation.tsx");
  const scrollHintSource = readSource("HorizontalScrollHint.tsx");

  assert.match(navbarSource, /aria-label="Buka menu navigasi"/);
  assert.match(navbarSource, /aria-label=\{`Buka menu pengguna untuk \$\{username\}`\}/);
  assert.match(navbarSource, /\{\[\.\.\.username\]\[0\] \|\| ""\}/);
  assert.match(homeButtonSource, /aria-label="Utama"/);
  assert.match(homeButtonSource, />Utama<\/span>/);
  assert.match(desktopNavigationSource, /aria-label="Navigasi utama"/);
  assert.match(desktopNavigationSource, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(desktopNavigationSource, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(desktopNavigationSource, /aria-current=\{activeItem \? "page" : undefined\}/);
  assert.match(scrollHintSource, /hint = "Tatal untuk lagi"/);
  assert.match(mobileNavigationSource, /<SheetTitle>Navigasi<\/SheetTitle>/);
  assert.match(mobileNavigationSource, /Bahagian semasa:/);
  assert.match(mobileNavigationSource, /aria-label="Navigasi mudah alih"/);
  assert.match(mobileNavigationSource, /aria-current=\{active \? "page" : undefined\}/);
  assert.doesNotMatch(navbarSource, /Open user menu|Open navigation menu/);
  assert.doesNotMatch(desktopNavigationSource, /Primary navigation|Scroll for more/);
  assert.doesNotMatch(scrollHintSource, /Scroll for more/);
  assert.doesNotMatch(mobileNavigationSource, /Mobile navigation|Current section:/);
});
