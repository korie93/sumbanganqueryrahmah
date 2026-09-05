import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest, conflict, notFound } from "../../http/errors";
import { removeCollectionReceiptFile } from "../../routes/collection-receipt.service";
import {
  ensureLooseObject,
  normalizeCollectionStringList,
  type CollectionUpdatePayload,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  parseCollectionAmountMyrInput,
  parseCollectionAmountToCents,
} from "../../../shared/collection-amount-types";
import {
  COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE,
  parseRecordVersionTimestamp,
  resolveRecordVersionTimestamp,
} from "./collection-record-runtime-utils";
import { findDuplicateCollectionReceiptHashes } from "./collection-receipt-validation";
import {
  buildCollectionRecordUpdateDraft,
  buildCollectionAuditFieldChanges,
  buildCollectionAuditSnapshot,
  buildReceiptUpdateInput,
  buildValidationDraftFromExistingReceipt,
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
  logCollectionRecordVersionConflict,
  readCollectionReceiptMetadataOrThrow,
  safeCreateCollectionMutationAuditLog,
  type StoredCollectionMutationReceipt,
} from "./collection-record-mutation-support";
import {
  assertCollectionRecordVersionMatch,
  assertCollectionStaffNicknameWriteAccess,
  getAccessibleCollectionRecordOrThrow,
  requireCollectionRecordId,
  type RequireUserFn,
} from "./collection-record-write-shared";
import { isDateInsideCollectionCallingWindow } from "../../lib/collection-calling-window";
import { verifyEligibleSavedCollectionSource } from "./collection-source-verification";

