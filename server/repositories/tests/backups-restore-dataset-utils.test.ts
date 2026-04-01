import assert from "node:assert/strict";
import test from "node:test";
import {
  createRestoreStats,
  initializeRestoreTrackingTempTable,
  restoreCollectionRecordsFromBackup,
  syncRestoredCollectionReceiptCache,
} from "../backups-restore-dataset-utils";

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) {
    return "";
  }
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Array.isArray(chunk)) {
    return chunk.map((item) => flattenSqlChunk(item)).join("");
  }
  if (typeof chunk === "object") {
    const value = (chunk as { value?: unknown; queryChunks?: unknown[] }).value;
    if (value !== undefined) {
      return flattenSqlChunk(value);
    }
    const queryChunks = (chunk as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(queryChunks)) {
      return queryChunks.map((item) => flattenSqlChunk(item)).join("");
    }
  }
  return "";
}

function normalizeSqlText(query: unknown): string {
  return flattenSqlChunk(query).replace(/\s+/g, " ").trim();
}

test("collection restore tracks restored record ids through a temp table before receipt cache sync", async () => {
  const executedQueries: string[] = [];
  const tx = {
    async execute(query: unknown) {
      const sqlText = normalizeSqlText(query);
      executedQueries.push(sqlText);

      if (sqlText.includes("INSERT INTO public.collection_records")) {
        return {
          rows: [{ id: "11111111-1111-1111-1111-111111111111" }],
        };
      }

      return { rows: [] };
    },
    insert() {
      throw new Error("Unexpected insert() call during collection restore test.");
    },
  };
  const backupDataReader = {
    getArray() {
      return [];
    },
    *iterateArrayChunks<T>(key: string): Generator<T[]> {
      if (key !== "collectionRecords") {
        return;
      }

      yield [
        {
          id: "11111111-1111-1111-1111-111111111111",
          customerName: "Alice Tan",
          icNumber: "900101015555",
          customerPhone: "0123000001",
          accountNumber: "ACC-1001",
          batch: "P10",
          paymentDate: "2026-03-31",
          amount: 100,
          receiptFile: null,
          receiptTotalAmount: "100.00",
          receiptValidationStatus: "matched",
          receiptValidationMessage: null,
          receiptCount: 1,
          duplicateReceiptFlag: false,
          createdByLogin: "system",
          collectionStaffNickname: "Collector Alpha",
          staffUsername: "Collector Alpha",
          createdAt: "2026-03-31T08:00:00.000Z",
        } as T,
      ];
    },
  };
  const stats = createRestoreStats();

  await initializeRestoreTrackingTempTable(tx as any);
  await restoreCollectionRecordsFromBackup(tx as any, backupDataReader as any, stats);
  await syncRestoredCollectionReceiptCache(tx as any);

  const createTempTableIndex = executedQueries.findIndex((query) =>
    query.includes("CREATE TEMP TABLE sqr_restored_collection_record_ids"),
  );
  const trackIdsIndex = executedQueries.findIndex((query) =>
    query.includes("INSERT INTO sqr_restored_collection_record_ids"),
  );
  const insertRecordsIndex = executedQueries.findIndex((query) =>
    query.includes("INSERT INTO public.collection_records"),
  );
  const syncReceiptCacheIndex = executedQueries.findIndex((query) =>
    query.includes("SELECT id FROM sqr_restored_collection_record_ids"),
  );

  assert.ok(createTempTableIndex >= 0);
  assert.ok(trackIdsIndex > createTempTableIndex);
  assert.ok(insertRecordsIndex > trackIdsIndex);
  assert.ok(syncReceiptCacheIndex > insertRecordsIndex);
  assert.equal(stats.collectionRecords.processed, 1);
  assert.equal(stats.collectionRecords.inserted, 1);
  assert.equal(stats.collectionRecords.skipped, 0);
});
