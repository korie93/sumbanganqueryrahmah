import type {
  BackupCollectionOspManualReconciliation,
  BackupCollectionOspManualReconciliationAudit,
  BackupCollectionOspTargetSourceRow,
  BackupCollectionRecord,
} from "./backups-repository-types";
import type {
  BackupCompositeCursorRow,
  BackupCursorRow,
} from "./backups-payload-db-utils";
import {
  resolveCollectionCustomerNameSearchHashesValue,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import {
  protectCollectionV7AccountBackupPii,
  protectCollectionV7CustomerBackupPii,
} from "./backups-collection-v7-pii-utils";

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const COLLECTION_PII_ENCRYPTED_PATTERN =
  /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/;
const COLLECTION_SEARCH_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const COLLECTION_CARD_LAST_FOUR_PATTERN = /^\d{4}$/;
const COLLECTION_OSP_AUDIT_STATE_KEYS = new Set([
  "sourceImportId",
  "sourceRecordId",
  "canonicalObligationKey",
  "cycleKey",
  "aging",
  "totalDue",
  "billingPrincipalOsp",
  "manualPriorAmount",
  "asOfDate",
  "actualPaymentDate",
  "dateSource",
  "reason",
  "note",
  "reference",
  "status",
  "version",
  "voidReason",
]);

export function sanitizeCollectionOspEncryptedSnapshot(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() || value.length > 8192) {
    return null;
  }
  return COLLECTION_PII_ENCRYPTED_PATTERN.test(value) ? value : null;
}

export function sanitizeCollectionOspSearchHash(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return COLLECTION_SEARCH_HASH_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

export function sanitizeCollectionOspCardLast4(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return COLLECTION_CARD_LAST_FOUR_PATTERN.test(normalized) ? normalized : null;
}

export function sanitizeCollectionOspAuditState(
  value: unknown,
): Record<string, string | number | boolean | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([key, entry]) => (
    !COLLECTION_OSP_AUDIT_STATE_KEYS.has(key)
    || (
      entry !== null
      && typeof entry !== "string"
      && typeof entry !== "number"
      && typeof entry !== "boolean"
    )
  ))) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, string | number | boolean | null>;
}

export function mapBackupCollectionOspTargetSourceRow(
  row: (BackupCollectionOspTargetSourceRow & BackupCompositeCursorRow) & Record<string, unknown>,
): BackupCollectionOspTargetSourceRow & BackupCompositeCursorRow {
  const accountPii = protectCollectionV7AccountBackupPii({
    encrypted: row.accountNumberEncrypted,
    searchHash: row.accountNumberSearchHash,
  });
  const customerPii = protectCollectionV7CustomerBackupPii({
    encrypted: row.customerNameEncrypted,
    searchHashes: row.customerNameSearchHashes,
  });
  const cardNumberLast4 = sanitizeCollectionOspCardLast4(row.cardNumberLast4);
  if (row.cardNumberLast4 != null && row.cardNumberLast4 !== "" && !cardNumberLast4) {
    throw new Error("Collection V7 backup card-number suffix is invalid.");
  }

  return {
    backupCursor: String(row.backupCursor || ""),
    targetRevisionId: String(row.targetRevisionId || ""),
    sourceImportId: String(row.sourceImportId || ""),
    sourceDataRowId: String(row.sourceDataRowId || ""),
    canonicalObligationKey: String(row.canonicalObligationKey || ""),
    cycleKey: String(row.cycleKey || ""),
    accountNumberEncrypted: accountPii.encrypted,
    accountNumberSearchHash: accountPii.searchHash,
    cardNumberLast4,
    customerNameEncrypted: customerPii.encrypted,
    customerNameSearchHashes: customerPii.searchHashes,
    agingBucket: String(row.agingBucket || ""),
    callingDate: String(row.callingDate || "").slice(0, 10),
    callingWindowEndExclusive: String(row.callingWindowEndExclusive || "").slice(0, 10),
    totalDue: row.totalDue as BackupCollectionOspTargetSourceRow["totalDue"],
    billingPrincipalOsp:
      row.billingPrincipalOsp as BackupCollectionOspTargetSourceRow["billingPrincipalOsp"],
    createdAt: row.createdAt as BackupCollectionOspTargetSourceRow["createdAt"],
  };
}

