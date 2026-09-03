import {
  CollectionPiiDecryptionError,
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  resolveCollectionPiiFieldValueFailClosed,
  type CollectionPiiFieldName,
} from "../lib/collection-pii-encryption";

const ENCRYPTED_PII_PATTERN = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/;
const SEARCH_HASH_PATTERN = /^[0-9a-f]{64}$/i;

export class CollectionV7BackupPiiValidationError extends Error {
  readonly field: CollectionPiiFieldName;

  constructor(field: CollectionPiiFieldName, reason: string) {
    super(`Collection V7 backup PII ${field} ${reason}.`);
    this.name = "CollectionV7BackupPiiValidationError";
    this.field = field;
  }
}

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function validateOptionalSearchHash(
  _field: CollectionPiiFieldName,
  value: unknown,
): boolean {
  if (isAbsent(value)) return true;
  return typeof value === "string" && SEARCH_HASH_PATTERN.test(value.trim());
}

function validateOptionalSearchHashes(
  field: CollectionPiiFieldName,
  value: unknown,
): boolean {
  if (isAbsent(value)) return true;
  if (!Array.isArray(value) || value.length > 128) return false;
  return value.every((entry) => validateOptionalSearchHash(field, entry));
}

function resolveAndReencryptPiiField(params: {
  field: CollectionPiiFieldName;
  encrypted: unknown;
}): { encrypted: string; plaintext: string } | null {
  if (isAbsent(params.encrypted)) return null;
  if (
    typeof params.encrypted !== "string"
    || params.encrypted !== params.encrypted.trim()
    || params.encrypted.length > 8192
    || !ENCRYPTED_PII_PATTERN.test(params.encrypted)
  ) {
    throw new CollectionPiiDecryptionError("DECRYPTION_FAILED", params.field);
  }

  const plaintext = resolveCollectionPiiFieldValueFailClosed({
    field: params.field,
    plaintext: null,
    encrypted: params.encrypted,
  });
  const encrypted = encryptCollectionPiiFieldValue(plaintext);
  if (!plaintext || !encrypted) {
    throw new CollectionPiiDecryptionError("KEY_NOT_CONFIGURED", params.field);
  }
  return { encrypted, plaintext };
}

export function protectCollectionV7AccountBackupPii(params: {
  encrypted: unknown;
  searchHash: unknown;
}): { encrypted: string | null; searchHash: string | null } {
  if (!validateOptionalSearchHash("accountNumber", params.searchHash)) {
    throw new CollectionV7BackupPiiValidationError("accountNumber", "search hash is invalid");
  }

  const resolved = resolveAndReencryptPiiField({
    field: "accountNumber",
    encrypted: params.encrypted,
  });
  if (!resolved) {
    if (!isAbsent(params.searchHash)) {
      throw new CollectionV7BackupPiiValidationError(
        "accountNumber",
        "search hash has no decryptable source value",
      );
    }
    return { encrypted: null, searchHash: null };
  }

  const searchHash = hashCollectionPiiSearchValue("accountNumber", resolved.plaintext);
  if (!searchHash) {
    throw new CollectionV7BackupPiiValidationError(
      "accountNumber",
      "search hash cannot be recomputed",
    );
  }
  return { encrypted: resolved.encrypted, searchHash };
}

export function protectCollectionV7CustomerBackupPii(params: {
  encrypted: unknown;
  searchHashes?: unknown;
}): { encrypted: string | null; searchHashes: string[] | null } {
  if (!validateOptionalSearchHashes("customerName", params.searchHashes)) {
    throw new CollectionV7BackupPiiValidationError("customerName", "search hashes are invalid");
  }

  const resolved = resolveAndReencryptPiiField({
    field: "customerName",
    encrypted: params.encrypted,
  });
  if (!resolved) {
    if (!isAbsent(params.searchHashes)) {
      throw new CollectionV7BackupPiiValidationError(
        "customerName",
        "search hashes have no decryptable source value",
      );
    }
    return { encrypted: null, searchHashes: null };
  }

  const searchHashes = hashCollectionCustomerNameSearchTerms(resolved.plaintext);
  if (!searchHashes?.length) {
    throw new CollectionV7BackupPiiValidationError(
      "customerName",
      "search hashes cannot be recomputed",
    );
  }
  return { encrypted: resolved.encrypted, searchHashes };
}
