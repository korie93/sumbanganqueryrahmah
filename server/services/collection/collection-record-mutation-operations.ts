import { badRequest, conflict, forbidden, notFound } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { verifyPassword } from "../../auth/passwords";
import { logger } from "../../lib/logger";
import {
  canUserAccessCollectionRecord,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
} from "../../routes/collection-access";
import { removeCollectionReceiptFile, saveCollectionReceipt } from "../../routes/collection-receipt.service";
import {
  COLLECTION_BATCHES,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
  type CollectionReceiptMetadataPayload,
  ensureLooseObject,
  isFutureCollectionDate,
  isNicknameScopeAllowedForRole,
  isValidCollectionDate,
  isValidCollectionPhone,
  normalizeCollectionStringList,
  normalizeCollectionText,
  parseCollectionAmount,
  type CollectionBatchValue,
  type CollectionCreatePayload,
  type CollectionDeletePayload,
  type CollectionReceiptPayload,
  type CollectionUpdatePayload,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  buildCollectionPurgeCutoffDate,
  COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE,
  getCollectionPurgeRetentionMonths,
  parseRecordVersionTimestamp,
  resolveRecordVersionTimestamp,
} from "./collection-record-runtime-utils";
import {
  findDuplicateCollectionReceiptHashes,
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

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

type MultipartCollectionPayload = Record<string, unknown> & {
  uploadedReceipts?: CreateCollectionRecordReceiptInput[] | null;
};

type CollectionRecordAuditSource = "relation" | "legacy" | "none";

type CollectionRecordAuditSnapshot = {
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

function resolveCollectionAuditReceiptState(params: {
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

function buildCollectionAuditSnapshot(params: {
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

function buildCollectionAuditFieldChanges(
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

function readUploadedReceiptRows(body: MultipartCollectionPayload): CreateCollectionRecordReceiptInput[] {
  if (!Array.isArray(body.uploadedReceipts)) {
    return [];
  }

  return body.uploadedReceipts
    .map((item) => ensureLooseObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      storagePath: normalizeCollectionText(item.storagePath),
      originalFileName: normalizeCollectionText(item.originalFileName),
      originalMimeType: normalizeCollectionText(item.originalMimeType) || "application/octet-stream",
      originalExtension: normalizeCollectionText(item.originalExtension),
      fileSize: Number(item.fileSize || 0),
      receiptAmountCents: parseCollectionAmountToCents(item.receiptAmountCents, { allowZero: true, allowEmpty: true }),
      extractedAmountCents: parseCollectionAmountToCents(item.extractedAmountCents, { allowZero: true, allowEmpty: true }),
      extractionStatus: normalizeCollectionReceiptExtractionStatus(item.extractionStatus ?? null),
      extractionConfidence: normalizeExtractionConfidence(item.extractionConfidence),
      receiptDate: normalizeCollectionReceiptDate(item.receiptDate),
      receiptReference: normalizeCollectionReceiptReference(item.receiptReference),
      fileHash: normalizeCollectionText(item.fileHash).toLowerCase() || null,
    }))
    .filter((item) => item.storagePath && item.originalFileName && Number.isFinite(item.fileSize));
}

type NormalizedCollectionReceiptMetadata = {
  receiptId: string | null;
  receiptAmountCents: number | null;
  extractedAmountCents: number | null;
  extractionStatus: CreateCollectionRecordReceiptInput["extractionStatus"];
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
};

function readCollectionReceiptMetadataList(raw: unknown): CollectionReceiptMetadataPayload[] {
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
      throw badRequest("Receipt metadata payload is invalid.", "COLLECTION_RECEIPT_METADATA_INVALID");
    }
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => ensureLooseObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizeExtractionConfidence(value: unknown): number | null {
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

function normalizeCollectionReceiptMetadata(
  raw: CollectionReceiptMetadataPayload,
): NormalizedCollectionReceiptMetadata {
  return {
    receiptId: normalizeCollectionText(raw.receiptId) || null,
    receiptAmountCents: parseCollectionAmountToCents(raw.receiptAmount, { allowZero: true }),
    extractedAmountCents: parseCollectionAmountToCents(raw.extractedAmount, { allowZero: true, allowEmpty: true }),
    extractionStatus: normalizeCollectionReceiptExtractionStatus(raw.extractionStatus ?? null),
    extractionConfidence: normalizeExtractionConfidence(raw.extractionConfidence),
    receiptDate: normalizeCollectionReceiptDate(raw.receiptDate),
    receiptReference: normalizeCollectionReceiptReference(raw.receiptReference),
    fileHash: normalizeCollectionText(raw.fileHash).toLowerCase() || null,
  };
}

function buildValidationDraftFromExistingReceipt(
  receipt: CollectionRecordReceipt,
): CollectionReceiptValidationDraft {
  return {
    receiptId: receipt.id,
    fileHash: normalizeCollectionText(receipt.fileHash).toLowerCase() || null,
    originalFileName: receipt.originalFileName,
    receiptAmountCents: parseCollectionAmountToCents(receipt.receiptAmount, { allowZero: true, allowEmpty: true }),
    extractedAmountCents: parseCollectionAmountToCents(receipt.extractedAmount, { allowZero: true, allowEmpty: true }),
    extractionStatus: normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus),
    extractionConfidence:
      receipt.extractionConfidence === null || receipt.extractionConfidence === undefined
        ? null
        : Number(receipt.extractionConfidence),
    receiptDate: normalizeCollectionReceiptDate(receipt.receiptDate),
    receiptReference: normalizeCollectionReceiptReference(receipt.receiptReference),
  };
}

function buildValidationDraftFromMetadata(params: {
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

function buildCreateReceiptInput(
  uploadedReceipt: CreateCollectionRecordReceiptInput,
  metadata: NormalizedCollectionReceiptMetadata,
): CreateCollectionRecordReceiptInput {
  return {
    ...uploadedReceipt,
    receiptAmountCents: metadata.receiptAmountCents,
    extractedAmountCents: metadata.extractedAmountCents,
    extractionStatus: metadata.extractionStatus || normalizeCollectionReceiptExtractionStatus(uploadedReceipt.extractionStatus),
    extractionConfidence: metadata.extractionConfidence,
    receiptDate: metadata.receiptDate,
    receiptReference: metadata.receiptReference,
    fileHash: metadata.fileHash || normalizeCollectionText(uploadedReceipt.fileHash).toLowerCase() || null,
  };
}

function buildReceiptUpdateInput(
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

export class CollectionRecordMutationOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  private async logRejectedPurgeAttempt(username: string, details: string) {
    try {
      await this.storage.createAuditLog({
        action: "COLLECTION_RECORDS_PURGE_REJECTED",
        performedBy: username,
        targetResource: "collection-records",
        details,
      });
    } catch {
      // best effort audit only
    }
  }

  private async safeCreateAuditLog(params: {
    action: string;
    performedBy: string;
    targetResource: string;
    details: string;
  }) {
    try {
      await this.storage.createAuditLog({
        action: params.action,
        performedBy: params.performedBy,
        targetResource: params.targetResource,
        details: params.details,
      });
    } catch (error) {
      logger.warn("Collection mutation audit log write failed", {
        error,
        action: params.action,
        targetResource: params.targetResource,
        performedBy: params.performedBy,
      });
    }
  }

  private async logRecordVersionConflict(params: {
    username: string;
    recordId: string;
    operation: "update" | "delete";
    expectedUpdatedAt: Date | null;
    currentUpdatedAt: Date | null;
  }) {
    try {
      await this.storage.createAuditLog({
        action: "COLLECTION_RECORD_VERSION_CONFLICT",
        performedBy: params.username,
        targetResource: params.recordId,
        details: [
          `Collection record ${params.operation} rejected due to stale version by ${params.username}.`,
          `expectedUpdatedAt=${params.expectedUpdatedAt?.toISOString() || "null"}`,
          `currentUpdatedAt=${params.currentUpdatedAt?.toISOString() || "null"}`,
        ].join(" "),
      });
    } catch {
      // best effort telemetry only
    }
  }

  async createRecord(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const uploadedReceipts: Array<Awaited<ReturnType<typeof saveCollectionReceipt>>> = [];
    let createdRecordId: string | null = null;

    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionCreatePayload & MultipartCollectionPayload;
      const customerName = normalizeCollectionText(body.customerName);
      const icNumber = normalizeCollectionText(body.icNumber);
      const customerPhone = normalizeCollectionText(body.customerPhone);
      const accountNumber = normalizeCollectionText(body.accountNumber);
      const batch = normalizeCollectionText(body.batch).toUpperCase();
      const paymentDate = normalizeCollectionText(body.paymentDate);
      const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
      const amount = parseCollectionAmount(body.amount);
      const amountCents = parseCollectionAmountToCents(body.amount);

      if (!customerName) throw badRequest("Customer Name is required.");
      if (!icNumber) throw badRequest("IC Number is required.");
      if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
      if (!accountNumber) throw badRequest("Account Number is required.");
      if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
      if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
      if (isFutureCollectionDate(paymentDate)) throw badRequest("Payment date cannot be in the future.");
      if (amount === null || amountCents === null) throw badRequest("Amount must be a positive number.");
      if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
        throw badRequest("Staff nickname must be at least 2 characters.");
      }

      const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
      if (!staffNickname?.isActive) {
        throw badRequest("Staff nickname tidak sah atau sudah inactive.");
      }
      if (user.role === "admin") {
        const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
        if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
          throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
        }
      } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
        throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
      }

      const receiptPayload = ensureLooseObject(body.receipt) as CollectionReceiptPayload | null;
      const receiptPayloads = [
        ...(receiptPayload ? [receiptPayload] : []),
        ...(Array.isArray(body.receipts)
          ? body.receipts
              .map((item) => ensureLooseObject(item) as CollectionReceiptPayload | null)
              .filter((item): item is CollectionReceiptPayload => Boolean(item))
          : []),
      ];
      uploadedReceipts.push(...readUploadedReceiptRows(body));
      for (const nextReceipt of receiptPayloads) {
        uploadedReceipts.push(await saveCollectionReceipt(nextReceipt));
      }
      const newReceiptMetadata = readCollectionReceiptMetadataList(body.newReceiptMetadata)
        .map((item) => normalizeCollectionReceiptMetadata(item));
      const newReceiptInputs = uploadedReceipts.map((receipt, index) =>
        buildCreateReceiptInput(
          receipt,
          newReceiptMetadata[index] || normalizeCollectionReceiptMetadata({}),
        ));
      const validationReceipts = newReceiptInputs.map((receipt) =>
        buildValidationDraftFromMetadata({
          metadata: {
            receiptId: null,
            receiptAmountCents: receipt.receiptAmountCents ?? null,
            extractedAmountCents: receipt.extractedAmountCents ?? null,
            extractionStatus: receipt.extractionStatus ?? null,
            extractionConfidence: receipt.extractionConfidence ?? null,
            receiptDate: receipt.receiptDate ?? null,
            receiptReference: receipt.receiptReference ?? null,
            fileHash: receipt.fileHash ?? null,
          },
          originalFileName: receipt.originalFileName,
        }));
      const duplicateReceipts = findDuplicateCollectionReceiptHashes(validationReceipts);
      if (duplicateReceipts.length > 0) {
        await this.safeCreateAuditLog({
          action: "COLLECTION_RECEIPT_DUPLICATE_REJECTED",
          performedBy: user.username,
          targetResource: "collection-records",
          details: JSON.stringify({
            event: "collection_receipt_duplicate_rejected",
            actor: user.username,
            customerName,
            duplicates: duplicateReceipts,
          }),
        });
        throw badRequest(
          "Duplicate receipt upload detected for this collection record.",
          "COLLECTION_RECEIPT_DUPLICATE_DETECTED",
        );
      }

      const record = await this.storage.createCollectionRecord({
        customerName,
        icNumber,
        customerPhone,
        accountNumber,
        batch: batch as CollectionBatchValue,
        paymentDate,
        amount,
        receiptFile: null,
        createdByLogin: user.username,
        collectionStaffNickname,
      });
      createdRecordId = record.id;
      if (newReceiptInputs.length > 0) {
        await this.storage.createCollectionRecordReceipts(record.id, newReceiptInputs);
      }
      const syncedRecord = await this.storage.syncCollectionRecordReceiptValidation(record.id);
      const hydratedRecord = syncedRecord || await this.storage.getCollectionRecordById(record.id);
      const finalRecord = hydratedRecord || record;
      const finalReceiptState = resolveCollectionAuditReceiptState({
        relationCount: newReceiptInputs.length,
        legacyReceiptFile: null,
      });

      if (finalRecord.duplicateReceiptFlag) {
        await this.safeCreateAuditLog({
          action: "COLLECTION_RECEIPT_DUPLICATE_WARNING",
          performedBy: user.username,
          targetResource: finalRecord.id,
          details: JSON.stringify({
            event: "collection_receipt_duplicate_warning",
            actor: user.username,
            recordId: finalRecord.id,
            receiptCount: finalRecord.receiptCount,
          }),
        });
      }

      await this.safeCreateAuditLog({
        action: "COLLECTION_RECORD_CREATED",
        performedBy: user.username,
        targetResource: finalRecord.id,
        details: JSON.stringify({
          event: "collection_record_created",
          actor: user.username,
          recordId: finalRecord.id,
          snapshot: buildCollectionAuditSnapshot({
            customerName: finalRecord.customerName,
            paymentDate: finalRecord.paymentDate,
            amount: finalRecord.amount,
            collectionStaffNickname: finalRecord.collectionStaffNickname,
            activeReceiptCount: finalReceiptState.count,
            activeReceiptSource: finalReceiptState.source,
          }),
          receipts: {
            addedCount: newReceiptInputs.length,
            afterCount: finalReceiptState.count,
            afterSource: finalReceiptState.source,
          },
        }),
      });

      return { ok: true as const, record: finalRecord };
    } catch (err) {
      if (createdRecordId) {
        try {
          await this.storage.deleteCollectionRecord(createdRecordId);
        } catch (rollbackError) {
          logger.warn("Collection record create rollback failed after mutation error", {
            error: rollbackError,
            recordId: createdRecordId,
            performedBy: user.username,
          });
        }
      }
      for (const uploadedReceipt of uploadedReceipts) {
        await removeCollectionReceiptFile(uploadedReceipt.storagePath);
      }
      throw err;
    }
  }

  async purgeOldRecords(
    userInput: AuthenticatedUser | undefined,
    bodyRaw?: unknown,
  ) {
    const user = this.requireUser(userInput);
    if (user.role !== "superuser") {
      throw forbidden("Purge data collection hanya untuk superuser.");
    }

    const actor =
      (user.userId ? await this.storage.getUser(user.userId) : undefined)
      || (await this.storage.getUserByUsername(user.username));
    if (!actor?.passwordHash) {
      throw forbidden("Tidak dapat sahkan kelayakan superuser.");
    }

    const body = ensureLooseObject(bodyRaw) || {};
    const currentPassword = String(body.currentPassword || "");
    if (!currentPassword) {
      throw badRequest("Password login superuser diperlukan untuk purge.");
    }

    const isValidPassword = await verifyPassword(currentPassword, actor.passwordHash);
    if (!isValidPassword) {
      await this.logRejectedPurgeAttempt(
        user.username,
        `Rejected collection purge attempt due to invalid superuser password by ${user.username}`,
      );
      throw forbidden("Password login superuser tidak sah.");
    }

    const cutoffDate = buildCollectionPurgeCutoffDate();
    const purged = await this.storage.purgeCollectionRecordsOlderThan(cutoffDate);
    if (purged.receiptPaths.length > 0) {
      await Promise.allSettled(
        purged.receiptPaths.map((receiptPath) => removeCollectionReceiptFile(receiptPath)),
      );
    }

    if (purged.totalRecords > 0) {
      await this.storage.createAuditLog({
        action: "COLLECTION_RECORDS_PURGED",
        performedBy: user.username,
        targetResource: "collection-records",
        details: `Purged ${purged.totalRecords} collection records older than ${cutoffDate} by ${user.username}`,
      });
    }

    return {
      ok: true as const,
      retentionMonths: getCollectionPurgeRetentionMonths(),
      cutoffDate,
      deletedRecords: purged.totalRecords,
      totalAmount: purged.totalAmount,
    };
  }

  async updateRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Collection id is required.");
    }

    const existing = await this.storage.getCollectionRecordById(id);
    if (!existing) {
      throw notFound("Collection record not found.");
    }
    if (!(await canUserAccessCollectionRecord(this.storage, user, existing))) {
      throw forbidden("Forbidden");
    }

    const uploadedReceipts: Array<Awaited<ReturnType<typeof saveCollectionReceipt>>> = [];
    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionUpdatePayload & MultipartCollectionPayload;
      const expectedUpdatedAt = parseRecordVersionTimestamp(body.expectedUpdatedAt);
      if (expectedUpdatedAt) {
        const currentVersion = resolveRecordVersionTimestamp(existing);
        if (!currentVersion || currentVersion.getTime() !== expectedUpdatedAt.getTime()) {
          await this.logRecordVersionConflict({
            username: user.username,
            recordId: id,
            operation: "update",
            expectedUpdatedAt,
            currentUpdatedAt: currentVersion,
          });
          throw conflict(COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE, "COLLECTION_RECORD_VERSION_CONFLICT");
        }
      }

      const updatePayload: Record<string, unknown> = {};
      const customerName = normalizeCollectionText(body.customerName);
      const icNumber = normalizeCollectionText(body.icNumber);
      const customerPhone = normalizeCollectionText(body.customerPhone);
      const accountNumber = normalizeCollectionText(body.accountNumber);
      const batch = normalizeCollectionText(body.batch).toUpperCase();
      const paymentDate = normalizeCollectionText(body.paymentDate);
      const collectionStaffNickname = normalizeCollectionText(body.collectionStaffNickname);
      const amount = body.amount !== undefined ? parseCollectionAmount(body.amount) : null;
      const nextAmountCents =
        body.amount !== undefined
          ? parseCollectionAmountToCents(body.amount)
          : parseCollectionAmountToCents(existing.amount, { allowZero: true });

      if (body.customerName !== undefined) {
        if (!customerName) throw badRequest("Customer Name cannot be empty.");
        updatePayload.customerName = customerName;
      }
      if (body.icNumber !== undefined) {
        if (!icNumber) throw badRequest("IC Number cannot be empty.");
        updatePayload.icNumber = icNumber;
      }
      if (body.customerPhone !== undefined) {
        if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
        updatePayload.customerPhone = customerPhone;
      }
      if (body.accountNumber !== undefined) {
        if (!accountNumber) throw badRequest("Account Number cannot be empty.");
        updatePayload.accountNumber = accountNumber;
      }
      if (body.batch !== undefined) {
        if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
        updatePayload.batch = batch;
      }
      if (body.paymentDate !== undefined) {
        if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
        if (isFutureCollectionDate(paymentDate)) throw badRequest("Payment date cannot be in the future.");
        updatePayload.paymentDate = paymentDate;
      }
      if (body.amount !== undefined) {
        if (amount === null || nextAmountCents === null) throw badRequest("Amount must be a positive number.");
        updatePayload.amount = amount;
      }
      if (body.collectionStaffNickname !== undefined) {
        if (collectionStaffNickname.length < COLLECTION_STAFF_NICKNAME_MIN_LENGTH) {
          throw badRequest("Staff nickname must be at least 2 characters.");
        }
        const staffNickname = await this.storage.getCollectionStaffNicknameByName(collectionStaffNickname);
        if (!staffNickname?.isActive) {
          throw badRequest("Staff nickname tidak sah atau sudah inactive.");
        }
        if (user.role === "admin") {
          const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
          if (!hasNicknameValue(allowedNicknames, collectionStaffNickname)) {
            throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
          }
        } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
          throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
        }
        updatePayload.collectionStaffNickname = collectionStaffNickname;
      }

      const shouldRemoveReceipt = body.removeReceipt === true;
      const receiptPayload = ensureLooseObject(body.receipt) as CollectionReceiptPayload | null;
      const receiptPayloads = [
        ...(receiptPayload ? [receiptPayload] : []),
        ...(Array.isArray(body.receipts)
          ? body.receipts
              .map((item) => ensureLooseObject(item) as CollectionReceiptPayload | null)
              .filter((item): item is CollectionReceiptPayload => Boolean(item))
          : []),
      ];
      const removeReceiptIds = Array.isArray(body.removeReceiptIds)
        ? normalizeCollectionStringList(body.removeReceiptIds)
        : [];
      uploadedReceipts.push(...readUploadedReceiptRows(body));
      for (const nextReceipt of receiptPayloads) {
        uploadedReceipts.push(await saveCollectionReceipt(nextReceipt));
      }
      const existingReceiptMetadata = readCollectionReceiptMetadataList(body.existingReceiptMetadata)
        .map((item) => normalizeCollectionReceiptMetadata(item));
      const newReceiptMetadata = readCollectionReceiptMetadataList(body.newReceiptMetadata)
        .map((item) => normalizeCollectionReceiptMetadata(item));

      const hasReceiptMutation =
        shouldRemoveReceipt
        || removeReceiptIds.length > 0
        || uploadedReceipts.length > 0
        || existingReceiptMetadata.length > 0;
      if (Object.keys(updatePayload).length === 0 && !hasReceiptMutation) {
        return { ok: true as const, record: existing };
      }

      const existingReceipts = Array.isArray(existing.receipts) ? existing.receipts : [];
      const beforeReceiptState = resolveCollectionAuditReceiptState({
        relationCount: existingReceipts.length,
        legacyReceiptFile: existing.receiptFile,
      });
      const removedReceipts = shouldRemoveReceipt
        ? existingReceipts
        : removeReceiptIds.length > 0
          ? existingReceipts.filter((receipt) => removeReceiptIds.includes(receipt.id))
          : [];
      const activeExistingReceipts = shouldRemoveReceipt
        ? []
        : existingReceipts.filter((receipt) => !removeReceiptIds.includes(receipt.id));
      const activeExistingDrafts = activeExistingReceipts.map((receipt) =>
        buildValidationDraftFromExistingReceipt(receipt));
      for (const metadata of existingReceiptMetadata) {
        if (!metadata.receiptId) {
          continue;
        }
        const targetDraft = activeExistingDrafts.find((draft) => draft.receiptId === metadata.receiptId);
        if (!targetDraft) {
          continue;
        }
        targetDraft.receiptAmountCents = metadata.receiptAmountCents;
        targetDraft.extractedAmountCents = metadata.extractedAmountCents;
        targetDraft.extractionStatus = metadata.extractionStatus;
        targetDraft.extractionConfidence = metadata.extractionConfidence;
        targetDraft.receiptDate = metadata.receiptDate;
        targetDraft.receiptReference = metadata.receiptReference;
        targetDraft.fileHash = metadata.fileHash || targetDraft.fileHash || null;
      }
      const newReceiptInputs = uploadedReceipts.map((receipt, index) =>
        buildCreateReceiptInput(
          receipt,
          newReceiptMetadata[index] || normalizeCollectionReceiptMetadata({}),
        ));
      const validationReceipts = [
        ...activeExistingDrafts,
        ...newReceiptInputs.map((receipt) =>
          buildValidationDraftFromMetadata({
            metadata: {
              receiptId: null,
              receiptAmountCents: receipt.receiptAmountCents ?? null,
              extractedAmountCents: receipt.extractedAmountCents ?? null,
              extractionStatus: receipt.extractionStatus ?? null,
              extractionConfidence: receipt.extractionConfidence ?? null,
              receiptDate: receipt.receiptDate ?? null,
              receiptReference: receipt.receiptReference ?? null,
              fileHash: receipt.fileHash ?? null,
            },
            originalFileName: receipt.originalFileName,
          })),
      ];
      const duplicateReceipts = findDuplicateCollectionReceiptHashes(validationReceipts);
      if (duplicateReceipts.length > 0) {
        await this.safeCreateAuditLog({
          action: "COLLECTION_RECEIPT_DUPLICATE_REJECTED",
          performedBy: user.username,
          targetResource: id,
          details: JSON.stringify({
            event: "collection_receipt_duplicate_rejected",
            actor: user.username,
            recordId: id,
            duplicates: duplicateReceipts,
          }),
        });
        throw badRequest(
          "Duplicate receipt upload detected for this collection record.",
          "COLLECTION_RECEIPT_DUPLICATE_DETECTED",
        );
      }

      const shouldClearLegacyReceiptFallback =
        shouldRemoveReceipt
        && uploadedReceipts.length === 0
        && existingReceipts.length === 0
        && Boolean(existing.receiptFile);
      if (shouldClearLegacyReceiptFallback) {
        // Transitional cleanup for legacy rows that still only use collection_records.receipt_file.
        updatePayload.receiptFile = null;
      }

      const updated = await this.storage.updateCollectionRecord(id, updatePayload, {
        expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        removeAllReceipts: shouldRemoveReceipt,
        removeReceiptIds: shouldRemoveReceipt ? [] : removeReceiptIds,
        newReceipts: newReceiptInputs,
        receiptUpdates: activeExistingDrafts.map((draft) =>
          buildReceiptUpdateInput(String(draft.receiptId || ""), draft)),
      });
      if (!updated) {
        for (const uploadedReceipt of uploadedReceipts) {
          await removeCollectionReceiptFile(uploadedReceipt.storagePath);
        }
        if (expectedUpdatedAt) {
          const freshRecord = await this.storage.getCollectionRecordById(id);
          const freshVersion = freshRecord ? resolveRecordVersionTimestamp(freshRecord) : null;
          await this.logRecordVersionConflict({
            username: user.username,
            recordId: id,
            operation: "update",
            expectedUpdatedAt,
            currentUpdatedAt: freshVersion,
          });
          throw conflict(COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE, "COLLECTION_RECORD_VERSION_CONFLICT");
        }
        throw notFound("Collection record not found.");
      }

      // Receipt rows are soft-deleted (archived) for recovery safety.
      // Physical file cleanup is deferred to record purge/delete flows.
      if (shouldClearLegacyReceiptFallback && existing.receiptFile) {
        await removeCollectionReceiptFile(existing.receiptFile);
      }
      const remainingRelationReceiptCount = shouldRemoveReceipt
        ? 0
        : Math.max(0, activeExistingReceipts.length);
      const afterReceiptState =
        remainingRelationReceiptCount + newReceiptInputs.length > 0
          ? resolveCollectionAuditReceiptState({
              relationCount: remainingRelationReceiptCount + newReceiptInputs.length,
              legacyReceiptFile: null,
            })
          : existingReceipts.length === 0 && !shouldClearLegacyReceiptFallback
            ? resolveCollectionAuditReceiptState({
                relationCount: 0,
                legacyReceiptFile: existing.receiptFile,
              })
            : resolveCollectionAuditReceiptState({
                relationCount: 0,
                legacyReceiptFile: null,
              });
      const beforeSnapshot = buildCollectionAuditSnapshot({
        customerName: existing.customerName,
        paymentDate: existing.paymentDate,
        amount: existing.amount,
        collectionStaffNickname: existing.collectionStaffNickname,
        activeReceiptCount: beforeReceiptState.count,
        activeReceiptSource: beforeReceiptState.source,
      });
      const afterSnapshot = buildCollectionAuditSnapshot({
        customerName: updated.customerName,
        paymentDate: updated.paymentDate,
        amount: updated.amount,
        collectionStaffNickname: updated.collectionStaffNickname,
        activeReceiptCount: afterReceiptState.count,
        activeReceiptSource: afterReceiptState.source,
      });

      if (updated.duplicateReceiptFlag) {
        await this.safeCreateAuditLog({
          action: "COLLECTION_RECEIPT_DUPLICATE_WARNING",
          performedBy: user.username,
          targetResource: id,
          details: JSON.stringify({
            event: "collection_receipt_duplicate_warning",
            actor: user.username,
            recordId: id,
            receiptCount: updated.receiptCount,
          }),
        });
      }

      await this.safeCreateAuditLog({
        action: "COLLECTION_RECORD_UPDATED",
        performedBy: user.username,
        targetResource: id,
        details: JSON.stringify({
          event: "collection_record_updated",
          actor: user.username,
          recordId: id,
          before: beforeSnapshot,
          after: afterSnapshot,
          changes: buildCollectionAuditFieldChanges(beforeSnapshot, afterSnapshot),
          receipts: {
            beforeCount: beforeReceiptState.count,
            afterCount: afterReceiptState.count,
            beforeSource: beforeReceiptState.source,
            afterSource: afterReceiptState.source,
            addedCount: newReceiptInputs.length,
            removedCount: shouldRemoveReceipt ? beforeReceiptState.count : removedReceipts.length,
            removedReceiptIds: removedReceipts.map((receipt) => receipt.id),
            replaced: (shouldRemoveReceipt ? beforeReceiptState.count : removedReceipts.length) > 0
              && newReceiptInputs.length > 0,
            clearedLegacyFallback: shouldClearLegacyReceiptFallback,
          },
        }),
      });

      return { ok: true as const, record: updated };
    } catch (err) {
      for (const uploadedReceipt of uploadedReceipts) {
        await removeCollectionReceiptFile(uploadedReceipt.storagePath);
      }
      throw err;
    }
  }

  async deleteRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw?: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = normalizeCollectionText(idRaw);
    if (!id) {
      throw badRequest("Collection id is required.");
    }

    const existing = await this.storage.getCollectionRecordById(id);
    if (!existing) {
      throw notFound("Collection record not found.");
    }
    if (!(await canUserAccessCollectionRecord(this.storage, user, existing))) {
      throw forbidden("Forbidden");
    }

    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionDeletePayload;
    const expectedUpdatedAt = parseRecordVersionTimestamp(body.expectedUpdatedAt);
    if (expectedUpdatedAt) {
      const currentVersion = resolveRecordVersionTimestamp(existing);
      if (!currentVersion || currentVersion.getTime() !== expectedUpdatedAt.getTime()) {
        await this.logRecordVersionConflict({
          username: user.username,
          recordId: id,
          operation: "delete",
          expectedUpdatedAt,
          currentUpdatedAt: currentVersion,
        });
        throw conflict(COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE, "COLLECTION_RECORD_VERSION_CONFLICT");
      }
    }

    const activeReceipts = Array.isArray(existing.receipts) ? existing.receipts : [];
    const archivedReceipts = Array.isArray(existing.archivedReceipts) ? existing.archivedReceipts : [];
    const receiptsForFileCleanup = [...activeReceipts, ...archivedReceipts];
    const deleted = await this.storage.deleteCollectionRecord(id, {
      expectedUpdatedAt: expectedUpdatedAt ?? undefined,
    });
    if (!deleted) {
      if (expectedUpdatedAt) {
        const freshRecord = await this.storage.getCollectionRecordById(id);
        const freshVersion = freshRecord ? resolveRecordVersionTimestamp(freshRecord) : null;
        await this.logRecordVersionConflict({
          username: user.username,
          recordId: id,
          operation: "delete",
          expectedUpdatedAt,
          currentUpdatedAt: freshVersion,
        });
        throw conflict(COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE, "COLLECTION_RECORD_VERSION_CONFLICT");
      }
      throw notFound("Collection record not found.");
    }
    for (const receipt of receiptsForFileCleanup) {
      await removeCollectionReceiptFile(receipt.storagePath);
    }
    if (receiptsForFileCleanup.length === 0 && existing.receiptFile) {
      await removeCollectionReceiptFile(existing.receiptFile);
    }
    const deletedReceiptState = resolveCollectionAuditReceiptState({
      relationCount: activeReceipts.length,
      legacyReceiptFile: activeReceipts.length > 0 ? null : existing.receiptFile,
    });

    await this.safeCreateAuditLog({
      action: "COLLECTION_RECORD_DELETED",
      performedBy: user.username,
      targetResource: existing.id,
      details: JSON.stringify({
        event: "collection_record_deleted",
        actor: user.username,
        recordId: existing.id,
        deleted: buildCollectionAuditSnapshot({
          customerName: existing.customerName,
          paymentDate: existing.paymentDate,
          amount: existing.amount,
          collectionStaffNickname: existing.collectionStaffNickname,
          activeReceiptCount: deletedReceiptState.count,
          activeReceiptSource: deletedReceiptState.source,
        }),
        receipts: {
          removedCount: receiptsForFileCleanup.length,
          removedReceiptIds: receiptsForFileCleanup.map((receipt) => receipt.id),
          removedLegacyFallback: receiptsForFileCleanup.length === 0 && Boolean(existing.receiptFile),
          removedArchivedCount: archivedReceipts.length,
        },
      }),
    });

    return { ok: true as const };
  }
}
