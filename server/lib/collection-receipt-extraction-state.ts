export type NormalizedCollectionReceiptExtractionStatus =
  | "unprocessed"
  | "suggested"
  | "ambiguous"
  | "unavailable"
  | "error";

function normalizeNullableCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

export function normalizeCollectionReceiptExtractionStatusValue(
  value: unknown,
): NormalizedCollectionReceiptExtractionStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "suggested"
    || normalized === "ambiguous"
    || normalized === "unavailable"
    || normalized === "error"
  ) {
    return normalized;
  }

  return "unprocessed";
}

export function normalizeCollectionReceiptExtractionState(params: {
  receiptAmountCents?: unknown;
  extractedAmountCents?: unknown;
  extractionStatus?: unknown;
}): {
  receiptAmountCents: number | null;
  extractedAmountCents: number | null;
  extractionStatus: NormalizedCollectionReceiptExtractionStatus;
} {
  const receiptAmountCents = normalizeNullableCents(params.receiptAmountCents);
  let extractedAmountCents = normalizeNullableCents(params.extractedAmountCents);
  let extractionStatus = normalizeCollectionReceiptExtractionStatusValue(params.extractionStatus);

  if (extractionStatus === "suggested" && extractedAmountCents === null) {
    if (receiptAmountCents !== null) {
      extractedAmountCents = receiptAmountCents;
    } else {
      extractionStatus = "unprocessed";
    }
  }

  return {
    receiptAmountCents,
    extractedAmountCents,
    extractionStatus,
  };
}
