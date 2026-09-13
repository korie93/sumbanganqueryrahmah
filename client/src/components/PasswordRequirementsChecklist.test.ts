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
  assert.match(empty, /data-state="neutral"/);
  assert.doesNotMatch(empty, /<svg|tidak sepadan|sepadan/);
  const matched = render("first", "first");
  assert.match(matched, /Pengesahan kata laluan sepadan/);
  assert.match(matched, /<svg/);
  assert.match(matched, /aria-live="polite"/);
  assert.match(matched, /data-state="success"/);
  assert.match(matched, /text-green-700/);
  const changed = render("second", "first");
  assert.match(changed, /Pengesahan kata laluan tidak sepadan/);
  assert.doesNotMatch(changed, /first|second/);
  assert.match(changed, /data-state="error"/);
  assert.match(changed, /text-red-700/);
  const rejected = render("first", "first", "Pengesahan ditolak. Sila semak semula.");
  assert.match(rejected, /Pengesahan ditolak/);
  assert.doesNotMatch(rejected, /Pengesahan kata laluan sepadan/);
});

test("untouched rules are neutral, but clearing an evaluated password keeps missing rules red", () => {
  for (const interacted of [false, true]) {
    const markup = renderToStaticMarkup(createElement(PasswordStrengthMeter, {
      id: "requirements", variant: "checklist", password: "", interacted,
    }));
    const rows = [...markup.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.ok(row.includes(`data-state="${interacted ? "error" : "neutral"}"`));
      assert.ok(row.includes(interacted ? "text-red-700" : "text-muted-foreground"));
      assert.ok(row.includes(interacted ? "lucide-circle-x" : "lucide-circle"));
      assert.ok(row.includes(interacted ? "Belum dipenuhi:" : "Belum dinilai:"));
    }
    assert.match(markup, /0\/5 dipenuhi/);
    assert.match(markup, /data-password-strength-level="none"/);
    assert.equal((markup.match(/data-filled="true"/g) ?? []).length, 0);
  }
});

test("each V2 example independently colors met rules green and missing rules red", () => {
  const cases = [
    { password: "abcdefghijklmno", met: ["length", "lowercase"] },
    { password: "Abcdefghijklmn1", met: ["length", "lowercase", "uppercase", "number"] },
    { password: "Abcdefghijklmn1!", met: ["length", "lowercase", "uppercase", "number", "symbol"] },
  ];
  for (const { password, met } of cases) {
    const markup = renderToStaticMarkup(createElement(PasswordStrengthMeter, {
      id: "requirements", variant: "checklist", password, interacted: true,
    }));
    assert.ok(markup.includes(`${met.length}/5 dipenuhi`));
    for (const [row] of markup.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)) {
      const id = /data-password-requirement="([^"]+)"/.exec(row)?.[1] ?? "";
      const success = met.includes(id);
      assert.ok(row.includes(`data-state="${success ? "success" : "error"}"`));
      assert.ok(row.includes(success ? "text-green-700" : "text-red-700"));
      assert.ok(row.includes(success ? "lucide-circle-check" : "lucide-circle-x"));
    }
    assert.equal(markup.includes("Kata laluan sah"), met.length === 5);
  }
});

test("five visible meter segments and semantic color transition with the existing heuristic", () => {
  const cases = [
    { password: "a", level: 0, label: "Sangat Lemah", color: "bg-red-700" },
    { password: "PalmRiver", level: 2, label: "Sederhana", color: "bg-amber-700" },
    { password: "PalmRiverMountain7", level: 3, label: "Kuat", color: "bg-green-600" },
    { password: "PalmRiver7!Aa", level: 4, label: "Sangat Kuat", color: "bg-green-800" },
  ];
  for (const { password, level, label, color } of cases) {
    const markup = renderToStaticMarkup(createElement(PasswordStrengthMeter, {
      id: "requirements", variant: "checklist", password,
    }));
    assert.ok(markup.includes(`data-password-strength-level="${level}"`));
    assert.ok(markup.includes(label));
    assert.equal((markup.match(/data-password-strength-segment=/g) ?? []).length, 5);
    assert.equal((markup.match(/data-filled="true"/g) ?? []).length, level + 1);
    assert.ok(markup.includes(color));
    assert.match(markup, /h-1\.5 rounded-full/);
  }
});
