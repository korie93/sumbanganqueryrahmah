import { badRequest } from "../../http/errors";
import {
  parseCollectionAmountToCents,
} from "../../../shared/collection-amount-types";
import {
  COLLECTION_ACCOUNT_NUMBER_MAX_LENGTH,
  COLLECTION_BATCHES,
  COLLECTION_CUSTOMER_NAME_MAX_LENGTH,
  COLLECTION_AGING_BUCKETS,
  COLLECTION_IC_NUMBER_MAX_LENGTH,
  COLLECTION_SOURCE_IMPORT_ID_MAX_LENGTH,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  isFutureCollectionDate,
  isValidCollectionDate,
  isValidCollectionPhone,
  parseCollectionAmount,
  type CollectionCreatePayload,
  type CollectionUpdatePayload,
  normalizeCollectionText,
} from "../../routes/collection.validation";

export type NormalizedCollectionRecordFields = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  sourceImportId: string;
  agingBucket: string;
  batch: string;
  paymentDate: string;
  collectionStaffNickname: string;
  amount: number | null;
  amountCents: number | null;
};

export function normalizeCollectionRecordFields(
  body: CollectionCreatePayload | CollectionUpdatePayload,
): NormalizedCollectionRecordFields {
  return {
    customerName: normalizeCollectionText(body.customerName),
    icNumber: normalizeCollectionText(body.icNumber),
    customerPhone: normalizeCollectionText(body.customerPhone),
    accountNumber: normalizeCollectionText(body.accountNumber),
    sourceImportId: normalizeCollectionText(body.sourceImportId),
    agingBucket: normalizeCollectionText(body.agingBucket).toUpperCase(),
    batch: normalizeCollectionText(body.batch).toUpperCase(),
    paymentDate: normalizeCollectionText(body.paymentDate),
    collectionStaffNickname: normalizeCollectionText(body.collectionStaffNickname),
    amount: body.amount !== undefined ? parseCollectionAmount(body.amount) : null,
    amountCents:
      body.amount !== undefined
        ? parseCollectionAmountToCents(body.amount)
        : null,
  };
}

export function assertValidCollectionCreateFields(
  fields: NormalizedCollectionRecordFields,
): asserts fields is NormalizedCollectionRecordFields & {
  amount: number;
  amountCents: number;
} {
  if (!fields.customerName) throw badRequest("Customer Name is required.");
  if (fields.customerName.length > COLLECTION_CUSTOMER_NAME_MAX_LENGTH) {
    throw badRequest("Customer Name must not exceed 200 characters.");
  }
  if (!fields.icNumber) throw badRequest("IC Number is required.");
  if (fields.icNumber.length > COLLECTION_IC_NUMBER_MAX_LENGTH) {
    throw badRequest("IC Number must not exceed 64 characters.");
  }
  if (!isValidCollectionPhone(fields.customerPhone)) {
    throw badRequest("Customer Phone Number is invalid.");
  }
  if (!fields.accountNumber) throw badRequest("Account Number is required.");
  if (fields.accountNumber.length > COLLECTION_ACCOUNT_NUMBER_MAX_LENGTH) {
    throw badRequest("Account Number must not exceed 128 characters.");
  }
  if (!fields.sourceImportId) {
    throw badRequest(
      "Select and verify a Saved source before saving.",
      "COLLECTION_SOURCE_REQUIRED",
    );
  }
  if (fields.sourceImportId.length > COLLECTION_SOURCE_IMPORT_ID_MAX_LENGTH) {
    throw badRequest("Saved source ID is invalid.");
  }
  if (fields.agingBucket && !COLLECTION_AGING_BUCKETS.has(fields.agingBucket)) {
    throw badRequest("Aging must be D3, D4, D5, or D6.");
  }
  if (!COLLECTION_BATCHES.has(fields.batch)) throw badRequest("Invalid batch value.");
  if (!fields.paymentDate || !isValidCollectionDate(fields.paymentDate)) {
    throw badRequest("Invalid payment date.");
  }
  if (isFutureCollectionDate(fields.paymentDate)) {
    throw badRequest("Payment date cannot be in the future.");
  }
  if (fields.amount === null || fields.amountCents === null) {
    throw badRequest("Amount must be a positive number.");
  }
  if (fields.collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
    throw badRequest("Staff nickname must be at least 2 characters.");
  }
}

export function buildCollectionRecordUpdateDraft(
  body: CollectionUpdatePayload,
  fields: NormalizedCollectionRecordFields,
): {
  updatePayload: Record<string, unknown>;
  nextCollectionStaffNickname: string | null;
} {
  const updatePayload: Record<string, unknown> = {};
  let nextCollectionStaffNickname: string | null = null;

  if (body.customerName !== undefined) {
    if (!fields.customerName) throw badRequest("Customer Name cannot be empty.");
    if (fields.customerName.length > COLLECTION_CUSTOMER_NAME_MAX_LENGTH) {
      throw badRequest("Customer Name must not exceed 200 characters.");
    }
    updatePayload.customerName = fields.customerName;
  }
  if (body.icNumber !== undefined) {
    if (!fields.icNumber) throw badRequest("IC Number cannot be empty.");
    if (fields.icNumber.length > COLLECTION_IC_NUMBER_MAX_LENGTH) {
      throw badRequest("IC Number must not exceed 64 characters.");
    }
    updatePayload.icNumber = fields.icNumber;
  }
  if (body.customerPhone !== undefined) {
    if (!isValidCollectionPhone(fields.customerPhone)) {
      throw badRequest("Customer Phone Number is invalid.");
    }
    updatePayload.customerPhone = fields.customerPhone;
  }
  if (body.accountNumber !== undefined) {
    if (!fields.accountNumber) throw badRequest("Account Number cannot be empty.");
    if (fields.accountNumber.length > COLLECTION_ACCOUNT_NUMBER_MAX_LENGTH) {
      throw badRequest("Account Number must not exceed 128 characters.");
    }
    updatePayload.accountNumber = fields.accountNumber;
  }
  if (body.sourceImportId !== undefined && fields.sourceImportId.length > COLLECTION_SOURCE_IMPORT_ID_MAX_LENGTH) {
    throw badRequest("Saved source ID is invalid.");
  }
  if (body.agingBucket !== undefined) {
    if (!COLLECTION_AGING_BUCKETS.has(fields.agingBucket)) {
      throw badRequest("Aging must be D3, D4, D5, or D6.");
    }
    updatePayload.agingBucket = fields.agingBucket;
  }
  if (body.batch !== undefined) {
    if (!COLLECTION_BATCHES.has(fields.batch)) throw badRequest("Invalid batch value.");
    updatePayload.batch = fields.batch;
  }
  if (body.paymentDate !== undefined) {
    if (!fields.paymentDate || !isValidCollectionDate(fields.paymentDate)) {
      throw badRequest("Invalid payment date.");
    }
    if (isFutureCollectionDate(fields.paymentDate)) {
      throw badRequest("Payment date cannot be in the future.");
    }
    updatePayload.paymentDate = fields.paymentDate;
  }
  if (body.amount !== undefined) {
    const amount = fields.amount;
    const amountCents = fields.amountCents;
    if (amount === null || amountCents === null) {
      throw badRequest("Amount must be a positive number.");
    }
    updatePayload.amount = amount;
  }
  if (body.collectionStaffNickname !== undefined) {
    if (fields.collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
      throw badRequest("Staff nickname must be at least 2 characters.");
    }
    nextCollectionStaffNickname = fields.collectionStaffNickname;
  }

  return {
    updatePayload,
    nextCollectionStaffNickname,
  };
}
