import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordConfirmationFeedback, getPasswordConfirmationFeedback } from "./PasswordConfirmationFeedback";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { isCredentialPasswordPolicyCompliant, getCredentialPasswordValidationIssues } from "@shared/password-policy";
import { CollectionNicknameDialogStepFields } from "../pages/collection-report/CollectionNicknameDialogStepFields";
import { MyAccountSecurityCard } from "../pages/settings/MyAccountSecurityCard";

// These node:test assertions inspect markup, not styling. The actual stylesheet
// is exercised by the browser contract; Node's ESM loader cannot evaluate CSS.
const stylesheetHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    return nextLoad(url, context);
  },
});
const { ActivationPasswordForm } = await import("../pages/ActivateAccountParts");
stylesheetHook.deregister();

function getActivationInputMarkup(markup: string, field: "new" | "confirm") {
  const input = markup.match(new RegExp(`<input[^>]*id="activate-account-${field}-password"[^>]*>`))?.[0];
  assert.ok(input, `Activation ${field} password input must exist.`);
  return input;
}

test("matching is live, exact, and independent from password validity", () => {
  assert.equal(getPasswordConfirmationFeedback("", ""), null);
  assert.equal(getPasswordConfirmationFeedback("valid", ""), null);
  assert.equal(getPasswordConfirmationFeedback("", "previous-value")?.matches, false);
  assert.equal(getPasswordConfirmationFeedback("short", "short")?.matches, true);
  assert.equal(isCredentialPasswordPolicyCompliant("short"), false);
  assert.equal(getPasswordConfirmationFeedback(" value", "value")?.matches, false);
  const matching = renderToStaticMarkup(createElement(PasswordConfirmationFeedback, {
    id: "confirmation", password: "short", confirmation: "short", requiredError: "stale mismatch",
  }));
  assert.match(matching, /Pengesahan kata laluan sepadan/);
  assert.doesNotMatch(matching, /stale mismatch|short/);
  assert.match(matching, /aria-live="polite"/);
  const mismatch = renderToStaticMarkup(createElement(PasswordConfirmationFeedback, {
    id: "confirmation", password: "new-value", confirmation: "previous-value",
  }));
  assert.match(mismatch, /tidak sepadan/);
  assert.doesNotMatch(mismatch, /new-value|previous-value/);
});

test("password meter does not confuse heuristic strength with accepted shared policy", () => {
  for (const password of ["", "Ab7!xQ2@", "Tr0ub4dor&3-xx", "lowercaselong1!", "UPPERCASELONG1!", "NoDigitsPresent!", "NoSymbolPresent123", `${"a".repeat(256)}A1!`, "Tr0ub4dor&3-Long"]) {
    const markup = renderToStaticMarkup(createElement(PasswordStrengthMeter, { password }));
    assert.equal(markup.includes("Kata laluan sah"), isCredentialPasswordPolicyCompliant(password));
    for (const issue of getCredentialPasswordValidationIssues(password, "ms")) {
      assert.ok(markup.includes(issue.message), `missing feedback for ${issue.code}`);
    }
    if (password) assert.equal(markup.includes(password), false, "password must not appear in feedback DOM");
  }
});

test("Collection setup renders shared rules and independent confirmation while login accepts temporary length", () => {
  const props = {
    confirmNicknamePassword: "Ab7!xQ2@", dialogStep: "setup" as const, nicknameInput: "staff",
    nicknamePassword: "Ab7!xQ2@", onConfirmNicknamePasswordChange() {}, onNicknameInputChange() {},
    onNicknamePasswordChange() {}, onToggleLoginPassword() {}, onToggleSetupConfirmPassword() {},
    onToggleSetupPassword() {}, resolvedNickname: "staff", setupMode: "forced-change" as const,
    showLoginPassword: false, showSetupConfirmPassword: false, showSetupPassword: false, submittingNicknameAuth: false,
  };
  const setup = renderToStaticMarkup(createElement(CollectionNicknameDialogStepFields, props));
  assert.match(setup, /Minimum 14 aksara/);
  assert.match(setup, /Password mesti sekurang-kurangnya 14 aksara/);
  assert.match(setup, /Pengesahan kata laluan sepadan/);
  assert.match(setup, /aria-describedby="collection-nickname-password-policy"/);
  const login = renderToStaticMarkup(createElement(CollectionNicknameDialogStepFields, { ...props, dialogStep: "login" }));
  assert.doesNotMatch(login, /Password mesti sekurang-kurangnya|Minimum 14/);
  assert.match(login, /autoComplete="current-password"/i);
});

