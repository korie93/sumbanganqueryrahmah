import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { normalizeCollectionPiiValue } from "./collection-pii-encryption-normalize";

export function getCollectionPiiCipherKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptCollectionPiiWithSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCollectionPiiCipherKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptCollectionPiiValueWithSecret(payload: string, secret: string): string {
  const [ivRaw, ciphertextRaw, tagRaw] = String(payload || "").split(".");
  if (!ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Invalid collection PII payload.");
  }

  const iv = Buffer.from(ivRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");
  const tag = Buffer.from(tagRaw, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", getCollectionPiiCipherKey(secret), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function decryptCollectionPiiValueWithSecretSafe(payload: unknown, secret: string): string | null {
  const normalized = normalizeCollectionPiiValue(payload);
  if (!normalized) {
    return null;
  }

  try {
    const decrypted = decryptCollectionPiiValueWithSecret(normalized, secret);
    return normalizeCollectionPiiValue(decrypted) || null;
  } catch {
    return null;
  }
}
