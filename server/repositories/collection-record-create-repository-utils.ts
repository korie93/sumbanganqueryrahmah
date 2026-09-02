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
  acquireCollectionSettlementCycleLocks,
  applyCollectionSettlementState,
  recalculateCollectionSettlementCycles,
} from "./collection-settlement-repository-utils";
import {
  createCollectionRecordReceiptRows,
  syncCollectionRecordReceiptValidation,
} from "./collection-receipt-utils";
import { assertAuthorizedCollectionSourceSnapshot } from "./collection-source-authority-repository-utils";

export async function createCollectionRecord(
  data: CreateCollectionRecordInput,
  receipts: CreateCollectionRecordReceiptInput[] = [],
): Promise<CollectionRecord> {
  const id = randomUUID();
  const settlementCycleKey = String(data.settlementCycleKey ?? "").trim() || null;
  return db.transaction(async (tx) => {
    await acquireCollectionSettlementCycleLocks(tx, [settlementCycleKey]);
    let trustedSourceAccountNumber: string | null = null;
    let trustedSourceCardNumberLast4: string | null | undefined;
    if (data.sourceImportId || data.sourceDataRowId || settlementCycleKey) {
      if (!data.sourceImportId || !data.sourceDataRowId) {
        throw new Error("Selected Collection source snapshot is incomplete.");
      }
      const authorizedSource = await assertAuthorizedCollectionSourceSnapshot(tx, {
        sourceImportId: data.sourceImportId,
        sourceDataRowId: data.sourceDataRowId,
        paymentDate: data.paymentDate,
        accountNumber: data.accountNumber,
        cardNumber: data.sourceCardNumber ?? null,
        requireFullIdentifierMatch: true,
        cardNumberLast4: data.cardNumberLast4 ?? null,
        agingBucket: data.agingBucket ?? null,
        callingDate: data.callingDate ?? null,
        callingWindowEndExclusive: data.callingWindowEndExclusive ?? null,
        totalDue: data.totalDue ?? null,
        billingPrincipalOsp: data.billingPrincipalOsp ?? null,
        sourceMatchBasis: data.sourceMatchBasis ?? null,
        sourceObligationKey: data.sourceObligationKey ?? null,
        settlementCycleKey,
      });
      trustedSourceAccountNumber = authorizedSource.accountNumber;
      trustedSourceCardNumberLast4 = authorizedSource.cardNumberLast4;
    }
    const accountNumber = trustedSourceAccountNumber ?? data.accountNumber;
    const cardNumberLast4 = trustedSourceCardNumberLast4 === undefined
      ? data.cardNumberLast4 ?? null
      : trustedSourceCardNumberLast4;
    const encryptedPii = buildEncryptedCollectionRecordPiiValues({
      customerName: data.customerName,
      icNumber: data.icNumber,
      customerPhone: data.customerPhone,
      accountNumber,
    });
    const piiSearchHashes = buildCollectionRecordPiiSearchHashes({
      customerName: data.customerName,
      icNumber: data.icNumber,
      customerPhone: data.customerPhone,
      accountNumber,
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
      plaintext: accountNumber,
      encrypted: encryptedPii?.accountNumberEncrypted,
    });
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
        card_number_last4,
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
        source_obligation_key,
        settlement_cycle_key,
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
        ${cardNumberLast4},
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
        ${data.sourceObligationKey ?? null},
        ${settlementCycleKey},
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
    const settlementStates = await recalculateCollectionSettlementCycles(tx, [settlementCycleKey]);
    return applyCollectionSettlementState(created, settlementStates.get(id));
  });
}
