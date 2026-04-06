import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest } from "../../http/errors";
import { logger } from "../../lib/logger";
import {
  ensureLooseObject,
  type CollectionBatchValue,
  type CollectionCreatePayload,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import { findDuplicateCollectionReceiptHashes } from "./collection-receipt-validation";
import {
  assertValidCollectionCreateFields,
  buildCollectionAuditSnapshot,
  normalizeCollectionRecordFields,
  normalizeCollectionReceiptMetadata,
  resolveCollectionAuditReceiptState,
  type MultipartCollectionPayload,
} from "./collection-record-mutation-helpers";
import {
  buildCollectionNewReceiptInputs,
  buildCollectionValidationDraftsFromNewReceipts,
  cleanupStoredCollectionReceipts,
  collectStoredCollectionReceipts,
  readCollectionReceiptMetadataOrThrow,
  safeCreateCollectionMutationAuditLog,
  type StoredCollectionMutationReceipt,
} from "./collection-record-mutation-support";
import {
  assertCollectionStaffNicknameWriteAccess,
  type RequireUserFn,
} from "./collection-record-write-shared";

export class CollectionRecordCreateOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async createRecord(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const uploadedReceipts: StoredCollectionMutationReceipt[] = [];
    let createdRecordId: string | null = null;

    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionCreatePayload & MultipartCollectionPayload;
      const fields = normalizeCollectionRecordFields(body);
      assertValidCollectionCreateFields(fields);
      await assertCollectionStaffNicknameWriteAccess(this.storage, user, fields.collectionStaffNickname);

      uploadedReceipts.push(...(await collectStoredCollectionReceipts(body)));
      const newReceiptMetadata = readCollectionReceiptMetadataOrThrow(body.newReceiptMetadata)
        .map((item) => normalizeCollectionReceiptMetadata(item));
      const newReceiptInputs = buildCollectionNewReceiptInputs(uploadedReceipts, newReceiptMetadata);
      const validationReceipts = buildCollectionValidationDraftsFromNewReceipts(newReceiptInputs);
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
      await cleanupStoredCollectionReceipts(uploadedReceipts);
      throw err;
    }
  }
}
