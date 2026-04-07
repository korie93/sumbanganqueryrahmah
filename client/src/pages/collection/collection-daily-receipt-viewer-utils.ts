import type {
  CollectionDailyDayDetailsResponse,
  CollectionRecord,
  CollectionRecordReceipt,
} from "@/lib/api";

export type CollectionDailyDayRecord = CollectionDailyDayDetailsResponse["records"][number];

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function inferReceiptExtension(fileName: string) {
  const normalized = String(fileName || "").trim();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= normalized.length - 1) return "";
  return normalized.slice(dotIndex + 1).toLowerCase();
}

export function mapDailyReceiptToCollectionReceipt(
  recordId: string,
  receipt: CollectionDailyDayRecord["receipts"][number],
): CollectionRecordReceipt {
  return {
    id: receipt.id,
    collectionRecordId: recordId,
    storagePath: receipt.storagePath || "",
    originalFileName: receipt.originalFileName,
    originalMimeType: receipt.originalMimeType,
    originalExtension: inferReceiptExtension(receipt.originalFileName),
    fileSize: receipt.fileSize,
    receiptAmount: null,
    extractedAmount: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    receiptDate: null,
    receiptReference: null,
    fileHash: null,
    createdAt: receipt.createdAt,
  };
}

export function mapDailyRecordToCollectionRecord(record: CollectionDailyDayRecord): CollectionRecord {
  const receipts = (record.receipts || []).map((receipt) =>
    mapDailyReceiptToCollectionReceipt(record.id, receipt),
  );

  return {
    id: record.id,
    customerName: record.customerName,
    icNumber: "",
    customerPhone: "",
    accountNumber: record.accountNumber,
    batch: record.batch as CollectionRecord["batch"],
    paymentDate: record.paymentDate,
    amount: String(record.amount),
    receiptFile: null,
    receipts,
    receiptTotalAmount: "0.00",
    receiptValidationStatus: "unverified",
    receiptValidationMessage:
      receipts.length > 0
        ? "Jumlah resit sedang menunggu semakan di skrin harian."
        : "Tiada resit dilampirkan untuk semakan jumlah.",
    receiptCount: receipts.length,
    duplicateReceiptFlag: false,
    createdByLogin: record.username,
    collectionStaffNickname: record.collectionStaffNickname,
    createdAt: record.createdAt,
  };
}

export function buildCollectionDailyReceiptKey(recordId: string, receiptId?: string | null) {
  return `${recordId}:${receiptId || "primary"}`;
}
