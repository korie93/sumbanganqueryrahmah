import {
  type CollectionBatch,
  type CollectionReceiptMetadata,
} from "@/lib/api";
import { buildCollectionReceiptMetadataPayload, type CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import {
  COLLECTION_BATCH_OPTIONS,
  isFutureDate,
  isPositiveAmount,
  isValidCustomerPhone,
  isValidDate,
} from "@/pages/collection/utils";
import { parseCollectionAmountMyrNumber } from "@shared/collection-amount-types";

export type SaveCollectionDraftRestoreNotice = {
  restoredAt: string;
  hadPendingReceipts: boolean;
};

export type SaveCollectionFormValues = {
  staffNickname: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
};

export type SaveCollectionMutationPayload = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: number;
  collectionStaffNickname: string;
  newReceiptMetadata: CollectionReceiptMetadata[];
};

export function formatSaveCollectionRestoreNoticeLabel(restoredAt: string | null | undefined) {
  if (!restoredAt) {
    return null;
  }

  const value = new Date(restoredAt);
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toLocaleString();
}

export function validateSaveCollectionForm(values: SaveCollectionFormValues): string | null {
  if (!values.staffNickname || values.staffNickname.trim().length < 2) {
    return "Staff nickname is required.";
  }
  if (!values.customerName.trim()) return "Customer Name is required.";
  if (!values.icNumber.trim()) return "IC Number is required.";
  if (!isValidCustomerPhone(values.customerPhone)) {
    return "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.";
  }
  if (!values.accountNumber.trim()) return "Account Number is required.";
  if (!COLLECTION_BATCH_OPTIONS.includes(values.batch)) return "Batch is not valid.";
  if (!isValidDate(values.paymentDate)) return "Payment Date is invalid.";
  if (isFutureDate(values.paymentDate)) return "Payment Date cannot be in the future.";
  if (!isPositiveAmount(values.amount)) return "Amount must be greater than 0.";
  return null;
}

export function buildSaveCollectionMutationPayload(options: {
  values: SaveCollectionFormValues;
  receiptDrafts: CollectionReceiptDraftInput[];
}): SaveCollectionMutationPayload {
  const { values, receiptDrafts } = options;

  return {
    customerName: values.customerName.trim(),
    icNumber: values.icNumber.trim(),
    customerPhone: values.customerPhone.trim(),
    accountNumber: values.accountNumber.trim(),
    batch: values.batch,
    paymentDate: values.paymentDate,
    amount: parseCollectionAmountMyrNumber(values.amount),
    collectionStaffNickname: values.staffNickname.trim(),
    newReceiptMetadata: receiptDrafts.map((draft) => buildCollectionReceiptMetadataPayload(draft)),
  };
}

export function removeSaveCollectionReceiptAtIndex<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}