export function mapBackupCollectionOspManualReconciliation(
  row: (BackupCollectionOspManualReconciliation & BackupCursorRow) & Record<string, unknown>,
): BackupCollectionOspManualReconciliation & BackupCursorRow {
  const accountPii = protectCollectionV7AccountBackupPii({
    encrypted: row.accountNumberEncrypted,
    searchHash: row.accountNumberSearchHash,
  });
  const customerPii = protectCollectionV7CustomerBackupPii({
    encrypted: row.customerNameEncrypted,
  });
  const cardNumberLast4 = sanitizeCollectionOspCardLast4(row.cardNumberLast4);
  if (row.cardNumberLast4 != null && row.cardNumberLast4 !== "" && !cardNumberLast4) {
    throw new Error("Collection V7 backup card-number suffix is invalid.");
  }
  return {
    id: String(row.id || ""),
    targetId: String(row.targetId || ""),
    targetRevisionId: String(row.targetRevisionId || ""),
    sourceImportId: String(row.sourceImportId || ""),
    sourceDataRowId: String(row.sourceDataRowId || ""),
    canonicalObligationKey: String(row.canonicalObligationKey || ""),
    cycleKey: String(row.cycleKey || ""),
    accountNumberEncrypted: accountPii.encrypted,
    accountNumberSearchHash: accountPii.searchHash,
    cardNumberLast4,
    customerNameEncrypted: customerPii.encrypted,
    customerNameSearchHashes: customerPii.searchHashes,
    agingBucket: String(row.agingBucket || ""),
    callingDate: String(row.callingDate || "").slice(0, 10),
    callingWindowEndExclusive: String(row.callingWindowEndExclusive || "").slice(0, 10),
    totalDue: row.totalDue as BackupCollectionOspManualReconciliation["totalDue"],
    billingPrincipalOsp:
      row.billingPrincipalOsp as BackupCollectionOspManualReconciliation["billingPrincipalOsp"],
    manualPriorAmount:
      row.manualPriorAmount as BackupCollectionOspManualReconciliation["manualPriorAmount"],
    manualAsOfDate: String(row.manualAsOfDate || "").slice(0, 10),
    actualPaymentDate:
      row.actualPaymentDate == null ? null : String(row.actualPaymentDate).slice(0, 10),
    dateSource: String(row.dateSource || ""),
    reasonCode: String(row.reasonCode || ""),
    note: row.note == null ? null : String(row.note),
    evidenceReference: row.evidenceReference == null ? null : String(row.evidenceReference),
    status: String(row.status || ""),
    version: Number(row.version),
    createdBy: String(row.createdBy || ""),
    createdAt: row.createdAt as BackupCollectionOspManualReconciliation["createdAt"],
    updatedBy: String(row.updatedBy || ""),
    updatedAt: row.updatedAt as BackupCollectionOspManualReconciliation["updatedAt"],
    voidedBy: row.voidedBy == null ? null : String(row.voidedBy),
    ...(row.voidedAt === undefined
      ? {}
      : { voidedAt: row.voidedAt as string | Date | null }),
    voidReason: row.voidReason == null ? null : String(row.voidReason),
  };
}

export function mapBackupCollectionOspManualReconciliationAudit(
  row: (BackupCollectionOspManualReconciliationAudit & BackupCursorRow) & Record<string, unknown>,
): BackupCollectionOspManualReconciliationAudit & BackupCursorRow {
  const beforeState = row.beforeState == null
    ? null
    : sanitizeCollectionOspAuditState(row.beforeState);
  const afterState = sanitizeCollectionOspAuditState(row.afterState);
  if ((row.beforeState != null && !beforeState) || !afterState) {
    throw new Error("Collection V7 backup audit state is invalid.");
  }
  return {
    id: String(row.id || ""),
    reconciliationId: String(row.reconciliationId || ""),
    targetId: String(row.targetId || ""),
    targetRevisionId: String(row.targetRevisionId || ""),
    operation: String(row.operation || ""),
    fromVersion: row.fromVersion == null ? null : Number(row.fromVersion),
    toVersion: Number(row.toVersion),
    beforeState,
    afterState,
    actorUsername: String(row.actorUsername || ""),
    actorRole: String(row.actorRole || ""),
    requestId: row.requestId == null ? null : String(row.requestId),
    createdAt: row.createdAt as BackupCollectionOspManualReconciliationAudit["createdAt"],
  };
}

