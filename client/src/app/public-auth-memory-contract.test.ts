import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readThemeTokenSource } from "../lib/theme-token-source.test-helper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

function readFirstCssRuleBlock(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*{([^}]*)}`));
  return match?.[1] ?? "";
}

test("public authentication routes do not warm the authenticated shell before login succeeds", () => {
  const appSource = readClientSource("../App.tsx");
  const loginSource = readClientSource("../pages/Login.tsx");
  const authenticatedEntrySource = readClientSource("AuthenticatedAppEntry.tsx");

  assert.doesNotMatch(
    appSource,
    /currentPage === "home"[\s\S]{0,180}LoginPage\.preload\s*\(/,
  );
  assert.doesNotMatch(loginSource, /authenticated-entry-lazy/);
  assert.doesNotMatch(loginSource, /AuthenticatedAppEntry\.preload\s*\(/);
  assert.doesNotMatch(authenticatedEntrySource, /AuthenticatedAppShell\.preload\s*\(/);
});

test("login shell avoids persistent compositor hints on large decorative layers", () => {
  const loginCss = readClientSource("../pages/Login.css");

  assert.doesNotMatch(readFirstCssRuleBlock(loginCss, ".login-bg-orb"), /will-change:/);
  assert.doesNotMatch(readFirstCssRuleBlock(loginCss, ".login-content"), /will-change:/);
});

test("forgot password route uses lightweight auth chrome without eager recovery preloading", () => {
  const appSource = readClientSource("../App.tsx");
  const forgotPasswordSource = readClientSource("../pages/ForgotPassword.tsx");
  const publicAuthCss = readClientSource("../components/PublicAuthLayout.css");

  assert.doesNotMatch(appSource, /ForgotPasswordPage\.preload\s*\(/);
  assert.match(forgotPasswordSource, /visualMode="minimal"/);
  assert.match(publicAuthCss, /\.public-auth-layout--minimal\s+\.public-auth-layout__glow/);
  assert.match(
    publicAuthCss,
    /\.public-auth-layout:not\(\.public-auth-layout--minimal\)\s+\.public-auth-layout__card/,
  );
});

test("public auth recovery routes receive SPA navigation callbacks", () => {
  const appSource = readClientSource("../App.tsx");
  const activateSource = readClientSource("../pages/ActivateAccount.tsx");
  const resetPasswordSource = readClientSource("../pages/ResetPassword.tsx");

  assert.match(appSource, /<BannedPage onRetryLogin=\{handleBannedRetryLogin\}/);
  assert.match(appSource, /onBanned=\{handleBannedSessionDetected\}/);
  assert.match(appSource, /<ResetPasswordPage[\s\S]*onBackToHome=\{\(\) => handlePublicNavigate\("home"\)\}/);
  assert.match(appSource, /onBackToLogin=\{\(\) => handlePublicNavigate\("login"\)\}/);
  assert.match(activateSource, /onBackClick=\{navigateToLogin\}/);
  assert.match(resetPasswordSource, /const layoutBackProps = onBackToHome \? \{ onBackClick: onBackToHome \} : \{\};/);
  assert.match(resetPasswordSource, /onClick=\{navigateToLogin\}/);
});

test("glass wrapper base styles are owned by the component stylesheet", () => {
  const shellSource = readClientSource("AuthenticatedAppShell.tsx");
  const shellCss = readClientSource("AuthenticatedAppShell.css");
  const glassWrapperSource = readClientSource("../components/GlassWrapper.tsx");
  const glassWrapperCss = readClientSource("../components/GlassWrapper.css");

  assert.match(shellSource, /import "@\/components\/GlassWrapper\.css";/);
  assert.match(glassWrapperSource, /import "\.\/GlassWrapper\.css";/);
  assert.match(glassWrapperCss, /\.glass-wrapper\s*{/);
  assert.match(glassWrapperCss, /\.low-spec \.glass-wrapper/);
  assert.doesNotMatch(shellCss, /^\.glass-wrapper\s*{/m);
  assert.doesNotMatch(shellCss, /^\.low-spec \.glass-wrapper/m);
});

test("login page exposes real labels and a stable primary heading", () => {
  const loginSource = readClientSource("../pages/Login.tsx");
  const loginPartsSource = readClientSource("../pages/LoginParts.tsx");
  const combinedLoginSource = `${loginSource}\n${loginPartsSource}`;

  assert.match(combinedLoginSource, /<h1 className="login-title/);
  assert.doesNotMatch(combinedLoginSource, /<h2 className="login-title/);
  assert.match(loginSource, /<label htmlFor="login-username" className="login-field-label/);
  assert.match(loginSource, /<label htmlFor="login-password" className="login-field-label/);
  assert.match(loginSource, /<label htmlFor="login-two-factor-code" className="login-field-label/);
  assert.match(loginSource, /pattern="\[0-9\]\*"/);
});

test("client entry fails clearly if the app root is missing", () => {
  const mainSource = readClientSource("../main.tsx");

  assert.match(mainSource, /const rootElement = document\.getElementById\("root"\);/);
  assert.match(mainSource, /throw new Error\("SQR app root element was not found\."\);/);
  assert.doesNotMatch(mainSource, /createRoot\(document\.getElementById\("root"\)!\)/);
});

test("client entry installs unhandled rejection logging before low-spec detection and keeps StrictMode always enabled", () => {
  const mainSource = readClientSource("../main.tsx");
  const unhandledIndex = mainSource.indexOf("installGlobalUnhandledRejectionHandler();");
  const lowSpecIndex = mainSource.indexOf("if (detectLowSpecMode())");
  const tokensImportIndex = mainSource.indexOf('import "./styles/tokens/index.css";');
  const publicShellImportIndex = mainSource.indexOf('import "./public-shell.css";');

  assert.notEqual(unhandledIndex, -1);
  assert.notEqual(lowSpecIndex, -1);
  assert.notEqual(tokensImportIndex, -1);
  assert.notEqual(publicShellImportIndex, -1);
  assert.ok(unhandledIndex < lowSpecIndex);
  assert.ok(tokensImportIndex < publicShellImportIndex);
  assert.match(mainSource, /import \{ StrictMode \} from "react";/);
  assert.match(mainSource, /import \{ detectLowSpecMode \} from "\.\/lib\/low-spec-mode";/);
  assert.match(mainSource, /createRoot\(rootElement\)\.render\(\s*<StrictMode>/);
  assert.doesNotMatch(mainSource, /import\.meta\.env\.DEV \?/);
});

test("browser color scheme metadata matches the light and dark token strategy", () => {
  const indexSource = readClientSource("../../index.html");
  const tokenSource = readThemeTokenSource();

  assert.match(indexSource, /<html lang="ms">/);
  assert.match(indexSource, /<meta name="color-scheme" content="light dark" \/>/);
  assert.match(indexSource, /<meta name="mobile-web-app-capable" content="yes" \/>/);
  assert.doesNotMatch(indexSource, /apple-mobile-web-app-capable/);
  assert.match(indexSource, /<link rel="canonical" href="https:\/\/sqr-system\.com\/" \/>/);
  assert.match(indexSource, /<meta property="og:url" content="https:\/\/sqr-system\.com\/" \/>/);
  assert.match(indexSource, /<meta name="twitter:image" content="https:\/\/sqr-system\.com\/brand\/sqr-logo-minimal\.webp" \/>/);
  assert.doesNotMatch(indexSource, /<link rel="icon" type="image\/webp"/);
  assert.match(tokenSource, /\.dark\s*{[\s\S]*color-scheme:\s*dark;[\s\S]*--background:/);
  assert.doesNotMatch(
    tokenSource,
    /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*color-scheme:\s*dark;/,
  );
});

test("web app manifest exposes a lightweight internal shortcut", () => {
  const manifestSource = readClientSource("../../public/site.webmanifest");
  const manifest = JSON.parse(manifestSource) as {
    shortcuts?: Array<{ name?: string; url?: string }>;
  };

  assert.ok(Array.isArray(manifest.shortcuts));
  assert.deepEqual(manifest.shortcuts?.[0], {
    name: "Carian Rekod",
    short_name: "Carian",
    description: "Buka ruang carian rekod SQR.",
    url: "/general-search",
    icons: [
      {
        src: "/brand/sqr-logo-minimal.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  });
});

test("global visible scrollbars include Firefox styling", () => {
  const indexCss = readClientSource("../index.css");
  const themeTokensCss = readThemeTokenSource();
  const scrollbarBlock = readFirstCssRuleBlock(indexCss, ".scrollbar-visible");

  assert.match(themeTokensCss, /--scrollbar-size:\s*var\(--spacing-2\);/);
  assert.match(themeTokensCss, /--scrollbar-track:\s*hsl\(var\(--muted\) \/ 0\.45\);/);
  assert.match(themeTokensCss, /--scrollbar-thumb:\s*hsl\(var\(--primary\) \/ 0\.45\);/);
  assert.match(scrollbarBlock, /scrollbar-color:\s*var\(--scrollbar-thumb\) var\(--scrollbar-track\);/);
  assert.match(scrollbarBlock, /scrollbar-width:\s*thin;/);
});
