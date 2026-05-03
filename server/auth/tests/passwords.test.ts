import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import {
  CREDENTIAL_PASSWORD_MAX_LENGTH,
  isCredentialPasswordWithinMaxLength,
  isStrongPassword,
} from "../credentials";
import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from "../passwords";

const VALID_BCRYPT_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7z6xUfIjm6";

test("credential password policy accepts normal passwords and rejects oversized input", () => {
  assert.equal(isStrongPassword("StrongPass123!"), true);
  assert.equal(isStrongPassword("StrongPass123"), false);
  assert.equal(isStrongPassword("short1!Aa"), false);
  assert.equal(isStrongPassword("a".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH + 1)), false);
  assert.equal(isCredentialPasswordWithinMaxLength("a".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH)), true);
  assert.equal(isCredentialPasswordWithinMaxLength("a".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH + 1)), false);
});

test("generateTemporaryPassword preserves entropy while meeting the credential policy", () => {
  const password = generateTemporaryPassword();

  assert.equal(password.length >= 16, true);
  assert.equal(isStrongPassword(password), true);
});

test("verifyPassword rejects oversized password input before bcrypt comparison", async (t) => {
  const compareMock = t.mock.method(bcrypt, "compare", async () => {
    throw new Error("bcrypt.compare should not be called for oversized passwords");
  });

  assert.equal(
    await verifyPassword("x".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH + 1), VALID_BCRYPT_HASH),
    false,
  );
  assert.equal(compareMock.mock.callCount(), 0);
});

test("hashPassword rejects oversized password input before bcrypt hashing", async (t) => {
  const hashMock = t.mock.method(bcrypt, "hash", async () => {
    throw new Error("bcrypt.hash should not be called for oversized passwords");
  });

  await assert.rejects(
    () => hashPassword("x".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH + 1)),
    /maximum supported length/i,
  );
  assert.equal(hashMock.mock.callCount(), 0);
});
