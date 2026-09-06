import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type { CollectionAmountMyrNumber } from "../../shared/collection-amount-types";
import {
  collectCollectionReceiptPaths,
  extractCollectionRecordIds,
  sumCollectionRowAmounts,
} from "./collection-record-query-utils";
import {
  mapCollectionRecordRowToDailyRollupSlice,
  refreshCollectionRecordDailyRollupSlices,
} from "./collection-record-rollup-utils";
import {
  acquireCollectionRecordMutationLock,
  acquireCollectionSettlementCycleLocks,
  recalculateCollectionSettlementCycles,
} from "./collection-settlement-repository-utils";

export async function purgeCollectionRecordsOlderThan(
  beforeDate: string,
  purgedBy: string,
): Promise<{
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
  receiptPaths: string[];
}> {
  const normalizedBeforeDate = String(beforeDate || "").trim();
  const normalizedPurgedBy = String(purgedBy || "").trim().slice(0, 200);
  if (!normalizedBeforeDate) {
    return {
      totalRecords: 0,
      totalAmount: 0,
      receiptPaths: [],
    };
  }
  if (!normalizedPurgedBy) {
    throw new Error("Collection purge actor is required.");
  }

  return db.transaction(async (tx) => {
    const candidateRecordsResult = await tx.execute(sql`
      SELECT id
      FROM public.collection_records
      WHERE payment_date < ${normalizedBeforeDate}::date
        AND settlement_override_status IS DISTINCT FROM 'ACTIVE'
      ORDER BY id ASC
    `);
    const candidateRecordIds = extractCollectionRecordIds(
      Array.isArray(candidateRecordsResult.rows) ? candidateRecordsResult.rows : [],
    ).sort();
    if (!candidateRecordIds.length) {
      return {
        totalRecords: 0,
        totalAmount: 0,
        receiptPaths: [],
      };
    }
    for (const recordId of candidateRecordIds) {
      await acquireCollectionRecordMutationLock(tx, recordId);
    }

    const candidateRecordIdSql = sql.join(
      candidateRecordIds.map((value) => sql`${value}::uuid`),
      sql`, `,
    );
    const settlementMetadataResult = await tx.execute(sql`
      SELECT
        id,
        amount,
        receipt_file,
        settlement_cycle_key
      FROM public.collection_records
      WHERE id IN (${candidateRecordIdSql})
        AND payment_date < ${normalizedBeforeDate}::date
        AND settlement_override_status IS DISTINCT FROM 'ACTIVE'
      ORDER BY payment_date ASC, created_at ASC, id ASC
    `);
    const settlementCycleKeys = (settlementMetadataResult.rows ?? []).map((row) =>
      String((row as { settlement_cycle_key?: unknown }).settlement_cycle_key ?? "").trim() || null
    );
    await acquireCollectionSettlementCycleLocks(tx, settlementCycleKeys);

    const oldRecordsResult = await tx.execute(sql`
      SELECT
        id,
        amount,
        receipt_file,
        settlement_cycle_key,
        payment_date,
        created_by_login,
        collection_staff_nickname
      FROM public.collection_records
      WHERE id IN (${candidateRecordIdSql})
        AND payment_date < ${normalizedBeforeDate}::date
        AND settlement_override_status IS DISTINCT FROM 'ACTIVE'
      ORDER BY payment_date ASC, created_at ASC, id ASC
      FOR UPDATE
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
      INSERT INTO public.collection_record_purge_history (
        original_record_id,
        source_import_id,
        source_data_row_id,
        source_obligation_key,
        source_import_name,
        source_filename,
        ic_number_search_hash,
        customer_phone_search_hash,
        account_number_search_hash,
        payment_date,
        amount,
        automatic_classification,
        settlement_override_status,
        pool_amount,
        manual_settlement_date,
        manual_settlement_reason,
        manual_settlement_note,
        manual_settlement_reference,
        manual_settlement_version,
        manual_settlement_verified_by,
        manual_settlement_verified_at,
        manual_settlement_updated_by,
        manual_settlement_updated_at,
        manual_settlement_revoked_by,
        manual_settlement_revoked_at,
        manual_settlement_revoked_reason,
        created_by_login,
        collection_staff_nickname,
        original_created_at,
        purged_at,
        purged_by,
        purge_reason
      )
      SELECT
        id,
        source_import_id,
        source_data_row_id,
        source_obligation_key,
        source_import_name,
        source_filename,
        ic_number_search_hash,
        customer_phone_search_hash,
        account_number_search_hash,
        payment_date,
        amount,
        classification,
        settlement_override_status,
        pool_amount,
        manual_settlement_date,
        manual_settlement_reason,
        manual_settlement_note,
        manual_settlement_reference,
        manual_settlement_version,
        manual_settlement_verified_by,
        manual_settlement_verified_at,
        manual_settlement_updated_by,
        manual_settlement_updated_at,
        manual_settlement_revoked_by,
        manual_settlement_revoked_at,
        manual_settlement_revoked_reason,
        created_by_login,
        collection_staff_nickname,
        created_at,
        now(),
        ${normalizedPurgedBy},
        'retention_policy'
      FROM public.collection_records
      WHERE id IN (${recordIdSql})
      ON CONFLICT (original_record_id) DO UPDATE SET
        source_import_id = EXCLUDED.source_import_id,
        source_data_row_id = EXCLUDED.source_data_row_id,
        source_obligation_key = EXCLUDED.source_obligation_key,
        source_import_name = EXCLUDED.source_import_name,
        source_filename = EXCLUDED.source_filename,
        ic_number_search_hash = EXCLUDED.ic_number_search_hash,
        customer_phone_search_hash = EXCLUDED.customer_phone_search_hash,
        account_number_search_hash = EXCLUDED.account_number_search_hash,
        payment_date = EXCLUDED.payment_date,
        amount = EXCLUDED.amount,
        automatic_classification = EXCLUDED.automatic_classification,
        settlement_override_status = EXCLUDED.settlement_override_status,
        pool_amount = EXCLUDED.pool_amount,
        manual_settlement_date = EXCLUDED.manual_settlement_date,
        manual_settlement_reason = EXCLUDED.manual_settlement_reason,
        manual_settlement_note = EXCLUDED.manual_settlement_note,
        manual_settlement_reference = EXCLUDED.manual_settlement_reference,
        manual_settlement_version = EXCLUDED.manual_settlement_version,
        manual_settlement_verified_by = EXCLUDED.manual_settlement_verified_by,
        manual_settlement_verified_at = EXCLUDED.manual_settlement_verified_at,
        manual_settlement_updated_by = EXCLUDED.manual_settlement_updated_by,
        manual_settlement_updated_at = EXCLUDED.manual_settlement_updated_at,
        manual_settlement_revoked_by = EXCLUDED.manual_settlement_revoked_by,
        manual_settlement_revoked_at = EXCLUDED.manual_settlement_revoked_at,
        manual_settlement_revoked_reason = EXCLUDED.manual_settlement_revoked_reason,
        created_by_login = EXCLUDED.created_by_login,
        collection_staff_nickname = EXCLUDED.collection_staff_nickname,
        original_created_at = EXCLUDED.original_created_at,
        purged_at = EXCLUDED.purged_at,
        purged_by = EXCLUDED.purged_by,
        purge_reason = EXCLUDED.purge_reason
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE collection_record_id IN (${recordIdSql})
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_records
      WHERE id IN (${recordIdSql})
    `);
    await recalculateCollectionSettlementCycles(tx, settlementCycleKeys);

    // Active manual anchors and concurrent historical entries are intentionally
    // retained. Recompute only actual deleted slices rather than erasing every
    // pre-cutoff aggregate (including retained records and other collectors).
    await refreshCollectionRecordDailyRollupSlices(tx, oldRecordRows.map((row) =>
      mapCollectionRecordRowToDailyRollupSlice(row as Record<string, unknown>),
    ));
    // Pending generations remain safe to replay, even when their day is now empty.

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
