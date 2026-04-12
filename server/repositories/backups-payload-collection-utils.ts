import type { BackupCollectionRecord } from "./backups-repository-types";
import type { BackupCursorRow } from "./backups-payload-db-utils";
import {
  resolveCollectionCustomerNameSearchHashesValue,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