test("activation form shows policy validity independently from a live mismatch", () => {
  const markup = renderToStaticMarkup(createElement(ActivationPasswordForm, {
    activation: { username: "operator", email: null, fullName: null, role: "user", expiresAt: "2026-09-12T12:00:00Z" },
    confirmPassword: "previous-input", confirmPasswordError: "", confirmPasswordInvalidProps: {}, error: "", loading: false,
    newPassword: "Tr0ub4dor&3-Long", newPasswordInteracted: true, newPasswordError: "", newPasswordInputRef: null, newPasswordInvalidProps: {},
    onActivate() {}, onClearConfirmPasswordError() {}, onClearFormError() {}, onClearNewPasswordError() {},
    onConfirmPasswordBlur() {}, onConfirmPasswordChange() {}, onNewPasswordBlur() {}, onNewPasswordChange() {},
  }));
  assert.match(markup, /Kata laluan sah/);
  assert.match(markup, /Pengesahan kata laluan tidak sepadan/);
  assert.match(markup, /aria-invalid="true" aria-describedby="activate-password-confirm-error"/);
  assert.match(getActivationInputMarkup(markup, "new"), /data-validation-state="success"/);
  assert.match(getActivationInputMarkup(markup, "confirm"), /data-validation-state="error"/);
});

test("activation form keeps untouched fields neutral and marks policy and matching states separately", () => {
  const baseProps = {
    activation: { username: "operator", email: null, fullName: null, role: "user", expiresAt: "2026-09-12T12:00:00Z" },
    confirmPassword: "", confirmPasswordError: "", confirmPasswordInvalidProps: {}, error: "", loading: false,
    newPassword: "", newPasswordError: "", newPasswordInputRef: null, newPasswordInvalidProps: {},
    onActivate() {}, onClearConfirmPasswordError() {}, onClearFormError() {}, onClearNewPasswordError() {},
    onConfirmPasswordBlur() {}, onConfirmPasswordChange() {}, onNewPasswordBlur() {}, onNewPasswordChange() {},
  };
  const initial = renderToStaticMarkup(createElement(ActivationPasswordForm, baseProps));
  assert.match(getActivationInputMarkup(initial, "new"), /data-validation-state="neutral"/);
  assert.match(getActivationInputMarkup(initial, "confirm"), /data-validation-state="neutral"/);
  assert.doesNotMatch(initial, /aria-invalid="true"/);

  const invalidButMatching = renderToStaticMarkup(createElement(ActivationPasswordForm, {
    ...baseProps, newPassword: "short", confirmPassword: "short", newPasswordInteracted: true,
  }));
  assert.match(getActivationInputMarkup(invalidButMatching, "new"), /data-validation-state="error"/);
  assert.match(getActivationInputMarkup(invalidButMatching, "new"), /aria-invalid="true"/);
  assert.match(getActivationInputMarkup(invalidButMatching, "confirm"), /data-validation-state="success"/);

  const cleared = renderToStaticMarkup(createElement(ActivationPasswordForm, {
    ...baseProps, newPasswordInteracted: true,
  }));
  assert.match(getActivationInputMarkup(cleared, "new"), /data-validation-state="error"/);
  assert.match(getActivationInputMarkup(cleared, "confirm"), /data-validation-state="neutral"/);
});

test("2FA setup renders exact algorithm requirements without a remote QR or secret transmission", () => {
  const props = {
    confirmPasswordInput: "", confirmPasswordError: null, currentPasswordInput: "", currentPasswordError: null,
    currentUserRole: "admin", newPasswordInput: "", newPasswordError: null,
    onDisableTwoFactor() {}, onEnableTwoFactor() {}, onChangePassword() {}, onChangeUsername() {},
    onConfirmPasswordBlur() {}, onConfirmPasswordInputChange() {}, onCurrentPasswordBlur() {}, onCurrentPasswordInputChange() {},
    onNewPasswordBlur() {}, onNewPasswordInputChange() {}, onStartTwoFactorSetup() {}, onTwoFactorCodeBlur() {},
    onTwoFactorCodeInputChange() {}, onTwoFactorPasswordBlur() {}, onTwoFactorPasswordInputChange() {}, onUsernameBlur() {}, onUsernameInputChange() {},
    passwordSaving: false, twoFactorCodeError: null, twoFactorCodeInput: "", twoFactorEnabled: false, twoFactorLoading: false,
    twoFactorPasswordError: null, twoFactorPasswordInput: "", twoFactorPendingSetup: true, twoFactorSetupAccountName: "operator",
    twoFactorSetupIssuer: "SQR", twoFactorSetupSecret: "TESTONLY", twoFactorSetupUri: "otpauth://totp/SQR:operator?secret=TESTONLY&algorithm=SHA256&digits=6&period=30",
    usernameError: null, usernameInput: "operator", usernameSaving: false,
  };
  const markup = renderToStaticMarkup(createElement(MyAccountSecurityCard, props));
  assert.match(markup, /algoritma SHA256, 6 digit/);
  assert.match(markup, /sela 30 saat/);
  assert.match(markup, /Jangan gunakan tetapan lalai SHA1 untuk rahsia SHA256/);
  assert.match(markup, /masa telefon ditetapkan secara automatik/);
  assert.doesNotMatch(markup, /(?:src|href)="https?:\/\/[^\"]*(?:TESTONLY|secret=)/);
  const invalid = renderToStaticMarkup(createElement(MyAccountSecurityCard, { ...props, twoFactorSetupUri: "" }));
  assert.match(invalid, /Tetapan pengesah tidak lengkap/);
  assert.match(invalid, /<button[^>]*disabled=""[^>]*>Sahkan dan aktifkan 2FA<\/button>/);
});
