import type { CollectionRecord, CollectionReceiptValidationStatus } from "@/lib/api";

export type CollectionReceiptReviewSummary = {
  totalRecords: number;
  matchedCount: number;
  mismatchCount: number;
  needsAttentionCount: number;
  duplicateWarningCount: number;
  flaggedCount: number;
  flaggedRecords: CollectionRecord[];
};

export function getCollectionReceiptValidationStatusLabel(
  status: CollectionReceiptValidationStatus,
) {
  if (status === "matched") return "Matched";
  if (status === "underpaid") return "Underpaid";
  if (status === "overpaid") return "Overpaid";
  if (status === "unverified") return "Unverified";
  return "Needs Review";
}

export function getCollectionReceiptReviewFilterLabel(
  status: CollectionReceiptValidationStatus | "flagged",
) {
  if (status === "flagged") {
    return "Flagged only";
  }
  return getCollectionReceiptValidationStatusLabel(status);
}

export function isCollectionRecordFlaggedForReview(record: Pick<
  CollectionRecord,
  "receiptValidationStatus" | "duplicateReceiptFlag"
>) {
  return record.receiptValidationStatus !== "matched" || record.duplicateReceiptFlag;
}

function getCollectionReceiptReviewPriority(record: Pick<
  CollectionRecord,
  "receiptValidationStatus" | "duplicateReceiptFlag" | "paymentDate" | "createdAt"
>) {
  let score = 0;

  if (record.receiptValidationStatus === "underpaid" || record.receiptValidationStatus === "overpaid") {
    score += 4;
  } else if (record.receiptValidationStatus === "unverified") {
    score += 3;
  } else if (record.receiptValidationStatus === "needs_review") {
    score += 2;
  }

  if (record.duplicateReceiptFlag) {
    score += 2;
  }

  const dateScore = Date.parse(record.paymentDate || record.createdAt || "");
  return {
    score,
    dateScore: Number.isFinite(dateScore) ? dateScore : 0,
  };
}

export function buildCollectionReceiptReviewSummary(
  records: CollectionRecord[],
): CollectionReceiptReviewSummary {
  let matchedCount = 0;
  let mismatchCount = 0;
  let needsAttentionCount = 0;
  let duplicateWarningCount = 0;

  for (const record of records) {
    if (record.receiptValidationStatus === "matched") {
      matchedCount += 1;
    } else if (
      record.receiptValidationStatus === "underpaid"
      || record.receiptValidationStatus === "overpaid"
    ) {
      mismatchCount += 1;
      needsAttentionCount += 1;
    } else {
      needsAttentionCount += 1;
    }

    if (record.duplicateReceiptFlag) {
      duplicateWarningCount += 1;
    }
  }

  const flaggedRecords = records
    .filter((record) => isCollectionRecordFlaggedForReview(record))
    .slice()
    .sort((left, right) => {
      const leftPriority = getCollectionReceiptReviewPriority(left);
      const rightPriority = getCollectionReceiptReviewPriority(right);
      if (leftPriority.score !== rightPriority.score) {
        return rightPriority.score - leftPriority.score;
      }
      if (leftPriority.dateScore !== rightPriority.dateScore) {
        return rightPriority.dateScore - leftPriority.dateScore;
      }
      return String(left.customerName || "").localeCompare(String(right.customerName || ""));
    });

  return {
    totalRecords: records.length,
    matchedCount,
    mismatchCount,
    needsAttentionCount,
    duplicateWarningCount,
    flaggedCount: flaggedRecords.length,
    flaggedRecords,
  };
}
