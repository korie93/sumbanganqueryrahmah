import { sql } from "drizzle-orm";
import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
  hasCollectionPiiEncryptionConfigured,
  resolveCollectionPiiFieldValue,
} from "../lib/collection-pii-encryption";
import { buildTextArraySql } from "../repositories/sql-array-utils";
import type { BootstrapSqlExecutor } from "./collection-bootstrap-records-shared";

const COLLECTION_PII_BACKFILL_BATCH_SIZE = 500;

export async function backfillCollectionRecordEncryptedPii(
  database: BootstrapSqlExecutor,
): Promise<void> {
  if (!hasCollectionPiiEncryptionConfigured()) {
    return;
  }

  const result = await database.execute(sql`
    SELECT
      id,
      customer_name,
      customer_name_encrypted,
      ic_number,
      ic_number_encrypted,
      customer_phone,
      customer_phone_encrypted,
      account_number,
      account_number_encrypted
    FROM public.collection_records
    WHERE (
      NULLIF(trim(COALESCE(customer_name, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(customer_name_encrypted, '')), '') IS NULL
    ) OR (
      NULLIF(trim(COALESCE(ic_number, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(ic_number_encrypted, '')), '') IS NULL
    ) OR (
      NULLIF(trim(COALESCE(customer_phone, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(customer_phone_encrypted, '')), '') IS NULL
    ) OR (
      NULLIF(trim(COALESCE(account_number, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(account_number_encrypted, '')), '') IS NULL
    )
    ORDER BY created_at ASC NULLS FIRST, id ASC
    LIMIT ${COLLECTION_PII_BACKFILL_BATCH_SIZE}
  `);

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const recordId = String(row.id || "").trim();
    if (!recordId) {
      continue;
    }

    const encryptedPii = buildEncryptedCollectionRecordPiiValues({
      customerName: row.customer_name,
      icNumber: row.ic_number,
      customerPhone: row.customer_phone,
      accountNumber: row.account_number,
    });
    if (!encryptedPii) {
      return;
    }

    await database.execute(sql`
      UPDATE public.collection_records
      SET
        customer_name_encrypted = COALESCE(customer_name_encrypted, ${encryptedPii.customerNameEncrypted}),
        ic_number_encrypted = COALESCE(ic_number_encrypted, ${encryptedPii.icNumberEncrypted}),
        customer_phone_encrypted = COALESCE(customer_phone_encrypted, ${encryptedPii.customerPhoneEncrypted}),
        account_number_encrypted = COALESCE(account_number_encrypted, ${encryptedPii.accountNumberEncrypted})
      WHERE id = ${recordId}::uuid
    `);
  }
}

export async function backfillCollectionRecordPiiSearchHashes(
  database: BootstrapSqlExecutor,
): Promise<void> {
  if (!hasCollectionPiiEncryptionConfigured()) {
    return;
  }

  const result = await database.execute(sql`
    SELECT
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
      account_number_search_hash
    FROM public.collection_records
    WHERE (
      NULLIF(trim(COALESCE(customer_name, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(customer_name_search_hash, '')), '') IS NULL
    ) OR (
      NULLIF(trim(COALESCE(customer_name, '')), '') IS NOT NULL
      AND COALESCE(array_length(customer_name_search_hashes, 1), 0) = 0
    ) OR (
      NULLIF(trim(COALESCE(ic_number, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(ic_number_search_hash, '')), '') IS NULL
    ) OR (
      NULLIF(trim(COALESCE(customer_phone, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(customer_phone_search_hash, '')), '') IS NULL
    ) OR (
      NULLIF(trim(COALESCE(account_number, '')), '') IS NOT NULL
      AND NULLIF(trim(COALESCE(account_number_search_hash, '')), '') IS NULL
    )
    ORDER BY created_at ASC NULLS FIRST, id ASC
    LIMIT ${COLLECTION_PII_BACKFILL_BATCH_SIZE}
  `);

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const recordId = String(row.id || "").trim();
    if (!recordId) {
      continue;
    }

    const searchHashes = buildCollectionRecordPiiSearchHashes({
      customerName: resolveCollectionPiiFieldValue({
        plaintext: row.customer_name,
        encrypted: row.customer_name_encrypted,
      }),
      icNumber: resolveCollectionPiiFieldValue({
        plaintext: row.ic_number,
        encrypted: row.ic_number_encrypted,
      }),
      customerPhone: resolveCollectionPiiFieldValue({
        plaintext: row.customer_phone,
        encrypted: row.customer_phone_encrypted,
      }),
      accountNumber: resolveCollectionPiiFieldValue({
        plaintext: row.account_number,
        encrypted: row.account_number_encrypted,
      }),
    });
    if (!searchHashes) {
      return;
    }

    await database.execute(sql`
      UPDATE public.collection_records
      SET
        customer_name_search_hash = COALESCE(customer_name_search_hash, ${searchHashes.customerNameSearchHash}),
        customer_name_search_hashes = CASE
          WHEN COALESCE(array_length(customer_name_search_hashes, 1), 0) = 0
            THEN ${searchHashes.customerNameSearchHashes?.length
              ? buildTextArraySql(searchHashes.customerNameSearchHashes)
              : null}
          ELSE customer_name_search_hashes
        END,
        ic_number_search_hash = COALESCE(ic_number_search_hash, ${searchHashes.icNumberSearchHash}),
        customer_phone_search_hash = COALESCE(customer_phone_search_hash, ${searchHashes.customerPhoneSearchHash}),
        account_number_search_hash = COALESCE(account_number_search_hash, ${searchHashes.accountNumberSearchHash})
      WHERE id = ${recordId}::uuid
    `);
  }
}
