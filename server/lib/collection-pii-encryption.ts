import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import {
  getCollectionPiiDecryptionSecrets,
  getCollectionPiiEncryptionSecret,
  isCollectionPiiPlaintextRetiredField,
} from "../config/security";

export type EncryptedCollectionRecordPiiValues = {
  customerNameEncrypted: string | null;
  icNumberEncrypted: string | null;
  customerPhoneEncrypted: string | null;
  accountNumberEncrypted: string | null;
};

export type CollectionRecordPiiSearchHashes = {
  customerNameSearchHash: string | null;
  customerNameSearchHashes: string[] | null;
  icNumberSearchHash: string | null;
  customerPhoneSearchHash: string | null;
  accountNumberSearchHash: string | null;
};

export type CollectionPiiFieldName =
  | "customerName"
  | "icNumber"
  | "customerPhone"
  | "accountNumber";

const MIN_CUSTOMER_NAME_SEARCH_TOKEN_LENGTH = 2;
const MAX_CUSTOMER_NAME_SEARCH_PREFIX_LENGTH = 12;

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

function normalizeCollectionPiiSearchValue(field: CollectionPiiFieldName, value: unknown): string {
  const normalized = normalizeCollectionPiiValue(value);
  if (!normalized) {
    return "";
  }

  if (field === "customerPhone") {
    const digits = normalized.replace(/\D+/g, "");
    if (digits.startsWith("0060") && digits.length > 4) {
      return `0${digits.slice(4)}`;
    }
    if (digits.startsWith("60") && digits.length > 2) {
      return `0${digits.slice(2)}`;
    }
    return digits;
  }
  if (field === "icNumber") {
    return normalized.replace(/[^0-9A-Za-z]+/g, "").toUpperCase();
  }
  if (field === "accountNumber") {
    return normalized.replace(/\s+/g, "").toUpperCase();
  }

  return normalized.trim().replace(/\s+/g, " ").toLowerCase();
}

function collectCustomerNameSearchTerms(value: unknown): string[] {
  const normalized = normalizeCollectionPiiSearchValue("customerName", value);
  if (!normalized) {
    return [];
  }

  const terms = new Set<string>();
  for (const token of normalized.split(" ")) {
    const compactToken = token.trim();
    if (compactToken.length < MIN_CUSTOMER_NAME_SEARCH_TOKEN_LENGTH) {
      continue;
    }

    const maxPrefixLength = Math.min(
      compactToken.length,
      MAX_CUSTOMER_NAME_SEARCH_PREFIX_LENGTH,
    );
    for (let prefixLength = MIN_CUSTOMER_NAME_SEARCH_TOKEN_LENGTH; prefixLength <= maxPrefixLength; prefixLength += 1) {
      terms.add(compactToken.slice(0, prefixLength));
    }
    if (compactToken.length > maxPrefixLength) {
      terms.add(compactToken);
    }
  }

  return Array.from(terms);
}

function normalizeCollectionPiiSearchHashArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeCollectionPiiValue(entry))
        .filter(Boolean),
    ),
  ).sort();
}

function encryptCollectionPiiWithSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCollectionPiiCipherKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

function decryptCollectionPiiValueWithSecret(payload: string, secret: string): string {
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

function decryptCollectionPiiValueWithSecretSafe(payload: unknown, secret: string): string | null {
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
