import {
  type CollectionBatch,
  type CollectionAgingBucket,
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
  sourceImportId: string;
  agingBucket: CollectionAgingBucket;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
};

export type SaveCollectionFieldName =
  | "staffNickname"
  | "customerName"
  | "icNumber"
  | "customerPhone"
  | "accountNumber"
  | "sourceImportId"
  | "agingBucket"
  | "batch"
  | "paymentDate"
  | "amount";

export type SaveCollectionFieldErrors = Partial<Record<SaveCollectionFieldName, string>>;

export type SaveCollectionIdentityValues = Pick<
  SaveCollectionFormValues,
  "customerName" | "icNumber" | "customerPhone" | "accountNumber"
>;

export type SaveCollectionReadiness = {
  errors: SaveCollectionFieldErrors;
  invalidFields: SaveCollectionFieldName[];
  isReady: boolean;
  firstError: string | null;
};

export const SAVE_COLLECTION_IDENTITY_FIELD_LIMITS = {
  customerName: 200,
  icNumber: 64,
  accountNumber: 128,
} as const;

const SAVE_COLLECTION_FIELD_ORDER: SaveCollectionFieldName[] = [
  "staffNickname",
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
  "sourceImportId",
  "agingBucket",
  "batch",
  "paymentDate",
  "amount",
];

export type SaveCollectionMutationPayload = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  sourceImportId: string;
  agingBucket: CollectionAgingBucket;
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
  return getSaveCollectionReadiness(values).firstError;
}

export function validateSaveCollectionIdentityFields(
  values: SaveCollectionIdentityValues,
): SaveCollectionFieldErrors {
  const errors: SaveCollectionFieldErrors = {};

  if (!values.customerName.trim()) {
    errors.customerName = "Customer Name is required.";
  } else if (values.customerName.trim().length > SAVE_COLLECTION_IDENTITY_FIELD_LIMITS.customerName) {
    errors.customerName = "Customer Name must not exceed 200 characters.";
  }
  if (!values.icNumber.trim()) {
    errors.icNumber = "IC Number is required.";
  } else if (values.icNumber.trim().length > SAVE_COLLECTION_IDENTITY_FIELD_LIMITS.icNumber) {
    errors.icNumber = "IC Number must not exceed 64 characters.";
  }
  if (!isValidCustomerPhone(values.customerPhone)) {
    errors.customerPhone = "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.";
  }
  if (!values.accountNumber.trim()) {
    errors.accountNumber = "Account Number is required.";
  } else if (values.accountNumber.trim().length > SAVE_COLLECTION_IDENTITY_FIELD_LIMITS.accountNumber) {
    errors.accountNumber = "Account Number must not exceed 128 characters.";
  }

  return errors;
}

export function validateSaveCollectionFormFields(values: SaveCollectionFormValues): SaveCollectionFieldErrors {
  const errors: SaveCollectionFieldErrors = validateSaveCollectionIdentityFields(values);

  if (!values.staffNickname || values.staffNickname.trim().length < 2) {
    errors.staffNickname = "Staff nickname is required.";
  }
  if (!String(values.sourceImportId || "").trim()) {
    errors.sourceImportId = "Pilih fail Saved yang telah disahkan matching.";
  }
  if (!["D3", "D4", "D5", "D6"].includes(values.agingBucket)) {
    errors.agingBucket = "Aging mesti D3, D4, D5, atau D6.";
  }
  if (!COLLECTION_BATCH_OPTIONS.includes(values.batch)) {
    errors.batch = "Batch is not valid.";
  }
  if (!isValidDate(values.paymentDate)) {
    errors.paymentDate = "Payment Date is invalid.";
  } else if (isFutureDate(values.paymentDate)) {
    errors.paymentDate = "Payment Date cannot be in the future.";
  }
  if (!isPositiveAmount(values.amount)) {
    errors.amount = "Amount must be greater than 0.";
  }

  return errors;
}

export function getSaveCollectionReadiness(values: SaveCollectionFormValues): SaveCollectionReadiness {
  const errors = validateSaveCollectionFormFields(values);
  const invalidFields = SAVE_COLLECTION_FIELD_ORDER.filter((field) => Boolean(errors[field]));

  return {
    errors,
    invalidFields,
    isReady: invalidFields.length === 0,
    firstError: invalidFields.length > 0 ? errors[invalidFields[0]!] ?? null : null,
  };
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
    sourceImportId: values.sourceImportId.trim(),
    agingBucket: values.agingBucket,
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
