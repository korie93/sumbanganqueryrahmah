import crypto from "crypto";
import {
  parseCollectionAmountMyrNumber,
  parseCollectionAmountToCents,
  parseStoredCollectionAmountCents,
} from "../../shared/collection-amount-types";
import {
  resolveCollectionRecordPiiValuesFailClosed,
} from "../lib/collection-pii-encryption";
import { normalizeCollectionReceiptExtractionState } from "../lib/collection-receipt-extraction-state";
import type {
  BackupCollectionReceipt,
  BackupCollectionRecord,
  BackupCollectionRecordPurgeHistory,
} from "./backups-repository-types";
import { toDate } from "./backups-restore-shared-utils";
import type {
  RestorableCollectionReceiptRow,
  RestorableCollectionRecordRow,
  RestorableCollectionRecordPurgeHistoryRow,
} from "./backups-restore-collection-dataset-types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEARCH_HASH_PATTERN = /^[0-9a-f]{64}$/i;

function normalizeBoundedOptionalText(value: unknown, maxLength = 512): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeBackupSearchHash(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SEARCH_HASH_PATTERN.test(normalized) ? normalized : null;
}

function normalizeBackupCustomerNameSearchHashes(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const hashes = Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
    ),
  );
  return hashes.length > 0 ? hashes : null;
}

export function normalizeBackupCollectionRecord(
  record: BackupCollectionRecord,
): RestorableCollectionRecordRow | null {
  const paymentDate =
    typeof record.paymentDate === "string"
      ? record.paymentDate.slice(0, 10)
      : toDate(record.paymentDate)?.toISOString().slice(0, 10) || "";
  if (!paymentDate) {
    return null;
  }

  const piiValues = resolveCollectionRecordPiiValuesFailClosed({
    customerName: {
      plaintext: record.customerName,
      encrypted: record.customerNameEncrypted,
    },
    icNumber: {
      plaintext: record.icNumber,
      encrypted: record.icNumberEncrypted,
    },
    customerPhone: {
      plaintext: record.customerPhone,
      encrypted: record.customerPhoneEncrypted,
    },
    accountNumber: {
      plaintext: record.accountNumber,
      encrypted: record.accountNumberEncrypted,
    },
  });
  const customerName = piiValues.customerName || "-";
  const icNumber = piiValues.icNumber || "-";
  const customerPhone = piiValues.customerPhone || "-";
  const accountNumber = piiValues.accountNumber || "-";

  const collectionStaffNickname =
    String(record.collectionStaffNickname || record.staffUsername || "unknown").trim()
    || "unknown";
  const createdByLogin = String(record.createdByLogin || "system").trim() || "system";

  return {
    id: String(record.id || crypto.randomUUID()),
    customerName,
    customerNameSearchHashes: normalizeBackupCustomerNameSearchHashes(record.customerNameSearchHashes),
    icNumber,
    customerPhone,
    accountNumber,
    sourceImportId: String(record.sourceImportId || "").trim() || null,
    sourceDataRowId: String(record.sourceDataRowId || "").trim() || null,
    sourceImportName: String(record.sourceImportName || "").trim() || null,
    sourceFilename: String(record.sourceFilename || "").trim() || null,
    batch: String(record.batch || "P10"),
    paymentDate,
    amount: parseCollectionAmountMyrNumber(record.amount),
    receiptFile: record.receiptFile || null,
    receiptTotalAmount:
      parseStoredCollectionAmountCents(record.receiptTotalAmountCents)
      ?? parseCollectionAmountToCents(record.receiptTotalAmount, { allowZero: true })
      ?? 0,
    receiptValidationStatus: String(record.receiptValidationStatus || "needs_review"),
    receiptValidationMessage: String(record.receiptValidationMessage || "").trim() || null,
    receiptCount: Math.max(0, Number(record.receiptCount || 0) || 0),
    duplicateReceiptFlag: record.duplicateReceiptFlag === true,
    createdByLogin,
    collectionStaffNickname,
    staffUsername: collectionStaffNickname,
    createdAt: toDate(record.createdAt) ?? new Date(),
  };
}

