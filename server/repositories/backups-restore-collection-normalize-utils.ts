import crypto from "crypto";
import {
  parseCollectionAmountMyrNumber,
  parseCollectionAmountToCents,
  parseStoredCollectionAmountCents,
} from "../../shared/collection-amount-types";
import {
  resolveCollectionPiiFieldValue,
} from "../lib/collection-pii-encryption";
import type {
  BackupCollectionReceipt,
  BackupCollectionRecord,
} from "./backups-repository-types";
import { toDate } from "./backups-restore-shared-utils";
import type {
  RestorableCollectionReceiptRow,
  RestorableCollectionRecordRow,
} from "./backups-restore-collection-dataset-types";

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

  const customerName = resolveCollectionPiiFieldValue({
    plaintext: record.customerName,
    encrypted: record.customerNameEncrypted,
    fallback: "-",
  }) || "-";
  const icNumber = resolveCollectionPiiFieldValue({
    plaintext: record.icNumber,
    encrypted: record.icNumberEncrypted,
    fallback: "-",
  }) || "-";
  const customerPhone = resolveCollectionPiiFieldValue({
    plaintext: record.customerPhone,
    encrypted: record.customerPhoneEncrypted,
    fallback: "-",
  }) || "-";
  const accountNumber = resolveCollectionPiiFieldValue({
    plaintext: record.accountNumber,
    encrypted: record.accountNumberEncrypted,
    fallback: "-",
  }) || "-";

  return {
    id: String(record.id || crypto.randomUUID()),
    customerName,
    customerNameSearchHashes: normalizeBackupCustomerNameSearchHashes(record.customerNameSearchHashes),
    icNumber,
    customerPhone,
    accountNumber,
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
    createdByLogin: String(record.createdByLogin || "system"),
    collectionStaffNickname: String(record.collectionStaffNickname || record.staffUsername || "unknown"),
    staffUsername: String(record.staffUsername || record.collectionStaffNickname || "unknown"),
    createdAt: toDate(record.createdAt) ?? new Date(),
  };
}

export function normalizeBackupCollectionReceipt(
  receipt: BackupCollectionReceipt,
): RestorableCollectionReceiptRow | null {
  if (!receipt.collectionRecordId || !receipt.storagePath) return null;
  return {
    id: String(receipt.id || crypto.randomUUID()),
    collectionRecordId: String(receipt.collectionRecordId),
    storagePath: String(receipt.storagePath),
    originalFileName: String(receipt.originalFileName || "receipt"),
    originalMimeType: String(receipt.originalMimeType || "application/octet-stream"),
    originalExtension: String(receipt.originalExtension || ""),
    fileSize: Number(receipt.fileSize || 0),
    receiptAmount:
      parseStoredCollectionAmountCents(receipt.receiptAmountCents)
      ?? parseCollectionAmountToCents(receipt.receiptAmount, { allowZero: true }),
    extractedAmount:
      parseStoredCollectionAmountCents(receipt.extractedAmountCents)
      ?? parseCollectionAmountToCents(receipt.extractedAmount, { allowZero: true }),
    extractionStatus: String(receipt.extractionStatus || "").trim() || "unprocessed",
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
