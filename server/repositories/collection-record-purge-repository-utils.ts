import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  collectCollectionReceiptPaths,
  extractCollectionRecordIds,
  sumCollectionRowAmounts,
} from "./collection-record-query-utils";
import {
  rebuildCollectionRecordMonthlyRollups,
} from "./collection-record-rollup-utils";

export async function purgeCollectionRecordsOlderThan(beforeDate: string): Promise<{
  totalRecords: number;
  totalAmount: number;
  receiptPaths: string[];
}> {
  const normalizedBeforeDate = String(beforeDate || "").trim();
  if (!normalizedBeforeDate) {
    return {
      totalRecords: 0,
      totalAmount: 0,
      receiptPaths: [],
    };
  }

  return db.transaction(async (tx) => {
    const oldRecordsResult = await tx.execute(sql`
      SELECT
        id,
        amount,
        receipt_file
      FROM public.collection_records
      WHERE payment_date < ${normalizedBeforeDate}::date
      ORDER BY payment_date ASC, created_at ASC, id ASC
    `);

    const oldRecordRows = Array.isArray(oldRecordsResult.rows) ? oldRecordsResult.rows : [];
    if (!oldRecordRows.length) {
      return {
        totalRecords: 0,
        totalAmount: 0,
        receiptPaths: [],
      };
    }

    const recordIds = extractCollectionRecordIds(oldRecordRows);
    if (!recordIds.length) {
      return {
        totalRecords: 0,
        totalAmount: 0,
        receiptPaths: [],
      };
    }

    const recordIdSql = sql.join(recordIds.map((value) => sql`${value}::uuid`), sql`, `);
    const receiptRowsResult = await tx.execute(sql`
      SELECT storage_path
      FROM public.collection_record_receipts
      WHERE collection_record_id IN (${recordIdSql})
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE collection_record_id IN (${recordIdSql})
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_records
      WHERE id IN (${recordIdSql})
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_record_daily_rollups
      WHERE payment_date < ${normalizedBeforeDate}::date
    `);
    await rebuildCollectionRecordMonthlyRollups(tx);
    await tx.execute(sql`
      DELETE FROM public.collection_record_daily_rollup_refresh_queue
      WHERE payment_date < ${normalizedBeforeDate}::date
    `);

    const receiptPaths = collectCollectionReceiptPaths(
      oldRecordRows,
      Array.isArray(receiptRowsResult.rows) ? receiptRowsResult.rows : [],
    );

    return {
      totalRecords: oldRecordRows.length,
      totalAmount: sumCollectionRowAmounts(oldRecordRows),
      receiptPaths,
    };
  });
}
