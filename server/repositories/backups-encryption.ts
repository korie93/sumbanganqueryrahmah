import crypto from "crypto";
import { internalMetrics } from "../internal/metrics";
import { logger } from "../lib/logger";

export const BACKUP_DATA_ENCRYPTION_PREFIX_V1 = "enc:v1:";
export const BACKUP_DATA_ENCRYPTION_PREFIX_V2 = "enc:v2:";
export const BACKUP_DATA_ENCRYPTION_PREFIX_V3 = "enc:v3:";
const BACKUP_DATA_DEFAULT_KEY_ID = "default";
const BACKUP_DATA_GCM_IV_BYTES = 12;
const BACKUP_DATA_GCM_AUTH_TAG_BYTES = 16;

export type BackupEncryptionConfig = {
  requireEncryption: boolean;
  allowLegacyUnencryptedRead?: boolean;
  primaryKeyId: string | null;
  keysById: Map<string, Buffer>;
};

export class BackupPayloadIntegrityError extends Error {
  constructor(message = "Backup payload failed integrity verification.") {
    super(message);
    this.name = "BackupPayloadIntegrityError";
  }
}

export class LegacyUnencryptedBackupPolicyError extends Error {
  constructor() {
    super("Stored backup payload is unencrypted and blocked by the backup encryption policy.");
    this.name = "LegacyUnencryptedBackupPolicyError";
  }
}

export function assertLegacyUnencryptedBackupReadAllowed(
  config: BackupEncryptionConfig,
): void {
  if (!config.requireEncryption) {
    return;
  }

  internalMetrics.increment("backupLegacyUnencryptedReadAttemptsTotal");

  if (config.allowLegacyUnencryptedRead === true) {
    logger.warn("Legacy unencrypted backup payload read allowed by emergency override", {
      event: "backup_legacy_unencrypted_read",
      action: "ALLOWED_BY_OVERRIDE",
    });
    return;
  }

  logger.error("Legacy unencrypted backup payload blocked by encryption policy", {
    event: "backup_legacy_unencrypted_read",
    action: "BLOCKED",
  });
  throw new LegacyUnencryptedBackupPolicyError();
}

export function isEncodedBackupDataForStorage(rawPayload: string): boolean {
  const normalized = String(rawPayload || "");
  return normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V1)
    || normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V2)
    || normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V3);
}

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

export function buildBackupPayloadAad(keyId: string): Buffer {
  return Buffer.from(`sqr-backup-payload:v3:${keyId}`, "utf8");
}

export function createBackupPayloadCipher(
  keyId: string,
  key: Buffer,
  iv: Buffer,
): crypto.CipherGCM {
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildBackupPayloadAad(keyId));
  return cipher;
}

export function createBackupPayloadStoragePrefix(
  keyId: string,
  iv: Buffer,
  authTag: Buffer,
): string {
  return `${BACKUP_DATA_ENCRYPTION_PREFIX_V3}${keyId}.${iv.toString("base64")}.${authTag.toString("base64")}.`;
}

export function recordBackupIntegrityFailure(params: {
  keyId: string;
  version: "v2" | "v3";
  error: unknown;
}) {
  internalMetrics.increment("backupPayloadIntegrityFailuresTotal");
  logger.error("Backup payload failed authenticated decryption", {
    event: "backup_payload_integrity_check_failed",
    keyId: params.keyId,
    version: params.version,
    errorName: params.error instanceof Error ? params.error.name : "UnknownError",
  });
}

function assertGcmEnvelope(iv: Buffer, authTag: Buffer) {
  if (iv.length !== BACKUP_DATA_GCM_IV_BYTES) {
    throw new BackupPayloadIntegrityError("Stored backup payload has an invalid AES-GCM IV length.");
  }
  if (authTag.length !== BACKUP_DATA_GCM_AUTH_TAG_BYTES) {
    throw new BackupPayloadIntegrityError("Stored backup payload has an invalid AES-GCM authentication tag length.");
  }
}

function decryptBackupPayloadWithKey(params: {
  ivBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
  key: Buffer;
  keyId: string;
  recordIntegrityFailure?: boolean;
  version: "v1" | "v2" | "v3";
}): string {
  const {
    authTagBase64,
    ciphertextBase64,
    ivBase64,
    key,
    keyId,
    recordIntegrityFailure = true,
    version,
  } = params;

  try {
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    assertGcmEnvelope(iv, authTag);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    if (version === "v3") {
      decipher.setAAD(buildBackupPayloadAad(keyId));
    }
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    if (recordIntegrityFailure && version !== "v1") {
      recordBackupIntegrityFailure({ keyId, version, error });
    }
    throw error instanceof BackupPayloadIntegrityError
      ? error
      : new BackupPayloadIntegrityError();
  }
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
  options: { allowLegacyUnencryptedRead?: boolean } = {},
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
    allowLegacyUnencryptedRead: options.allowLegacyUnencryptedRead === true,
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
  if (isEncodedBackupDataForStorage(rawPayload)) {
    return String(rawPayload || "");
  }

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
  const cipher = createBackupPayloadCipher(primaryKey.keyId, primaryKey.key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(rawPayload, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${createBackupPayloadStoragePrefix(primaryKey.keyId, iv, authTag)}${ciphertext.toString("base64")}`;
}

export function decodeBackupDataFromStorage(rawPayload: string, config: BackupEncryptionConfig): string {
  const normalized = String(rawPayload || "");
  if (
    normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V3)
    || normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V2)
  ) {
    const version = normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V3) ? "v3" : "v2";
    const prefix = version === "v3" ? BACKUP_DATA_ENCRYPTION_PREFIX_V3 : BACKUP_DATA_ENCRYPTION_PREFIX_V2;
    const token = normalized.slice(prefix.length);
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

    return decryptBackupPayloadWithKey({
      authTagBase64,
      ciphertextBase64,
      ivBase64,
      key,
      keyId,
      version,
    });
  }

  if (!normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V1)) {
    assertLegacyUnencryptedBackupReadAllowed(config);
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
      return decryptBackupPayloadWithKey({
        authTagBase64,
        ciphertextBase64,
        ivBase64,
        key,
        keyId: BACKUP_DATA_DEFAULT_KEY_ID,
        recordIntegrityFailure: false,
        version: "v1",
      });
    } catch {
      // Try the next key to support rotation of legacy v1 payloads without key id.
    }
  }

  throw new Error("Unable to decrypt legacy encrypted backup payload with configured backup encryption keys.");
}
