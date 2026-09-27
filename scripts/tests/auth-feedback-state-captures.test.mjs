import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../auth-feedback-browser.mjs", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../fixtures/auth-feedback-ui.jsx", import.meta.url), "utf8");

test("expanded auth screenshots remain loopback-only mocked component evidence", () => {
  assert.match(source, /configFile: false, envFile: false, envDir: false/);
  assert.match(source, /server: \{ host: "127\.0\.0\.1", port: 0/);
  assert.match(source, /if \(url\.origin !== origin\)[\s\S]*return route\.abort\(\)/);
  assert.match(source, /new URL\(page\.url\(\)\)\.origin, origin/);
  assert.match(source, /url\.pathname === "\/api\/auth\/request-password-reset"/);
  assert.match(source, /route\.request\(\)\.postDataJSON\(\)\.identifier, "ui\.fixture"/);
  assert.match(fixture, /view === "forgot"[\s\S]*<ForgotPassword onBackToLogin=/);
});

test("expanded screenshots mask credential and manual key values while retaining visible labels", () => {
  assert.match(source, /mask: \[page\.locator\('input\[type="password"\], #my-account-two-factor-secret, #my-account-two-factor-code, #login-two-factor-code'\)\]/);
  for (const state of [
    "forgot-ready", "forgot-empty-error", "forgot-pending", "forgot-submitted", "forgot-request-error",
    "change-ready", "change-empty-error", "change-success", "login-otp-ready", "login-otp-invalid",
    "two-factor-off", "two-factor-password", "two-factor-qr", "two-factor-manual", "two-factor-confirm",
    "two-factor-invalid", "two-factor-active", "two-factor-disable-confirm",
  ]) assert.ok(source.includes(`captureAuthState("${state}"`), `${state} is actually captured`);
  assert.match(source, /for \(const width of \[390, 1280\]\)/);
  assert.match(source, /for \(const theme of \["light", "dark"\]\)/);
  assert.match(source, /counts\.disable, beforeDisable, "Cancel never disables 2FA/);
  assert.match(source, /rule IDs\/selectors only, never input values or API data/);
  assert.doesNotMatch(source, /checkContrast|disableRules/);
  assert.match(source, /captureAuthState\("forgot-empty-error", theme\)/);
  assert.match(source, /await document\.fonts\.ready/);
  assert.match(source, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\)/);
  assert.match(source, /fullPage: true, animations: "disabled", caret: "hide"/);
});