export function buildCollectionRecordBackupPiiFields(
  row: Record<string, unknown>,
): Pick<
  BackupCollectionRecord,
  | "customerName"
  | "customerNameEncrypted"
  | "customerNameSearchHashes"
  | "icNumber"
  | "icNumberEncrypted"
  | "customerPhone"
  | "customerPhoneEncrypted"
  | "accountNumber"
  | "accountNumberEncrypted"
> {
  const customerNameEncrypted = hasNonEmptyString(row.customerNameEncrypted)
    ? row.customerNameEncrypted
    : null;
  const icNumberEncrypted = hasNonEmptyString(row.icNumberEncrypted)
    ? row.icNumberEncrypted
    : null;
  const customerPhoneEncrypted = hasNonEmptyString(row.customerPhoneEncrypted)
    ? row.customerPhoneEncrypted
    : null;
  const accountNumberEncrypted = hasNonEmptyString(row.accountNumberEncrypted)
    ? row.accountNumberEncrypted
    : null;
  const customerName = resolveStoredCollectionPiiPlaintextValue({
    field: "customerName",
    plaintext: row.customerName,
    encrypted: row.customerNameEncrypted,
    fallback: null,
  });
  const icNumber = resolveStoredCollectionPiiPlaintextValue({
    field: "icNumber",
    plaintext: row.icNumber,
    encrypted: row.icNumberEncrypted,
    fallback: null,
  });
  const customerPhone = resolveStoredCollectionPiiPlaintextValue({
    field: "customerPhone",
    plaintext: row.customerPhone,
    encrypted: row.customerPhoneEncrypted,
    fallback: null,
  });
  const accountNumber = resolveStoredCollectionPiiPlaintextValue({
    field: "accountNumber",
    plaintext: row.accountNumber,
    encrypted: row.accountNumberEncrypted,
    fallback: null,
  });
  const customerNameSearchHashes = resolveCollectionCustomerNameSearchHashesValue({
    plaintext: customerName,
    encrypted: row.customerNameEncrypted,
    hashes: row.customerNameSearchHashes,
  });

  return {
    ...(customerNameEncrypted
      ? {
          customerNameEncrypted,
          ...(customerNameSearchHashes?.length ? { customerNameSearchHashes } : {}),
        }
      : {
          ...(customerName ? { customerName } : {}),
        }),
    ...(icNumberEncrypted
      ? { icNumberEncrypted }
      : {
          ...(icNumber ? { icNumber } : {}),
        }),
    ...(customerPhoneEncrypted
      ? { customerPhoneEncrypted }
      : {
          ...(customerPhone ? { customerPhone } : {}),
        }),
    ...(accountNumberEncrypted
      ? { accountNumberEncrypted }
      : {
          ...(accountNumber ? { accountNumber } : {}),
        }),
  };
}

