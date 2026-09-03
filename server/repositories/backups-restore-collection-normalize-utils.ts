import crypto from "crypto";
import {
  parseCollectionAmountMyrNumber,
  parseCollectionAmountMyrInput,
  parseCollectionAmountToCents,
  parseStoredCollectionAmountCents,
} from "../../shared/collection-amount-types";
import {
  resolveCollectionRecordPiiValuesFailClosed,
} from "../lib/collection-pii-encryption";
import { buildCollectionCallingWindow, parseSavedCallingDate } from "../lib/collection-calling-window";
import { normalizeCollectionReceiptExtractionState } from "../lib/collection-receipt-extraction-state";
import type {
  BackupCollectionOspTarget,
  BackupCollectionReceipt,
  BackupCollectionRecord,
  BackupCollectionRecordPurgeHistory,
  BackupCollectionSourceConfig,
  BackupCollectionSourceRow,
} from "./backups-repository-types";
import { toDate } from "./backups-restore-shared-utils";
import type {
  RestorableCollectionOspTargetRow,
  RestorableCollectionReceiptRow,
  RestorableCollectionRecordRow,
  RestorableCollectionRecordPurgeHistoryRow,
  RestorableCollectionSourceConfigRow,
  RestorableCollectionSourceRow,
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

function normalizeBackupDate(value: unknown): string | null {
  return parseSavedCallingDate(value);
}

function normalizeBackupAgingBucket(value: unknown): "D3" | "D4" | "D5" | "D6" | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "D3" || normalized === "D4" || normalized === "D5" || normalized === "D6"
    ? normalized
    : null;
}

function normalizeBackupCompatibilityIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((entry) => normalizeBoundedOptionalText(entry, 128))
      .filter((entry): entry is string => Boolean(entry)),
  )).slice(0, 50);
}

export function normalizeBackupCollectionSourceConfig(
  record: BackupCollectionSourceConfig,
): RestorableCollectionSourceConfigRow | null {
  const sourceImportId = normalizeBoundedOptionalText(record.id, 512);
  const validFrom = normalizeBackupDate(record.validFrom);
  const validTo = normalizeBackupDate(record.validTo);
  const cycleKey = normalizeBoundedOptionalText(record.cycleKey, 160);
  const configuredBy = normalizeBoundedOptionalText(record.configuredBy, 160) ?? "system";
  const compatibilityStatus = record.compatibilityStatus === "compatible"
    ? "compatible"
    : record.compatibilityStatus === "incompatible"
      ? "incompatible"
      : null;
  const indexedRowCount = Number(record.indexedRowCount);
  const createdAt = toDate(record.createdAt);
  const updatedAt = toDate(record.updatedAt);

  if (
    !sourceImportId
    || !validFrom
    || !validTo
    || validFrom > validTo
    || !cycleKey
    || !compatibilityStatus
    || !Number.isSafeInteger(indexedRowCount)
    || indexedRowCount < 0
    || !createdAt
    || !updatedAt
  ) {
    return null;
  }

  return {
    sourceImportId,
    validFrom,
    validTo,
    cycleKey,
    enabled: record.enabled === true,
    compatibilityStatus,
    compatibilityIssues: normalizeBackupCompatibilityIssues(record.compatibilityIssues),
    indexedRowCount,
    configuredBy,
    createdAt,
    updatedAt,
  };
}

