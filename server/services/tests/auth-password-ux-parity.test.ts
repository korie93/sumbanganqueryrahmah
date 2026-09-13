import assert from "node:assert/strict";
import test from "node:test";

import { getPasswordRequirements } from "../../../client/src/lib/password-requirements";
import {
  hasPublicAuthFieldErrors,
  validatePasswordFields,
} from "../../../client/src/pages/public-auth-form-utils";
import {
  CREDENTIAL_PASSWORD_MAX_LENGTH,
  CREDENTIAL_PASSWORD_MIN_LENGTH,
  assessCredentialPassword,
  getCredentialPasswordValidationError,
  type CredentialPasswordIssueCode,
} from "../../../shared/password-policy";
import { readActivationBody } from "../../routes/auth/auth-public-request-parsers";
import { assertConfirmedStrongPassword } from "../auth-account-token-utils";
import { AuthAccountError } from "../auth-account-types";

const REQUIREMENT_IDS = ["length", "lowercase", "uppercase", "number", "symbol"];

function assertPasswordParity(password: string, expectedValid: boolean) {
  const requirements = getPasswordRequirements(password);
  const assessment = assessCredentialPassword(password);
  const fieldErrors = validatePasswordFields({
    newPassword: password,
    confirmPassword: password,
  });
  // Both public mutation routes use this parser and the same backend gate.
  const parsed = readActivationBody({
    token: "policy-parity-fixture-not-a-live-token",
    newPassword: password,
    confirmPassword: password,
  });

  assert.deepEqual(requirements.requirements.map(({ id }) => id), REQUIREMENT_IDS);
  assert.equal(requirements.valid, expectedValid);
  assert.equal(assessment.valid, expectedValid);
  assert.equal(requirements.requirements.every(({ satisfied }) => satisfied), expectedValid);
  assert.equal(requirements.satisfiedCount,
    requirements.requirements.filter(({ satisfied }) => satisfied).length);
  assert.equal(!hasPublicAuthFieldErrors(fieldErrors), expectedValid);
  assert.equal(parsed.newPassword, password, "The API parser must not trim or normalize passwords.");
  assert.equal(parsed.confirmPassword, password);

  if (expectedValid) {
    assert.doesNotThrow(() => assertConfirmedStrongPassword(parsed.newPassword, parsed.confirmPassword));
    return;
  }

  const issue = getCredentialPasswordValidationError(password);
  assert.ok(issue);
  assert.throws(() => assertConfirmedStrongPassword(parsed.newPassword, parsed.confirmPassword),
    (error: unknown) => {
      assert.ok(error instanceof AuthAccountError);
      assert.equal(error.code, issue.code);
      assert.equal(error.statusCode, 400);
      if (password) assert.equal(error.message.includes(password), false);
      return true;
    });
  if (password) {
    assert.equal(fieldErrors.newPassword, getCredentialPasswordValidationError(password, "ms")?.message);
  }
}

test("the five visible requirements preserve all seven backend policy checks and field errors", () => {
  const cases: Array<{ password: string; code: CredentialPasswordIssueCode; missing: string[] }> = [
    { password: "Aa1!", code: "PASSWORD_TOO_SHORT", missing: ["length"] },
    { password: `Aa1!${"a".repeat(253)}`, code: "PASSWORD_TOO_LONG", missing: ["length"] },
    { password: "1234567890123!", code: "PASSWORD_MISSING_LETTER", missing: ["lowercase", "uppercase"] },
    { password: "lowercasepass1!", code: "PASSWORD_MISSING_UPPERCASE", missing: ["uppercase"] },
    { password: "UPPERCASEPASS1!", code: "PASSWORD_MISSING_LOWERCASE", missing: ["lowercase"] },
    { password: "StrongPassword!", code: "PASSWORD_MISSING_NUMBER", missing: ["number"] },
    { password: "StrongPassword1", code: "PASSWORD_MISSING_SYMBOL", missing: ["symbol"] },
  ];

  for (const { password, code, missing } of cases) {
    assertPasswordParity(password, false);
    assert.equal(getCredentialPasswordValidationError(password)?.code, code);
    assert.deepEqual(getPasswordRequirements(password).requirements
      .filter(({ satisfied }) => !satisfied).map(({ id }) => id), missing);
  }
});

test("manual policy boundaries stay 14 through 256 rather than the temporary 8-character policy", () => {
  assert.equal(CREDENTIAL_PASSWORD_MIN_LENGTH, 14);
  assert.equal(CREDENTIAL_PASSWORD_MAX_LENGTH, 256);
  for (const length of [0, 8, 13, 14, 15, 255, 256, 257]) {
    const password = length === 0 ? "" : `Aa1!${"a".repeat(length - 4)}`;
    assertPasswordParity(password, length >= 14 && length <= 256);
  }
});

test("all character-category combinations agree between visible checklist, form and backend", () => {
  const categories = ["a", "A", "1", "!"];
  for (let mask = 1; mask < 16; mask += 1) {
    const selected = categories.filter((_, index) => (mask & (1 << index)) !== 0).join("");
    const password = selected.padEnd(14, selected[0]);
    assertPasswordParity(password, mask === 15);
  }
});

test("the UI preserves backend whitespace, ASCII-category and UTF-16 length semantics", () => {
  // The existing symbol rule means any non-ASCII-alphanumeric character.
  // These fixtures prevent accidentally adding trim/Unicode/space restrictions.
  for (const password of [
    "StrongPassword1 ",
    " StrongPassword1",
    "StrongPassword1\t",
    "StrongPassword1\n",
    "StrongPassword1é",
    "StrongPassword1🙂",
    `Aa1!${"🙂".repeat(126)}`,
  ]) {
    assertPasswordParity(password, true);
  }

  for (const [password, code] of [
    ["Élowercasepass1!", "PASSWORD_MISSING_UPPERCASE"],
    ["éUPPERCASEPASS1!", "PASSWORD_MISSING_LOWERCASE"],
    ["StrongPassword١!", "PASSWORD_MISSING_NUMBER"],
    [`Aa1!${"🙂".repeat(127)}`, "PASSWORD_TOO_LONG"],
  ]) {
    assertPasswordParity(password, false);
    assert.equal(getCredentialPasswordValidationError(password)?.code, code);
  }
});

test("matching remains independent of policy validity and never normalizes confirmation", () => {
  const newPassword = " StrongPassword1! ";
  assertPasswordParity(newPassword, true);

  for (const confirmPassword of ["", newPassword.trim(), " StrongPassword2! "]) {
    const fields = validatePasswordFields({ newPassword, confirmPassword });
    assert.equal(fields.newPassword, undefined);
    assert.ok(fields.confirmPassword);
    const parsed = readActivationBody({ token: "confirmation-fixture", newPassword, confirmPassword });
    assert.throws(() => assertConfirmedStrongPassword(parsed.newPassword, parsed.confirmPassword), {
      code: "PASSWORD_CONFIRMATION_MISMATCH",
      statusCode: 400,
    });
  }
});
