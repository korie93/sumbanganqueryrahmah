import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest } from "../../http/errors";
import { logger } from "../../lib/logger";
import {
  ensureLooseObject,
  type CollectionBatchValue,
  type CollectionCreatePayload,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import { parseCollectionAmountMyrInput } from "../../../shared/collection-amount-types";
import { findDuplicateCollectionReceiptHashes } from "./collection-receipt-validation";
import {
  assertValidCollectionCreateFields,
  buildCollectionAuditSnapshot,
  maskCollectionAuditCustomerName,
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
import { isDateInsideCollectionCallingWindow } from "../../lib/collection-calling-window";
import { verifySelectedSavedCollectionSource } from "./collection-source-verification";

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
      uploadedReceipts.push(...(await collectStoredCollectionReceipts(body)));
      const fields = normalizeCollectionRecordFields(body);
      assertValidCollectionCreateFields(fields);
      await assertCollectionStaffNicknameWriteAccess(this.storage, user, fields.collectionStaffNickname);

      const sourceMatch = await verifySelectedSavedCollectionSource(this.storage, {
        customerName: fields.customerName,
        icNumber: fields.icNumber,
        customerPhone: fields.customerPhone,
        accountNumber: fields.accountNumber,
        sourceImportId: fields.sourceImportId,
      });
      if (sourceMatch.sourceImportId !== fields.sourceImportId) {
        throw badRequest(
          "The selected Saved file no longer contains a matching customer row. Run matching again.",
          "COLLECTION_SOURCE_MATCH_STALE",
        );
      }
      const matchedTotalDue = sourceMatch?.totalDue === null || sourceMatch?.totalDue === undefined
        ? null
        : parseCollectionAmountMyrInput(sourceMatch.totalDue, { allowZero: true });
      const matchedBillingPrincipalOsp = sourceMatch?.billingPrincipalOsp === null
        || sourceMatch?.billingPrincipalOsp === undefined
        ? null
        : parseCollectionAmountMyrInput(sourceMatch.billingPrincipalOsp, { allowZero: true });
      if (matchedTotalDue === null) {
        throw badRequest(
          "The matched Saved row does not contain a valid TOTAL DUE value.",
          "COLLECTION_SOURCE_TOTAL_DUE_MISSING",
        );
      }
      if (!isDateInsideCollectionCallingWindow(fields.paymentDate, {
        start: sourceMatch.callingDate as string,
        endExclusive: sourceMatch.callingWindowEndExclusive as string,
      })) {
        throw badRequest(
          `Payment Date must be between ${sourceMatch.callingDate} and ${sourceMatch.callingWindowEnd}.`,
          "COLLECTION_PAYMENT_OUTSIDE_CALLING_WINDOW",
        );
      }

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
            customerName: maskCollectionAuditCustomerName(fields.customerName),
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
        sourceImportId: sourceMatch?.sourceImportId ?? null,
        sourceDataRowId: sourceMatch?.rowId ?? null,
        sourceImportName: sourceMatch?.sourceImportName ?? null,
        sourceFilename: sourceMatch?.sourceFilename ?? null,
        callingDate: sourceMatch.callingDate,
        callingWindowEndExclusive: sourceMatch.callingWindowEndExclusive,
        agingBucket: fields.agingBucket
          ? fields.agingBucket as "D3" | "D4" | "D5" | "D6"
          : null,
        totalDue: matchedTotalDue,
        billingPrincipalOsp: matchedBillingPrincipalOsp,
        sourceMatchBasis: sourceMatch?.matchBasis ?? null,
        sourceMatchAccuracy: sourceMatch?.matchAccuracy ?? null,
        batch: fields.batch as CollectionBatchValue,
        paymentDate: fields.paymentDate,
        amount: fields.amount,
        receiptFile: null,
        createdByLogin: user.username,
        collectionStaffNickname: fields.collectionStaffNickname,
      }, newReceiptInputs);
      createdRecordId = record.id;
      const finalRecord = record;
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
          sourceImportId: finalRecord.sourceImportId,
          sourceDataRowId: finalRecord.sourceDataRowId,
          sourceImportName: finalRecord.sourceImportName,
          sourceMatchBasis: sourceMatch?.matchBasis ?? null,
          sourceMatchAccuracy: sourceMatch?.matchAccuracy ?? null,
          agingBucket: finalRecord.agingBucket,
          totalDue: finalRecord.totalDue,
          billingPrincipalOsp: finalRecord.billingPrincipalOsp,
          callingDate: finalRecord.callingDate,
          callingWindowEnd: finalRecord.callingWindowEnd,
          cumulativeCollected: finalRecord.cumulativeCollected,
          cpStatus: finalRecord.cpStatus,
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
