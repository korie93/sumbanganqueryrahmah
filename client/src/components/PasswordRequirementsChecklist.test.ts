import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { PasswordConfirmationFeedback } from "./PasswordConfirmationFeedback";
import { getPasswordRequirements } from "@/lib/password-requirements";
import { isCredentialPasswordPolicyCompliant } from "@shared/password-policy";

test("checklist always renders every real requirement with icons and non-color states", () => {
  for (const password of ["", "ValidCreation1!", "onlylowercaseword", "!123456789012345", "Aa1!" + "x".repeat(253)]) {
    const markup = renderToStaticMarkup(createElement(PasswordStrengthMeter, {
      id: "requirements", variant: "checklist", password,
    }));
    const { requirements, valid } = getPasswordRequirements(password);
    assert.equal(valid, isCredentialPasswordPolicyCompliant(password));
    assert.equal((markup.match(/data-password-requirement=/g) ?? []).length, 5);
    for (const requirement of requirements) {
      assert.ok(markup.includes(`data-password-requirement="${requirement.id}" data-satisfied="${requirement.satisfied}"`));
      assert.ok(markup.includes(requirement.label));
    }
    assert.match(markup, /Keperluan kata laluan/);
    assert.match(markup, /Antara 14 hingga 256 aksara/);
    assert.match(markup, /aria-labelledby="requirements-heading"/);
    assert.match(markup, /aria-hidden="true" focusable="false"/);
    assert.doesNotMatch(markup, /aria-live|role="status"|role="alert"/,
      "Do not announce the entire checklist and strength estimate on every keystroke.");
    assert.equal(markup.includes("Kata laluan sah"), valid);
    if (password) assert.equal(markup.includes(password), false, "Feedback must not contain the password.");
  }
});

test("an apparently strong but too-short password cannot pass policy status", () => {
  const markup = renderToStaticMarkup(createElement(PasswordStrengthMeter, {
    id: "requirements", variant: "checklist", password: "PalmRiver7!Aa",
  }));
  assert.match(markup, /Sangat Kuat/);
  assert.match(markup, /data-password-policy-status="incomplete"/);
  assert.match(markup, /data-password-requirement="length" data-satisfied="false"/);
  assert.match(markup, /Anggaran kekuatan, bukan pengesahan syarat/);
  assert.doesNotMatch(markup, /Kata laluan sah/);
});

test("enhanced confirmation is initially quiet and uses icons/text for live match states", () => {
  const render = (password: string, confirmation: string, requiredError?: string) => renderToStaticMarkup(
    createElement(PasswordConfirmationFeedback, { id: "confirm", variant: "enhanced", password, confirmation, requiredError: requiredError ?? null }),
  );
  const empty = render("", "");
  assert.match(empty, /min-h-10/);
  assert.doesNotMatch(empty, /<svg|tidak sepadan|sepadan/);
  const matched = render("first", "first");
  assert.match(matched, /Pengesahan kata laluan sepadan/);
  assert.match(matched, /<svg/);
  assert.match(matched, /aria-live="polite"/);
  const changed = render("second", "first");
  assert.match(changed, /Pengesahan kata laluan tidak sepadan/);
  assert.doesNotMatch(changed, /first|second/);
  const rejected = render("first", "first", "Pengesahan ditolak. Sila semak semula.");
  assert.match(rejected, /Pengesahan ditolak/);
  assert.doesNotMatch(rejected, /Pengesahan kata laluan sepadan/);
});
