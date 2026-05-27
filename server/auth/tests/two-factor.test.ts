import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { getSessionSecret, getTwoFactorDecryptionSecrets } from "../../config/security";
import {
  buildTwoFactorOtpAuthUrl,
  decryptTwoFactorSecret,
  decryptTwoFactorSecretPayload,
  encryptTwoFactorSecret,
  generateCurrentTwoFactorCode,
  generateTwoFactorSecret,
  resolveTotpAlgorithm,
  verifyTwoFactorCode,
} from "../two-factor";

function withTwoFactorEncryptionEnv<T>(
  env: {
    current?: string | null;
    previous?: string | null;
  },
  run: () => T,
): T {
  const previousCurrent = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  const previousCompat = process.env.TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS;

  if (env.current === null) {
    delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
  } else if (env.current !== undefined) {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = env.current;
  }

  if (env.previous === null) {
    delete process.env.TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS;
  } else if (env.previous !== undefined) {
    process.env.TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS = env.previous;
  }

  try {
    return run();
  } finally {
    if (previousCurrent === undefined) {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    } else {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = previousCurrent;
    }

    if (previousCompat === undefined) {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS;
    } else {
      process.env.TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS = previousCompat;
    }
  }
}

function encryptTwoFactorSecretWithRawKey(secret: string, encryptionKey: string) {
  const iv = randomBytes(12);
  const cipherKey = createHash("sha256").update(encryptionKey).digest();
  const cipher = createCipheriv("aes-256-gcm", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

function encryptLegacyTwoFactorSecret(secret: string) {
  const iv = randomBytes(12);
  const cipherKey = createHash("sha256").update(getSessionSecret()).digest();
  const cipher = createCipheriv("aes-256-gcm", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

test("encryptTwoFactorSecret requires a dedicated two-factor encryption key", () => {
  withTwoFactorEncryptionEnv({ current: null, previous: null }, () => {
    assert.throws(
      () => encryptTwoFactorSecret("JBSWY3DPEHPK3PXP"),
      /TWO_FACTOR_ENCRYPTION_KEY is required/i,
    );
  });
});

test("decryptTwoFactorSecret supports payloads encrypted with the dedicated key", () => {
  withTwoFactorEncryptionEnv({ current: "test-two-factor-encryption-key", previous: null }, () => {
    const encrypted = encryptTwoFactorSecret("JBSWY3DPEHPK3PXP");
    assert.equal(decryptTwoFactorSecret(encrypted), "JBSWY3DPEHPK3PXP");
  });
});

test("new two-factor secret payloads preserve the enrollment TOTP algorithm", () => {
  withTwoFactorEncryptionEnv({ current: "test-two-factor-encryption-key", previous: null }, () => {
    const encrypted = encryptTwoFactorSecret("JBSWY3DPEHPK3PXP", "sha256");
    const decrypted = decryptTwoFactorSecretPayload(encrypted);

    assert.equal(decrypted.secret, "JBSWY3DPEHPK3PXP");
    assert.equal(decrypted.algorithm, "sha256");
  });
});

test("legacy two-factor secret payloads are treated as SHA1 enrollments", () => {
  withTwoFactorEncryptionEnv({ current: "test-two-factor-encryption-key", previous: null }, () => {
    const encrypted = encryptTwoFactorSecretWithRawKey(
      "JBSWY3DPEHPK3PXP",
      "test-two-factor-encryption-key",
    );
    const decrypted = decryptTwoFactorSecretPayload(encrypted);

    assert.equal(decrypted.secret, "JBSWY3DPEHPK3PXP");
    assert.equal(decrypted.algorithm, "sha1");
  });
});

test("decryptTwoFactorSecret supports payloads encrypted with the previous rotation key", () => {
  withTwoFactorEncryptionEnv({
    current: "new-two-factor-encryption-key",
    previous: "old-two-factor-encryption-key",
  }, () => {
    const encrypted = encryptTwoFactorSecretWithRawKey(
      "JBSWY3DPEHPK3PXP",
      "old-two-factor-encryption-key",
    );

    assert.equal(decryptTwoFactorSecret(encrypted), "JBSWY3DPEHPK3PXP");
  });
});

test("decryptTwoFactorSecret fails safely when the previous rotation key is missing", () => {
  withTwoFactorEncryptionEnv({ current: "new-two-factor-encryption-key", previous: null }, () => {
    const encrypted = encryptTwoFactorSecretWithRawKey(
      "JBSWY3DPEHPK3PXP",
      "old-two-factor-encryption-key",
    );

    assert.throws(
      () => decryptTwoFactorSecret(encrypted),
      /Invalid 2FA secret payload/i,
    );
  });
});

test("getTwoFactorDecryptionSecrets keeps current key first and dedupes previous keys", () => {
  withTwoFactorEncryptionEnv({
    current: "current-two-factor-key",
    previous: "previous-two-factor-key,current-two-factor-key,previous-two-factor-key",
  }, () => {
    assert.deepEqual(getTwoFactorDecryptionSecrets(), [
      "current-two-factor-key",
      "previous-two-factor-key",
    ]);
  });
});

test("decryptTwoFactorSecret rejects legacy payloads encrypted with the session secret", () => {
  withTwoFactorEncryptionEnv({ current: "test-two-factor-encryption-key", previous: null }, () => {
    const encrypted = encryptLegacyTwoFactorSecret("JBSWY3DPEHPK3PXP");
    assert.throws(
      () => decryptTwoFactorSecret(encrypted),
      /Invalid 2FA secret payload/i,
    );
  });
});

test("verifyTwoFactorCode accepts the current valid TOTP code", (t) => {
  const secret = generateTwoFactorSecret();
  t.mock.method(Date, "now", () => new Date("2026-04-29T00:00:00.000Z").getTime());
  const code = generateCurrentTwoFactorCode(secret);

  assert.equal(verifyTwoFactorCode(secret, code), true);
});

test("verifyTwoFactorCode rejects invalid, short, and non-digit-only TOTP codes", (t) => {
  const secret = generateTwoFactorSecret();
  t.mock.method(Date, "now", () => new Date("2026-04-29T00:00:00.000Z").getTime());
  const validCode = generateCurrentTwoFactorCode(secret);
  const invalidCode = validCode === "000000" ? "111111" : "000000";

  assert.equal(verifyTwoFactorCode(secret, invalidCode), false);
  assert.equal(verifyTwoFactorCode(secret, "12345"), false);
  assert.equal(verifyTwoFactorCode(secret, "abcdef"), false);
});

test("verifyTwoFactorCode keeps existing normalization for pasted spaced codes", (t) => {
  const secret = generateTwoFactorSecret();
  t.mock.method(Date, "now", () => new Date("2026-04-29T00:00:00.000Z").getTime());
  const code = generateCurrentTwoFactorCode(secret);
  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  assert.equal(verifyTwoFactorCode(secret, formattedCode), true);
});

test("two-factor TOTP defaults to SHA1 and supports SHA256 as an opt-in algorithm", (t) => {
  const secret = "JBSWY3DPEHPK3PXP";
  t.mock.method(Date, "now", () => new Date("2026-04-29T00:00:00.000Z").getTime());

  assert.equal(resolveTotpAlgorithm(), "sha1");
  assert.equal(resolveTotpAlgorithm("SHA256"), "sha256");
  const sha1Code = generateCurrentTwoFactorCode(secret, "sha1");
  const sha256Code = generateCurrentTwoFactorCode(secret, "sha256");

  assert.notEqual(sha256Code, sha1Code);
  assert.equal(verifyTwoFactorCode(secret, sha256Code, 1, "sha256"), true);
  assert.equal(verifyTwoFactorCode(secret, sha1Code, 1, "sha256"), false);
  assert.match(
    buildTwoFactorOtpAuthUrl({ issuer: "SQR", username: "admin", secret, algorithm: "SHA256" }),
    /algorithm=SHA256/,
  );
});
