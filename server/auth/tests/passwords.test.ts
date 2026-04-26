import assert from "node:assert/strict";
import test from "node:test";
import { generateTemporaryPassword } from "../passwords";

test("generateTemporaryPassword keeps minimum length and credential complexity", () => {
  const password = generateTemporaryPassword(8);

  assert.equal(password.length, 16);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /\d/);
  assert.match(password, /[!@#$%^&*()\-_=+]/);
});

test("generateTemporaryPassword honors longer requested lengths", () => {
  const password = generateTemporaryPassword(24);

  assert.equal(password.length, 24);
});
