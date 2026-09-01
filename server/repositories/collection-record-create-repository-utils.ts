import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionRecord,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
} from "../storage-postgres";
import {
  refreshCollectionRecordDailyRollupSlices,
} from "./collection-record-rollup-utils";
import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import { buildTextArraySql } from "./sql-array-utils";
import {
  createCollectionRecordReceiptRows,
  syncCollectionRecordReceiptValidation,
} from "./collection-receipt-utils";

export async function createCollectionRecord(
  data: CreateCollectionRecordInput,
  receipts: CreateCollectionRecordReceiptInput[] = [],
): Promise<CollectionRecord> {
  const id = randomUUID();
  const encryptedPii = buildEncryptedCollectionRecordPiiValues({
    customerName: data.customerName,
    icNumber: data.icNumber,
    customerPhone: data.customerPhone,
    accountNumber: data.accountNumber,
  });
  const piiSearchHashes = buildCollectionRecordPiiSearchHashes({
    customerName: data.customerName,
    icNumber: data.icNumber,
    customerPhone: data.customerPhone,
    accountNumber: data.accountNumber,
  });
  const persistedCustomerName = resolveStoredCollectionPiiPlaintextValue({
    field: "customerName",
    plaintext: data.customerName,
    encrypted: encryptedPii?.customerNameEncrypted,
  });
  const persistedIcNumber = resolveStoredCollectionPiiPlaintextValue({
    field: "icNumber",
    plaintext: data.icNumber,
    encrypted: encryptedPii?.icNumberEncrypted,
  });
  const persistedCustomerPhone = resolveStoredCollectionPiiPlaintextValue({
    field: "customerPhone",
    plaintext: data.customerPhone,
    encrypted: encryptedPii?.customerPhoneEncrypted,
  });
  const persistedAccountNumber = resolveStoredCollectionPiiPlaintextValue({
    field: "accountNumber",
    plaintext: data.accountNumber,
    encrypted: encryptedPii?.accountNumberEncrypted,
  });
  return db.transaction(async (tx) => {
    if (data.sourceImportId && data.sourceDataRowId) {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${data.sourceImportId}:${data.sourceDataRowId}`}, 0)
        )
      `);
      const sourceRow = await tx.execute(sql`
        SELECT source_row.id
        FROM public.data_rows source_row
        JOIN public.imports imp ON imp.id = source_row.import_id
        WHERE source_row.id = ${data.sourceDataRowId}
          AND source_row.import_id = ${data.sourceImportId}
          AND imp.is_deleted = false
        FOR SHARE OF source_row, imp
      `);
      if (!sourceRow.rows?.[0]) {
        throw new Error("Selected Saved source row no longer exists in the selected file.");
      }
    }
    await tx.execute(sql`
      INSERT INTO public.collection_records (
        id,
        customer_name,
        customer_name_encrypted,
        customer_name_search_hash,
        customer_name_search_hashes,
        ic_number,
        ic_number_encrypted,
        ic_number_search_hash,
        customer_phone,
        customer_phone_encrypted,
        customer_phone_search_hash,
        account_number,
        account_number_encrypted,
        account_number_search_hash,
        source_import_id,
        source_data_row_id,
        source_import_name,
        source_filename,
        aging_bucket,
        calling_date,
        calling_window_end_exclusive,
        total_due,
        billing_principal_osp,
        source_match_basis,
        source_match_accuracy,
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
        ${persistedCustomerName},
        ${encryptedPii?.customerNameEncrypted ?? null},
        ${piiSearchHashes?.customerNameSearchHash ?? null},
        ${piiSearchHashes?.customerNameSearchHashes?.length
          ? buildTextArraySql(piiSearchHashes.customerNameSearchHashes)
          : null},
        ${persistedIcNumber},
        ${encryptedPii?.icNumberEncrypted ?? null},
        ${piiSearchHashes?.icNumberSearchHash ?? null},
        ${persistedCustomerPhone},
        ${encryptedPii?.customerPhoneEncrypted ?? null},
        ${piiSearchHashes?.customerPhoneSearchHash ?? null},
        ${persistedAccountNumber},
        ${encryptedPii?.accountNumberEncrypted ?? null},
        ${piiSearchHashes?.accountNumberSearchHash ?? null},
        ${data.sourceImportId ?? null},
        ${data.sourceDataRowId && data.sourceImportId
          ? sql`(
              SELECT source_row.id
              FROM public.data_rows source_row
              WHERE source_row.id = ${data.sourceDataRowId}
                AND source_row.import_id = ${data.sourceImportId}
              LIMIT 1
            )`
          : null},
        ${data.sourceImportName ?? null},
        ${data.sourceFilename ?? null},
        ${data.agingBucket ?? null},
        ${data.callingDate ?? null}::date,
        ${data.callingWindowEndExclusive ?? null}::date,
        ${data.totalDue ?? null},
        ${data.billingPrincipalOsp ?? null},
        ${data.sourceMatchBasis ?? null},
        ${data.sourceMatchAccuracy ?? null},
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

    await refreshCollectionRecordDailyRollupSlices(tx, [{
      paymentDate: data.paymentDate,
      createdByLogin: data.createdByLogin,
      collectionStaffNickname: data.collectionStaffNickname,
    }]);

    if (receipts.length > 0) {
      await createCollectionRecordReceiptRows(tx, id, receipts);
    }

    const created = await syncCollectionRecordReceiptValidation(tx, id);
    if (!created) {
      throw new Error("Failed to load created collection record.");
    }
    return created;
  });
}
