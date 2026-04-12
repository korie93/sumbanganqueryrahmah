import type { CollectionPiiFieldName } from "./collection-pii-encryption-types";

const MIN_CUSTOMER_NAME_SEARCH_TOKEN_LENGTH = 2;
const MAX_CUSTOMER_NAME_SEARCH_PREFIX_LENGTH = 12;

export function normalizeCollectionPiiValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  const normalized = String(value);
  return normalized.trim() ? normalized : "";
}

export function normalizeCollectionPiiSearchValue(
  field: CollectionPiiFieldName,
  value: unknown,
): string {
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

export function collectCustomerNameSearchTerms(value: unknown): string[] {
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
    for (
      let prefixLength = MIN_CUSTOMER_NAME_SEARCH_TOKEN_LENGTH;
      prefixLength <= maxPrefixLength;
      prefixLength += 1
    ) {
      terms.add(compactToken.slice(0, prefixLength));
    }
    if (compactToken.length > maxPrefixLength) {
      terms.add(compactToken);
    }
  }

  return Array.from(terms);
}

export function normalizeCollectionPiiSearchHashArray(value: unknown): string[] {
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
