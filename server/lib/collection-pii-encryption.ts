import { createHmac } from "node:crypto";
import {
  getCollectionPiiDecryptionSecrets,
  getCollectionPiiEncryptionSecret,
  isCollectionPiiPlaintextRetiredField,
} from "../config/security";
import { internalMetrics } from "../internal/metrics";
import { logger } from "./logger";
import {
  collectCustomerNameSearchTerms,
  normalizeCollectionPiiSearchHashArray,
  normalizeCollectionPiiSearchValue,
  normalizeCollectionPiiValue,
} from "./collection-pii-encryption-normalize";
import {
  decryptCollectionPiiValueWithSecret,
  decryptCollectionPiiValueWithCurrentDerivationOnly,
  encryptCollectionPiiWithSecret,
  getCollectionPiiBlindIndexKey,
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

const MAX_COLLECTION_PII_DECRYPT_WARNINGS = 5;
let collectionPiiDecryptWarningCount = 0;

export type CollectionPiiDecryptionFailureReason =
  | "EMPTY_PAYLOAD"
  | "KEY_NOT_CONFIGURED"
  | "DECRYPTION_FAILED";

export type CollectionPiiDecryptResult =
  | { success: true; data: string }
  | { success: false; reason: CollectionPiiDecryptionFailureReason };

export type CollectionRecordPiiFieldValues = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
};

export class CollectionPiiDecryptionError extends Error {
  readonly reason: CollectionPiiDecryptionFailureReason;
  readonly field?: CollectionPiiFieldName;

  constructor(
    reason: CollectionPiiDecryptionFailureReason,
    field?: CollectionPiiFieldName,
  ) {
    super("Collection PII field cannot be decrypted.");
    this.name = "CollectionPiiDecryptionError";
    this.reason = reason;
    if (field !== undefined) {
      this.field = field;
    }
  }
}

function summarizeCollectionPiiDecryptError(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "string") {
    return { type: "string" };
  }

  return undefined;
}

function recordCollectionPiiDecryptFailure(params: {
  operation: string;
  payloadLength: number;
  reason: CollectionPiiDecryptionFailureReason;
  error?: unknown;
}): void {
  internalMetrics.increment("collectionPiiDecryptFallbackTotal");
  if (collectionPiiDecryptWarningCount >= MAX_COLLECTION_PII_DECRYPT_WARNINGS) {
    return;
  }

  collectionPiiDecryptWarningCount += 1;
  logger.warn("Failed to decrypt collection PII shadow value", {
    operation: params.operation,
    payloadLength: params.payloadLength,
    reason: params.reason,
    suppressedAfter: MAX_COLLECTION_PII_DECRYPT_WARNINGS,
    error: summarizeCollectionPiiDecryptError(params.error),
  });
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

  return createHmac("sha256", getCollectionPiiBlindIndexKey(encryptionSecret))
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
  const secrets = getCollectionPiiDecryptionSecrets();
  for (const [secretIndex, secret] of secrets.entries()) {
    try {
      return decryptCollectionPiiValueWithSecret(payload, secret);
    } catch (error) {
      logger.debug("Collection PII decryption candidate failed", {
        operation: "decryptCollectionPiiValue",
        payloadLength: payload.length,
        secretIndex,
        secretCount: secrets.length,
        error: summarizeCollectionPiiDecryptError(error),
      });
      continue;
    }
  }

  throw new Error("Invalid collection PII payload.");
}

export function decryptCollectionPiiValueResult(
  payload: unknown,
  params: {
    operation?: string;
    logFailure?: boolean;
  } = {},
): CollectionPiiDecryptResult {
  const normalized = normalizeCollectionPiiValue(payload);
  if (!normalized) {
    return { success: false, reason: "EMPTY_PAYLOAD" };
  }

  const secrets = getCollectionPiiDecryptionSecrets();
  if (secrets.length === 0) {
    if (params.logFailure !== false) {
      recordCollectionPiiDecryptFailure({
        operation: params.operation ?? "decryptCollectionPiiValueResult",
        payloadLength: normalized.length,
        reason: "KEY_NOT_CONFIGURED",
      });
    }
    return { success: false, reason: "KEY_NOT_CONFIGURED" };
  }

  try {
    const decrypted = decryptCollectionPiiValue(normalized);
    return { success: true, data: normalizeCollectionPiiValue(decrypted) };
  } catch (error) {
    if (params.logFailure !== false) {
      recordCollectionPiiDecryptFailure({
        operation: params.operation ?? "decryptCollectionPiiValueResult",
        payloadLength: normalized.length,
        reason: "DECRYPTION_FAILED",
        error,
      });
    }
    return { success: false, reason: "DECRYPTION_FAILED" };
  }
}

export function decryptCollectionPiiValueSafe(payload: unknown): string | null {
  const result = decryptCollectionPiiValueResult(payload, {
    operation: "decryptCollectionPiiValueSafe",
  });
  if (!result.success) {
    return null;
  }

  return result.data || null;
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

export function resolveCollectionPiiFieldValueFailClosed(params: {
  field?: CollectionPiiFieldName;
  plaintext: unknown;
  encrypted: unknown;
  fallback?: string;
}): string {
  const encrypted = normalizeCollectionPiiValue(params.encrypted);
  if (encrypted) {
    const result = decryptCollectionPiiValueResult(encrypted, {
      operation: "resolveCollectionPiiFieldValueFailClosed",
      logFailure: false,
    });
    if (result.success) {
      return result.data;
    }

    internalMetrics.increment("collectionPiiDecryptFailClosedTotal");
    logger.error("Collection PII decryption failed closed", {
      operation: "resolveCollectionPiiFieldValueFailClosed",
      source: params.field ?? "unknown",
      payloadLength: encrypted.length,
      reason: result.reason,
    });
    throw new CollectionPiiDecryptionError(result.reason, params.field);
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

export function resolveCollectionRecordPiiValuesFailClosed(params: {
  customerName: { plaintext: unknown; encrypted: unknown };
  icNumber: { plaintext: unknown; encrypted: unknown };
  customerPhone: { plaintext: unknown; encrypted: unknown };
  accountNumber: { plaintext: unknown; encrypted: unknown };
}): CollectionRecordPiiFieldValues {
  return {
    customerName: resolveCollectionPiiFieldValueFailClosed({
      field: "customerName",
      plaintext: params.customerName.plaintext,
      encrypted: params.customerName.encrypted,
    }),
    icNumber: resolveCollectionPiiFieldValueFailClosed({
      field: "icNumber",
      plaintext: params.icNumber.plaintext,
      encrypted: params.icNumber.encrypted,
    }),
    customerPhone: resolveCollectionPiiFieldValueFailClosed({
      field: "customerPhone",
      plaintext: params.customerPhone.plaintext,
      encrypted: params.customerPhone.encrypted,
    }),
    accountNumber: resolveCollectionPiiFieldValueFailClosed({
      field: "accountNumber",
      plaintext: params.accountNumber.plaintext,
      encrypted: params.accountNumber.encrypted,
    }),
  };
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

  try {
    return decryptCollectionPiiValueWithCurrentDerivationOnly(
      normalizeCollectionPiiValue(params.encrypted),
      currentSecret,
    ) !== resolved;
  } catch {
    return true;
  }
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
