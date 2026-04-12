import { createHmac } from "node:crypto";
import {
  getCollectionPiiDecryptionSecrets,
  getCollectionPiiEncryptionSecret,
  isCollectionPiiPlaintextRetiredField,
} from "../config/security";
import {
  collectCustomerNameSearchTerms,
  normalizeCollectionPiiSearchHashArray,
  normalizeCollectionPiiSearchValue,
  normalizeCollectionPiiValue,
} from "./collection-pii-encryption-normalize";
import {
  decryptCollectionPiiValueWithSecret,
  decryptCollectionPiiValueWithSecretSafe,
  encryptCollectionPiiWithSecret,
  getCollectionPiiCipherKey,
} from "./collection-pii-encryption-crypto";
export type {
  CollectionPiiFieldName,
  CollectionRecordPiiSearchHashes,
  EncryptedCollectionRecordPiiValues,
} from "./collection-pii-encryption-types";
import type {
  CollectionPiiFieldName,
  CollectionRecordPiiSearchHashes,
  EncryptedCollectionRecordPiiValues,
} from "./collection-pii-encryption-types";

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

export function hashCollectionPiiSearchValue(
  field: CollectionPiiFieldName,
  value: unknown,
): string | null {
  const encryptionSecret = getCollectionPiiEncryptionSecret();
  if (!encryptionSecret) {
    return null;
  }

  const normalized = normalizeCollectionPiiSearchValue(field, value);
  if (!normalized) {
    return null;
  }

  return createHmac("sha256", getCollectionPiiCipherKey(encryptionSecret))
    .update(`${field}:${normalized}`)
    .digest("hex");
}

export function hashCollectionCustomerNameSearchTerms(value: unknown): string[] | null {
  const terms = collectCustomerNameSearchTerms(value);
  if (terms.length === 0) {
    return null;
  }

  const hashes = Array.from(
    new Set(
      terms
        .map((term) => hashCollectionPiiSearchValue("customerName", term))
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    ),
  );
  return hashes.length > 0 ? hashes : null;
}

export function buildCollectionRecordPiiSearchHashes(values: {
  customerName: unknown;
  icNumber: unknown;
  customerPhone: unknown;
  accountNumber: unknown;
}): CollectionRecordPiiSearchHashes | null {
  const customerNameSearchHash = hashCollectionPiiSearchValue("customerName", values.customerName);
  const customerNameSearchHashes = hashCollectionCustomerNameSearchTerms(values.customerName);
  const icNumberSearchHash = hashCollectionPiiSearchValue("icNumber", values.icNumber);
  const customerPhoneSearchHash = hashCollectionPiiSearchValue("customerPhone", values.customerPhone);
  const accountNumberSearchHash = hashCollectionPiiSearchValue("accountNumber", values.accountNumber);

  if (
    customerNameSearchHash === null
    && customerNameSearchHashes === null
    && icNumberSearchHash === null
    && customerPhoneSearchHash === null
    && accountNumberSearchHash === null
  ) {
    return null;
  }

  return {
    customerNameSearchHash,
    customerNameSearchHashes,
    icNumberSearchHash,
    customerPhoneSearchHash,
    accountNumberSearchHash,
  };
}

