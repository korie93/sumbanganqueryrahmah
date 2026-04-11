import { badRequest } from "../../http/errors";
import { logger } from "../../lib/logger";
import {
  removeCollectionReceiptFile,
  saveCollectionReceipt,
} from "../../routes/collection-receipt.service";
import {
  ensureLooseObject,
  type CollectionReceiptPayload,
} from "../../routes/collection.validation";
import type { CreateCollectionRecordReceiptInput } from "../../storage-postgres";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  buildCreateReceiptInput,
  buildValidationDraftFromMetadata,
  readCollectionReceiptMetadataList,
  readUploadedReceiptRows,
  type MultipartCollectionPayload,
  type NormalizedCollectionReceiptMetadata,
} from "./collection-record-mutation-helpers";

type CollectionAuditStorage = Pick<CollectionStoragePort, "createAuditLog">;
type CollectionReceiptMutationBody = MultipartCollectionPayload & {
  receipt?: unknown;
  receipts?: unknown;
};

export type StoredCollectionMutationReceipt = Awaited<
  ReturnType<typeof saveCollectionReceipt>
>;

function readCollectionReceiptPayloads(
  body: CollectionReceiptMutationBody,
): CollectionReceiptPayload[] {
  const receiptPayload = ensureLooseObject(body.receipt) as CollectionReceiptPayload | null;

  return [
    ...(receiptPayload ? [receiptPayload] : []),
    ...(Array.isArray(body.receipts)
      ? body.receipts
          .map((item) => ensureLooseObject(item) as CollectionReceiptPayload | null)
          .filter((item): item is CollectionReceiptPayload => Boolean(item))
      : []),
  ];
}

export async function collectStoredCollectionReceipts(
  body: CollectionReceiptMutationBody,
): Promise<StoredCollectionMutationReceipt[]> {
  const storedReceipts: StoredCollectionMutationReceipt[] = [...readUploadedReceiptRows(body)];
  const receiptPayloads = readCollectionReceiptPayloads(body);

  if (receiptPayloads.length === 0) {
    return storedReceipts;
  }

  const savedPayloadResults = await Promise.allSettled(
    receiptPayloads.map((receipt) => saveCollectionReceipt(receipt)),
  );

  for (const result of savedPayloadResults) {
    if (result.status === "fulfilled") {
      storedReceipts.push(result.value);
    }
  }

  const failedResult = savedPayloadResults.find((result) => result.status === "rejected");
  if (failedResult?.status === "rejected") {
    await cleanupStoredCollectionReceipts(storedReceipts);
    throw failedResult.reason;
  }

  return storedReceipts;
}

export function buildCollectionNewReceiptInputs(
  uploadedReceipts: CreateCollectionRecordReceiptInput[],
  metadata: NormalizedCollectionReceiptMetadata[],
): CreateCollectionRecordReceiptInput[] {
  return uploadedReceipts.map((receipt, index) =>
    buildCreateReceiptInput(receipt, metadata[index] || { receiptId: null, receiptAmountCents: null, extractedAmountCents: null, extractionStatus: null, extractionConfidence: null, receiptDate: null, receiptReference: null, fileHash: null }),
  );
}

export function buildCollectionValidationDraftsFromNewReceipts(
  newReceiptInputs: CreateCollectionRecordReceiptInput[],
) {
  return newReceiptInputs.map((receipt) =>
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
    }),
  );
}

export async function cleanupStoredCollectionReceipts(
  receipts: Array<Pick<CreateCollectionRecordReceiptInput, "storagePath">>,
) {
  const cleanupResults = await Promise.allSettled(
    receipts.map((receipt) => removeCollectionReceiptFile(receipt.storagePath)),
  );

  for (let index = 0; index < cleanupResults.length; index += 1) {
    const result = cleanupResults[index];
    if (result.status === "rejected") {
      logger.warn("Collection receipt cleanup failed", {
        storagePath: receipts[index]?.storagePath || null,
        error: result.reason,
      });
    }
  }
}

export async function logRejectedCollectionPurgeAttempt(
  storage: CollectionAuditStorage,
  username: string,
  details: string,
) {
  try {
    await storage.createAuditLog({
      action: "COLLECTION_RECORDS_PURGE_REJECTED",
      performedBy: username,
      targetResource: "collection-records",
      details,
    });
  } catch {
    // best effort audit only
  }
}

export async function safeCreateCollectionMutationAuditLog(
  storage: CollectionAuditStorage,
  params: {
    action: string;
    performedBy: string;
    targetResource: string;
    details: string;
  },
) {
  try {
    await storage.createAuditLog({
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

export async function logCollectionRecordVersionConflict(
  storage: CollectionAuditStorage,
  params: {
    username: string;
    recordId: string;
    operation: "update" | "delete";
    expectedUpdatedAt: Date | null;
    currentUpdatedAt: Date | null;
  },
) {
  try {
    await storage.createAuditLog({
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

export function readCollectionReceiptMetadataOrThrow(raw: unknown) {
  try {
    return readCollectionReceiptMetadataList(raw);
  } catch (error) {
    if ((error as Error)?.message === "COLLECTION_RECEIPT_METADATA_INVALID") {
      throw badRequest(
        "Receipt metadata payload is invalid.",
        "COLLECTION_RECEIPT_METADATA_INVALID",
      );
    }
    throw error;
  }
}
