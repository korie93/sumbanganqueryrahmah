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

export function getCollectionRecordEditValidationError({
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
}: CollectionRecordEditValidationArgs) {
  if (!customerName.trim()) {
    return "Customer Name is required.";
  }
  if (!icNumber.trim()) {
    return "IC Number is required.";
  }
  if (!isValidCustomerPhone(customerPhone)) {
    return "Customer Phone Number is invalid.";
  }
  if (!accountNumber.trim()) {
    return "Account Number is required.";
  }
  if (!COLLECTION_BATCH_OPTIONS.includes(batch)) {
    return "Batch is not valid.";
  }
  if (!isValidDate(paymentDate)) {
    return "Payment Date is invalid.";
  }
  if (isFutureDate(paymentDate)) {
    return "Payment Date cannot be in the future.";
  }
  if (!isPositiveAmount(amount)) {
    return "Amount must be greater than 0.";
  }

  if (!editingRecord) {
    return "No record selected for editing.";
  }

  const normalizedStaffNickname = staffNickname.trim();
  const staffNicknameChanged =
    normalizedStaffNickname !== editingRecord.collectionStaffNickname;
  if (staffNicknameChanged) {
    const isOfficialNickname = nicknameOptions.some(
      (item) => item.nickname === normalizedStaffNickname && item.isActive,
    );
    if (!isOfficialNickname) {
      return "Sila pilih Staff Nickname rasmi daripada senarai.";
    }
  }

  return null;
}
