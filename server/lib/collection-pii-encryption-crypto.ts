import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { normalizeCollectionPiiValue } from "./collection-pii-encryption-normalize";
import { logger } from "./logger";

export const COLLECTION_PII_ENCRYPTION_INFO = "sqr-collection-pii-encryption-v1";
export const COLLECTION_PII_ENCRYPTION_SALT = "sqr-collection-pii-encryption-salt-v1";

export function getCollectionPiiCipherKey(secret: string) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(String(secret), "utf8"),
      Buffer.from(COLLECTION_PII_ENCRYPTION_SALT, "utf8"),
      Buffer.from(COLLECTION_PII_ENCRYPTION_INFO, "utf8"),
      32,
    ),
  );
}

export function getLegacyCollectionPiiCipherKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function getCollectionPiiBlindIndexKey(secret: string) {
  // Keep blind-index hashes stable for existing database rows. Encryption
  // payloads moved to HKDF above; changing search hashes requires a separate
  // database backfill/migration window.
  return getLegacyCollectionPiiCipherKey(secret);
}

function decryptCollectionPiiValueWithKey(payload: string, key: Buffer): string {
  const payloadParts = String(payload || "").split(".");
  if (payloadParts.length !== 3) {
    throw new Error("Invalid collection PII payload.");
  }
  const [ivRaw, ciphertextRaw, tagRaw] = payloadParts;
  // AES-GCM has a valid authenticated representation for an empty plaintext:
  // `<iv>..<tag>`. Older writes could produce that representation for optional
  // blank fields, so accept the empty ciphertext while still requiring exactly
  // three segments plus a non-empty IV and authentication tag.
  if (!ivRaw || ciphertextRaw === undefined || !tagRaw) {
    throw new Error("Invalid collection PII payload.");
  }

  const iv = Buffer.from(ivRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");
  const tag = Buffer.from(tagRaw, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function encryptCollectionPiiWithSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCollectionPiiCipherKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptCollectionPiiValueWithSecret(payload: string, secret: string): string {
  try {
    return decryptCollectionPiiValueWithKey(payload, getCollectionPiiCipherKey(secret));
  } catch (hkdfError) {
    try {
      return decryptCollectionPiiValueWithKey(payload, getLegacyCollectionPiiCipherKey(secret));
    } catch (legacyError) {
      logger.debug("Collection PII legacy decrypt fallback failed", {
        operation: "decryptCollectionPiiValueWithSecret",
        payloadLength: payload.length,
        hkdfError: hkdfError instanceof Error ? hkdfError.message : "Unknown HKDF decrypt failure",
        legacyError: legacyError instanceof Error ? legacyError.message : "Unknown legacy decrypt failure",
      });
      throw hkdfError;
    }
  }
}

export function decryptCollectionPiiValueWithCurrentDerivationOnly(
  payload: string,
  secret: string,
): string {
  return decryptCollectionPiiValueWithKey(payload, getCollectionPiiCipherKey(secret));
}

export function decryptCollectionPiiValueWithSecretSafe(payload: unknown, secret: string): string | null {
  const normalized = normalizeCollectionPiiValue(payload);
  if (!normalized) {
    return null;
  }

  try {
    const decrypted = decryptCollectionPiiValueWithSecret(normalized, secret);
    return normalizeCollectionPiiValue(decrypted) || null;
  } catch (error) {
    logger.debug("Safe collection PII decrypt returned null after decrypt failure", {
      operation: "decryptCollectionPiiValueWithSecretSafe",
      payloadLength: normalized.length,
      error: error instanceof Error ? error.message : "Unknown decrypt failure",
    });
    return null;
  }
}