export function normalizeBackupCollectionReceipt(
  receipt: BackupCollectionReceipt,
): RestorableCollectionReceiptRow | null {
  if (!receipt.collectionRecordId || !receipt.storagePath) return null;
  const normalizedReceiptState = normalizeCollectionReceiptExtractionState({
    receiptAmountCents:
      parseStoredCollectionAmountCents(receipt.receiptAmountCents)
      ?? parseCollectionAmountToCents(receipt.receiptAmount, { allowZero: true }),
    extractedAmountCents:
      parseStoredCollectionAmountCents(receipt.extractedAmountCents)
      ?? parseCollectionAmountToCents(receipt.extractedAmount, { allowZero: true }),
    extractionStatus: String(receipt.extractionStatus || "").trim() || "unprocessed",
  });
  return {
    id: String(receipt.id || crypto.randomUUID()),
    collectionRecordId: String(receipt.collectionRecordId),
    storagePath: String(receipt.storagePath),
    originalFileName: String(receipt.originalFileName || "receipt"),
    originalMimeType: String(receipt.originalMimeType || "application/octet-stream"),
    originalExtension: String(receipt.originalExtension || ""),
    fileSize: Number(receipt.fileSize || 0),
    receiptAmount: normalizedReceiptState.receiptAmountCents,
    extractedAmount: normalizedReceiptState.extractedAmountCents,
    extractionStatus: normalizedReceiptState.extractionStatus,
    extractionConfidence:
      receipt.extractionConfidence === null
      || receipt.extractionConfidence === undefined
      || receipt.extractionConfidence === ""
        ? null
        : Number(receipt.extractionConfidence),
    receiptDate:
      typeof receipt.receiptDate === "string"
        ? receipt.receiptDate.slice(0, 10)
        : toDate(receipt.receiptDate)?.toISOString().slice(0, 10) || null,
    receiptReference: String(receipt.receiptReference || "").trim() || null,
    fileHash: String(receipt.fileHash || "").trim().toLowerCase() || null,
    createdAt: toDate(receipt.createdAt) ?? new Date(),
  };
}

export function normalizeBackupCollectionRecordPurgeHistory(
  record: BackupCollectionRecordPurgeHistory,
): RestorableCollectionRecordPurgeHistoryRow | null {
  const id = String(record.id ?? "").trim();
  const paymentDate = typeof record.paymentDate === "string"
    ? record.paymentDate.slice(0, 10)
    : "";
  const parsedPaymentDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
    ? toDate(`${paymentDate}T00:00:00.000Z`)
    : null;
  const originalCreatedAt = toDate(record.originalCreatedAt);
  const purgedAt = toDate(record.purgedAt);
  const amountCents = parseCollectionAmountToCents(record.amount, { allowZero: true });
  const amount = amountCents === null ? null : parseCollectionAmountMyrNumber(record.amount);
  const createdByLogin = normalizeBoundedOptionalText(record.createdByLogin, 160);
  const collectionStaffNickname = normalizeBoundedOptionalText(
    record.collectionStaffNickname,
    160,
  );
  const purgedBy = normalizeBoundedOptionalText(record.purgedBy, 160);

  if (
    !UUID_PATTERN.test(id)
    || !parsedPaymentDate
    || parsedPaymentDate.toISOString().slice(0, 10) !== paymentDate
    || amount === null
    || !originalCreatedAt
    || !purgedAt
    || !createdByLogin
    || !collectionStaffNickname
    || !purgedBy
    || record.purgeReason !== "retention_policy"
  ) {
    return null;
  }

  return {
    id,
    sourceImportId: normalizeBoundedOptionalText(record.sourceImportId),
    sourceDataRowId: normalizeBoundedOptionalText(record.sourceDataRowId),
    sourceImportName: normalizeBoundedOptionalText(record.sourceImportName),
    sourceFilename: normalizeBoundedOptionalText(record.sourceFilename),
    icNumberSearchHash: normalizeBackupSearchHash(record.icNumberSearchHash),
    customerPhoneSearchHash: normalizeBackupSearchHash(record.customerPhoneSearchHash),
    accountNumberSearchHash: normalizeBackupSearchHash(record.accountNumberSearchHash),
    paymentDate,
    amount,
    createdByLogin,
    collectionStaffNickname,
    originalCreatedAt,
    purgedAt,
    purgedBy,
    purgeReason: "retention_policy",
  };
}
