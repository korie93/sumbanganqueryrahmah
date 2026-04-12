import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAuthIdentifier,
  normalizeAuthIdentifier,
  normalizeTwoFactorCode,
} from "@/pages/auth-field-utils";

test("normalizeAuthIdentifier trims and lowercases identifiers", () => {
  assert.equal(normalizeAuthIdentifier("  User.Name  "), "user.name");
  assert.equal(normalizeAuthIdentifier(""), "");
  assert.equal(normalizeAuthIdentifier(undefined), "");
});

test("hasAuthIdentifier only passes when a normalized identifier remains", () => {
  assert.equal(hasAuthIdentifier("  operator@example.com "), true);
  assert.equal(hasAuthIdentifier("   "), false);
});

test("normalizeTwoFactorCode keeps only the first six digits", () => {
  assert.equal(normalizeTwoFactorCode("12a3 45678"), "123456");
  assert.equal(normalizeTwoFactorCode("  98-76  "), "9876");
});