export function normalizeBackupCollectionSourceRow(
  record: BackupCollectionSourceRow,
): RestorableCollectionSourceRow | null {
  const sourceImportId = normalizeBoundedOptionalText(record.sourceImportId, 512);
  const sourceDataRowId = normalizeBoundedOptionalText(record.id, 512);
  const accountNumberHash = normalizeBackupSearchHash(record.accountNumberHash);
  const cardNumberHash = normalizeBackupSearchHash(record.cardNumberHash);
  const expectedObligationKey = accountNumberHash
    ? `account:${accountNumberHash}`
    : cardNumberHash
      ? `card:${cardNumberHash}`
      : null;
  const canonicalObligationKey = normalizeBoundedOptionalText(record.canonicalObligationKey, 80);
  const totalDue = parseCollectionAmountMyrInput(record.totalDue, { allowZero: true });
  const billingPrincipalOsp = parseCollectionAmountMyrInput(
    record.billingPrincipalOsp,
    { allowZero: true },
  );
  const totalOsb = record.totalOsb == null
    ? null
    : parseCollectionAmountMyrInput(record.totalOsb, { allowZero: true });
  const agingBucket = normalizeBackupAgingBucket(record.agingBucket);
  const callingDate = normalizeBackupDate(record.callingDate);
  const createdAt = toDate(record.createdAt);
  const cardNumberLast4Raw = String(record.cardNumberLast4 ?? "").trim();
  const cardNumberLast4 = /^\d{4}$/.test(cardNumberLast4Raw)
    ? cardNumberLast4Raw
    : null;

  if (
    !sourceImportId
    || !sourceDataRowId
    || !expectedObligationKey
    || canonicalObligationKey !== expectedObligationKey
    || totalDue === null
    || billingPrincipalOsp === null
    || (record.totalOsb != null && totalOsb === null)
    || !agingBucket
    || !callingDate
    || !createdAt
  ) {
    return null;
  }

  return {
    sourceImportId,
    sourceDataRowId,
    accountNumberHash,
    cardNumberHash,
    cardNumberLast4,
    canonicalObligationKey,
    totalDue,
    billingPrincipalOsp,
    totalOsb,
    agingBucket,
    callingDate,
    createdAt,
  };
}

