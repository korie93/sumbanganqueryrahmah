// Collection money units are intentionally split:
// - MYR string values are used for API/read models rendered to clients.
// - MYR number values are used for validated inputs and in-memory calculations.
// - cents values are integer minor units used by receipt/OCR/bigint storage paths.

export type CollectionAmountMyrString = string;
export type CollectionAmountMyrNumber = number;
export type CollectionAmountMyrLike = CollectionAmountMyrString | CollectionAmountMyrNumber;

export type CollectionAmountCents = number;
export type CollectionAmountCentsLike = string | CollectionAmountCents;
export type CollectionAmountCentsParseOptions = {
  allowZero?: boolean;
};
export type CollectionAmountMyrParseOptions = CollectionAmountCentsParseOptions;

const COLLECTION_MYR_INPUT_REGEX = /^-?\d+(?:\.\d{1,2})?$/;
const COLLECTION_CENTS_INPUT_REGEX = /^\d+(?:\.\d{1,2})?$/;

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

export function parseCollectionAmountMyrInput(
  value: unknown,
  options?: CollectionAmountMyrParseOptions,
): CollectionAmountMyrNumber | null {
  const cents = parseCollectionAmountToCents(value, options);
  if (cents === null) {
    return null;
  }

  return parseCollectionAmountMyrNumber(formatCollectionAmountFromCents(cents));
}

export function parseCollectionAmountToCents(
  value: unknown,
  options?: CollectionAmountCentsParseOptions,
): CollectionAmountCents | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    // Empty collection amount fields intentionally stay "missing" rather than
    // being coerced to zero so optional receipt metadata remains distinguishable
    // from an explicit MYR 0.00 value.
    return null;
  }

  const normalized = raw.replace(/,/g, "");
  if (!COLLECTION_CENTS_INPUT_REGEX.test(normalized)) {
    return null;
  }

  const [wholePartRaw, fractionPartRaw = ""] = normalized.split(".");
  const wholePart = Number.parseInt(wholePartRaw, 10);
  if (!Number.isSafeInteger(wholePart) || wholePart < 0) {
    return null;
  }
  const fractionPart = Number.parseInt(`${fractionPartRaw}00`.slice(0, 2), 10);
  if (!Number.isSafeInteger(fractionPart) || fractionPart < 0) {
    return null;
  }

  const cents = (wholePart * 100) + fractionPart;
  if (!Number.isSafeInteger(cents)) {
    return null;
  }
  if (!options?.allowZero && cents <= 0) {
    return null;
  }
  if (options?.allowZero && cents < 0) {
    return null;
  }

  return cents;
}

export function parseStoredCollectionAmountCents(
  value: unknown,
): CollectionAmountCents | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  const normalized = String(value).trim();
  if (!normalized || !/^-?\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function formatCollectionAmountFromCents(value: unknown): CollectionAmountMyrString {
  const cents = parseStoredCollectionAmountCents(value);
  if (cents === null) {
    return "0.00";
  }

  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  return `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}

export function formatCollectionCurrencyLabelFromCents(value: unknown): string {
  const amount = parseCollectionAmountMyrNumber(formatCollectionAmountFromCents(value));
  return amount.toLocaleString("en-MY", {
    style: "currency",
    currency: "MYR",
  });
}
