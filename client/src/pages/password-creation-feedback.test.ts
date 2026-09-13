import assert from "node:assert/strict";
import test from "node:test";
import { assessCredentialPassword } from "@shared/password-policy";
import {
  getPasswordCreationFieldErrors,
  getPasswordCreationSubmitHint,
} from "./password-creation-feedback";

const validPassword = "TestPassword123!";

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