export function decryptCollectionPiiValue(payload: string): string {
  for (const secret of getCollectionPiiDecryptionSecrets()) {
    try {
      return decryptCollectionPiiValueWithSecret(payload, secret);
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
  field?: CollectionPiiFieldName;
  plaintext: unknown;
  encrypted: unknown;
  fallback?: string;
}): string {
  const decrypted = decryptCollectionPiiValueSafe(params.encrypted);
  if (decrypted) {
    return decrypted;
  }

  if (params.field && isCollectionPiiPlaintextRetiredField(params.field)) {
    return params.fallback ?? "";
  }

  const plaintext = normalizeCollectionPiiValue(params.plaintext);
  if (plaintext) {
    return plaintext;
  }

  return params.fallback ?? "";
}

export function resolveCollectionCustomerNameSearchHashesValue(params: {
  plaintext: unknown;
  encrypted?: unknown;
  hashes?: unknown;
}): string[] | null {
  const resolved = resolveCollectionPiiFieldValue({
    field: "customerName",
    plaintext: params.plaintext,
    encrypted: params.encrypted,
  });
  const recomputedHashes = hashCollectionCustomerNameSearchTerms(resolved);
  if (recomputedHashes?.length) {
    return recomputedHashes;
  }

  const fallbackHashes = normalizeCollectionPiiSearchHashArray(params.hashes);
  return fallbackHashes.length > 0 ? fallbackHashes : null;
}

export function resolveStoredCollectionPiiPlaintextValue(params: {
  field?: CollectionPiiFieldName;
  plaintext: unknown;
  encrypted?: unknown;
  fallback?: string | null;
}): string | null {
  const plaintext = normalizeCollectionPiiValue(params.plaintext);
  const encrypted = normalizeCollectionPiiValue(params.encrypted);
  if (params.field && isCollectionPiiPlaintextRetiredField(params.field)) {
    if (!hasCollectionPiiEncryptionConfigured() && plaintext) {
      throw new Error(
        `Cannot retire collection PII plaintext for ${params.field} without COLLECTION_PII_ENCRYPTION_KEY.`,
      );
    }
    if (plaintext && !encrypted) {
      throw new Error(
        `Cannot persist retired collection PII field ${params.field} without an encrypted shadow value.`,
      );
    }
    return params.fallback ?? null;
  }

  if (encrypted && hasCollectionPiiEncryptionConfigured()) {
    return params.fallback ?? null;
  }

  if (plaintext) {
    return plaintext;
  }

  return params.fallback ?? null;
}

export function hasUnreadableCollectionPiiShadowValue(params: {
  plaintext: unknown;
  encrypted: unknown;
}): boolean {
  const encrypted = normalizeCollectionPiiValue(params.encrypted);
  if (!encrypted) {
    return false;
  }

  const decrypted = decryptCollectionPiiValueSafe(encrypted);
  if (decrypted) {
    return false;
  }

  return normalizeCollectionPiiValue(params.plaintext).length === 0;
}

export function shouldRewriteCollectionPiiShadowValue(params: {
  plaintext: unknown;
  encrypted: unknown;
}): boolean {
  const resolved = resolveCollectionPiiFieldValue({
    plaintext: params.plaintext,
    encrypted: params.encrypted,
  });
  if (!resolved) {
    return false;
  }

  const currentSecret = getCollectionPiiEncryptionSecret();
  if (!currentSecret) {
    return false;
  }

  return decryptCollectionPiiValueWithSecretSafe(params.encrypted, currentSecret) !== resolved;
}

export function shouldRewriteCollectionPiiSearchHashValue(params: {
  field: CollectionPiiFieldName;
  plaintext: unknown;
  encrypted?: unknown;
  hash: unknown;
}): boolean {
  const resolved = resolveCollectionPiiFieldValue({
    field: params.field,
    plaintext: params.plaintext,
    encrypted: params.encrypted,
  });
  if (!resolved) {
    return false;
  }

  const nextHash = hashCollectionPiiSearchValue(params.field, resolved);
  if (!nextHash) {
    return false;
  }

  return normalizeCollectionPiiValue(params.hash) !== nextHash;
}

export function shouldRewriteCollectionPiiSearchHashesValue(params: {
  plaintext: unknown;
  encrypted?: unknown;
  hashes: unknown;
}): boolean {
  const resolved = resolveCollectionPiiFieldValue({
    field: "customerName",
    plaintext: params.plaintext,
    encrypted: params.encrypted,
  });
  if (!resolved) {
    return false;
  }

  const nextHashes = hashCollectionCustomerNameSearchTerms(resolved);
  if (!nextHashes || nextHashes.length === 0) {
    return false;
  }

  const currentHashes = normalizeCollectionPiiSearchHashArray(params.hashes);
  if (currentHashes.length !== nextHashes.length) {
    return true;
  }

  const sortedNextHashes = [...nextHashes].sort();
  return sortedNextHashes.some((value, index) => currentHashes[index] !== value);
}

export function shouldRedactCollectionPiiPlaintextValue(params: {
  field: CollectionPiiFieldName;
  plaintext: unknown;
  encrypted?: unknown;
  hash: unknown;
  hashes?: unknown;
}): boolean {
  const plaintext = normalizeCollectionPiiValue(params.plaintext);
  if (!plaintext) {
    return false;
  }

  if (
    shouldRewriteCollectionPiiShadowValue({
      plaintext,
      encrypted: params.encrypted,
    })
  ) {
    return false;
  }

  if (
    shouldRewriteCollectionPiiSearchHashValue({
      field: params.field,
      plaintext,
      encrypted: params.encrypted,
      hash: params.hash,
    })
  ) {
    return false;
  }

  if (
    params.field === "customerName"
    && shouldRewriteCollectionPiiSearchHashesValue({
      plaintext,
      encrypted: params.encrypted,
      hashes: params.hashes,
    })
  ) {
    return false;
  }

  return true;
}
