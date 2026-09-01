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
import {
  acquireCollectionRecordMutationLock,
  acquireCollectionSettlementCycleLocks,
  applyCollectionSettlementState,
  loadCollectionSettlementCycleKeyForRecord,
  recalculateCollectionSettlementCycles,
} from "./collection-settlement-repository-utils";

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
  return db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, recordId);
    const cycleKey = await loadCollectionSettlementCycleKeyForRecord(tx, recordId);
    await acquireCollectionSettlementCycleLocks(tx, [cycleKey]);
    const created = await createCollectionRecordReceiptRows(tx, recordId, receipts);
    await syncCollectionRecordReceiptValidation(tx, recordId);
    await recalculateCollectionSettlementCycles(tx, [cycleKey]);
    return created;
  });
}

export async function updateCollectionRecordReceiptsRepository(
  recordId: string,
  updates: UpdateCollectionRecordReceiptInput[],
): Promise<CollectionRecordReceipt[]> {
  return db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, recordId);
    const cycleKey = await loadCollectionSettlementCycleKeyForRecord(tx, recordId);
    await acquireCollectionSettlementCycleLocks(tx, [cycleKey]);
    const updated = await updateCollectionRecordReceiptRows(tx, recordId, updates);
    await syncCollectionRecordReceiptValidation(tx, recordId);
    await recalculateCollectionSettlementCycles(tx, [cycleKey]);
    return updated;
  });
}

export async function deleteCollectionRecordReceiptsRepository(
  recordId: string,
  receiptIds: string[],
): Promise<CollectionRecordReceipt[]> {
  return db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, recordId);
    const cycleKey = await loadCollectionSettlementCycleKeyForRecord(tx, recordId);
    await acquireCollectionSettlementCycleLocks(tx, [cycleKey]);
    const deleted = await deleteCollectionRecordReceiptRows(tx, recordId, receiptIds);
    await syncCollectionRecordReceiptValidation(tx, recordId);
    await recalculateCollectionSettlementCycles(tx, [cycleKey]);
    return deleted;
  });
}

export async function deleteAllCollectionRecordReceiptsRepository(
  recordId: string,
): Promise<CollectionRecordReceipt[]> {
  return db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, recordId);
    const cycleKey = await loadCollectionSettlementCycleKeyForRecord(tx, recordId);
    await acquireCollectionSettlementCycleLocks(tx, [cycleKey]);
    const deleted = await deleteAllCollectionRecordReceiptRows(tx, recordId);
    await syncCollectionRecordReceiptValidation(tx, recordId);
    await recalculateCollectionSettlementCycles(tx, [cycleKey]);
    return deleted;
  });
}

export async function syncCollectionRecordReceiptValidationRepository(
  recordId: string,
): Promise<CollectionRecord | undefined> {
  return db.transaction(async (tx) => {
    await acquireCollectionRecordMutationLock(tx, recordId);
    const cycleKey = await loadCollectionSettlementCycleKeyForRecord(tx, recordId);
    await acquireCollectionSettlementCycleLocks(tx, [cycleKey]);
    const record = await syncCollectionRecordReceiptValidation(tx, recordId);
    if (!record) return undefined;
    const states = await recalculateCollectionSettlementCycles(tx, [cycleKey]);
    return applyCollectionSettlementState(record, states.get(recordId));
  });
}
