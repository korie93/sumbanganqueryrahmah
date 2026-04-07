import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionRecord,
  CreateCollectionRecordInput,
} from "../storage-postgres";
import {
  enqueueCollectionRecordDailyRollupSlices,
} from "./collection-record-rollup-utils";
import {
  attachCollectionReceipts,
} from "./collection-receipt-utils";
import { mapCollectionRecordRow } from "./collection-repository-mappers";

export async function createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord> {
  const id = randomUUID();
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO public.collection_records (
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at,
        updated_at
      )
      VALUES (
        ${id}::uuid,
        ${data.customerName},
        ${data.icNumber},
        ${data.customerPhone},
        ${data.accountNumber},
        ${data.batch},
        ${data.paymentDate}::date,
        ${data.amount},
        ${null},
        ${data.createdByLogin},
        ${data.collectionStaffNickname},
        ${data.collectionStaffNickname},
        now(),
        date_trunc('milliseconds', now())
      )
    `);

    await enqueueCollectionRecordDailyRollupSlices(tx, [{
      paymentDate: data.paymentDate,
      createdByLogin: data.createdByLogin,
      collectionStaffNickname: data.collectionStaffNickname,
    }]);

    const result = await tx.execute(sql`
      SELECT
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        receipt_total_amount,
        receipt_validation_status,
        receipt_validation_message,
        receipt_count,
        duplicate_receipt_flag,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at,
        updated_at
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) {
      throw new Error("Failed to load created collection record.");
    }

    const [created] = await attachCollectionReceipts(tx, [mapCollectionRecordRow(row)]);
    return created || mapCollectionRecordRow(row);
  });
}
