import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readCssWithImports, readThemeTokenSource } from "./theme-token-source.test-helper";

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), "client/src", relativePath), "utf8");
}

test("dark mode exposes neutral corporate semantic tokens", () => {
  const tokenSource = readThemeTokenSource();

  assert.match(tokenSource, /--dm-bg:\s*#0e0e0e;/);
  assert.match(tokenSource, /--dm-surface:\s*#1b1b1b;/);
  assert.match(tokenSource, /--dm-surface-elevated:\s*#232323;/);
  assert.match(tokenSource, /--dm-sidebar-icon:\s*#d4d4d4;/);
  assert.match(tokenSource, /--dm-focus-ring:\s*rgba\(86, 156, 212, 0\.45\);/);
  assert.match(tokenSource, /--color-bg:\s*var\(--dm-bg\);/);
  assert.match(tokenSource, /--color-surface:\s*var\(--dm-surface\);/);
  assert.match(tokenSource, /--color-primary:\s*var\(--dm-primary\);/);
  assert.match(tokenSource, /\.dark\s*{[\s\S]*--background:\s*0 0% 5\.5%;/);
  assert.doesNotMatch(tokenSource, /\.dark\s*{[\s\S]*--background:\s*222 47% 11%;/);
});

test("dark mode suppresses glassmorphism and old blue page backdrops", () => {
  const glassWrapperCss = readClientSource("components/GlassWrapper.css");
  const indexCss = readClientSource("index.css");
  const loginCss = readClientSource("pages/Login.css");
  const publicAuthCss = readClientSource("components/PublicAuthLayout.css");
  const floatingAiCss = readClientSource("components/FloatingAI.module.css");
  const navbarCss = readClientSource("components/Navbar.css");
  const mainSource = readClientSource("main.tsx");
  const themeCss = readCssWithImports(path.resolve(process.cwd(), "client/src/styles/theme/index.css"));
  const pageSources = [
    readClientSource("pages/AI.tsx"),
    readClientSource("pages/Import.tsx"),
    readClientSource("pages/HomeSections.tsx"),
    readClientSource("pages/GeneralSearch.tsx"),
    readClientSource("components/navigation/SideTabNavigation.tsx"),
    readClientSource("pages/collection-report/CollectionSidebar.tsx"),
    readClientSource("pages/settings/SettingsSidebar.tsx"),
    readClientSource("pages/settings/account-management/UserAccountManagementNav.tsx"),
  ].join("\n");

  assert.match(mainSource, /import "\.\/styles\/theme\/index\.css";/);
  assert.match(themeCss, /\.dark :where\([\s\S]*\[class\*="backdrop-blur"\]/);
  assert.match(themeCss, /\.dark :where\([\s\S]*\.glass-wrapper/);
  assert.match(themeCss, /\.dark :where\([\s\S]*\.side-tab-nav/);
  assert.match(themeCss, /background:\s*var\(--dm-surface\) !important;/);
  assert.match(themeCss, /color:\s*var\(--dm-sidebar-icon-active\) !important;/);
  assert.match(
    glassWrapperCss,
    /\.dark \.glass-wrapper\s*{[\s\S]*background:\s*hsl\(var\(--card\) \/ 1\);/,
  );
  assert.match(
    glassWrapperCss,
    /\.dark \.glass-wrapper\s*{[\s\S]*backdrop-filter:\s*none !important;/,
  );
  assert.match(indexCss, /\.dark :where\(\[class\*="backdrop-blur"\]\)\s*{/);
  assert.match(loginCss, /\.dark \.login-card\s*{[\s\S]*backdrop-filter:\s*none !important;/);
  assert.match(
    publicAuthCss,
    /\.dark \.public-auth-layout:not\(\.public-auth-layout--minimal\) \.public-auth-layout__card\s*{[\s\S]*backdrop-filter:\s*none !important;/,
  );
  assert.match(floatingAiCss, /:global\(\.dark\) \.floatingMobileBackdrop\s*{[\s\S]*backdrop-filter:\s*none !important;/);
  assert.match(navbarCss, /\.dark \.navbar-premium-glass\s*{[\s\S]*backdrop-filter:\s*none !important;/);
  assert.match(pageSources, /side-tab-nav/);
  assert.match(pageSources, /data-active=\{active \? "true" : "false"\}/);
  assert.doesNotMatch(pageSources, /dark:(from|via|to)-/);
  assert.doesNotMatch(pageSources, /dark:bg-white\/\[/);
  assert.doesNotMatch(pageSources, /dark:(?:bg|shadow|focus-visible:ring-offset)-\[hsl\(22[0-9]_/);
});
