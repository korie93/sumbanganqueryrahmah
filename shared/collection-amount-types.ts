// Collection money units are intentionally split:
// - MYR string values are used for API/read models rendered to clients.
// - MYR number values are used for validated inputs and in-memory calculations.
// - cents values are integer minor units used by receipt/OCR/bigint storage paths.

export type CollectionAmountMyrString = string;
export type CollectionAmountMyrNumber = number;
export type CollectionAmountMyrLike = CollectionAmountMyrString | CollectionAmountMyrNumber;

export type CollectionAmountCents = number;
export type CollectionAmountCentsLike = string | CollectionAmountCents;

const COLLECTION_MYR_INPUT_REGEX = /^-?\d+(?:\.\d{1,2})?$/;

export function parseCollectionAmountMyrNumber(value: unknown): CollectionAmountMyrNumber {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.parseFloat(value.toFixed(2));
  }

  const normalized = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (!normalized || !COLLECTION_MYR_INPUT_REGEX.test(normalized)) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed)
    ? Number.parseFloat(parsed.toFixed(2))
    : 0;
}

export function formatCollectionAmountMyrString(value: unknown): CollectionAmountMyrString {
  return parseCollectionAmountMyrNumber(value).toFixed(2);
}
