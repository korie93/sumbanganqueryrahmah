import { badRequest, conflict, forbidden, notFound } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { verifyPassword } from "../../auth/passwords";
import {
  canUserAccessCollectionRecord,
  getAdminVisibleNicknameValues,
  hasNicknameValue,
} from "../../routes/collection-access";
import { removeCollectionReceiptFile, saveCollectionReceipt } from "../../routes/collection-receipt.service";
import {
  COLLECTION_BATCHES,
  COLLECTION_STAFF_NICKNAME_MIN_LENGTH,
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
import type { CreateCollectionRecordReceiptInput } from "../../storage-postgres";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

type MultipartCollectionPayload = Record<string, unknown> & {
  uploadedReceipts?: CreateCollectionRecordReceiptInput[] | null;
};

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
    }))
    .filter((item) => item.storagePath && item.originalFileName && Number.isFinite(item.fileSize));
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

      if (!customerName) throw badRequest("Customer Name is required.");
      if (!icNumber) throw badRequest("IC Number is required.");
      if (!isValidCollectionPhone(customerPhone)) throw badRequest("Customer Phone Number is invalid.");
      if (!accountNumber) throw badRequest("Account Number is required.");
      if (!COLLECTION_BATCHES.has(batch)) throw badRequest("Invalid batch value.");
      if (!paymentDate || !isValidCollectionDate(paymentDate)) throw badRequest("Invalid payment date.");
      if (isFutureCollectionDate(paymentDate)) throw badRequest("Payment date cannot be in the future.");
      if (amount === null) throw badRequest("Amount must be a positive number.");
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
      if (uploadedReceipts.length > 0) {
        await this.storage.createCollectionRecordReceipts(record.id, uploadedReceipts);
      }
      const hydratedRecord = await this.storage.getCollectionRecordById(record.id);
      const finalRecord = hydratedRecord || record;

      await this.storage.createAuditLog({
        action: "COLLECTION_RECORD_CREATED",
        performedBy: user.username,
        targetResource: finalRecord.id,
        details: `Collection record created by ${user.username}`,
      });

      return { ok: true as const, record: finalRecord };
    } catch (err) {
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
        if (amount === null) throw badRequest("Amount must be a positive number.");
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

      const hasReceiptMutation = shouldRemoveReceipt || removeReceiptIds.length > 0 || uploadedReceipts.length > 0;
      if (Object.keys(updatePayload).length === 0 && !hasReceiptMutation) {
        return { ok: true as const, record: existing };
      }

      const existingReceipts = Array.isArray(existing.receipts) ? existing.receipts : [];
      const removedReceipts = shouldRemoveReceipt
        ? existingReceipts
        : removeReceiptIds.length > 0
          ? existingReceipts.filter((receipt) => removeReceiptIds.includes(receipt.id))
          : [];

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
        newReceipts: uploadedReceipts,
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

      for (const removedReceipt of removedReceipts) {
        await removeCollectionReceiptFile(removedReceipt.storagePath);
      }
      if (shouldClearLegacyReceiptFallback && existing.receiptFile) {
        await removeCollectionReceiptFile(existing.receiptFile);
      }

      await this.storage.createAuditLog({
        action: "COLLECTION_RECORD_UPDATED",
        performedBy: user.username,
        targetResource: id,
        details: `Collection record updated by ${user.username}`,
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

    const removedReceipts = Array.isArray(existing.receipts) ? existing.receipts : [];
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
    for (const receipt of removedReceipts) {
      await removeCollectionReceiptFile(receipt.storagePath);
    }
    if (removedReceipts.length === 0 && existing.receiptFile) {
      await removeCollectionReceiptFile(existing.receiptFile);
    }

    await this.storage.createAuditLog({
      action: "COLLECTION_RECORD_DELETED",
      performedBy: user.username,
      targetResource: existing.id,
      details: `Collection record deleted by ${user.username}`,
    });

    return { ok: true as const };
  }
}
