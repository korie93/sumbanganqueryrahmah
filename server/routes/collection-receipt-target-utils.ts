import fs from "fs";
import type { AuthenticatedRequest } from "../auth/guards";
import type {
  CollectionRecordReceipt,
  PostgresStorage,
} from "../storage-postgres";
import {
  logCollectionReceiptWarning,
} from "./collection-receipt-response-utils";
import {
  pruneMissingCollectionReceiptRelation,
  resolveSelectedCollectionReceipt,
} from "./collection-receipt-relation-utils";
import { resolveCollectionReceiptFile } from "./collection-receipt-file-utils";
import type { CollectionReceiptRecord } from "./collection-receipt-request-context-utils";

type ResolvedCollectionReceiptFile = NonNullable<ReturnType<typeof resolveCollectionReceiptFile>>;

type CollectionReceiptTargetFailure = {
  ok: false;
  statusCode: 404;
  message: string;
  reason: "receipt_row_not_found" | "receipt_storage_missing";
  meta?: Record<string, unknown>;
};

type CollectionReceiptTargetSuccess = {
  ok: true;
  resolved: ResolvedCollectionReceiptFile;
  selectedReceipt: CollectionRecordReceipt | null;
};

export async function resolveReadableCollectionReceiptTarget(params: {
  storage: PostgresStorage;
  req: AuthenticatedRequest;
  mode: "view" | "download";
  record: CollectionReceiptRecord;
  requestedReceiptId: string | null;
}): Promise<CollectionReceiptTargetFailure | CollectionReceiptTargetSuccess> {
  const { storage, req, mode, record, requestedReceiptId } = params;
  let selectedReceipt = await resolveSelectedCollectionReceipt({
    storage,
    record,
    receiptIdRaw: requestedReceiptId,
  });

  if (requestedReceiptId && !selectedReceipt) {
    return {
      ok: false,
      statusCode: 404,
      message: "Receipt file not found.",
      reason: "receipt_row_not_found",
      meta: {
        recordId: record.id,
        requestedReceiptId,
      },
    };
  }

  let resolved = resolveCollectionReceiptFile(selectedReceipt?.storagePath ?? null);
  if (!resolved && selectedReceipt) {
    await pruneMissingCollectionReceiptRelation({
      storage,
      recordId: record.id,
      receipt: selectedReceipt,
    });
    if (!requestedReceiptId) {
      const refreshedRecord = await storage.getCollectionRecordById(record.id);
      const fallbackReceipt = await resolveSelectedCollectionReceipt({
        storage,
        record: refreshedRecord || record,
        receiptIdRaw: null,
      });
      resolved = resolveCollectionReceiptFile(fallbackReceipt?.storagePath ?? null);
      if (resolved) {
        selectedReceipt = fallbackReceipt;
      }
    }
  }

  if (resolved) {
    try {
      await fs.promises.access(resolved.absolutePath, fs.constants.R_OK);
    } catch (error) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: 404,
        reason: "receipt_storage_access_failed",
        meta: {
          recordId: record.id,
          requestedReceiptId,
          absolutePath: resolved.absolutePath,
          errorCode: (error as NodeJS.ErrnoException)?.code || null,
        },
      });
      await pruneMissingCollectionReceiptRelation({
        storage,
        recordId: record.id,
        receipt: selectedReceipt,
      });
      resolved = null;
      if (!requestedReceiptId) {
        const refreshedRecord = await storage.getCollectionRecordById(record.id);
        const fallbackReceipt = await resolveSelectedCollectionReceipt({
          storage,
          record: refreshedRecord || record,
          receiptIdRaw: null,
        });
        const fallbackResolved = resolveCollectionReceiptFile(fallbackReceipt?.storagePath ?? null);
        if (fallbackResolved) {
          resolved = fallbackResolved;
          selectedReceipt = fallbackReceipt;
        }
      }
    }
  }

  if (!resolved) {
    return {
      ok: false,
      statusCode: 404,
      message: "Receipt file not found.",
      reason: "receipt_storage_missing",
      meta: {
        recordId: record.id,
        requestedReceiptId,
      },
    };
  }

  return {
    ok: true,
    resolved,
    selectedReceipt,
  };
}
