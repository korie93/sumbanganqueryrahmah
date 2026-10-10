import type {
  CollectionBatch,
  CollectionRecord,
  CollectionStaffNickname,
} from "@/lib/api";
import {
  COLLECTION_BATCH_OPTIONS,
  isFutureDate,
  isPositiveAmount,
  isValidCustomerPhone,
  isValidDate,
} from "@/pages/collection/utils";

export function cloneReceiptIds(receiptIds: string[]) {
  return Array.from(new Set(receiptIds.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function confirmExistingReceiptRemoval(removedCount: number) {
  if (removedCount <= 0) {
    return true;
  }

  const confirmFn = globalThis.confirm;
  if (typeof confirmFn !== "function") {
    return true;
  }

  return confirmFn(
    removedCount === 1
      ? "1 receipt ditanda untuk dibuang selepas Save. Teruskan?"
      : `${removedCount} receipts ditanda untuk dibuang selepas Save. Teruskan?`,
  );
}

type CollectionRecordEditValidationArgs = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  staffNickname: string;
  editingRecord: CollectionRecord | null;
  nicknameOptions: CollectionStaffNickname[];
};

export type CollectionRecordEditField =
  | "customerName"
  | "icNumber"
  | "customerPhone"
  | "accountNumber"
  | "batch"
  | "paymentDate"
  | "amount"
  | "staffNickname";

export type CollectionRecordEditFieldErrors = Partial<Record<CollectionRecordEditField, string>>;

export function getCollectionRecordEditFieldErrors({
  customerName,
  icNumber,
  customerPhone,
  accountNumber,
  batch,
  paymentDate,
  amount,
  staffNickname,
  editingRecord,
  nicknameOptions,
}: CollectionRecordEditValidationArgs): CollectionRecordEditFieldErrors {
  // Preserve the existing validation order and messages for both inline feedback
  // and callers that still need the first validation error only.
  const errors: CollectionRecordEditFieldErrors = {};
  if (!customerName.trim()) {
    errors.customerName = "Customer Name is required.";
  }
  if (!icNumber.trim()) {
    errors.icNumber = "IC Number is required.";
  }
  if (!isValidCustomerPhone(customerPhone)) {
    errors.customerPhone = "Customer Phone Number is invalid.";
  }
  if (!accountNumber.trim() && !editingRecord?.cardNumberLast4) {
    errors.accountNumber = "Account Number or a previously matched Card Number is required.";
  }
  if (!COLLECTION_BATCH_OPTIONS.includes(batch)) {
    errors.batch = "Batch is not valid.";
  }
  if (!isValidDate(paymentDate)) {
    errors.paymentDate = "Payment Date is invalid.";
  } else if (isFutureDate(paymentDate)) {
    errors.paymentDate = "Payment Date cannot be in the future.";
  }
  if (!isPositiveAmount(amount)) {
    errors.amount = "Amount must be greater than 0.";
  }

  if (!editingRecord) {
    return errors;
  }

  const normalizedStaffNickname = staffNickname.trim();
  const staffNicknameChanged =
    normalizedStaffNickname !== editingRecord.collectionStaffNickname;
  if (staffNicknameChanged) {
    const isOfficialNickname = nicknameOptions.some(
      (item) => item.nickname === normalizedStaffNickname && item.isActive,
    );
    if (!isOfficialNickname) {
      errors.staffNickname = "Sila pilih Staff Nickname rasmi daripada senarai.";
    }
  }

  return errors;
}

export function getCollectionRecordEditValidationError(args: CollectionRecordEditValidationArgs) {
  const firstFieldError = Object.values(getCollectionRecordEditFieldErrors(args))[0];
  return firstFieldError ?? (args.editingRecord ? null : "No record selected for editing.");
}
