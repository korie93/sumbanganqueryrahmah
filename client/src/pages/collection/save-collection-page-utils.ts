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

export type SaveCollectionFieldErrorMap = Partial<{
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: string;
  paymentDate: string;
  amount: string;
}>;

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

export function buildSaveCollectionFieldErrorMap(
  values: SaveCollectionFormValues,
  options?: {
    showRequired?: boolean;
  },
): SaveCollectionFieldErrorMap {
  const showRequired = options?.showRequired === true;
  const errors: SaveCollectionFieldErrorMap = {};

  if (!values.customerName.trim()) {
    if (showRequired) {
      errors.customerName = "Customer Name is required.";
    }
  }

  if (!values.icNumber.trim()) {
    if (showRequired) {
      errors.icNumber = "IC Number is required.";
    }
  }

  if (!values.customerPhone.trim()) {
    if (showRequired) {
      errors.customerPhone = "Customer Phone Number is required.";
    }
  } else if (!isValidCustomerPhone(values.customerPhone)) {
    errors.customerPhone = "Use 8-20 chars with digits, spaces, dashes, or +.";
  }

  if (!values.accountNumber.trim()) {
    if (showRequired) {
      errors.accountNumber = "Account Number is required.";
    }
  }

  if (!COLLECTION_BATCH_OPTIONS.includes(values.batch)) {
    errors.batch = "Batch is not valid.";
  }

  if (!values.paymentDate.trim()) {
    if (showRequired) {
      errors.paymentDate = "Payment Date is required.";
    }
  } else if (!isValidDate(values.paymentDate)) {
    errors.paymentDate = "Payment Date is invalid.";
  } else if (isFutureDate(values.paymentDate)) {
    errors.paymentDate = "Payment Date cannot be in the future.";
  }

  if (!values.amount.trim()) {
    if (showRequired) {
      errors.amount = "Amount is required.";
    }
  } else if (!isPositiveAmount(values.amount)) {
    errors.amount = "Amount must be greater than 0.";
  }

  return errors;
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
