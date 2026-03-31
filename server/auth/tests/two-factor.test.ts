import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { getSessionSecret } from "../../config/security";
import { decryptTwoFactorSecret, encryptTwoFactorSecret } from "../two-factor";

function encryptLegacyTwoFactorSecret(secret: string) {
  const iv = randomBytes(12);
  const cipherKey = createHash("sha256").update(getSessionSecret()).digest();
  const cipher = createCipheriv("aes-256-gcm", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

test("encryptTwoFactorSecret requires a dedicated two-factor encryption key", () => {
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  delete process.env.TWO_FACTOR_ENCRYPTION_KEY;

  try {
    assert.throws(
      () => encryptTwoFactorSecret("JBSWY3DPEHPK3PXP"),
      /TWO_FACTOR_ENCRYPTION_KEY is required/i,
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    } else {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("decryptTwoFactorSecret supports payloads encrypted with the dedicated key", () => {
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  process.env.TWO_FACTOR_ENCRYPTION_KEY = "test-two-factor-encryption-key";

  try {
    const encrypted = encryptTwoFactorSecret("JBSWY3DPEHPK3PXP");
    assert.equal(decryptTwoFactorSecret(encrypted), "JBSWY3DPEHPK3PXP");
  } finally {
    if (previousKey === undefined) {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    } else {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("decryptTwoFactorSecret still supports legacy payloads encrypted with the session secret", () => {
  const previousKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  process.env.TWO_FACTOR_ENCRYPTION_KEY = "test-two-factor-encryption-key";

  try {
    const encrypted = encryptLegacyTwoFactorSecret("JBSWY3DPEHPK3PXP");
    assert.equal(decryptTwoFactorSecret(encrypted), "JBSWY3DPEHPK3PXP");
  } finally {
    if (previousKey === undefined) {
      delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    } else {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = previousKey;
    }
  }
});
