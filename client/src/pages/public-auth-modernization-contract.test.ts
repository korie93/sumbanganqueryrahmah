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

test("maintenance page uses shared accessible status and bounded manual recovery without countdown polling", () => {
  const source = readPageSource("Maintenance.tsx");
  const view = readPageSource("../components/system-status/SystemStatusView.tsx");
  const recovery = readPageSource("../components/system-status/useServiceRecovery.ts");

  assert.match(source, /<SystemStatusView/);
  assert.match(view, /role="status" aria-live="polite"/);
  assert.match(source, /useServiceRecovery\("maintenance"\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /window\.clearTimeout\(timeout\)/);
  assert.match(recovery, /active\.current\?\.abort\(\)/);
  assert.doesNotMatch(source, /setInterval|setManagedInterval|countdown/i);
  assert.doesNotMatch(recovery, /setInterval|setManagedInterval/);
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

test("public auth retains neutral dark-mode surfaces independently of landing", () => {
  const tokenSource = readThemeTokenSource();
  assert.match(tokenSource, /--public-auth-layout-bg:\s*var\(--dm-bg\);/);
  assert.match(tokenSource, /--public-auth-shell-surface-strong:\s*var\(--color-surface-elevated\);/);
  assert.match(tokenSource, /--login-card-border-gradient:\s*none;/);
});

test("V21 landing integrates modular React views without changing authentication", () => {
  const landing = readPageSource("Landing.tsx");
  const preview = readPageSource("landing-v21/ProductPreview.tsx");
  const links = readPageSource("landing-v21/LandingLink.tsx");
  assert.match(landing, /<ProductPreview/);
  assert.match(landing, /<TestimonialCarousel/);
  assert.match(landing, /id="main-content" tabIndex=\{-1\}/);
  assert.match(preview, /role="tablist"/);
  assert.match(preview, /role="tabpanel"/);
  assert.match(preview, /window.clearInterval/);
  assert.ok(links.includes('href === "/login"'));
  assert.match(links, /onLoginClick\(\)/);
  assert.doesNotMatch(landing + preview, /dangerouslySetInnerHTML|fetch\(/);
});
