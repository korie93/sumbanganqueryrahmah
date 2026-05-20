import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

  assert.match(loginSource, /<h1 className="login-title/);
  assert.doesNotMatch(loginSource, /<h2 className="login-title/);
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
  const tokensImportIndex = mainSource.indexOf('import "./theme-tokens.css";');
  const publicShellImportIndex = mainSource.indexOf('import "./public-shell.css";');

  assert.notEqual(unhandledIndex, -1);
  assert.notEqual(lowSpecIndex, -1);
  assert.notEqual(tokensImportIndex, -1);
  assert.notEqual(publicShellImportIndex, -1);
  assert.ok(unhandledIndex < lowSpecIndex);
  assert.ok(tokensImportIndex < publicShellImportIndex);
  assert.match(mainSource, /import \{ StrictMode \} from "react";/);
  assert.match(mainSource, /createRoot\(rootElement\)\.render\(\s*<StrictMode>/);
  assert.doesNotMatch(mainSource, /import\.meta\.env\.DEV \?/);
});

test("browser color scheme metadata matches the light and dark token strategy", () => {
  const indexSource = readClientSource("../../index.html");

  assert.match(indexSource, /<meta name="color-scheme" content="light dark" \/>/);
  assert.match(indexSource, /<meta name="mobile-web-app-capable" content="yes" \/>/);
  assert.match(indexSource, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
});
