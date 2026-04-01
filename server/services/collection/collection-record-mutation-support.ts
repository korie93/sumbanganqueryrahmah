import { badRequest } from "../../http/errors";
import { logger } from "../../lib/logger";
import type { CollectionStoragePort } from "./collection-service-support";
import { readCollectionReceiptMetadataList } from "./collection-record-mutation-helpers";

type CollectionAuditStorage = Pick<CollectionStoragePort, "createAuditLog">;

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
