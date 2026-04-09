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
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import { buildTextArraySql } from "./sql-array-utils";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import {
  attachCollectionReceipts,
} from "./collection-receipt-utils";
import { mapCollectionRecordRow } from "./collection-repository-mappers";

export async function createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord> {
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
        ${buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted", "customer_name", "customerName")},
        customer_name_encrypted,
        ${buildProtectedCollectionPiiSelect("ic_number", "ic_number_encrypted", "ic_number", "icNumber")},
        ic_number_encrypted,
        ${buildProtectedCollectionPiiSelect("customer_phone", "customer_phone_encrypted", "customer_phone", "customerPhone")},
        customer_phone_encrypted,
        ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted", "account_number", "accountNumber")},
        account_number_encrypted,
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
