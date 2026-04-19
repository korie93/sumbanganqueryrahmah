import assert from "node:assert/strict";
import test from "node:test";
import { isStrongPassword } from "@shared/password-policy";

test("collection nickname password policy matches the shared strong-password requirements", () => {
  assert.equal(isStrongPassword("Password123!"), true);
  assert.equal(isStrongPassword("password123!"), false);
  assert.equal(isStrongPassword("PASSWORD123!"), false);
  assert.equal(isStrongPassword("Password123"), false);
});
