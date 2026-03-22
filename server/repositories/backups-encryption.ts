import crypto from "crypto";

const BACKUP_DATA_ENCRYPTION_PREFIX_V1 = "enc:v1:";
const BACKUP_DATA_ENCRYPTION_PREFIX_V2 = "enc:v2:";
const BACKUP_DATA_DEFAULT_KEY_ID = "default";

export type BackupEncryptionConfig = {
  requireEncryption: boolean;
  primaryKeyId: string | null;
  keysById: Map<string, Buffer>;
};

function parseEncryptionKey(raw: string): Buffer | null {
  const normalized = String(raw || "").trim();
  if (!normalized) return null;

  const fromHex = /^[a-f0-9]{64}$/i.test(normalized) ? Buffer.from(normalized, "hex") : null;
  if (fromHex && fromHex.length === 32) return fromHex;

  const base64Candidate = /^[A-Za-z0-9+/=]+$/.test(normalized) ? Buffer.from(normalized, "base64") : null;
  if (base64Candidate && base64Candidate.length === 32) return base64Candidate;

  const utf8 = Buffer.from(normalized, "utf8");
  if (utf8.length === 32) return utf8;

  return null;
}

function normalizeEncryptionKeyId(raw: string): string | null {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_-]{1,64}$/.test(normalized)) return null;
  return normalized;
}

function parseEncryptionKeyMap(raw: string): Map<string, Buffer> {
  const keysById = new Map<string, Buffer>();
  const entries = String(raw || "")
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(":");
    const keyIdRaw = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : BACKUP_DATA_DEFAULT_KEY_ID;
    const keyRaw = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : entry;
    const keyId = normalizeEncryptionKeyId(keyIdRaw);
    const key = parseEncryptionKey(keyRaw);
    if (!keyId || !key) continue;
    keysById.set(keyId, key);
  }

  return keysById;
}

function decryptBackupPayloadWithKey(
  ivBase64: string,
  authTagBase64: string,
  ciphertextBase64: string,
  key: Buffer,
): string {
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const ciphertext = Buffer.from(ciphertextBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function getPrimaryBackupEncryptionKey(config: BackupEncryptionConfig): { keyId: string; key: Buffer } | null {
  const keyId = config.primaryKeyId;
  if (!keyId) return null;
  const key = config.keysById.get(keyId);
  if (!key) return null;
  return { keyId, key };
}

export function resolveBackupEncryptionConfig(
  env: Record<string, string | undefined>,
  requireEncryption: boolean,
): BackupEncryptionConfig {
  const envMap = parseEncryptionKeyMap(String(env.BACKUP_ENCRYPTION_KEYS || ""));
  const singleRawKey = String(env.BACKUP_ENCRYPTION_KEY || "").trim();
  const singleKey = parseEncryptionKey(singleRawKey);
  const singleKeyId =
    normalizeEncryptionKeyId(String(env.BACKUP_ENCRYPTION_KEY_ID || ""))
    || BACKUP_DATA_DEFAULT_KEY_ID;

  if (singleKey && !envMap.has(singleKeyId)) {
    envMap.set(singleKeyId, singleKey);
  }

  const preferredKeyId = normalizeEncryptionKeyId(String(env.BACKUP_ENCRYPTION_KEY_ID || ""));
  const primaryKeyId = preferredKeyId && envMap.has(preferredKeyId)
    ? preferredKeyId
    : envMap.keys().next().value || null;

  if (preferredKeyId && !envMap.has(preferredKeyId)) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY_ID '${preferredKeyId}' is configured but no matching key exists in BACKUP_ENCRYPTION_KEY(S).`,
    );
  }

  return {
    requireEncryption,
    primaryKeyId,
    keysById: envMap,
  };
}

export function assertBackupEncryptionConfig(config: BackupEncryptionConfig) {
  if (!config.requireEncryption) {
    return;
  }
  if (config.keysById.size > 0 && config.primaryKeyId) {
    return;
  }
  throw new Error(
    "Backup encryption is required outside development/test. Configure BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS.",
  );
}

export function encodeBackupDataForStorage(rawPayload: string, config: BackupEncryptionConfig): string {
  const primaryKey = getPrimaryBackupEncryptionKey(config);
  if (!primaryKey) {
    if (config.requireEncryption) {
      throw new Error(
        "Backup encryption key is required outside development/test environments.",
      );
    }
    return rawPayload;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", primaryKey.key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(rawPayload, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${BACKUP_DATA_ENCRYPTION_PREFIX_V2}${primaryKey.keyId}.${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decodeBackupDataFromStorage(rawPayload: string, config: BackupEncryptionConfig): string {
  const normalized = String(rawPayload || "");
  if (normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V2)) {
    const token = normalized.slice(BACKUP_DATA_ENCRYPTION_PREFIX_V2.length);
    const [keyIdRaw, ivBase64, authTagBase64, ciphertextBase64] = token.split(".");
    const keyId = normalizeEncryptionKeyId(keyIdRaw || "");
    if (!keyId || !ivBase64 || !authTagBase64 || !ciphertextBase64) {
      throw new Error("Stored backup payload has an invalid encrypted format.");
    }

    const key = config.keysById.get(keyId);
    if (!key) {
      throw new Error(
        `Missing backup encryption key '${keyId}'. Configure BACKUP_ENCRYPTION_KEYS for key rotation support.`,
      );
    }

    return decryptBackupPayloadWithKey(ivBase64, authTagBase64, ciphertextBase64, key);
  }

  if (!normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V1)) {
    return normalized;
  }

  if (config.keysById.size === 0) {
    throw new Error("BACKUP_ENCRYPTION_KEY(S) is required to decrypt stored backup data.");
  }

  const token = normalized.slice(BACKUP_DATA_ENCRYPTION_PREFIX_V1.length);
  const [ivBase64, authTagBase64, ciphertextBase64] = token.split(".");
  if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
    throw new Error("Stored backup payload has an invalid encrypted format.");
  }

  for (const key of config.keysById.values()) {
    try {
      return decryptBackupPayloadWithKey(ivBase64, authTagBase64, ciphertextBase64, key);
    } catch {
      // Try the next key to support rotation of legacy v1 payloads without key id.
    }
  }

  throw new Error("Unable to decrypt legacy encrypted backup payload with configured backup encryption keys.");
}
