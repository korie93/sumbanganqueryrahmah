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

async function resolveReadableReceiptCandidate(params: {
  req: AuthenticatedRequest;
  mode: "view" | "download";
  recordId: string;
  requestedReceiptId: string | null;
  receipt: CollectionRecordReceipt;
}): Promise<CollectionReceiptTargetSuccess | null> {
  const resolved = resolveCollectionReceiptFile(params.receipt.storagePath);
  if (!resolved) {
    logCollectionReceiptWarning({
      req: params.req,
      mode: params.mode,
      statusCode: 404,
      reason: "receipt_storage_path_invalid",
      meta: {
        recordId: params.recordId,
        requestedReceiptId: params.requestedReceiptId,
        receiptId: params.receipt.id,
      },
    });
    return null;
  }

  try {
    await fs.promises.access(resolved.absolutePath, fs.constants.R_OK);
    return {
      ok: true,
      resolved,
      selectedReceipt: params.receipt,
    };
  } catch (error) {
    logCollectionReceiptWarning({
      req: params.req,
      mode: params.mode,
      statusCode: 404,
      reason: "receipt_storage_access_failed",
      meta: {
        recordId: params.recordId,
        requestedReceiptId: params.requestedReceiptId,
        receiptId: params.receipt.id,
        errorCode: (error as NodeJS.ErrnoException)?.code || null,
      },
    });
    return null;
  }
}

export async function resolveReadableCollectionReceiptTarget(params: {
  storage: PostgresStorage;
  req: AuthenticatedRequest;
  mode: "view" | "download";
  record: CollectionReceiptRecord;
  requestedReceiptId: string | null;
}): Promise<CollectionReceiptTargetFailure | CollectionReceiptTargetSuccess> {
  const { storage, req, mode, record, requestedReceiptId } = params;
  const selectedReceipt = await resolveSelectedCollectionReceipt({
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

  if (selectedReceipt) {
    const selectedTarget = await resolveReadableReceiptCandidate({
      req,
      mode,
      recordId: record.id,
      requestedReceiptId,
      receipt: selectedReceipt,
    });
    if (selectedTarget) {
      return selectedTarget;
    }
  }

  if (!requestedReceiptId) {
    const hydratedReceipts = Array.isArray(record.receipts) ? record.receipts : [];
    const storedReceipts = await storage.listCollectionRecordReceipts(record.id);
    const attemptedReceiptIds = new Set(
      selectedReceipt ? [selectedReceipt.id] : [],
    );

    for (const fallbackReceipt of [...hydratedReceipts, ...storedReceipts]) {
      if (attemptedReceiptIds.has(fallbackReceipt.id)) continue;
      attemptedReceiptIds.add(fallbackReceipt.id);

      const fallbackTarget = await resolveReadableReceiptCandidate({
        req,
        mode,
        recordId: record.id,
        requestedReceiptId: null,
        receipt: fallbackReceipt,
      });
      if (fallbackTarget) {
        return fallbackTarget;
      }
    }
  }

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
