import { sql } from "drizzle-orm";
import { parseCollectionAmountToCents } from "../../shared/collection-amount-types";
import { buildCollectionReceiptValidationResult } from "../services/collection/collection-receipt-validation";
import { mapCollectionRecordRow } from "./collection-repository-mappers";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import {
  attachCollectionReceipts,
  findCollectionReceiptDuplicateSummariesByHash,
  listCollectionRecordReceiptsByRecordId,
  readFirstRow,
} from "./collection-receipt-read-utils";
import type { CollectionReceiptExecutor } from "./collection-receipt-read-utils";
import type { CollectionRecord } from "../storage-postgres";

export async function syncCollectionRecordReceiptValidation(
  executor: CollectionReceiptExecutor,
  recordId: string,
): Promise<CollectionRecord | undefined> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) {
    return undefined;
  }

  const recordResult = await executor.execute(sql`
    SELECT amount
    FROM public.collection_records
    WHERE id = ${normalizedRecordId}::uuid
    LIMIT 1
  `);
  const recordRow = readFirstRow<Record<string, unknown>>(recordResult);
  if (!recordRow) {
    return undefined;
  }

  const totalPaidCents = parseCollectionAmountToCents(recordRow.amount, { allowZero: true }) ?? 0;
  const receipts = await listCollectionRecordReceiptsByRecordId(executor, normalizedRecordId);
  const validation = buildCollectionReceiptValidationResult({
    totalPaidCents,
    receipts: receipts.map((receipt) => ({
      receiptId: receipt.id,
      originalFileName: receipt.originalFileName,
      fileHash: receipt.fileHash,
      receiptAmountCents: parseCollectionAmountToCents(receipt.receiptAmount, {
        allowZero: true,
      }),
      extractedAmountCents: parseCollectionAmountToCents(receipt.extractedAmount, {
        allowZero: true,
      }),
      extractionStatus: receipt.extractionStatus,
      extractionConfidence: receipt.extractionConfidence,
      receiptDate: receipt.receiptDate,
      receiptReference: receipt.receiptReference,
    })),
  });
  const duplicateSummaries = await findCollectionReceiptDuplicateSummariesByHash(
    executor,
    receipts.map((receipt) => receipt.fileHash || ""),
  );
  const duplicateReceiptFlag = duplicateSummaries.some((summary) => summary.matchCount > 1);

  await executor.execute(sql`
    UPDATE public.collection_records
    SET
      receipt_total_amount = ${validation.receiptTotalAmountCents},
      receipt_validation_status = ${validation.status},
      receipt_validation_message = ${validation.message},
      receipt_count = ${validation.receiptCount},
      duplicate_receipt_flag = ${duplicateReceiptFlag}
    WHERE id = ${normalizedRecordId}::uuid
  `);

  const refreshed = await executor.execute(sql`
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
    WHERE id = ${normalizedRecordId}::uuid
    LIMIT 1
  `);
  const row = readFirstRow<Record<string, unknown>>(refreshed);
  if (!row) {
    return undefined;
  }
  const [hydrated] = await attachCollectionReceipts(executor, [mapCollectionRecordRow(row)]);
  return hydrated;
}
