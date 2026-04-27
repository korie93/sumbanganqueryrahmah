import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { getSessionSecret, getTwoFactorDecryptionSecrets } from "../../config/security";
import { decryptTwoFactorSecret, encryptTwoFactorSecret } from "../two-factor";

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
