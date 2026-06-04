import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readThemeTokenSource } from "./theme-token-source.test-helper";

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), "client/src", relativePath), "utf8");
}

test("dark mode exposes neutral corporate semantic tokens", () => {
  const tokenSource = readThemeTokenSource();

  assert.match(tokenSource, /--color-bg:\s*rgb\(14, 14, 14\);/);
  assert.match(tokenSource, /--color-bg-soft:\s*rgb\(22, 22, 22\);/);
  assert.match(tokenSource, /--color-surface:\s*rgb\(32, 32, 31\);/);
  assert.match(tokenSource, /--color-surface-elevated:\s*rgb\(50, 50, 49\);/);
  assert.match(tokenSource, /--color-border:\s*rgba\(102, 99, 91, 0\.55\);/);
  assert.match(tokenSource, /--color-primary:\s*rgb\(86, 156, 212\);/);
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
  assert.doesNotMatch(pageSources, /dark:(from|via|to)-slate-/);
  assert.doesNotMatch(pageSources, /dark:(?:bg|shadow|focus-visible:ring-offset)-\[hsl\(22[0-9]_/);
});
