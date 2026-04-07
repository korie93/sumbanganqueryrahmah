import type {
  CollectionMonthlySummary,
  CollectionNicknameDailyAggregate,
  CollectionRecord,
  CollectionRecordAggregateFilters,
  CollectionRecordListFilters,
  CreateCollectionRecordInput,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
} from "../storage-postgres";
import {
  createCollectionRecord,
  deleteCollectionRecord,
  getCollectionMonthlySummary,
  getCollectionRecordById,
  getCollectionRecordDailyRollupFreshnessSnapshot,
  listCollectionRecords,
  purgeCollectionRecordsOlderThan,
  summarizeCollectionRecords,
  summarizeCollectionRecordsByNickname,
  summarizeCollectionRecordsByNicknameAndPaymentDate,
  summarizeCollectionRecordsOlderThan,
  updateCollectionRecord,
} from "./collection-record-repository-utils";

export async function createCollectionRecordRepository(
  data: CreateCollectionRecordInput,
): Promise<CollectionRecord> {
  return createCollectionRecord(data);
}

export async function listCollectionRecordsRepository(
  filters?: CollectionRecordListFilters,
): Promise<CollectionRecord[]> {
  return listCollectionRecords(filters);
}

export async function summarizeCollectionRecordsRepository(
  filters?: CollectionRecordAggregateFilters,
): Promise<{ totalRecords: number; totalAmount: number }> {
  return summarizeCollectionRecords(filters);
}

export async function summarizeCollectionRecordsByNicknameRepository(
  filters?: CollectionRecordAggregateFilters,
): Promise<Array<{ nickname: string; totalRecords: number; totalAmount: number }>> {
  return summarizeCollectionRecordsByNickname(filters);
}

export async function getCollectionRecordDailyRollupFreshnessRepository(filters?: {
  from?: string;
  to?: string;
  createdByLogin?: string;
  nicknames?: string[];
}) {
  return getCollectionRecordDailyRollupFreshnessSnapshot(filters);
}

export async function summarizeCollectionRecordsByNicknameAndPaymentDateRepository(
  filters?: CollectionRecordAggregateFilters,
): Promise<CollectionNicknameDailyAggregate[]> {
  return summarizeCollectionRecordsByNicknameAndPaymentDate(filters);
}

export async function summarizeCollectionRecordsOlderThanRepository(
  beforeDate: string,
): Promise<{ totalRecords: number; totalAmount: number }> {
  return summarizeCollectionRecordsOlderThan(beforeDate);
}

export async function purgeCollectionRecordsOlderThanRepository(beforeDate: string): Promise<{
  totalRecords: number;
  totalAmount: number;
  receiptPaths: string[];
}> {
  return purgeCollectionRecordsOlderThan(beforeDate);
}

export async function getCollectionMonthlySummaryRepository(filters: {
  year: number;
  nicknames?: string[];
  createdByLogin?: string;
}): Promise<CollectionMonthlySummary[]> {
  return getCollectionMonthlySummary(filters);
}

export async function getCollectionRecordByIdRepository(
  id: string,
): Promise<CollectionRecord | undefined> {
  return getCollectionRecordById(id);
}

export async function updateCollectionRecordRepository(
  id: string,
  data: UpdateCollectionRecordInput,
  options?: UpdateCollectionRecordOptions,
): Promise<CollectionRecord | undefined> {
  return updateCollectionRecord(id, data, options);
}

export async function deleteCollectionRecordRepository(
  id: string,
  options?: DeleteCollectionRecordOptions,
): Promise<boolean> {
  return deleteCollectionRecord(id, options);
}