export function mapBackupCollectionRecordRow(
  row: (BackupCollectionRecord & BackupCursorRow) & Record<string, unknown>,
): BackupCollectionRecord & BackupCursorRow {
  const receiptTotalAmountCents =
    row.receiptTotalAmountCents as BackupCollectionRecord["receiptTotalAmountCents"];
  const receiptValidationStatus =
    row.receiptValidationStatus as BackupCollectionRecord["receiptValidationStatus"];
  const receiptCount =
    typeof row.receiptCount === "number" ? row.receiptCount : Number(row.receiptCount || 0);

  return {
    id: String(row.id || ""),
    ...buildCollectionRecordBackupPiiFields(row),
    sourceImportId:
      typeof row.sourceImportId === "string" && row.sourceImportId.trim()
        ? row.sourceImportId.trim()
        : null,
    sourceDataRowId:
      typeof row.sourceDataRowId === "string" && row.sourceDataRowId.trim()
        ? row.sourceDataRowId.trim()
        : null,
    sourceImportName:
      typeof row.sourceImportName === "string" && row.sourceImportName.trim()
        ? row.sourceImportName.trim()
        : null,
    sourceFilename:
      typeof row.sourceFilename === "string" && row.sourceFilename.trim()
        ? row.sourceFilename.trim()
        : null,
    cardNumberLast4:
      typeof row.cardNumberLast4 === "string" && /^\d{4}$/.test(row.cardNumberLast4.trim())
        ? row.cardNumberLast4.trim()
        : null,
    agingBucket:
      typeof row.agingBucket === "string" && ["D3", "D4", "D5", "D6"].includes(row.agingBucket)
        ? row.agingBucket
        : null,
    totalDue: row.totalDue == null
      ? null
      : row.totalDue as NonNullable<BackupCollectionRecord["totalDue"]>,
    billingPrincipalOsp:
      row.billingPrincipalOsp == null
        ? null
        : row.billingPrincipalOsp as NonNullable<BackupCollectionRecord["billingPrincipalOsp"]>,
    callingDate:
      typeof row.callingDate === "string" && row.callingDate.trim()
        ? row.callingDate.slice(0, 10)
        : null,
    callingWindowEndExclusive:
      typeof row.callingWindowEndExclusive === "string" && row.callingWindowEndExclusive.trim()
        ? row.callingWindowEndExclusive.slice(0, 10)
        : null,
    sourceMatchBasis:
      row.sourceMatchBasis === "ic"
      || row.sourceMatchBasis === "phone_and_account"
      || row.sourceMatchBasis === "account_number"
      || row.sourceMatchBasis === "card_number"
      || row.sourceMatchBasis === "account_and_card"
        ? row.sourceMatchBasis
        : null,
    sourceMatchAccuracy:
      Number.isInteger(Number(row.sourceMatchAccuracy))
        ? Number(row.sourceMatchAccuracy)
        : null,
    sourceObligationKey:
      typeof row.sourceObligationKey === "string" && row.sourceObligationKey.trim()
        ? row.sourceObligationKey.trim()
        : null,
    settlementCycleKey:
      typeof row.settlementCycleKey === "string" && row.settlementCycleKey.trim()
        ? row.settlementCycleKey.trim()
        : null,
    classification:
      row.classification === "cp" || row.classification === "abort_cp"
        ? row.classification
        : null,
    cumulativeCollected:
      row.cumulativeCollected == null
        ? null
        : row.cumulativeCollected as NonNullable<BackupCollectionRecord["cumulativeCollected"]>,
    remainingAmount:
      row.remainingAmount == null
        ? null
        : row.remainingAmount as NonNullable<BackupCollectionRecord["remainingAmount"]>,
    batch: String(row.batch || ""),
    paymentDate: String(row.paymentDate || ""),
    amount: row.amount as BackupCollectionRecord["amount"],
    receiptFile:
      typeof row.receiptFile === "string" && row.receiptFile.trim().length > 0
        ? row.receiptFile
        : null,
    ...(receiptTotalAmountCents === undefined ? {} : { receiptTotalAmountCents }),
    ...(receiptValidationStatus === undefined ? {} : { receiptValidationStatus }),
    receiptValidationMessage:
      typeof row.receiptValidationMessage === "string" &&
      row.receiptValidationMessage.trim().length > 0
        ? row.receiptValidationMessage
        : null,
    ...(row.receiptCount === undefined ? {} : { receiptCount }),
    duplicateReceiptFlag: row.duplicateReceiptFlag === true,
    createdByLogin: String(row.createdByLogin || ""),
    collectionStaffNickname: String(row.collectionStaffNickname || ""),
    staffUsername:
      typeof row.staffUsername === "string" && row.staffUsername.trim().length > 0
        ? row.staffUsername
        : null,
    createdAt: row.createdAt as BackupCollectionRecord["createdAt"],
  };
}
