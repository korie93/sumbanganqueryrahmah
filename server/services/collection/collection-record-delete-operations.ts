import type { AuthenticatedUser } from "../../auth/guards";
import { conflict, notFound } from "../../http/errors";
import { ensureLooseObject, type CollectionDeletePayload } from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE,
  parseRecordVersionTimestamp,
  resolveRecordVersionTimestamp,
} from "./collection-record-runtime-utils";
import {
  buildCollectionAuditSnapshot,
  resolveCollectionAuditReceiptState,
} from "./collection-record-mutation-helpers";
import {
  logCollectionRecordVersionConflict,
  safeCreateCollectionMutationAuditLog,
} from "./collection-record-mutation-support";
import {
  assertCollectionRecordVersionMatch,
  getAccessibleCollectionRecordOrThrow,
  requireCollectionRecordId,
  type RequireUserFn,
} from "./collection-record-write-shared";

export class CollectionRecordDeleteOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async deleteRecord(
    userInput: AuthenticatedUser | undefined,
    idRaw: unknown,
    bodyRaw?: unknown,
  ) {
    const user = this.requireUser(userInput);
    const id = requireCollectionRecordId(idRaw);
    const existing = await getAccessibleCollectionRecordOrThrow(this.storage, user, id);

    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionDeletePayload;
    const expectedUpdatedAt = parseRecordVersionTimestamp(body.expectedUpdatedAt);
    await assertCollectionRecordVersionMatch({
      storage: this.storage,
      user,
      recordId: id,
      operation: "delete",
      existing,
      expectedUpdatedAt,
    });

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
