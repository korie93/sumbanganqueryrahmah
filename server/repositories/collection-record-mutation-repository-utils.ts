import { sql, type SQL } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionRecord,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
} from "../storage-postgres";
import type {
  CollectionAgingBucket,
  CollectionSourceMatchBasis,
} from "../storage-postgres-collection-types";
import {
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  resolveCollectionPiiFieldValueFailClosed,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import {
  getCollectionRecordById,
} from "./collection-record-read-utils";
import {
  mapCollectionRecordRowToDailyRollupSlice,
  refreshCollectionRecordDailyRollupSlices,
} from "./collection-record-rollup-utils";
import {
  attachCollectionReceipts,
  createCollectionRecordReceiptRows,
  deleteAllCollectionRecordReceiptRows,
  deleteCollectionRecordReceiptRows,
  syncCollectionRecordReceiptValidation,
  updateCollectionRecordReceiptRows,
} from "./collection-receipt-utils";
import { mapCollectionRecordRow } from "./collection-repository-mappers";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import { buildTextArraySql } from "./sql-array-utils";
import { assertAuthorizedCollectionSourceSnapshot } from "./collection-source-authority-repository-utils";
import {
  acquireCollectionRecordMutationLock,
  acquireCollectionSettlementCycleLocks,
  applyCollectionSettlementState,
  recalculateCollectionSettlementCycles,
} from "./collection-settlement-repository-utils";

function resolveExpectedCollectionRecordUpdatedAt(
  value: Date | undefined,
): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

export function buildExpectedCollectionRecordVersionWhereClause(
  expectedUpdatedAt: Date | null,
) {
  if (!expectedUpdatedAt) {
    return null;
  }

  return sql`date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', CAST(${expectedUpdatedAt.toISOString()} AS timestamptz))`;
}

export async function updateCollectionRecord(
  id: string,
  data: UpdateCollectionRecordInput,
  options?: UpdateCollectionRecordOptions,
): Promise<CollectionRecord | undefined> {
  const updateChunks: SQL[] = [];

  if (data.customerName !== undefined) {
    const customerNameEncrypted = encryptCollectionPiiFieldValue(data.customerName);
    updateChunks.push(sql`customer_name = ${resolveStoredCollectionPiiPlaintextValue({
      field: "customerName",
      plaintext: data.customerName,
      encrypted: customerNameEncrypted,
    })}`);
    if (customerNameEncrypted !== null) {
      updateChunks.push(sql`customer_name_encrypted = ${customerNameEncrypted}`);
    }
    updateChunks.push(sql`customer_name_search_hash = ${hashCollectionPiiSearchValue("customerName", data.customerName)}`);
    const customerNameSearchHashes = hashCollectionCustomerNameSearchTerms(data.customerName);
    updateChunks.push(sql`customer_name_search_hashes = ${customerNameSearchHashes?.length
      ? buildTextArraySql(customerNameSearchHashes)
      : null}`);
  }
  if (data.icNumber !== undefined) {
    const icNumberEncrypted = encryptCollectionPiiFieldValue(data.icNumber);
    updateChunks.push(sql`ic_number = ${resolveStoredCollectionPiiPlaintextValue({
      field: "icNumber",
      plaintext: data.icNumber,
      encrypted: icNumberEncrypted,
    })}`);
    if (icNumberEncrypted !== null) {
      updateChunks.push(sql`ic_number_encrypted = ${icNumberEncrypted}`);
    }
    updateChunks.push(sql`ic_number_search_hash = ${hashCollectionPiiSearchValue("icNumber", data.icNumber)}`);
  }
  if (data.customerPhone !== undefined) {
    const customerPhoneEncrypted = encryptCollectionPiiFieldValue(data.customerPhone);
    updateChunks.push(sql`customer_phone = ${resolveStoredCollectionPiiPlaintextValue({
      field: "customerPhone",
      plaintext: data.customerPhone,
      encrypted: customerPhoneEncrypted,
    })}`);
    if (customerPhoneEncrypted !== null) {
      updateChunks.push(sql`customer_phone_encrypted = ${customerPhoneEncrypted}`);
    }
    updateChunks.push(sql`customer_phone_search_hash = ${hashCollectionPiiSearchValue("customerPhone", data.customerPhone)}`);
  }
  if (data.accountNumber !== undefined) {
    const accountNumberEncrypted = encryptCollectionPiiFieldValue(data.accountNumber);
    updateChunks.push(sql`account_number = ${resolveStoredCollectionPiiPlaintextValue({
      field: "accountNumber",
      plaintext: data.accountNumber,
      encrypted: accountNumberEncrypted,
    })}`);
    if (accountNumberEncrypted !== null) {
      updateChunks.push(sql`account_number_encrypted = ${accountNumberEncrypted}`);
    }
    updateChunks.push(sql`account_number_search_hash = ${hashCollectionPiiSearchValue("accountNumber", data.accountNumber)}`);
  }
  if (data.cardNumberLast4 !== undefined) {
    updateChunks.push(sql`card_number_last4 = ${data.cardNumberLast4}`);
  }
  if (data.sourceImportId !== undefined) {
    updateChunks.push(sql`source_import_id = ${data.sourceImportId}`);
  }
  if (data.sourceDataRowId !== undefined) {
    updateChunks.push(data.sourceDataRowId && data.sourceImportId
      ? sql`source_data_row_id = (
          SELECT source_row.id
          FROM public.data_rows source_row
          WHERE source_row.id = ${data.sourceDataRowId}
            AND source_row.import_id = ${data.sourceImportId}
          LIMIT 1
        )`
      : sql`source_data_row_id = NULL`);
  }
  if (data.sourceImportName !== undefined) {
    updateChunks.push(sql`source_import_name = ${data.sourceImportName}`);
  }
  if (data.sourceFilename !== undefined) {
    updateChunks.push(sql`source_filename = ${data.sourceFilename}`);
  }
  if (data.agingBucket !== undefined) {
    updateChunks.push(sql`aging_bucket = ${data.agingBucket}`);
  }
  if (data.callingDate !== undefined) {
    updateChunks.push(sql`calling_date = ${data.callingDate ?? null}::date`);
  }
  if (data.callingWindowEndExclusive !== undefined) {
    updateChunks.push(sql`calling_window_end_exclusive = ${data.callingWindowEndExclusive ?? null}::date`);
  }
  if (data.totalDue !== undefined) {
    updateChunks.push(sql`total_due = ${data.totalDue}`);
  }
  if (data.billingPrincipalOsp !== undefined) {
    updateChunks.push(sql`billing_principal_osp = ${data.billingPrincipalOsp}`);
  }
  if (data.sourceMatchBasis !== undefined) {
    updateChunks.push(sql`source_match_basis = ${data.sourceMatchBasis}`);
  }
  if (data.sourceMatchAccuracy !== undefined) {
    updateChunks.push(sql`source_match_accuracy = ${data.sourceMatchAccuracy}`);
  }
  if (data.sourceObligationKey !== undefined) {
    updateChunks.push(sql`source_obligation_key = ${data.sourceObligationKey}`);
  }
  if (data.settlementCycleKey !== undefined) {
    updateChunks.push(sql`settlement_cycle_key = ${String(data.settlementCycleKey ?? "").trim() || null}`);
  }
  if (data.batch !== undefined) {
    updateChunks.push(sql`batch = ${data.batch}`);
  }
  if (data.paymentDate !== undefined) {
    updateChunks.push(sql`payment_date = ${data.paymentDate}::date`);
  }
  if (data.amount !== undefined) {
    updateChunks.push(sql`amount = ${data.amount}`);
  }
  if (Object.prototype.hasOwnProperty.call(data, "receiptFile")) {
    // collection_records.receipt_file is a compatibility cache only.
    // The mutation layer must only ever set this to null (transitional legacy cleanup).
    // New receipt files must be written through collection_record_receipts, not this field.
    updateChunks.push(sql`receipt_file = ${data.receiptFile ?? null}`);
  }
  if (data.collectionStaffNickname !== undefined) {
    updateChunks.push(sql`collection_staff_nickname = ${data.collectionStaffNickname}`);
    updateChunks.push(sql`staff_username = ${data.collectionStaffNickname}`);
  }

  const expectedUpdatedAt = resolveExpectedCollectionRecordUpdatedAt(options?.expectedUpdatedAt);
  const removeAllReceipts = options?.removeAllReceipts === true;
  const removeReceiptIds = Array.from(
    new Set(
      Array.isArray(options?.removeReceiptIds)
        ? options.removeReceiptIds.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
    ),
  );
  const newReceipts = Array.isArray(options?.newReceipts)
    ? options.newReceipts
    : [];
  const receiptUpdates = Array.isArray(options?.receiptUpdates)
    ? options.receiptUpdates
    : [];
  const hasReceiptMutation = removeAllReceipts
    || removeReceiptIds.length > 0
    || newReceipts.length > 0
    || receiptUpdates.length > 0;

  if (!updateChunks.length && !hasReceiptMutation) {
    const current = await getCollectionRecordById(id);
    if (!current) return undefined;
    if (
      expectedUpdatedAt
      && current.updatedAt instanceof Date
      && Number.isFinite(current.updatedAt.getTime())
      && current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      return undefined;
    }
    return current;
  }

  updateChunks.push(sql`updated_at = date_trunc('milliseconds', now())`);

  const whereClauses = [sql`id = ${id}::uuid`];
  const expectedVersionWhereClause = buildExpectedCollectionRecordVersionWhereClause(expectedUpdatedAt);
  if (expectedVersionWhereClause) {
    whereClauses.push(expectedVersionWhereClause);
  }

  return db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, id);
    const existingSliceResult = await tx.execute(sql`
      SELECT
        payment_date,
        created_by_login,
        collection_staff_nickname,
        account_number,
        account_number_encrypted,
        card_number_last4,
        source_import_id,
        source_data_row_id,
        aging_bucket,
        calling_date,
        calling_window_end_exclusive,
        total_due,
        billing_principal_osp,
        source_match_basis,
        source_obligation_key,
        settlement_cycle_key,
        settlement_override_status
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const existingRow = (existingSliceResult.rows?.[0] || null) as Record<string, unknown> | null;
    if (!existingRow) return undefined;
    const existingSlice = mapCollectionRecordRowToDailyRollupSlice(existingRow);
    const existingSettlementCycleKey = String(existingRow?.settlement_cycle_key ?? "").trim() || null;
    const sourceIdentityChanged = data.sourceImportId !== undefined
      || data.sourceDataRowId !== undefined
      || data.callingDate !== undefined;
    const sourceSnapshotRefreshed = data.sourceImportId !== undefined
      || data.sourceDataRowId !== undefined
      || data.sourceObligationKey !== undefined
      || data.sourceMatchBasis !== undefined;
    const mutatesSettlementIdentity = data.accountNumber !== undefined
      || data.sourceCardNumber !== undefined
      || data.cardNumberLast4 !== undefined
      || data.sourceImportId !== undefined
      || data.sourceDataRowId !== undefined
      || data.agingBucket !== undefined
      || data.callingDate !== undefined
      || data.callingWindowEndExclusive !== undefined
      || data.totalDue !== undefined
      || data.billingPrincipalOsp !== undefined
      || data.sourceMatchBasis !== undefined
      || data.sourceMatchAccuracy !== undefined
      || data.sourceObligationKey !== undefined
      || data.settlementCycleKey !== undefined;
    if (
      existingRow.settlement_override_status === "ACTIVE"
      && mutatesSettlementIdentity
    ) {
      // The service performs the same check for fast feedback. This in-lock
      // guard is still required: a superuser can activate the override after
      // the service read but before this transaction acquires the row lock.
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_ACTIVE_IDENTITY_CHANGE_BLOCKED");
    }
    const nextSettlementCycleKey = data.settlementCycleKey !== undefined
      ? String(data.settlementCycleKey ?? "").trim() || null
      : sourceIdentityChanged
        ? null
        : existingSettlementCycleKey;
    if (data.settlementCycleKey === undefined && sourceIdentityChanged) {
      updateChunks.push(sql`settlement_cycle_key = ${nextSettlementCycleKey}`);
      if (data.sourceObligationKey === undefined) {
        updateChunks.push(sql`source_obligation_key = NULL`);
      }
    }
    await acquireCollectionSettlementCycleLocks(tx, [
      existingSettlementCycleKey,
      nextSettlementCycleKey,
    ]);

    const effectiveSourceImportId = data.sourceImportId !== undefined
      ? data.sourceImportId
      : String(existingRow?.source_import_id ?? "").trim() || null;
    const effectiveSourceDataRowId = data.sourceDataRowId !== undefined
      ? data.sourceDataRowId
      : String(existingRow?.source_data_row_id ?? "").trim() || null;
    const effectiveAccountNumber = data.accountNumber !== undefined
      ? data.accountNumber
      : resolveCollectionPiiFieldValueFailClosed({
        field: "accountNumber",
        plaintext: existingRow?.account_number,
        encrypted: existingRow?.account_number_encrypted,
      });
    const existingAgingBucket = String(existingRow?.aging_bucket ?? "").trim();
    const effectiveAgingBucket: CollectionAgingBucket | null = data.agingBucket !== undefined
      ? data.agingBucket ?? null
      : existingAgingBucket === "D3"
        || existingAgingBucket === "D4"
        || existingAgingBucket === "D5"
        || existingAgingBucket === "D6"
        ? existingAgingBucket
        : null;
    const existingSourceMatchBasis = String(existingRow?.source_match_basis ?? "").trim();
    const effectiveSourceMatchBasis: CollectionSourceMatchBasis | null = data.sourceMatchBasis !== undefined
      ? data.sourceMatchBasis ?? null
      : existingSourceMatchBasis === "ic"
        || existingSourceMatchBasis === "phone_and_account"
        || existingSourceMatchBasis === "account_number"
        || existingSourceMatchBasis === "card_number"
        || existingSourceMatchBasis === "account_and_card"
        ? existingSourceMatchBasis
        : null;
    if (
      nextSettlementCycleKey
      || data.sourceImportId !== undefined
      || data.sourceDataRowId !== undefined
      || data.sourceObligationKey !== undefined
    ) {
      if (!effectiveSourceImportId || !effectiveSourceDataRowId) {
        throw new Error("Selected Collection source snapshot is incomplete.");
      }
      await assertAuthorizedCollectionSourceSnapshot(tx, {
        sourceImportId: effectiveSourceImportId,
        sourceDataRowId: effectiveSourceDataRowId,
        paymentDate: data.paymentDate
          ?? String(existingRow?.payment_date ?? "").slice(0, 10),
        accountNumber: effectiveAccountNumber,
        cardNumber: data.sourceCardNumber ?? null,
        requireFullIdentifierMatch: sourceSnapshotRefreshed,
        cardNumberLast4: data.cardNumberLast4 !== undefined
          ? data.cardNumberLast4
          : String(existingRow?.card_number_last4 ?? "").trim() || null,
        agingBucket: effectiveAgingBucket,
        callingDate: data.callingDate !== undefined
          ? data.callingDate
          : String(existingRow?.calling_date ?? "").slice(0, 10) || null,
        callingWindowEndExclusive: data.callingWindowEndExclusive !== undefined
          ? data.callingWindowEndExclusive
          : String(existingRow?.calling_window_end_exclusive ?? "").slice(0, 10) || null,
        totalDue: data.totalDue !== undefined
          ? data.totalDue
          : (existingRow?.total_due as string | number | null | undefined) ?? null,
        billingPrincipalOsp: data.billingPrincipalOsp !== undefined
          ? data.billingPrincipalOsp
          : (existingRow?.billing_principal_osp as string | number | null | undefined) ?? null,
        sourceMatchBasis: effectiveSourceMatchBasis,
        sourceObligationKey: data.sourceObligationKey !== undefined
          ? data.sourceObligationKey
          : String(existingRow?.source_obligation_key ?? "").trim() || null,
        settlementCycleKey: nextSettlementCycleKey,
      });
    }

    const result = await tx.execute(sql`
      UPDATE public.collection_records
      SET ${sql.join(updateChunks, sql`, `)}
      WHERE ${sql.join(whereClauses, sql` AND `)}
      RETURNING
        id,
        ${buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted", "customer_name", "customerName")},
        customer_name_encrypted,
        customer_name_search_hashes,
        ${buildProtectedCollectionPiiSelect("ic_number", "ic_number_encrypted", "ic_number", "icNumber")},
        ic_number_encrypted,
        ${buildProtectedCollectionPiiSelect("customer_phone", "customer_phone_encrypted", "customer_phone", "customerPhone")},
        customer_phone_encrypted,
        ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted", "account_number", "accountNumber")},
        account_number_encrypted,
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
        classification,
        cumulative_collected,
        remaining_amount,
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
    `);

    const row = result.rows?.[0];
    if (!row) return undefined;

    if (removeAllReceipts) {
      await deleteAllCollectionRecordReceiptRows(tx, id);
    } else if (removeReceiptIds.length > 0) {
      await deleteCollectionRecordReceiptRows(tx, id, removeReceiptIds);
    }

    if (newReceipts.length > 0) {
      await createCollectionRecordReceiptRows(tx, id, newReceipts);
    }
    if (receiptUpdates.length > 0) {
      await updateCollectionRecordReceiptRows(tx, id, receiptUpdates);
    }

    const syncedRecord = await syncCollectionRecordReceiptValidation(tx, id);
    const settlementStates = await recalculateCollectionSettlementCycles(tx, [
      existingSettlementCycleKey,
      nextSettlementCycleKey,
    ]);

    await refreshCollectionRecordDailyRollupSlices(tx, [
      existingSlice,
      mapCollectionRecordRowToDailyRollupSlice((row || null) as Record<string, unknown> | null),
    ]);

    if (syncedRecord) {
      return applyCollectionSettlementState(syncedRecord, settlementStates.get(id));
    }

    const [hydrated] = await attachCollectionReceipts(tx, [mapCollectionRecordRow(row)]);
    return applyCollectionSettlementState(
      hydrated || mapCollectionRecordRow(row),
      settlementStates.get(id),
    );
  });
}

export async function deleteCollectionRecord(
  id: string,
  options?: DeleteCollectionRecordOptions,
): Promise<boolean> {
  const expectedUpdatedAt = resolveExpectedCollectionRecordUpdatedAt(options?.expectedUpdatedAt);
  const whereClauses = [sql`id = ${id}::uuid`];
  const expectedVersionWhereClause = buildExpectedCollectionRecordVersionWhereClause(expectedUpdatedAt);
  if (expectedVersionWhereClause) {
    whereClauses.push(expectedVersionWhereClause);
  }

  return db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, id);
    const existingSliceResult = await tx.execute(sql`
      SELECT
        payment_date,
        created_by_login,
        collection_staff_nickname,
        settlement_cycle_key,
        settlement_override_status
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const existingRow = (existingSliceResult.rows?.[0] || null) as Record<string, unknown> | null;
    if (!existingRow) return false;
    if (existingRow.settlement_override_status === "ACTIVE") {
      throw new Error("COLLECTION_MANUAL_SETTLEMENT_ACTIVE_DELETE_BLOCKED");
    }
    const existingSlice = mapCollectionRecordRowToDailyRollupSlice(existingRow);
    const existingSettlementCycleKey = String(existingRow?.settlement_cycle_key ?? "").trim() || null;
    await acquireCollectionSettlementCycleLocks(tx, [existingSettlementCycleKey]);

    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          COALESCE(source_import_id, '') || ':' || COALESCE(source_data_row_id, ''),
          0
        )
      )
      FROM public.collection_records
      WHERE id = ${id}::uuid
        AND source_import_id IS NOT NULL
        AND source_data_row_id IS NOT NULL
    `);

    const deletedRecord = await tx.execute(sql`
      DELETE FROM public.collection_records
      WHERE ${sql.join(whereClauses, sql` AND `)}
      RETURNING id
    `);
    const deletedId = deletedRecord.rows?.[0]?.id as string | undefined;
    if (!deletedId) {
      return false;
    }

    await tx.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE collection_record_id = ${deletedId}::uuid
    `);

    await recalculateCollectionSettlementCycles(tx, [existingSettlementCycleKey]);
    await refreshCollectionRecordDailyRollupSlices(tx, [existingSlice]);
    return true;
  });
}