export function normalizeBackupCollectionOspTarget(
  record: BackupCollectionOspTarget,
): RestorableCollectionOspTargetRow | null {
  const id = String(record.id ?? "").trim();
  const sourceImportIds = Array.isArray(record.sourceImportIds)
    ? Array.from(new Set(record.sourceImportIds
      .map((entry) => normalizeBoundedOptionalText(entry, 512))
      .filter((entry): entry is string => Boolean(entry))))
    : [];
  const canonicalScope = [...sourceImportIds].sort().join("\n");
  const sourceScopeHash = String(record.sourceScopeHash ?? "").trim().toLowerCase();
  const expectedScopeHash = crypto.createHash("sha256")
    .update(`sqr-collection-osp-source-scope-v1:${canonicalScope}`, "utf8")
    .digest("hex");
  const periodFrom = normalizeBackupDate(record.periodFrom);
  const periodTo = normalizeBackupDate(record.periodTo);
  const agingBucket = normalizeBackupAgingBucket(record.agingBucket);
  const totalOspBaseline = record.totalOspBaseline == null
    ? null
    : parseCollectionAmountMyrInput(record.totalOspBaseline, { allowZero: true });
  const targetPercentage = Number(record.targetPercentage);
  const configuredBy = normalizeBoundedOptionalText(record.configuredBy, 160) ?? "system";
  const createdAt = toDate(record.createdAt);
  const updatedAt = toDate(record.updatedAt);

  if (
    !UUID_PATTERN.test(id)
    || sourceImportIds.length < 1
    || sourceImportIds.length > 5
    || sourceScopeHash !== expectedScopeHash
    || !periodFrom
    || !periodTo
    || periodFrom > periodTo
    || !agingBucket
    || (record.totalOspBaseline != null && totalOspBaseline === null)
    || !Number.isFinite(targetPercentage)
    || targetPercentage < 0
    || targetPercentage > 100
    || !createdAt
    || !updatedAt
  ) {
    return null;
  }

  return {
    id,
    sourceScopeHash,
    sourceImportIds,
    periodFrom,
    periodTo,
    agingBucket,
    totalOspBaseline,
    targetPercentage,
    configuredBy,
    createdAt,
    updatedAt,
  };
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
  const agingBucketRaw = String(record.agingBucket || "").toUpperCase();
  const agingBucket = agingBucketRaw === "D3"
    || agingBucketRaw === "D4"
    || agingBucketRaw === "D5"
    || agingBucketRaw === "D6"
    ? agingBucketRaw
    : null;
  const totalDue = record.totalDue == null
    ? null
    : parseCollectionAmountMyrInput(record.totalDue, { allowZero: true });
  const billingPrincipalOsp = record.billingPrincipalOsp == null
    ? null
    : parseCollectionAmountMyrInput(record.billingPrincipalOsp, { allowZero: true });
  const callingDate = parseSavedCallingDate(record.callingDate);
  const callingWindow = callingDate ? buildCollectionCallingWindow(callingDate) : null;
  const suppliedCallingWindowEndExclusive = parseSavedCallingDate(
    record.callingWindowEndExclusive,
  );
  const callingWindowEndExclusive = callingWindow
    && suppliedCallingWindowEndExclusive === callingWindow.endExclusive
    ? suppliedCallingWindowEndExclusive
    : null;
  const sourceMatchBasis = record.sourceMatchBasis === "ic"
    || record.sourceMatchBasis === "phone_and_account"
    || record.sourceMatchBasis === "account_number"
    || record.sourceMatchBasis === "card_number"
    || record.sourceMatchBasis === "account_and_card"
    ? record.sourceMatchBasis
    : null;
  const sourceMatchAccuracyRaw = Number(record.sourceMatchAccuracy);
  const sourceMatchAccuracy = Number.isInteger(sourceMatchAccuracyRaw)
    && sourceMatchAccuracyRaw >= 0
    && sourceMatchAccuracyRaw <= 100
    ? sourceMatchAccuracyRaw
    : null;
  const cardNumberLast4Raw = String(record.cardNumberLast4 ?? "").trim();
  const cardNumberLast4 = /^\d{4}$/.test(cardNumberLast4Raw)
    ? cardNumberLast4Raw
    : null;
  const sourceObligationKey = normalizeBoundedOptionalText(record.sourceObligationKey, 160);
  const settlementCycleKey = normalizeBoundedOptionalText(record.settlementCycleKey, 192);
  const cumulativeCollected = record.cumulativeCollected == null
    ? null
    : parseCollectionAmountMyrInput(record.cumulativeCollected, { allowZero: true });
  const remainingAmount = record.remainingAmount == null
    ? null
    : parseCollectionAmountMyrInput(record.remainingAmount, { allowZero: true });
  const hasTrustedSettlementState = Boolean(
    callingWindowEndExclusive
    && sourceObligationKey
    && settlementCycleKey === `${callingDate}:${sourceObligationKey}`
    && totalDue !== null
    && cumulativeCollected !== null
    && remainingAmount !== null,
  );
  const classification = hasTrustedSettlementState
    && (record.classification === "cp" || record.classification === "abort_cp")
    ? record.classification
    : null;

  return {
    id: String(record.id || crypto.randomUUID()),
    customerName,
    customerNameSearchHashes: normalizeBackupCustomerNameSearchHashes(record.customerNameSearchHashes),
    icNumber,
    customerPhone,
    accountNumber,
    cardNumberLast4,
    sourceImportId: String(record.sourceImportId || "").trim() || null,
    sourceDataRowId: String(record.sourceDataRowId || "").trim() || null,
    sourceImportName: String(record.sourceImportName || "").trim() || null,
    sourceFilename: String(record.sourceFilename || "").trim() || null,
    agingBucket,
    totalDue,
    billingPrincipalOsp,
    callingDate: callingWindowEndExclusive ? callingDate : null,
    callingWindowEndExclusive,
    sourceMatchBasis,
    sourceMatchAccuracy,
    sourceObligationKey: hasTrustedSettlementState ? sourceObligationKey : null,
    settlementCycleKey: hasTrustedSettlementState ? settlementCycleKey : null,
    classification,
    cumulativeCollected: hasTrustedSettlementState ? cumulativeCollected : null,
    remainingAmount: hasTrustedSettlementState ? remainingAmount : null,
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
