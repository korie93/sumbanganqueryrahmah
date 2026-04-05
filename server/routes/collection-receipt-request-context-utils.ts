import type { AuthenticatedRequest } from "../auth/guards";
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

  const id = normalizeCollectionText(req.params.id);
  if (!id) {
    return {
      ok: false,
      statusCode: 400,
      message: "Collection id is required.",
      reason: "missing_collection_id",
    };
  }

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

  return {
    ok: true,
    record,
    requestedReceiptId: normalizeCollectionText(
      receiptIdRaw ?? req.params.receiptId ?? null,
    ),
  };
}
