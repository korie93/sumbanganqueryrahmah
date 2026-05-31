import type { AuthenticatedRequest } from "../auth/guards";
import { readRouteParam } from "../http/validation";
import type { PostgresStorage } from "../storage-postgres";
import { canUserAccessCollectionRecord } from "./collection-access";
import { normalizeCollectionText } from "./collection.validation";

export type CollectionReceiptRequestContextFailure = {
  ok: false;
  statusCode: 400 | 401 | 403 | 404;
  message: string;
  reason: string;
  meta?: Record<string, unknown>;
};

export type CollectionReceiptRecord = NonNullable<
  Awaited<ReturnType<PostgresStorage["getCollectionRecordById"]>>
>;

export type CollectionReceiptRequestContextSuccess = {
  ok: true;
  record: CollectionReceiptRecord;
  requestedReceiptId: string | null;
};

function safeReadRouteParam(value: unknown, name: string): {
  message?: string;
  ok: boolean;
  value?: string;
} {
  try {
    return {
      ok: true,
      value: readRouteParam(value, name),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : `${name} is invalid.`,
    };
  }
}

export async function resolveCollectionReceiptRequestContext(
  storage: PostgresStorage,
  req: AuthenticatedRequest,
  receiptIdRaw?: string | null,
): Promise<CollectionReceiptRequestContextFailure | CollectionReceiptRequestContextSuccess> {
  if (!req.user) {
    return {
      ok: false,
      statusCode: 401,
      message: "Unauthenticated",
      reason: "unauthenticated",
    };
  }

  const idParam = safeReadRouteParam(req.params.id, "Collection id");
  if (!idParam.ok || !idParam.value) {
    return {
      ok: false,
      statusCode: 400,
      message: idParam.message || "Collection id is required.",
      reason: "invalid_collection_id",
    };
  }

  const id = idParam.value;
  const record = await storage.getCollectionRecordById(id);
  if (!record) {
    return {
      ok: false,
      statusCode: 404,
      message: "Collection record not found.",
      reason: "record_not_found",
      meta: { recordId: id },
    };
  }

  const canAccessRecord = await canUserAccessCollectionRecord(storage, req.user, {
    createdByLogin: record.createdByLogin,
    collectionStaffNickname: record.collectionStaffNickname,
  });
  if (!canAccessRecord) {
    return {
      ok: false,
      statusCode: 403,
      message: "Forbidden",
      reason: "forbidden",
      meta: { recordId: record.id },
    };
  }

  const rawReceiptId = receiptIdRaw ?? req.params.receiptId ?? null;
  if (rawReceiptId === null || rawReceiptId === undefined || rawReceiptId === "") {
    return {
      ok: true,
      record,
      requestedReceiptId: null,
    };
  }

  const receiptIdParam = safeReadRouteParam(rawReceiptId, "Receipt id");
  if (!receiptIdParam.ok || !receiptIdParam.value) {
    return {
      ok: false,
      statusCode: 400,
      message: receiptIdParam.message || "Receipt id is invalid.",
      reason: "invalid_receipt_id",
      meta: { recordId: record.id },
    };
  }

  return {
    ok: true,
    record,
    requestedReceiptId: normalizeCollectionText(receiptIdParam.value),
  };
}
