import {
  isValidCollectionDate,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import {
  formatCollectionCurrencyLabelFromCents,
} from "../../../shared/collection-amount-types";

export type CollectionReceiptValidationStatus =
  | "matched"
  | "underpaid"
  | "overpaid"
  | "unverified"
  | "needs_review";
export type CollectionReceiptExtractionStatus =
  | "unprocessed"
  | "suggested"
  | "ambiguous"
  | "unavailable"
  | "error";
export type CollectionReceiptValidationBlockingReason = "underpaid" | "overpaid" | "unverified" | null;

export type CollectionReceiptValidationDraft = {
  receiptId?: string | null | undefined;
  fileHash?: string | null | undefined;
  originalFileName?: string | null | undefined;
  receiptAmountCents?: number | null | undefined;
  extractedAmountCents?: number | null | undefined;
  extractionStatus?: CollectionReceiptExtractionStatus | null | undefined;
  extractionConfidence?: number | null | undefined;
  receiptDate?: string | null | undefined;
  receiptReference?: string | null | undefined;
};

export type CollectionReceiptValidationResult = {
  receiptCount: number;
  receiptTotalAmountCents: number;
  differenceAmountCents: number;
  status: CollectionReceiptValidationStatus;
  message: string;
  blockingReason: CollectionReceiptValidationBlockingReason;
  requiresOverride: boolean;
};
export {
  formatCollectionAmountFromCents,
  formatCollectionCurrencyLabelFromCents,
  parseCollectionAmountToCents,
} from "../../../shared/collection-amount-types";

export function normalizeCollectionReceiptReference(value: unknown): string | null {
  const normalized = normalizeCollectionText(value);
  return normalized ? normalized.slice(0, 140) : null;
}

export function normalizeCollectionReceiptDate(value: unknown): string | null {
  const normalized = normalizeCollectionText(value);
  if (!normalized) {
    return null;
  }
  if (!isValidCollectionDate(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizeCollectionReceiptExtractionStatus(
  value: unknown,
): CollectionReceiptExtractionStatus {
  const normalized = normalizeCollectionText(value).toLowerCase();
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

function hasReceiptOcrReviewSignal(receipt: CollectionReceiptValidationDraft): boolean {
  const status = normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus);
  if (status === "ambiguous" || status === "error") {
    return true;
  }
  if (
    status !== "suggested"
    || receipt.extractedAmountCents === null
    || receipt.extractedAmountCents === undefined
    || receipt.receiptAmountCents === null
    || receipt.receiptAmountCents === undefined
  ) {
    return false;
  }

  const confidence = Number(receipt.extractionConfidence ?? 0);
  const isHighConfidence = Number.isFinite(confidence) ? confidence >= 0.85 : false;
  if (!isHighConfidence) {
    return false;
  }

  return Number(receipt.extractedAmountCents) !== Number(receipt.receiptAmountCents);
}

export function findDuplicateCollectionReceiptHashes(
  receipts: Array<Pick<CollectionReceiptValidationDraft, "fileHash" | "originalFileName">>,
): Array<{ fileHash: string; fileNames: string[] }> {
  const entriesByHash = new Map<string, { fileNames: Set<string>; count: number }>();

  for (const receipt of receipts) {
    const hash = normalizeCollectionText(receipt.fileHash).toLowerCase();
    if (!hash) {
      continue;
    }
    const current = entriesByHash.get(hash) || { fileNames: new Set<string>(), count: 0 };
    const fileName = normalizeCollectionText(receipt.originalFileName) || "receipt";
    current.fileNames.add(fileName);
    current.count += 1;
    entriesByHash.set(hash, current);
  }

  return Array.from(entriesByHash.entries())
    .filter(([, entry]) => entry.count > 1)
    .map(([fileHash, entry]) => ({
      fileHash,
      fileNames: Array.from(entry.fileNames),
    }));
}

export function buildCollectionReceiptValidationResult(params: {
  totalPaidCents: number;
  receipts: CollectionReceiptValidationDraft[];
}): CollectionReceiptValidationResult {
  const activeReceipts = Array.isArray(params.receipts)
    ? params.receipts
    : [];
  const receiptCount = activeReceipts.length;

  if (receiptCount === 0) {
    return {
      receiptCount: 0,
      receiptTotalAmountCents: 0,
      differenceAmountCents: 0 - params.totalPaidCents,
      status: "unverified",
      message: "Tiada resit dilampirkan. Rekod masih belum disahkan melalui jumlah resit.",
      blockingReason: null,
      requiresOverride: false,
    };
  }

  const missingAmountCount = activeReceipts.filter((receipt) => receipt.receiptAmountCents === null || receipt.receiptAmountCents === undefined).length;
  const receiptTotalAmountCents = activeReceipts.reduce(
    (sum, receipt) => sum + (Number.isSafeInteger(receipt.receiptAmountCents) ? Number(receipt.receiptAmountCents) : 0),
    0,
  );

  if (missingAmountCount > 0) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      differenceAmountCents: receiptTotalAmountCents - params.totalPaidCents,
      status: "unverified",
      message: "Setiap resit perlu disahkan jumlahnya sebelum rekod boleh disimpan.",
      blockingReason: "unverified",
      requiresOverride: true,
    };
  }

  if (receiptTotalAmountCents < params.totalPaidCents) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      differenceAmountCents: receiptTotalAmountCents - params.totalPaidCents,
      status: "underpaid",
      message: `Jumlah resit ${formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents)} masih kurang daripada jumlah bayaran ${formatCollectionCurrencyLabelFromCents(params.totalPaidCents)}.`,
      blockingReason: "underpaid",
      requiresOverride: true,
    };
  }

  if (receiptTotalAmountCents > params.totalPaidCents) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      differenceAmountCents: receiptTotalAmountCents - params.totalPaidCents,
      status: "overpaid",
      message: `Jumlah resit ${formatCollectionCurrencyLabelFromCents(receiptTotalAmountCents)} melebihi jumlah bayaran ${formatCollectionCurrencyLabelFromCents(params.totalPaidCents)}.`,
      blockingReason: "overpaid",
      requiresOverride: true,
    };
  }

  if (activeReceipts.some((receipt) => hasReceiptOcrReviewSignal(receipt))) {
    return {
      receiptCount,
      receiptTotalAmountCents,
      differenceAmountCents: 0,
      status: "needs_review",
      message: "Jumlah resit sudah sepadan, tetapi bacaan OCR kelihatan lemah atau bercanggah dan perlu semakan manusia.",
      blockingReason: null,
      requiresOverride: false,
    };
  }

  return {
    receiptCount,
    receiptTotalAmountCents,
    differenceAmountCents: 0,
    status: "matched",
    message: "Jumlah resit sepadan dengan jumlah bayaran yang dimasukkan.",
    blockingReason: null,
    requiresOverride: false,
  };
}
