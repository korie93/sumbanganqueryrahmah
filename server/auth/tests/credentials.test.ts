import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDENTIAL_PASSWORD_MIN_LENGTH,
  isStrongPassword,
} from "../credentials";

test("isStrongPassword enforces the strengthened shared password policy", () => {
  assert.equal(CREDENTIAL_PASSWORD_MIN_LENGTH, 8);
  assert.equal(isStrongPassword("Password123!"), true);
  assert.equal(isStrongPassword("password123!"), false);
  assert.equal(isStrongPassword("PASSWORD123!"), false);
  assert.equal(isStrongPassword("Password!!!"), false);
  assert.equal(isStrongPassword("Password123"), false);
  assert.equal(isStrongPassword("Pass1!"), false);
});
