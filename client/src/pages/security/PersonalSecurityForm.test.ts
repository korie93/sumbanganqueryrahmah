import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonalSecurityForm, type PersonalSecurityFormProps } from "./PersonalSecurityForm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("PersonalSecurityForm reuses the existing password and 2FA controls in English", () => {
  const card = readFileSync(path.join(__dirname, "PersonalSecurityForm.tsx"), "utf8");
  const source = card + readFileSync(path.join(__dirname, "../settings/TwoFactorSettingsPanel.tsx"), "utf8");

  assert.match(card, /Current password/);
  assert.match(card, /New password/);
  assert.match(card, /Confirm new password/);
  assert.match(card, /Update password/);
  assert.match(source, /Two-factor authentication/);
  assert.match(source, /6-digit authenticator code/);
  assert.match(source, /autoComplete="current-password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /autoComplete="one-time-code"/);
  assert.match(card, /<TwoFactorSettingsPanel/);
  assert.match(card, /locale="en"/);
  assert.equal((card.match(/capsLockMessage="Caps Lock is on\."/g) ?? []).length, 3);

  assert.doesNotMatch(source, />Account Security</);
  assert.doesNotMatch(card, /Kata laluan|Mengemas kini|Tukar kata laluan/);
  assert.doesNotMatch(source, /onChangeUsername|accountUsername|accountRole|LogOut|Logout/);
});

function fixture(overrides: Partial<PersonalSecurityFormProps> = {}): PersonalSecurityFormProps {
  return {
    currentUserRole: "admin", currentPasswordInput: "", currentPasswordError: null,
    newPasswordInput: "", newPasswordError: null, confirmPasswordInput: "", confirmPasswordError: null,
    passwordSaving: false, passwordExpanded: false,
    twoFactorEnabled: false, twoFactorPendingSetup: false, twoFactorLoading: false,
    twoFactorPasswordInput: "", twoFactorPasswordError: null, twoFactorCodeInput: "", twoFactorCodeError: null,
    twoFactorSetupSecret: "", twoFactorSetupUri: "", twoFactorSetupAccountName: "", twoFactorSetupIssuer: "",
    onPasswordExpandedChange() {}, onChangePassword() {}, onClearPassword() {},
    onCurrentPasswordInputChange() {}, onCurrentPasswordBlur() {}, onNewPasswordInputChange() {}, onNewPasswordBlur() {},
    onConfirmPasswordInputChange() {}, onConfirmPasswordBlur() {}, onStartTwoFactorSetup() {}, onEnableTwoFactor() {}, onDisableTwoFactor() {},
    onTwoFactorPasswordInputChange() {}, onTwoFactorPasswordBlur() {}, onTwoFactorCodeInputChange() {}, onTwoFactorCodeBlur() {},
    ...overrides,
  };
}
const render = (overrides: Partial<PersonalSecurityFormProps> = {}) => renderToStaticMarkup(createElement(PersonalSecurityForm, fixture(overrides)));

test("expanded personal password form uses English feedback and the authoritative shared policy", () => {
  const markup = render({ passwordExpanded: true, newPasswordInput: "weak", confirmPasswordInput: "different" });
  assert.match(markup, /Current password/);
  assert.match(markup, /Confirm new password/);
  assert.match(markup, /Show current password/);
  assert.match(markup, /Show new password/);
  assert.match(markup, /Show password confirmation/);
  assert.match(markup, /Password must be at least 14 characters/);
  assert.match(markup, /Password confirmation does not match/);
  assert.match(markup, /Changing your password ends your active sessions/);
  assert.match(markup, /Activate 2FA/);
  assert.doesNotMatch(markup, /Kata laluan|Pengesahan|Lihat|Sahkan|recovery codes|Log out other devices/i);
});

test("personal Security preserves the existing role policy without hiding password self-service", () => {
  for (const currentUserRole of ["user", "manager"]) {
    const markup = render({ currentUserRole });
    assert.match(markup, /data-testid="security-change-password"/);
    assert.match(markup, /data-testid="two-factor-unavailable"/);
    assert.match(markup, /current security policy/);
    assert.doesNotMatch(markup, /data-testid="two-factor-settings"|Activate 2FA|<input/);
  }
  for (const currentUserRole of ["admin", "superuser"]) {
    assert.match(render({ currentUserRole }), /data-testid="two-factor-settings"/);
  }
});

test("busy personal form disables all password mutation actions", () => {
  const markup = render({ passwordExpanded: true, passwordSaving: true });
  assert.match(markup, /Updating\.\.\./);
  assert.equal((markup.match(/<input[^>]*disabled=""/g) ?? []).length, 3);
  assert.match(markup, /<button[^>]*type="submit"[^>]*disabled=""/);
});

test("the canonical password hook submits only password fields and guards cancellation and concurrent submits", () => {
  const source = readFileSync(path.join(__dirname, "../settings/useSettingsMyAccountCredentialState.ts"), "utf8");
  assert.match(source, /changeMyPassword\(\{/);
  assert.match(source, /currentPassword: currentPasswordInput/);
  assert.match(source, /newPassword: newPasswordInput/);
  assert.match(source, /signal: controller.signal/);
  assert.match(source, /requestRef.current \|\| accountKeyRef.current !== accountKey/);
  assert.match(source, /requestRef.current\?\.abort\(\)/);
  assert.match(source, /if \(response.forceLogout\) forceLogoutAfterPasswordChange\(\)/);
  assert.doesNotMatch(source, /updateMyCredentials|newUsername|email:|role:|permissions:|console\./);
});
