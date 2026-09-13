import assert from "node:assert/strict";
import test from "node:test";
import { assessCredentialPassword } from "@shared/password-policy";
import {
  getPasswordCreationFieldErrors,
  getPasswordCreationSubmitHint,
  getPasswordCreationValidationStates,
} from "./password-creation-feedback";

const validPassword = "TestPassword123!";

test("creation field states start neutral and remain evaluated after an interacted password is cleared", () => {
  assert.deepEqual(getPasswordCreationValidationStates({ newPassword: "", confirmPassword: "" }), {
    newPassword: "neutral", confirmPassword: "neutral",
  });
  assert.deepEqual(getPasswordCreationValidationStates({ newPassword: "", confirmPassword: "", newPasswordInteracted: true }), {
    newPassword: "error", confirmPassword: "neutral",
  });
});

test("new password field state uses the complete authoritative policy after interaction", () => {
  for (const newPassword of [
    "abcdefghijklmno", "Abcdefghijklmn1", "Abcdefghijklmn1!", "Aa1!", "UPPERCASE12345!",
    "NoDigitsPresent!", `${"a".repeat(252)}A1!a`, `${"a".repeat(253)}A1!a`, "  Abcdefghij1!  ",
  ]) {
    const states = getPasswordCreationValidationStates({ newPassword, confirmPassword: "", newPasswordInteracted: true });
    assert.equal(states.newPassword, assessCredentialPassword(newPassword, "ms").valid ? "success" : "error");
    assert.equal(states.confirmPassword, "neutral");
  }
});

test("confirmation field state is exact, independent of policy, and recomputes when the original changes", () => {
  const state = (newPassword: string, confirmPassword: string) => getPasswordCreationValidationStates({
    newPassword, confirmPassword, newPasswordInteracted: true,
  });
  assert.deepEqual(state("short", "short"), { newPassword: "error", confirmPassword: "success" });
  assert.deepEqual(state(validPassword, validPassword), { newPassword: "success", confirmPassword: "success" });
  assert.deepEqual(state(`${validPassword}changed`, validPassword), { newPassword: "success", confirmPassword: "error" });
  assert.equal(state(` ${validPassword}`, validPassword).confirmPassword, "error");
  assert.equal(state(validPassword, "").confirmPassword, "neutral");
});

test("explicit field rejection takes precedence over successful or untouched visual states", () => {
  assert.deepEqual(getPasswordCreationValidationStates({
    newPassword: validPassword, confirmPassword: validPassword, newPasswordInteracted: true,
    newPasswordError: "Known policy rejection", confirmPasswordError: "Known confirmation rejection",
  }), { newPassword: "error", confirmPassword: "error" });
  assert.deepEqual(getPasswordCreationValidationStates({
    newPassword: "", confirmPassword: "", newPasswordError: "Required", confirmPasswordError: "Required",
  }), { newPassword: "error", confirmPassword: "error" });
});

test("creation feedback maps every supported policy rejection to shared safe Malay copy", () => {
  for (const check of assessCredentialPassword("", "ms").checks) {
    assert.deepEqual(getPasswordCreationFieldErrors({ error: { code: check.code, message: "Do not expose this text" } }), {
      newPassword: check.message,
    });
  }
  assert.deepEqual(getPasswordCreationFieldErrors(new Error('400: {"error":{"code":"PASSWORD_TOO_SHORT"}}')), {
    newPassword: assessCredentialPassword("", "ms").checks[0].message,
  });
});

test("creation feedback maps confirmation and leaves token, network and rate failures to page feedback", () => {
  assert.deepEqual(getPasswordCreationFieldErrors({ code: "PASSWORD_CONFIRMATION_MISMATCH" }), {
    confirmPassword: "Pengesahan kata laluan tidak sepadan.",
  });
  for (const code of ["INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_USED", "AUTH_RATE_LIMITED", "NETWORK_ERROR", "UNRECOGNIZED_PASSWORD_RULE"]) {
    assert.deepEqual(getPasswordCreationFieldErrors({ code }), {});
  }
  assert.deepEqual(getPasswordCreationFieldErrors(null), {});
});

test("creation submit hint explains initial, invalid, confirmation, matching and pending states", () => {
  const hint = (newPassword: string, confirmPassword: string) => getPasswordCreationSubmitHint({ newPassword, confirmPassword, loading: false });
  assert.match(hint("", ""), /Masukkan kata laluan baharu/);
  assert.match(hint("Short1!", "Short1!"), /14 aksara/);
  assert.match(hint(validPassword, ""), /Sila sahkan/);
  assert.match(hint(validPassword, `${validPassword}different`), /tidak sepadan/);
  assert.match(hint(validPassword, validPassword), /memenuhi semua syarat dan sepadan/);
  assert.match(hint(`${validPassword}changed`, validPassword), /tidak sepadan/);
  assert.match(getPasswordCreationSubmitHint({ newPassword: validPassword, confirmPassword: validPassword, loading: true }), /Sila tunggu/);
});

test("server field errors take precedence over locally matching values until the user edits", () => {
  const options = { newPassword: validPassword, confirmPassword: validPassword, loading: false };
  assert.equal(getPasswordCreationSubmitHint({ ...options, newPasswordError: "Password mesti mengandungi sekurang-kurangnya satu simbol." }),
    "Password mesti mengandungi sekurang-kurangnya satu simbol.");
  assert.equal(getPasswordCreationSubmitHint({ ...options, confirmPasswordError: "Pengesahan kata laluan tidak sepadan." }),
    "Pengesahan kata laluan tidak sepadan.");
});
