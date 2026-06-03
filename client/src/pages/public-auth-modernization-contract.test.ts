import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readThemeTokenSource } from "../lib/theme-token-source.test-helper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPageSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("login page uses the compact modern shell without animated orb layers", () => {
  const source = `${readPageSource("Login.tsx")}\n${readPageSource("LoginParts.tsx")}`;
  const css = readPageSource("Login.css");

  assert.match(source, /login-card login-card-grid/);
  assert.match(source, /className="login-shell relative w-full"/);
  assert.doesNotMatch(source, /login-shell[^"]*max-w-5xl/);
  assert.match(css, /\.login-shell\s*{\s*max-width: min\(32rem, 100%\);/);
  assert.doesNotMatch(source, /login-bg-orb--/);
  assert.doesNotMatch(source, /floating-slow/);
  assert.match(source, /<form className="login-form space-y-4" onSubmit=\{handleSubmit\} noValidate/);
  assert.match(source, /aria-label="Papar kata laluan"/);
  assert.match(source, /aria-label="Sembunyi kata laluan"/);
  assert.match(source, /aria-pressed="false"/);
  assert.match(source, /aria-pressed="true"/);
  assert.match(source, /className="login-alert--warning-subtext mt-1 text-xs"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
});

test("public auth recovery pages expose labels and decorative icons correctly", () => {
  const forgotSource = readPageSource("ForgotPassword.tsx");
  const activateSource = `${readPageSource("ActivateAccount.tsx")}\n${readPageSource("ActivateAccountParts.tsx")}`;
  const resetSource = readPageSource("ResetPassword.tsx");

  assert.match(forgotSource, /<label htmlFor="forgot-password-identifier" className="public-auth-field-label">/);
  assert.match(forgotSource, /showBackButton=\{false\}/);
  assert.match(activateSource, /<label htmlFor="activate-account-new-password" className="public-auth-field-label">/);
  assert.match(activateSource, /<dl className="public-auth-account-summary">/);
  assert.match(activateSource, /visualMode="minimal"/);
  assert.match(activateSource, /showBackButton=\{false\}/);
  assert.match(resetSource, /<label htmlFor="reset-password-new-password" className="public-auth-field-label">/);
  assert.match(resetSource, /<dl className="public-auth-account-summary">/);
  assert.match(resetSource, /visualMode="minimal"/);
  assert.match(resetSource, /showBackButton=\{false\}/);
  assert.match(forgotSource, /aria-hidden="true" focusable="false"/);
  assert.match(activateSource, /aria-hidden="true" focusable="false"/);
  assert.match(resetSource, /aria-hidden="true" focusable="false"/);
});

test("maintenance page keeps timer cleanup logic while using the modern status layout", () => {
  const source = readPageSource("Maintenance.tsx");

  assert.match(source, /maintenance-page__status-grid/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /clearManagedInterval\(pollIntervalId\)/);
  assert.match(source, /window\.clearInterval\(tick\)/);
  assert.match(source, /activeController\?\.abort\(\)/);
});

test("single-tab blocked page uses readable token-based copy and accessible guidance", () => {
  const source = readPageSource("SingleTabBlocked.tsx");
  const css = readPageSource("SingleTabBlocked.css");

  assert.match(source, /import "\.\/SingleTabBlocked\.css";/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /role="list" aria-label="Pilihan untuk meneruskan penggunaan sistem"/);
  assert.match(source, /aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(source, /text-white/);
  assert.match(css, /\.single-tab-blocked__notice\s*{/);
  assert.match(css, /color:\s*var\(--public-auth-text-soft\);/);
  assert.match(css, /\.single-tab-blocked__actions\s*{/);
});

test("landing and public auth theme use a dark SQR backdrop with elevated light auth surfaces", () => {
  const landingCss = readPageSource("Landing.css");
  const tokenSource = readThemeTokenSource();

  assert.match(tokenSource, /--public-auth-layout-bg: linear-gradient\(135deg, hsl\(222 47% 9%\)/);
  assert.match(tokenSource, /--public-auth-shell-surface-strong: hsl\(0 0% 100% \/ 0\.98\);/);
  assert.match(landingCss, /\.landing-hero-panel\s*{/);
  assert.match(landingCss, /--landing-primary:\s*hsl\(221 83% 53%\);/);
  assert.match(landingCss, /--landing-trust:\s*hsl\(154 58% 32%\);/);
  assert.match(landingCss, /--landing-amber:\s*hsl\(36 84% 39%\);/);
  assert.match(landingCss, /background:\s*linear-gradient\(180deg, var\(--landing-surface\), var\(--landing-surface-muted\)\);/);
  assert.match(landingCss, /\.landing-placeholder-footer-shell\s*{/);
});

test("landing hero uses compact modular preview sections", () => {
  const landingSource = readPageSource("Landing.tsx");
  const heroShellSource = readPageSource("LandingHeroShell.tsx");
  const insightSource = readPageSource("LandingHeroInsightStrip.tsx");
  const previewSource = readPageSource("LandingProductPreview.tsx");
  const smokeSource = readPageSource("../../../scripts/ui-smoke.mjs");

  assert.match(landingSource, /<LandingHeroInsightStrip \/>/);
  assert.match(landingSource, /rightPane=\{<LandingProductPreview \/>\}/);
  assert.doesNotMatch(landingSource, /landing-feature-card/);
  assert.match(heroShellSource, /Log Masuk ke Sistem/);
  assert.match(insightSource, /role="list"/);
  assert.match(previewSource, /landing-workspace-preview/);
  assert.match(previewSource, /role="group"/);
  assert.match(smokeSource, /\^\(Log In\|Log Masuk\)\$/);
});
