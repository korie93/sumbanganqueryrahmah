import { badRequest } from "../../http/errors";
import {
  COLLECTION_BATCHES,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  isFutureCollectionDate,
  isValidCollectionDate,
  isValidCollectionPhone,
  parseCollectionAmount,
  type CollectionCreatePayload,
  type CollectionUpdatePayload,
  type CollectionReceiptMetadataPayload,
  ensureLooseObject,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import {
  normalizeCollectionReceiptDate,
  normalizeCollectionReceiptExtractionStatus,
  normalizeCollectionReceiptReference,
  parseCollectionAmountToCents,
  type CollectionReceiptValidationDraft,
} from "./collection-receipt-validation";
import type {
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  UpdateCollectionRecordReceiptInput,
} from "../../storage-postgres";

export type MultipartCollectionPayload = Record<string, unknown> & {
  uploadedReceipts?: CreateCollectionRecordReceiptInput[] | null;
};

export type CollectionRecordAuditSource = "relation" | "legacy" | "none";

export type CollectionRecordAuditSnapshot = {
  customerName: string;
  paymentDate: string;
  amount: number;
  collectionStaffNickname: string;
  activeReceiptCount: number;
  activeReceiptSource: CollectionRecordAuditSource;
};

function toCollectionAuditAmount(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export function resolveCollectionAuditReceiptState(params: {
  relationCount: number;
  legacyReceiptFile?: string | null;
}): {
  count: number;
  source: CollectionRecordAuditSource;
} {
  const relationCount = Math.max(0, Number(params.relationCount) || 0);
  if (relationCount > 0) {
    return {
      count: relationCount,
      source: "relation",
    };
  }

  if (normalizeCollectionText(params.legacyReceiptFile)) {
    return {
      count: 1,
      source: "legacy",
    };
  }

  return {
    count: 0,
    source: "none",
  };
}

export function buildCollectionAuditSnapshot(params: {
  customerName: unknown;
  paymentDate: unknown;
  amount: unknown;
  collectionStaffNickname: unknown;
  activeReceiptCount: number;
  activeReceiptSource: CollectionRecordAuditSource;
}): CollectionRecordAuditSnapshot {
  return {
    customerName: String(params.customerName || "").trim(),
    paymentDate: String(params.paymentDate || "").trim(),
    amount: toCollectionAuditAmount(params.amount),
    collectionStaffNickname: String(params.collectionStaffNickname || "").trim(),
    activeReceiptCount: Math.max(0, Number(params.activeReceiptCount) || 0),
    activeReceiptSource: params.activeReceiptSource,
  };
}

export function buildCollectionAuditFieldChanges(
  before: CollectionRecordAuditSnapshot,
  after: CollectionRecordAuditSnapshot,
) {
  const changes: Record<string, { from: string | number; to: string | number }> = {};

  if (before.customerName !== after.customerName) {
    changes.customerName = {
      from: before.customerName,
      to: after.customerName,
    };
  }
  if (before.paymentDate !== after.paymentDate) {
    changes.paymentDate = {
      from: before.paymentDate,
      to: after.paymentDate,
    };
  }
  if (before.amount !== after.amount) {
    changes.amount = {
      from: before.amount,
      to: after.amount,
    };
  }
  if (before.collectionStaffNickname !== after.collectionStaffNickname) {
    changes.collectionStaffNickname = {
      from: before.collectionStaffNickname,
      to: after.collectionStaffNickname,
    };
  }

  return changes;
}

export type NormalizedCollectionRecordFields = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
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
  if (!fields.icNumber) throw badRequest("IC Number is required.");
  if (!isValidCollectionPhone(fields.customerPhone)) {
    throw badRequest("Customer Phone Number is invalid.");
  }
  if (!fields.accountNumber) throw badRequest("Account Number is required.");
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
    updatePayload.customerName = fields.customerName;
  }
  if (body.icNumber !== undefined) {
    if (!fields.icNumber) throw badRequest("IC Number cannot be empty.");
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
    updatePayload.accountNumber = fields.accountNumber;
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

export function normalizeExtractionConfidence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  if (parsed <= 1) {
    return parsed;
  }
  if (parsed <= 100) {
    return parsed / 100;
  }
  return null;
}

export function readUploadedReceiptRows(
  body: MultipartCollectionPayload,
): CreateCollectionRecordReceiptInput[] {
  if (!Array.isArray(body.uploadedReceipts)) {
    return [];
  }

  return body.uploadedReceipts
    .map((item) => ensureLooseObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      storagePath: normalizeCollectionText(item.storagePath),
      originalFileName: normalizeCollectionText(item.originalFileName),
      originalMimeType:
        normalizeCollectionText(item.originalMimeType) || "application/octet-stream",
      originalExtension: normalizeCollectionText(item.originalExtension),
      fileSize: Number(item.fileSize || 0),
      receiptAmountCents: parseCollectionAmountToCents(item.receiptAmountCents, {
        allowZero: true,
        allowEmpty: true,
      }),
      extractedAmountCents: parseCollectionAmountToCents(item.extractedAmountCents, {
        allowZero: true,
        allowEmpty: true,
      }),
      extractionStatus: normalizeCollectionReceiptExtractionStatus(item.extractionStatus ?? null),
      extractionConfidence: normalizeExtractionConfidence(item.extractionConfidence),
      receiptDate: normalizeCollectionReceiptDate(item.receiptDate),
      receiptReference: normalizeCollectionReceiptReference(item.receiptReference),
      fileHash: normalizeCollectionText(item.fileHash).toLowerCase() || null,
    }))
    .filter((item) => item.storagePath && item.originalFileName && Number.isFinite(item.fileSize));
}

