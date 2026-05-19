import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import {
  CREDENTIAL_BCRYPT_COST,
  CREDENTIAL_PASSWORD_MAX_LENGTH,
  isCredentialPasswordWithinMaxLength,
  isStrongPassword,
} from "../credentials";
import {
  generateTemporaryPassword,
  getOpaqueTokenHashCandidates,
  hashLegacyOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  resetDummyBcryptHashForTests,
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

test("opaque token hashing uses keyed HMAC while retaining legacy lookup candidates", () => {
  const rawToken = "reset-token-value";
  const hmacHash = hashOpaqueToken(rawToken);
  const legacyHash = hashLegacyOpaqueToken(rawToken);
  const candidates = getOpaqueTokenHashCandidates(rawToken);

  assert.match(hmacHash, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.match(legacyHash, /^[a-f0-9]{64}$/);
  assert.notEqual(hmacHash, legacyHash);
  assert.equal(hashOpaqueToken(rawToken), hmacHash);
  assert.deepEqual(Array.from(new Set(candidates)), candidates);
  assert.equal(candidates.includes(hmacHash), true);
  assert.equal(candidates.includes(legacyHash), true);
});

test("opaque token hashes are context-bound", () => {
  assert.notEqual(hashOpaqueToken("token-a"), hashOpaqueToken("token-b"));
  assert.notEqual(hashLegacyOpaqueToken("token-a"), hashOpaqueToken("token-a"));
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

test("verifyPassword generates a process-local dummy hash for invalid stored hashes", async (t) => {
  resetDummyBcryptHashForTests();
  t.after(() => {
    resetDummyBcryptHashForTests();
  });
  const hashMock = t.mock.method(bcrypt, "hash", async () => VALID_BCRYPT_HASH);
  const compareMock = t.mock.method(bcrypt, "compare", async () => false);

  assert.equal(await verifyPassword("Password123!", null), false);
  assert.equal(await verifyPassword("Password123!", "not-a-bcrypt-hash"), false);
  assert.equal(hashMock.mock.callCount(), 1);
  assert.equal(compareMock.mock.callCount(), 2);
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

test("hashPassword uses an explicit bcrypt cost of at least 12", async (t) => {
  const hashMock = t.mock.method(bcrypt, "hash", async () => VALID_BCRYPT_HASH);

  await hashPassword("Password123!");

  assert.equal(hashMock.mock.callCount(), 1);
  assert.equal(hashMock.mock.calls[0]?.arguments[1], CREDENTIAL_BCRYPT_COST);
  assert.equal(CREDENTIAL_BCRYPT_COST >= 12, true);
});
