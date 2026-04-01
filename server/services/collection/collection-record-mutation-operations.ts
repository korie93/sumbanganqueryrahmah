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
  ensureLooseObject,
  isNicknameScopeAllowedForRole,
  normalizeCollectionStringList,
  normalizeCollectionText,
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
import { findDuplicateCollectionReceiptHashes } from "./collection-receipt-validation";
import {
  assertValidCollectionCreateFields,
  buildCollectionRecordUpdateDraft,
  buildCollectionAuditFieldChanges,
  buildCollectionAuditSnapshot,
  buildCreateReceiptInput,
  buildReceiptUpdateInput,
  buildValidationDraftFromExistingReceipt,
  buildValidationDraftFromMetadata,
  normalizeCollectionRecordFields,
  normalizeCollectionReceiptMetadata,
  readUploadedReceiptRows,
  resolveCollectionAuditReceiptState,
  type MultipartCollectionPayload,
} from "./collection-record-mutation-helpers";
import {
  logCollectionRecordVersionConflict,
  logRejectedCollectionPurgeAttempt,
  readCollectionReceiptMetadataOrThrow,
  safeCreateCollectionMutationAuditLog,
} from "./collection-record-mutation-support";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export class CollectionRecordMutationOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async createRecord(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const uploadedReceipts: Array<Awaited<ReturnType<typeof saveCollectionReceipt>>> = [];
    let createdRecordId: string | null = null;

    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionCreatePayload & MultipartCollectionPayload;
      const fields = normalizeCollectionRecordFields(body);
      assertValidCollectionCreateFields(fields);

      const staffNickname = await this.storage.getCollectionStaffNicknameByName(
        fields.collectionStaffNickname,
      );
      if (!staffNickname?.isActive) {
        throw badRequest("Staff nickname tidak sah atau sudah inactive.");
      }
      if (user.role === "admin") {
        const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
        if (!hasNicknameValue(allowedNicknames, fields.collectionStaffNickname)) {
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
      const newReceiptMetadata = readCollectionReceiptMetadataOrThrow(body.newReceiptMetadata)
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
        await safeCreateCollectionMutationAuditLog(this.storage, {
          action: "COLLECTION_RECEIPT_DUPLICATE_REJECTED",
          performedBy: user.username,
          targetResource: "collection-records",
          details: JSON.stringify({
            event: "collection_receipt_duplicate_rejected",
            actor: user.username,
            customerName: fields.customerName,
            duplicates: duplicateReceipts,
          }),
        });
        throw badRequest(
          "Duplicate receipt upload detected for this collection record.",
          "COLLECTION_RECEIPT_DUPLICATE_DETECTED",
        );
      }

      const record = await this.storage.createCollectionRecord({
        customerName: fields.customerName,
        icNumber: fields.icNumber,
        customerPhone: fields.customerPhone,
        accountNumber: fields.accountNumber,
        batch: fields.batch as CollectionBatchValue,
        paymentDate: fields.paymentDate,
        amount: fields.amount,
        receiptFile: null,
        createdByLogin: user.username,
        collectionStaffNickname: fields.collectionStaffNickname,
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
        await safeCreateCollectionMutationAuditLog(this.storage, {
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

      await safeCreateCollectionMutationAuditLog(this.storage, {
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
      await logRejectedCollectionPurgeAttempt(
        this.storage,
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
          await logCollectionRecordVersionConflict(this.storage, {
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
      const fields = normalizeCollectionRecordFields(body);
      const updateDraft = buildCollectionRecordUpdateDraft(body, fields);
      Object.assign(updatePayload, updateDraft.updatePayload);
      if (updateDraft.nextCollectionStaffNickname) {
        const staffNickname = await this.storage.getCollectionStaffNicknameByName(
          updateDraft.nextCollectionStaffNickname,
        );
        if (!staffNickname?.isActive) {
          throw badRequest("Staff nickname tidak sah atau sudah inactive.");
        }
        if (user.role === "admin") {
          const allowedNicknames = await getAdminVisibleNicknameValues(this.storage, user);
          if (!hasNicknameValue(allowedNicknames, updateDraft.nextCollectionStaffNickname)) {
            throw forbidden("Nickname tidak dibenarkan untuk akaun admin ini.");
          }
        } else if (!isNicknameScopeAllowedForRole(staffNickname.roleScope, user.role)) {
          throw forbidden("Nickname ini tidak dibenarkan untuk role semasa.");
        }
        updatePayload.collectionStaffNickname = updateDraft.nextCollectionStaffNickname;
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
      const existingReceiptMetadata = readCollectionReceiptMetadataOrThrow(body.existingReceiptMetadata)
        .map((item) => normalizeCollectionReceiptMetadata(item));
      const newReceiptMetadata = readCollectionReceiptMetadataOrThrow(body.newReceiptMetadata)
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
        await safeCreateCollectionMutationAuditLog(this.storage, {
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
          await logCollectionRecordVersionConflict(this.storage, {
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
        await safeCreateCollectionMutationAuditLog(this.storage, {
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

      await safeCreateCollectionMutationAuditLog(this.storage, {
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
        await logCollectionRecordVersionConflict(this.storage, {
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
        await logCollectionRecordVersionConflict(this.storage, {
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
    // Keep original receipt files on record deletion so backup restore can recover
    // both the record row and its receipt preview/download path.
    // Physical cleanup stays in purge/retention workflows.
    const deletedReceiptState = resolveCollectionAuditReceiptState({
      relationCount: activeReceipts.length,
      legacyReceiptFile: activeReceipts.length > 0 ? null : existing.receiptFile,
    });

    await safeCreateCollectionMutationAuditLog(this.storage, {
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
