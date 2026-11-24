import path from "node:path";
import { sql } from "drizzle-orm";
import { COLLECTION_OFFLINE_EXPORT_MAX_RECEIPTS } from "../../shared/collection-offline-export";
import { HttpError } from "../http/errors";
import type { CollectionRecord } from "../storage-postgres-collection-types";
import type { CollectionRepositoryExecutor } from "./collection-nickname-types";
import { loadCollectionReceiptMapByRecordIds } from "./collection-receipt-attachment-utils";
import { inferLegacyReceiptMimeType, mapCollectionRecordReceiptRow } from "./collection-receipt-read-shared";

/** Export is read-only, including for records predating the receipt relation. */
export async function attachOfflineExportReceipts(executor: CollectionRepositoryExecutor, records: CollectionRecord[]) {
  if (!records.length) return records;
  const ids = records.map(record => record.id);
  const idSql = sql.join(ids.map(id => sql`${id}::uuid`), sql`, `);
  const count = await executor.execute(sql`SELECT count(*)::int AS total FROM public.collection_record_receipts
    WHERE collection_record_id IN (${idSql}) AND deleted_at IS NULL`);
  if (Number((count.rows?.[0] as { total: number }).total) > COLLECTION_OFFLINE_EXPORT_MAX_RECEIPTS) {
    throw new HttpError(413, "Terlalu banyak resit. Bahagikan pilihan kepada beberapa eksport.", { code: "PAYLOAD_TOO_LARGE" });
  }
  const active = await loadCollectionReceiptMapByRecordIds(executor, ids);
  const legacy = records.filter(record => record.receiptFile && !active.has(record.id));
  const archived = legacy.length ? await executor.execute(sql`
    SELECT DISTINCT r.id FROM public.collection_records r JOIN public.collection_record_receipts f
      ON f.collection_record_id = r.id AND f.storage_path = r.receipt_file
    WHERE f.deleted_at IS NOT NULL AND r.id IN (${sql.join(legacy.map(r => sql`${r.id}::uuid`), sql`, `)})`) : null;
  const retired = new Set(archived?.rows?.map(row => (row as {id: string}).id));
  return records.map(record => {
    const receipts = active.get(record.id) ?? [];
    if (!receipts.length && record.receiptFile && !retired.has(record.id)) {
      receipts.push(mapCollectionRecordReceiptRow({
        id: record.id, collection_record_id: record.id, storage_path: record.receiptFile,
        original_extension: path.extname(record.receiptFile), original_mime_type: inferLegacyReceiptMimeType(record.receiptFile),
        created_at: record.createdAt,
      }));
    }
    return { ...record, receiptFile: null, receipts };
  });
}