export type NormalizedCollectionReceiptMetadata = {
  receiptId: string | null;
  receiptAmountCents: number | null;
  extractedAmountCents: number | null;
  extractionStatus: CreateCollectionRecordReceiptInput["extractionStatus"];
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
};

export function readCollectionReceiptMetadataList(
  raw: unknown,
): CollectionReceiptMetadataPayload[] {
  if (!raw) {
    return [];
  }

  if (typeof raw === "string") {
    const normalized = raw.trim();
    if (!normalized) {
      return [];
    }
    try {
      const parsed = JSON.parse(normalized);
      return Array.isArray(parsed)
        ? parsed
            .map((item) => ensureLooseObject(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
        : [];
    } catch {
      throw new Error("COLLECTION_RECEIPT_METADATA_INVALID");
    }
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => ensureLooseObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

export function normalizeCollectionReceiptMetadata(
  raw: CollectionReceiptMetadataPayload,
): NormalizedCollectionReceiptMetadata {
  return {
    receiptId: normalizeCollectionText(raw.receiptId) || null,
    receiptAmountCents: parseCollectionAmountToCents(raw.receiptAmount, { allowZero: true }),
    extractedAmountCents: parseCollectionAmountToCents(raw.extractedAmount, {
      allowZero: true,
      allowEmpty: true,
    }),
    extractionStatus: normalizeCollectionReceiptExtractionStatus(raw.extractionStatus ?? null),
    extractionConfidence: normalizeExtractionConfidence(raw.extractionConfidence),
    receiptDate: normalizeCollectionReceiptDate(raw.receiptDate),
    receiptReference: normalizeCollectionReceiptReference(raw.receiptReference),
    fileHash: normalizeCollectionText(raw.fileHash).toLowerCase() || null,
  };
}

export function buildValidationDraftFromExistingReceipt(
  receipt: CollectionRecordReceipt,
): CollectionReceiptValidationDraft {
  return {
    receiptId: receipt.id,
    fileHash: normalizeCollectionText(receipt.fileHash).toLowerCase() || null,
    originalFileName: receipt.originalFileName,
    receiptAmountCents: parseCollectionAmountToCents(receipt.receiptAmount, {
      allowZero: true,
      allowEmpty: true,
    }),
    extractedAmountCents: parseCollectionAmountToCents(receipt.extractedAmount, {
      allowZero: true,
      allowEmpty: true,
    }),
    extractionStatus: normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus),
    extractionConfidence:
      receipt.extractionConfidence === null || receipt.extractionConfidence === undefined
        ? null
        : Number(receipt.extractionConfidence),
    receiptDate: normalizeCollectionReceiptDate(receipt.receiptDate),
    receiptReference: normalizeCollectionReceiptReference(receipt.receiptReference),
  };
}

export function buildValidationDraftFromMetadata(params: {
  metadata: NormalizedCollectionReceiptMetadata;
  originalFileName?: string | null;
}): CollectionReceiptValidationDraft {
  return {
    receiptId: params.metadata.receiptId,
    fileHash: params.metadata.fileHash,
    originalFileName: params.originalFileName || null,
    receiptAmountCents: params.metadata.receiptAmountCents,
    extractedAmountCents: params.metadata.extractedAmountCents,
    extractionStatus: params.metadata.extractionStatus,
    extractionConfidence: params.metadata.extractionConfidence,
    receiptDate: params.metadata.receiptDate,
    receiptReference: params.metadata.receiptReference,
  };
}

export function buildCreateReceiptInput(
  uploadedReceipt: CreateCollectionRecordReceiptInput,
  metadata: NormalizedCollectionReceiptMetadata,
): CreateCollectionRecordReceiptInput {
  return {
    ...uploadedReceipt,
    receiptAmountCents: metadata.receiptAmountCents,
    extractedAmountCents: metadata.extractedAmountCents,
    extractionStatus:
      metadata.extractionStatus
      || normalizeCollectionReceiptExtractionStatus(uploadedReceipt.extractionStatus),
    extractionConfidence: metadata.extractionConfidence,
    receiptDate: metadata.receiptDate,
    receiptReference: metadata.receiptReference,
    fileHash:
      metadata.fileHash || normalizeCollectionText(uploadedReceipt.fileHash).toLowerCase() || null,
  };
}

export function buildReceiptUpdateInput(
  receiptId: string,
  draft: CollectionReceiptValidationDraft,
): UpdateCollectionRecordReceiptInput {
  return {
    receiptId,
    receiptAmountCents: draft.receiptAmountCents ?? null,
    extractedAmountCents: draft.extractedAmountCents ?? null,
    extractionStatus: draft.extractionStatus ?? null,
    extractionConfidence: draft.extractionConfidence ?? null,
    receiptDate: draft.receiptDate ?? null,
    receiptReference: draft.receiptReference ?? null,
  };
}
