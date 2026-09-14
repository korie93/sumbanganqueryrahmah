import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { TwoFactorSettingsPanel, type TwoFactorSettingsPanelProps } from "./TwoFactorSettingsPanel";

function fixture(overrides: Partial<TwoFactorSettingsPanelProps> = {}): TwoFactorSettingsPanelProps {
  return {
    busy: false, twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorLoading: false,
    twoFactorPasswordInput: "", twoFactorPasswordError: null, twoFactorCodeInput: "", twoFactorCodeError: null,
    twoFactorSetupSecret: "", twoFactorSetupUri: "", twoFactorSetupAccountName: "test.admin", twoFactorSetupIssuer: "SQR",
    onClearTwoFactorSetup() {}, onStartTwoFactorSetup() {}, onEnableTwoFactor() {}, onDisableTwoFactor() {},
    onTwoFactorPasswordInputChange() {}, onTwoFactorPasswordBlur() {}, onTwoFactorCodeInputChange() {}, onTwoFactorCodeBlur() {},
    ...overrides,
  };
}
const render = (overrides: Partial<TwoFactorSettingsPanelProps> = {}) => renderToStaticMarkup(createElement(TwoFactorSettingsPanel, fixture(overrides)));
const syntheticSecret = "TESTONLYTESTONLY";
const syntheticUri = `otpauth://totp/SQR:test.admin?secret=${syntheticSecret}&issuer=SQR&algorithm=SHA256&digits=6&period=30`;

test("OFF starts with one clear action, never asks for a code before setup", () => {
  const markup = render();
  assert.match(markup, /Status: Tidak aktif/);
  assert.match(markup, /Aktifkan 2FA/);
  assert.match(markup, /bukan dihantar melalui emel atau SMS/);
  assert.doesNotMatch(markup, /<input|Sahkan dan aktifkan|data-testid="two-factor-qr"/);
});

test("pending state without in-memory material offers explicit restart and no unusable confirmation", () => {
  const markup = render({ twoFactorPendingSetup: true });
  assert.match(markup, /Mulakan semula persediaan/);
  assert.match(markup, /gantikan entri SQR lama/);
  assert.doesNotMatch(markup, /<input|Sahkan dan aktifkan|data-testid="two-factor-qr"/);
});

test("SETUP uses a local responsive black-on-white QR and hides manual material by default", () => {
  const markup = render({ twoFactorPendingSetup: true, twoFactorSetupSecret: syntheticSecret, twoFactorSetupUri: syntheticUri,
    twoFactorSetupExpiresAt: "2026-09-14T04:30:00.000Z" });
  assert.match(markup, /data-two-factor-state="setup"/);
  assert.match(markup, /Langkah 2 daripada 3/);
  assert.match(markup, /Ente Auth/);
  assert.match(markup, /SHA256, 6 digit dan 30 saat/);
  assert.match(markup, /data-testid="two-factor-qr"/);
  assert.match(markup, /width="240"/);
  assert.match(markup, /fill="#ffffff"/);
  assert.match(markup, /fill="#000000"/);
  assert.match(markup, /max-w-full/);
  assert.match(markup, /Selesaikan sebelum/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /<input|otpauth:|TESTONLY|(?:src|href)="https?:/);
});

test("ACTIVE hides all setup material and requires explicit disable confirmation", () => {
  const markup = render({ twoFactorEnabled: true, twoFactorSetupSecret: syntheticSecret, twoFactorSetupUri: syntheticUri,
    twoFactorConfiguredAt: "2026-09-14T04:30:00.000Z" });
  assert.match(markup, /Status: Aktif/);
  assert.match(markup, /Aplikasi pengesah \(TOTP\)/);
  assert.match(markup, /Diaktifkan pada/);
  assert.match(markup, /Nyahaktifkan 2FA/);
  assert.doesNotMatch(markup, /<input|otpauth:|TESTONLY|data-testid="two-factor-qr"|Sahkan nyahaktifkan 2FA/);
});

test("malformed setup fails closed and expiry errors remain distinct from code errors", () => {
  const malformed = render({ twoFactorSetupSecret: syntheticSecret, twoFactorSetupUri: syntheticUri.replace("SHA256", "SHA512") });
  assert.match(malformed, /Tetapan aplikasi tidak lengkap/);
  assert.doesNotMatch(malformed, /data-testid="two-factor-qr"|Sahkan dan aktifkan/);
  const expired = render({ twoFactorPendingSetup: true, twoFactorActionError: "Persediaan tamat tempoh. Mulakan semula." });
  assert.match(expired, /role="alert"/);
  assert.match(expired, /Persediaan tamat tempoh/);
  assert.doesNotMatch(expired, /my-account-two-factor-code-error/);
});