export class CollectionRecordUpdateOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async updateRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = requireCollectionRecordId(idRaw);
    const uploadedReceipts: StoredCollectionMutationReceipt[] = [];
    try {
      const body = (ensureLooseObject(bodyRaw) || {}) as CollectionUpdatePayload & MultipartCollectionPayload;
      uploadedReceipts.push(...(await collectStoredCollectionReceipts(body)));
      const existing = await getAccessibleCollectionRecordOrThrow(this.storage, user, id);
      if (user.role === "user" || user.role === "admin") {
        await assertCollectionStaffNicknameWriteAccess(
          this.storage, user, existing.collectionStaffNickname,
        );
      }
      const expectedUpdatedAt = parseRecordVersionTimestamp(body.expectedUpdatedAt);
      await assertCollectionRecordVersionMatch({
        storage: this.storage,
        user,
        recordId: id,
        operation: "update",
        existing,
        expectedUpdatedAt,
      });

      const updatePayload: Record<string, unknown> = {};
      const fields = normalizeCollectionRecordFields(body);
      const updateDraft = buildCollectionRecordUpdateDraft(body, fields);
      if (
        body.accountNumber !== undefined
        && !fields.accountNumber
        && !fields.cardNumber
        && existing.sourceMatchBasis !== "card_number"
        && existing.sourceMatchBasis !== "account_and_card"
      ) {
        throw badRequest("Account Number cannot be empty unless Card Number is provided.");
      }
      Object.assign(updatePayload, updateDraft.updatePayload);
      if (updateDraft.nextCollectionStaffNickname) {
        updatePayload.collectionStaffNickname = await assertCollectionStaffNicknameWriteAccess(
          this.storage, user, updateDraft.nextCollectionStaffNickname,
        );
      }

      // Governed matching is keyed only by strong account/card identifiers.
      // Editing descriptive customer fields must not force users to re-enter a
      // full card number that is deliberately never persisted.
      const identityFields = ["accountNumber"] as const;
      const identityChanged = identityFields.some((field) => (
        Object.prototype.hasOwnProperty.call(updatePayload, field)
        && String(updatePayload[field] ?? "").trim() !== String(existing[field] ?? "").trim()
      ));
      const nextPaymentDate = String(updatePayload.paymentDate ?? existing.paymentDate);
      const paymentDateChanged = Object.prototype.hasOwnProperty.call(updatePayload, "paymentDate")
        && nextPaymentDate !== String(existing.paymentDate);
      const cardNumberSupplied = body.cardNumber !== undefined && Boolean(fields.cardNumber);
      const hasTrustedSourceLink = Boolean(existing.sourceImportId && existing.sourceDataRowId);
      const shouldRematchSource = identityChanged
        || cardNumberSupplied
        || (paymentDateChanged && !hasTrustedSourceLink);
      if (existing.manualSettlement?.status === "ACTIVE" && shouldRematchSource) {
        throw conflict(
          "Batalkan Manual Verified ABORT sebelum menukar identiti atau sumber rekod anchor.",
        );
      }
      const sourceMatch = shouldRematchSource
        ? await verifyEligibleSavedCollectionSource(this.storage, {
            paymentDate: nextPaymentDate,
            accountNumber: String(updatePayload.accountNumber ?? existing.accountNumber),
            ...(cardNumberSupplied ? { cardNumber: fields.cardNumber } : {}),
          })
        : null;
      const matchedTotalDue = sourceMatch?.totalDue == null
        ? null
        : parseCollectionAmountMyrInput(sourceMatch.totalDue, { allowZero: true });
      const matchedBillingPrincipalOsp = sourceMatch?.billingPrincipalOsp == null
        ? null
        : parseCollectionAmountMyrInput(sourceMatch.billingPrincipalOsp, { allowZero: true });
      if (shouldRematchSource && matchedTotalDue === null) {
        throw badRequest(
          "The matched Saved row does not contain a valid TOTAL DUE value.",
          "COLLECTION_SOURCE_TOTAL_DUE_MISSING",
        );
      }
      if (shouldRematchSource) {
        updatePayload.sourceCardNumber = fields.cardNumber || null;
        updatePayload.cardNumberLast4 = sourceMatch?.cardNumberLast4 ?? null;
        updatePayload.sourceImportId = sourceMatch?.sourceImportId ?? null;
        updatePayload.sourceDataRowId = sourceMatch?.sourceDataRowId ?? null;
        updatePayload.sourceImportName = sourceMatch?.sourceImportName ?? null;
        updatePayload.sourceFilename = sourceMatch?.sourceFilename ?? null;
        updatePayload.callingDate = sourceMatch?.callingDate ?? null;
        updatePayload.callingWindowEndExclusive = sourceMatch?.callingWindowEndExclusive ?? null;
        updatePayload.agingBucket = sourceMatch?.agingBucket ?? null;
        updatePayload.totalDue = matchedTotalDue;
        updatePayload.billingPrincipalOsp = matchedBillingPrincipalOsp;
        updatePayload.sourceMatchBasis = sourceMatch?.matchBasis ?? null;
        updatePayload.sourceMatchAccuracy = sourceMatch ? 100 : null;
        updatePayload.sourceObligationKey = sourceMatch?.sourceObligationKey ?? null;
        updatePayload.settlementCycleKey = sourceMatch?.settlementCycleKey ?? null;
      }
      const trustedCallingDate = sourceMatch?.callingDate ?? existing.callingDate ?? null;
      const trustedCallingWindowEnd = sourceMatch?.callingWindowEnd ?? existing.callingWindowEnd ?? null;
      const trustedCallingWindowEndExclusive = sourceMatch?.callingWindowEndExclusive
        ?? existing.callingWindowEndExclusive
        ?? null;
      const nextAmountCents = parseCollectionAmountToCents(
        updatePayload.amount ?? existing.amount,
        { allowZero: true },
      );
      const existingAmountCents = parseCollectionAmountToCents(existing.amount, { allowZero: true });
      const amountChanged = Object.prototype.hasOwnProperty.call(updatePayload, "amount")
        && nextAmountCents !== existingAmountCents;
      const changesSettlement = shouldRematchSource
        || paymentDateChanged
        || amountChanged;
      if (
        shouldRematchSource
        && (!trustedCallingDate || !trustedCallingWindowEnd || !trustedCallingWindowEndExclusive)
      ) {
        throw badRequest(
          "The selected Saved source has no verified Calling Date.",
          "COLLECTION_SOURCE_CALLING_DATE_INVALID",
        );
      }
      if (
        changesSettlement
        && trustedCallingDate
        && trustedCallingWindowEndExclusive
        && !isDateInsideCollectionCallingWindow(nextPaymentDate, {
          start: trustedCallingDate,
          endExclusive: trustedCallingWindowEndExclusive,
        })
      ) {
        throw badRequest(
          `Payment Date must be between ${trustedCallingDate} and ${trustedCallingWindowEnd}.`,
          "COLLECTION_PAYMENT_OUTSIDE_CALLING_WINDOW",
        );
      }

      const shouldRemoveReceipt = body.removeReceipt === true;
      const removeReceiptIds = Array.isArray(body.removeReceiptIds)
        ? normalizeCollectionStringList(body.removeReceiptIds)
        : [];
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
      const newReceiptInputs = buildCollectionNewReceiptInputs(uploadedReceipts, newReceiptMetadata);
      const validationReceipts = [
        ...activeExistingDrafts,
        ...buildCollectionValidationDraftsFromNewReceipts(newReceiptInputs),
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
        updatePayload.receiptFile = null;
      }

      const updatedMutation = await this.storage.updateCollectionRecord(id, updatePayload, {
        expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        removeAllReceipts: shouldRemoveReceipt,
        removeReceiptIds: shouldRemoveReceipt ? [] : removeReceiptIds,
        newReceipts: newReceiptInputs,
        receiptUpdates: activeExistingDrafts.map((draft) =>
          buildReceiptUpdateInput(String(draft.receiptId || ""), draft)),
      });
      if (!updatedMutation) {
        await cleanupStoredCollectionReceipts(uploadedReceipts);
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
      const updated = await this.storage.getCollectionRecordById(id) || updatedMutation;

      if (
        existing.manualSettlement
        && updated.manualSettlement
        && existing.manualSettlement.validity !== updated.manualSettlement.validity
      ) {
        await safeCreateCollectionMutationAuditLog(this.storage, {
          action: "COLLECTION_MANUAL_SETTLEMENT_REVALIDATED",
          performedBy: user.username,
          targetResource: id,
          details: JSON.stringify({
            event: "collection_manual_settlement_revalidated",
            actor: user.username,
            recordId: id,
            oldValidity: existing.manualSettlement.validity,
            newValidity: updated.manualSettlement.validity,
            reason: "collection_record_updated",
          }),
        });
      }

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
          ...(shouldRematchSource
            ? {
                sourceLink: {
                  sourceImportId: updated.sourceImportId ?? null,
                  sourceDataRowId: updated.sourceDataRowId ?? null,
                  matchBasis: sourceMatch?.matchBasis ?? null,
                  matchAccuracy: sourceMatch ? 100 : null,
                },
              }
            : {}),
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
      await cleanupStoredCollectionReceipts(uploadedReceipts);
      if (String((err as { message?: unknown })?.message ?? "").includes(
        "COLLECTION_MANUAL_SETTLEMENT_ACTIVE_IDENTITY_CHANGE_BLOCKED",
      )) {
        throw conflict(
          "Batalkan Manual Verified ABORT sebelum menukar identiti atau sumber rekod anchor.",
        );
      }
      throw err;
    }
  }
}
