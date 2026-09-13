import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import { readFileSync } from "node:fs";
import {
  assessCredentialPassword,
  getCredentialPasswordValidationError,
  getCredentialPasswordValidationIssues,
  isTemporaryPasswordPolicyCompliant,
  TEMPORARY_PASSWORD_LENGTH,
} from "../../../shared/password-policy";
import { runtimeConfig } from "../../config/runtime";
import {
  CREDENTIAL_BCRYPT_COST,
  CREDENTIAL_PASSWORD_MAX_LENGTH,
  CREDENTIAL_PASSWORD_MIN_LENGTH,
  isCredentialPasswordWithinMaxLength,
  isStrongPassword,
} from "../credentials";
import {
  generateOneTimeToken,
  generateTemporaryPassword,
  getOpaqueTokenHashCandidates,
  hashLegacyOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  resetDummyBcryptHashForTests,
  verifyBcryptRuntimeStartup,
  verifyPassword,
} from "../passwords";

const VALID_BCRYPT_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7z6xUfIjm6";

test("credential password policy accepts normal passwords and rejects oversized input", () => {
  assert.equal(isStrongPassword("StrongPass123!"), true);
  assert.equal(CREDENTIAL_PASSWORD_MIN_LENGTH, 14);
  assert.equal(isStrongPassword("StrongPas123!"), false);
  assert.equal(isStrongPassword("StrongPass123"), false);
  assert.equal(isStrongPassword("short1!Aa"), false);
  assert.equal(isStrongPassword("a".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH + 1)), false);
  assert.equal(isCredentialPasswordWithinMaxLength("a".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH)), true);
  assert.equal(isCredentialPasswordWithinMaxLength("a".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH + 1)), false);
});

test("generateTemporaryPassword produces unique eight-character temporary credentials with all required classes", () => {
  const passwords = Array.from({ length: 256 }, () => generateTemporaryPassword());
  assert.equal(TEMPORARY_PASSWORD_LENGTH, 8);
  assert.equal(new Set(passwords).size, passwords.length);
  for (const password of passwords) {
    assert.equal(password.length, 8);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[^A-Za-z0-9]/);
    assert.equal(isTemporaryPasswordPolicyCompliant(password), true);
    assert.equal(isStrongPassword(password), false, "Temporary rules must not weaken manually chosen passwords.");
  }
});

test("temporary credentials retain secure RNG selection and Fisher-Yates position shuffling", () => {
  const source = readFileSync(new URL("../passwords.ts", import.meta.url), "utf8");
  assert.match(source, /randomInt[^\n]*from "node:crypto"/);
  assert.match(source, /const index = randomInt\(alphabet\.length\)/);
  assert.match(source, /const swapIndex = randomInt\(index \+ 1\)/);
  assert.match(source, /return shuffleCharacters\(characters\)\.join\(""\)/);
  assert.doesNotMatch(source, /Math\.random\s*\(/);
});

test("temporary credentials can be hashed and verified without passing permanent-password creation policy", async () => {
  const password = generateTemporaryPassword();
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(`${password}wrong`, hash), false);
});

test("shared manual password assessment gives precise rules without diverging from the Boolean policy", () => {
  const cases = [
    { password: "Short1!Aa", code: "PASSWORD_TOO_SHORT" },
    { password: `Aa1!${"x".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH)}`, code: "PASSWORD_TOO_LONG" },
    { password: "1234567890123!", code: "PASSWORD_MISSING_LETTER" },
    { password: "lowercasepass1!", code: "PASSWORD_MISSING_UPPERCASE" },
    { password: "UPPERCASEPASS1!", code: "PASSWORD_MISSING_LOWERCASE" },
    { password: "NoNumbersHere!", code: "PASSWORD_MISSING_NUMBER" },
    { password: "NoSymbolsHere12", code: "PASSWORD_MISSING_SYMBOL" },
  ];
  for (const { password, code } of cases) {
    const assessment = assessCredentialPassword(password);
    assert.equal(assessment.valid, false);
    assert.equal(isStrongPassword(password), assessment.valid);
    assert.equal(getCredentialPasswordValidationError(password)?.code, code);
    assert.ok(getCredentialPasswordValidationIssues(password, "ms").every((issue) => issue.message.startsWith("Password")));
    assert.deepEqual(assessment.errors, getCredentialPasswordValidationIssues(password));
  }
  for (const password of ["StrongPass123!", `Aa1!${"x".repeat(CREDENTIAL_PASSWORD_MAX_LENGTH - 4)}`]) {
    assert.equal(assessCredentialPassword(password).valid, true);
    assert.equal(isStrongPassword(password), true);
    assert.equal(getCredentialPasswordValidationError(password), null);
    assert.deepEqual(getCredentialPasswordValidationIssues(password), []);
  }
});

test("temporary validation rejects missing character classes and non-eight lengths", () => {
  for (const password of ["Abcdefg!", "1234567!", "Abcdef12", "Abc1!", "Abcdef12!", ""]) {
    assert.equal(isTemporaryPasswordPolicyCompliant(password), false);
  }
});

test("generateOneTimeToken never drops below 32 bytes of entropy", () => {
  assert.match(generateOneTimeToken(), /^[a-f0-9]{64}$/);
  assert.match(generateOneTimeToken(8), /^[a-f0-9]{64}$/);
  assert.match(generateOneTimeToken(48), /^[a-f0-9]{96}$/);
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
  assert.equal(CREDENTIAL_BCRYPT_COST, runtimeConfig.auth.bcryptCost);
  assert.equal(CREDENTIAL_BCRYPT_COST >= 12, true);
});

test("verifyBcryptRuntimeStartup validates bcrypt hash and compare before serving traffic", async (t) => {
  resetDummyBcryptHashForTests();
  t.after(() => {
    resetDummyBcryptHashForTests();
  });

  const hashMock = t.mock.method(bcrypt, "hash", async () => VALID_BCRYPT_HASH);
  const compareMock = t.mock.method(bcrypt, "compare", async (raw: string) => !raw.endsWith(":mismatch"));

  await verifyBcryptRuntimeStartup();

  assert.equal(hashMock.mock.callCount(), 1);
  assert.equal(compareMock.mock.callCount(), 2);

  assert.equal(await verifyPassword("Password123!", null), false);
  assert.equal(hashMock.mock.callCount(), 1);
  assert.equal(compareMock.mock.callCount(), 3);
});

test("verifyBcryptRuntimeStartup fails fast when bcrypt comparison is inconsistent", async (t) => {
  resetDummyBcryptHashForTests();
  t.after(() => {
    resetDummyBcryptHashForTests();
  });

  t.mock.method(bcrypt, "hash", async () => VALID_BCRYPT_HASH);
  t.mock.method(bcrypt, "compare", async () => false);

  await assert.rejects(() => verifyBcryptRuntimeStartup(), /bcrypt runtime self-check failed/i);
});
