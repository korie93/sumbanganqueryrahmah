import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PasswordConfirmationFeedback } from "@/components/PasswordConfirmationFeedback";
import { getAuthErrorMessage, localizeAuthFeedback } from "@/lib/auth-flow-feedback";
import { getPasswordRequirements } from "@/lib/password-requirements";
import { assessCredentialPassword } from "@shared/password-policy";
import { localizePasswordFeedback } from "./password-creation-feedback";

test("recovery feedback translates known token states without changing their meaning", () => {
  for (const flow of ["reset", "activation"] as const) {
    for (const code of ["INVALID_TOKEN", "TOKEN_EXPIRED", "TOKEN_USED", "TOKEN_SUPERSEDED"]) {
      const error = { code };
      const malay = getAuthErrorMessage(error, "Fallback", flow);
      const english = getAuthErrorMessage(error, "Fallback", flow, "en");
      assert.notEqual(english, malay, `${flow}/${code}`);
      assert.equal(localizeAuthFeedback(malay, "en"), english);
      assert.equal(localizeAuthFeedback(english, "ms"), malay);
    }
  }
  assert.equal(localizeAuthFeedback("", "en"), "");
  assert.equal(localizeAuthFeedback("Unknown sanitized error", "en"), "Unknown sanitized error");
  assert.equal(localizeAuthFeedback("Sila masukkan username atau emel anda.", "en"), "Enter your username or email.");
});

test("password locale changes presentation, not authoritative requirements or validity", () => {
  for (const password of ["", "Abcdefghij1!", "LongerPassword1!", "A".repeat(257)]) {
    const malay = getPasswordRequirements(password);
    const english = getPasswordRequirements(password, "en");
    assert.equal(malay.valid, english.valid);
    assert.equal(malay.satisfiedCount, english.satisfiedCount);
    assert.deepEqual(malay.requirements.map(({ id, satisfied }) => ({ id, satisfied })),
      english.requirements.map(({ id, satisfied }) => ({ id, satisfied })));
    assert.match(english.requirements[0].label, /14.*256/);
  }
  const englishChecks = assessCredentialPassword("", "en").checks;
  for (const check of assessCredentialPassword("", "ms").checks) {
    const english = englishChecks.find((entry) => entry.code === check.code)?.message;
    assert.equal(localizePasswordFeedback(check.message, "en"), english);
    assert.equal(localizePasswordFeedback(english!, "ms"), check.message);
  }
  assert.equal(localizePasswordFeedback("Pengesahan kata laluan tidak sepadan.", "en"), "Password confirmation does not match.");
});

test("login feedback switches language without changing retry timing or unknown diagnostics", () => {
  const retry = "Terlalu banyak percubaan. Sila cuba semula dalam 60 saat.";
  assert.equal(localizeAuthFeedback(retry, "en"), "Too many attempts. Try again in 60 seconds.");
  assert.equal(localizeAuthFeedback(localizeAuthFeedback(retry, "en"), "ms"), retry);
  assert.equal(localizeAuthFeedback("Invalid credentials", "ms"), "Maklumat log masuk tidak sah.");
  assert.equal(localizeAuthFeedback("Session expired. Please login again.", "ms"), "Sesi anda telah tamat. Sila log masuk semula.");
  assert.equal(localizeAuthFeedback("Sambungan terputus. Semak internet anda dan cuba semula.", "en"), "Connection lost. Check your internet connection and retry.");
  const activation = "Akaun untuk ui.fixture telah sedia digunakan. Sila log masuk menggunakan kata laluan baharu anda.";
  assert.equal(localizeAuthFeedback(localizeAuthFeedback(activation, "en"), "ms"), activation);
  assert.equal(localizeAuthFeedback("Unexpected sanitized diagnostic remains complete", "en"), "Unexpected sanitized diagnostic remains complete");
});

test("English password widgets preserve masked fields, independent toggles and actual policy", () => {
  const markup = renderToStaticMarkup(createElement("div", null,
    createElement(PasswordInput, {
      id: "new-password", name: "newPassword", value: "LongerPassword1!", onChange() {},
      visibilityLabel: "new password", locale: "en", variant: "public-auth",
      autoComplete: "new-password", capsLockMessage: "Caps Lock is on.", "aria-describedby": "password-strength",
    }),
    createElement(PasswordStrengthMeter, {
      id: "password-strength", password: "LongerPassword1!", locale: "en", variant: "checklist",
    }),
    createElement(PasswordConfirmationFeedback, {
      id: "password-match", password: "LongerPassword1!", confirmation: "LongerPassword1!", locale: "en", variant: "enhanced",
    }),
  ));
  assert.match(markup, /type="password"/);
  assert.match(markup, /aria-label="Show new password"/);
  assert.match(markup, /aria-controls="new-password"/);
  assert.match(markup, /aria-describedby="password-strength"/);
  assert.match(markup, /Password requirements/);
  assert.match(markup, /Between 14 and 256 characters/);
  assert.match(markup, /Password confirmation matches/);
  assert.doesNotMatch(markup, /capsLockMessage=|locale=|Caps Lock is on/);
});
