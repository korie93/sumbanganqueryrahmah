import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePasswordStrength } from "./password-strength";

test("evaluatePasswordStrength scores weak short passwords as very weak", () => {
  const result = evaluatePasswordStrength("abc");

  assert.equal(result.label, "Very Weak");
  assert.equal(result.level, 0);
  assert.ok(result.feedback.includes("Use 12+ chars"));
  assert.ok(result.feedback.includes("Add number"));
});

test("evaluatePasswordStrength penalizes common password patterns", () => {
  const result = evaluatePasswordStrength("Password1");

  assert.equal(result.label, "Fair");
  assert.equal(result.level, 2);
  assert.ok(result.feedback.includes("Use 12+ chars"));
  assert.ok(result.feedback.includes("Avoid common words"));
});

test("evaluatePasswordStrength recognizes varied non-common passwords as strong", () => {
  const result = evaluatePasswordStrength("Tr0ub4dor&3");

  assert.equal(result.label, "Strong");
  assert.equal(result.level, 3);
  assert.deepEqual(result.feedback, ["Use 12+ chars"]);
});

test("evaluatePasswordStrength recognizes long varied passwords as very strong", () => {
  const result = evaluatePasswordStrength("Tr0ub4dor&3-Long");

  assert.equal(result.label, "Very Strong");
  assert.equal(result.level, 4);
  assert.deepEqual(result.feedback, []);
});
