import assert from "node:assert/strict";
import test from "node:test";
import { generateTemporaryPassword } from "../passwords";

const TEMP_PASSWORD_ALLOWED_CHARACTERS =
  /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()\-_=+]+$/;

test("generateTemporaryPassword enforces the minimum secure length and required character classes", () => {
  const generated = generateTemporaryPassword(12);

  assert.equal(generated.length, 16);
  assert.match(generated, /[A-Z]/);
  assert.match(generated, /[a-z]/);
  assert.match(generated, /\d/);
  assert.match(generated, /[!@#$%^&*()\-_=+]/);
});

test("generateTemporaryPassword respects explicit lengths above the secure minimum", () => {
  const generated = generateTemporaryPassword(24);

  assert.equal(generated.length, 24);
  assert.match(generated, TEMP_PASSWORD_ALLOWED_CHARACTERS);
});

test("generateTemporaryPassword stays within the supported alphabet", () => {
  const generated = Array.from({ length: 32 }, () => generateTemporaryPassword()).join("");

  assert.match(generated, TEMP_PASSWORD_ALLOWED_CHARACTERS);
});
