import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  getCollectionPiiDecryptionSecrets,
  getCollectionPiiEncryptionSecret,
} from "../config/security";

export type EncryptedCollectionRecordPiiValues = {
  customerNameEncrypted: string | null;
  icNumberEncrypted: string | null;
  customerPhoneEncrypted: string | null;
  accountNumberEncrypted: string | null;
};

function getCollectionPiiCipherKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function normalizeCollectionPiiValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  const normalized = String(value);
  return normalized.trim() ? normalized : "";
}

function encryptCollectionPiiWithSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCollectionPiiCipherKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function hasCollectionPiiEncryptionConfigured(): boolean {
  return Boolean(getCollectionPiiEncryptionSecret());
}

export function encryptCollectionPiiFieldValue(value: unknown): string | null {
  const encryptionSecret = getCollectionPiiEncryptionSecret();
  if (!encryptionSecret) {
    return null;
  }

  return encryptCollectionPiiWithSecret(
    normalizeCollectionPiiValue(value),
    encryptionSecret,
  );
}

export function buildEncryptedCollectionRecordPiiValues(values: {
  customerName: unknown;
  icNumber: unknown;
  customerPhone: unknown;
  accountNumber: unknown;
}): EncryptedCollectionRecordPiiValues | null {
  const encryptionSecret = getCollectionPiiEncryptionSecret();
  if (!encryptionSecret) {
    return null;
  }

  return {
    customerNameEncrypted: encryptCollectionPiiWithSecret(normalizeCollectionPiiValue(values.customerName), encryptionSecret),
    icNumberEncrypted: encryptCollectionPiiWithSecret(normalizeCollectionPiiValue(values.icNumber), encryptionSecret),
    customerPhoneEncrypted: encryptCollectionPiiWithSecret(normalizeCollectionPiiValue(values.customerPhone), encryptionSecret),
    accountNumberEncrypted: encryptCollectionPiiWithSecret(normalizeCollectionPiiValue(values.accountNumber), encryptionSecret),
  };
}

export function decryptCollectionPiiValue(payload: string): string {
  const [ivRaw, ciphertextRaw, tagRaw] = String(payload || "").split(".");
  if (!ivRaw || !ciphertextRaw || !tagRaw) {
    throw new Error("Invalid collection PII payload.");
  }

  const iv = Buffer.from(ivRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");
  const tag = Buffer.from(tagRaw, "base64url");

  for (const secret of getCollectionPiiDecryptionSecrets()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", getCollectionPiiCipherKey(secret), iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return plaintext.toString("utf8");
    } catch {
      continue;
    }
  }

  throw new Error("Invalid collection PII payload.");
}

export function decryptCollectionPiiValueSafe(payload: unknown): string | null {
  const normalized = normalizeCollectionPiiValue(payload);
  if (!normalized) {
    return null;
  }

  try {
    const decrypted = decryptCollectionPiiValue(normalized);
    return normalizeCollectionPiiValue(decrypted) || null;
  } catch {
    return null;
  }
}

export function resolveCollectionPiiFieldValue(params: {
  plaintext: unknown;
  encrypted: unknown;
  fallback?: string;
}): string {
  const plaintext = normalizeCollectionPiiValue(params.plaintext);
  if (plaintext) {
    return plaintext;
  }

  const decrypted = decryptCollectionPiiValueSafe(params.encrypted);
  if (decrypted) {
    return decrypted;
  }

  return params.fallback ?? "";
}
