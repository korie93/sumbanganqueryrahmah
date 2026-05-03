import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPageSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("login page uses the compact modern shell without animated orb layers", () => {
  const source = readPageSource("Login.tsx");

  assert.match(source, /login-card login-card-grid/);
  assert.doesNotMatch(source, /login-bg-orb--/);
  assert.doesNotMatch(source, /floating-slow/);
  assert.match(source, /aria-label="Papar kata laluan"/);
  assert.match(source, /aria-label="Sembunyi kata laluan"/);
});

test("public auth recovery pages expose labels and decorative icons correctly", () => {
  const forgotSource = readPageSource("ForgotPassword.tsx");
  const activateSource = readPageSource("ActivateAccount.tsx");
  const resetSource = readPageSource("ResetPassword.tsx");

  assert.match(forgotSource, /<label htmlFor="forgot-password-identifier" className="public-auth-field-label">/);
  assert.match(activateSource, /<label htmlFor="activate-account-new-password" className="public-auth-field-label">/);
  assert.match(activateSource, /<dl className="public-auth-account-summary">/);
  assert.match(resetSource, /<label htmlFor="reset-password-new-password" className="public-auth-field-label">/);
  assert.match(resetSource, /<dl className="public-auth-account-summary">/);
  assert.match(forgotSource, /aria-hidden="true" focusable="false"/);
  assert.match(activateSource, /aria-hidden="true" focusable="false"/);
  assert.match(resetSource, /aria-hidden="true" focusable="false"/);
});

test("maintenance page keeps timer cleanup logic while using the modern status layout", () => {
  const source = readPageSource("Maintenance.tsx");

  assert.match(source, /maintenance-page__status-grid/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /window\.clearInterval\(pollIntervalId\)/);
  assert.match(source, /window\.clearInterval\(tick\)/);
  assert.match(source, /activeController\?\.abort\(\)/);
});
