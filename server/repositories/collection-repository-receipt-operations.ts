import { db } from "../db-postgres";
import type {
  CollectionReceiptDuplicateSummary,
  CollectionRecord,
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  UpdateCollectionRecordReceiptInput,
} from "../storage-postgres";
import {
  createCollectionRecordReceiptRows,
  deleteAllCollectionRecordReceiptRows,
  deleteCollectionRecordReceiptRows,
  findCollectionReceiptDuplicateSummariesByHash,
  getCollectionRecordReceiptByIdForRecord,
  listCollectionRecordReceiptsByRecordId,
  syncCollectionRecordReceiptValidation,
  updateCollectionRecordReceiptRows,
} from "./collection-receipt-utils";

export async function listCollectionRecordReceiptsRepository(
  recordId: string,
): Promise<CollectionRecordReceipt[]> {
  return listCollectionRecordReceiptsByRecordId(db, recordId);
}

export async function getCollectionRecordReceiptByIdRepository(
  recordId: string,
  receiptId: string,
): Promise<CollectionRecordReceipt | undefined> {
  return getCollectionRecordReceiptByIdForRecord(db, recordId, receiptId);
}

export async function findCollectionReceiptDuplicateSummariesRepository(
  fileHashes: string[],
  options?: { excludeRecordId?: string },
): Promise<CollectionReceiptDuplicateSummary[]> {
  return findCollectionReceiptDuplicateSummariesByHash(db, fileHashes, options);
}

export async function createCollectionRecordReceiptsRepository(
  recordId: string,
  receipts: CreateCollectionRecordReceiptInput[],
): Promise<CollectionRecordReceipt[]> {
  return createCollectionRecordReceiptRows(db, recordId, receipts);
}

export async function updateCollectionRecordReceiptsRepository(
  recordId: string,
  updates: UpdateCollectionRecordReceiptInput[],
): Promise<CollectionRecordReceipt[]> {
  return updateCollectionRecordReceiptRows(db, recordId, updates);
}

export async function deleteCollectionRecordReceiptsRepository(
  recordId: string,
  receiptIds: string[],
): Promise<CollectionRecordReceipt[]> {
  return deleteCollectionRecordReceiptRows(db, recordId, receiptIds);
}

export async function deleteAllCollectionRecordReceiptsRepository(
  recordId: string,
): Promise<CollectionRecordReceipt[]> {
  return deleteAllCollectionRecordReceiptRows(db, recordId);
}

export async function syncCollectionRecordReceiptValidationRepository(
  recordId: string,
): Promise<CollectionRecord | undefined> {
  return syncCollectionRecordReceiptValidation(db, recordId);
}
