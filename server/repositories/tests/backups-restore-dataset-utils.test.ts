import assert from "node:assert/strict";
import test from "node:test";
import {
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
} from "../../lib/collection-pii-encryption";
import {
  createRestoreStats,
  initializeRestoreTrackingTempTable,
  restoreCollectionRecordsFromBackup,
  syncRestoredCollectionReceiptCache,
} from "../backups-restore-dataset-utils";
import {
  normalizeBackupCollectionReceipt,
  normalizeBackupCollectionRecord,
} from "../backups-restore-collection-datasets-utils";
import type {
  BackupCollectionReceipt,
  BackupCollectionRecord,
} from "../backups-repository-types";
import type {
  BackupPayloadChunkReader,
  BackupRestoreExecutor,
} from "../backups-restore-shared-utils";

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

function createBackupRestoreExecutor(
  execute: (query: unknown) => Promise<{ rows: unknown[] }>,
  insertMessage: string,
): BackupRestoreExecutor {
  return {
    execute: execute as BackupRestoreExecutor["execute"],
    insert() {
      throw new Error(insertMessage);
    },
  } as unknown as BackupRestoreExecutor;
}

function createCollectionRecordReader(
  records: BackupCollectionRecord[],
): BackupPayloadChunkReader {
  return {
    async *iterateArrayChunks<T>(key: string): AsyncGenerator<T[]> {
      if (key !== "collectionRecords") {
        return;
      }

      yield records as unknown as T[];
    },
  };
}

async function withCollectionPiiEncryptionKey<T>(secret: string, fn: () => Promise<T> | T): Promise<T> {
  const previous = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = secret;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previous;
    }
  }
}

test("collection restore tracks restored record ids through a temp table before receipt cache sync", async () => {
  const executedQueries: string[] = [];
  const tx = createBackupRestoreExecutor(
    async (query: unknown) => {
      const sqlText = normalizeSqlText(query);
      executedQueries.push(sqlText);

      if (sqlText.includes("INSERT INTO public.collection_records")) {
        return {
          rows: [{ id: "11111111-1111-1111-1111-111111111111" }],
        };
      }

      return { rows: [] };
    },
    "Unexpected insert() call during collection restore test.",
  );
  const backupDataReader = createCollectionRecordReader([
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
      receiptTotalAmountCents: 10000,
      receiptValidationStatus: "matched",
      receiptValidationMessage: null,
      receiptCount: 1,
      duplicateReceiptFlag: false,
      createdByLogin: "system",
      collectionStaffNickname: "Collector Alpha",
      staffUsername: "Collector Alpha",
      createdAt: "2026-03-31T08:00:00.000Z",
    },
  ]);
  const stats = createRestoreStats();

  await initializeRestoreTrackingTempTable(tx);
  await restoreCollectionRecordsFromBackup(tx, backupDataReader, stats);
  await syncRestoredCollectionReceiptCache(tx);

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

test("collection restore batches temp-table tracking and inserts for large restore chunks", async () => {
  const executedQueries: string[] = [];
  const tx = createBackupRestoreExecutor(
    async (query: unknown) => {
      const sqlText = normalizeSqlText(query);
      executedQueries.push(sqlText);

      if (sqlText.includes("INSERT INTO public.collection_records")) {
        const insertedRows = (sqlText.match(/::uuid/g) ?? []).length;
        return {
          rows: Array.from({ length: insertedRows }, (_, index) => ({ id: `record-${index + 1}` })),
        };
      }

      return { rows: [] };
    },
    "Unexpected insert() call during collection restore batching test.",
  );
  const largeChunk = Array.from({ length: 205 }, (_, index) => ({
    id: `11111111-1111-1111-1111-${String(index + 1).padStart(12, "0")}`,
    customerName: `Customer ${index + 1}`,
    icNumber: `90010101${String(index + 1).padStart(4, "0")}`,
    customerPhone: `012300${String(index + 1).padStart(4, "0")}`,
    accountNumber: `ACC-${index + 1}`,
    batch: "P10",
    paymentDate: "2026-03-31",
    amount: 100,
    receiptFile: null,
    receiptTotalAmountCents: 10000,
    receiptValidationStatus: "matched",
    receiptValidationMessage: null,
    receiptCount: 1,
    duplicateReceiptFlag: false,
    createdByLogin: "system",
    collectionStaffNickname: "Collector Alpha",
    staffUsername: "Collector Alpha",
    createdAt: "2026-03-31T08:00:00.000Z",
  }));
  const backupDataReader = createCollectionRecordReader(largeChunk);
  const stats = createRestoreStats();

  await initializeRestoreTrackingTempTable(tx);
  await restoreCollectionRecordsFromBackup(tx, backupDataReader, stats);

  assert.equal(
    executedQueries.filter((query) => query.includes("INSERT INTO sqr_restored_collection_record_ids")).length,
    2,
  );
  assert.equal(
    executedQueries.filter((query) => query.includes("INSERT INTO public.collection_records")).length,
    2,
  );
  assert.equal(stats.collectionRecords.processed, 205);
  assert.equal(stats.collectionRecords.inserted, 205);
  assert.equal(stats.collectionRecords.skipped, 0);
});

test("normalizeBackupCollectionRecord keeps restore fallbacks stable", () => {
  const restoredRecord = normalizeBackupCollectionRecord({
    id: "11111111-1111-1111-1111-111111111111",
    customerName: "",
    customerNameSearchHashes: ["hash.customer.al", "hash.customer.alice"],
    icNumber: "",
    customerPhone: "",
    accountNumber: "",
    batch: "",
    paymentDate: new Date("2026-03-31T08:00:00.000Z"),
    amount: "12.50",
    receiptFile: "",
    receiptTotalAmountCents: 1234,
    receiptTotalAmount: "12.34",
    receiptValidationStatus: "",
    receiptValidationMessage: "  Review manually  ",
    receiptCount: -4,
    duplicateReceiptFlag: true,
    createdByLogin: "",
    collectionStaffNickname: "",
    staffUsername: "Staff Alpha",
    createdAt: "2026-03-30T08:00:00.000Z",
  } as unknown as BackupCollectionRecord);

  assert.ok(restoredRecord);
  assert.equal(restoredRecord.customerName, "-");
  assert.deepEqual(restoredRecord.customerNameSearchHashes, ["hash.customer.al", "hash.customer.alice"]);
  assert.equal(restoredRecord.paymentDate, "2026-03-31");
  assert.equal(restoredRecord.amount, 12.5);
  assert.equal(restoredRecord.receiptFile, null);
  assert.equal(restoredRecord.receiptTotalAmount, 1234);
  assert.equal(restoredRecord.receiptValidationStatus, "needs_review");
  assert.equal(restoredRecord.receiptValidationMessage, "Review manually");
  assert.equal(restoredRecord.receiptCount, 0);
  assert.equal(restoredRecord.collectionStaffNickname, "Staff Alpha");
  assert.equal(restoredRecord.staffUsername, "Staff Alpha");

  assert.equal(
    normalizeBackupCollectionRecord({
      paymentDate: null,
    } as unknown as BackupCollectionRecord),
    null,
  );
});

test("normalizeBackupCollectionRecord can recover PII from encrypted backup fields", async () => {
  await withCollectionPiiEncryptionKey("collection-pii-secret-2026", async () => {
    const restoredRecord = normalizeBackupCollectionRecord({
      id: "33333333-3333-3333-3333-333333333333",
      customerName: "",
      customerNameEncrypted: encryptCollectionPiiFieldValue("Encrypted Alice"),
      customerNameSearchHashes: ["hash.customer.al", "hash.customer.alice"],
      icNumber: "",
      icNumberEncrypted: encryptCollectionPiiFieldValue("900101019999"),
      customerPhone: "",
      customerPhoneEncrypted: encryptCollectionPiiFieldValue("0123999999"),
      accountNumber: "",
      accountNumberEncrypted: encryptCollectionPiiFieldValue("ACC-ENC-1"),
      batch: "P10",
      paymentDate: "2026-03-31",
      amount: "25.50",
      receiptFile: null,
      receiptTotalAmountCents: 2550,
      createdByLogin: "system",
      collectionStaffNickname: "Collector Alpha",
      staffUsername: "staff.alpha",
      createdAt: "2026-03-31T08:00:00.000Z",
    });

    assert.ok(restoredRecord);
    assert.equal(restoredRecord?.customerName, "Encrypted Alice");
    assert.deepEqual(restoredRecord?.customerNameSearchHashes, ["hash.customer.al", "hash.customer.alice"]);
    assert.equal(restoredRecord?.icNumber, "900101019999");
    assert.equal(restoredRecord?.customerPhone, "0123999999");
    assert.equal(restoredRecord?.accountNumber, "ACC-ENC-1");
  });
});

test("collection restore recomputes customer-name blind indexes instead of trusting stale backup hashes", async () => {
  await withCollectionPiiEncryptionKey("collection-pii-secret-2026", async () => {
    const executedQueries: string[] = [];
    const tx = createBackupRestoreExecutor(
      async (query: unknown) => {
        const sqlText = normalizeSqlText(query);
        executedQueries.push(sqlText);

        if (sqlText.includes("INSERT INTO public.collection_records")) {
          return {
            rows: [{ id: "11111111-1111-1111-1111-111111111111" }],
          };
        }

        return { rows: [] };
      },
      "Unexpected insert() call during collection restore hash recompute test.",
    );
    const backupDataReader = createCollectionRecordReader([
      {
        id: "11111111-1111-1111-1111-111111111111",
        customerName: "",
        customerNameEncrypted: encryptCollectionPiiFieldValue("Encrypted Alice"),
        customerNameSearchHashes: ["stale.hash.value"],
        icNumber: "900101015555",
        customerPhone: "0123000001",
        accountNumber: "ACC-1001",
        batch: "P10",
        paymentDate: "2026-03-31",
        amount: 100,
        receiptFile: null,
        receiptTotalAmountCents: 10000,
        receiptValidationStatus: "matched",
        receiptValidationMessage: null,
        receiptCount: 1,
        duplicateReceiptFlag: false,
        createdByLogin: "system",
        collectionStaffNickname: "Collector Alpha",
        staffUsername: "Collector Alpha",
        createdAt: "2026-03-31T08:00:00.000Z",
      },
    ]);
    const stats = createRestoreStats();

    await initializeRestoreTrackingTempTable(tx);
    await restoreCollectionRecordsFromBackup(tx, backupDataReader, stats);

    const insertQuery = executedQueries.find((query) => query.includes("INSERT INTO public.collection_records"));
    assert.ok(insertQuery);
    assert.equal(insertQuery?.includes("stale.hash.value"), false);
    for (const hash of hashCollectionCustomerNameSearchTerms("Encrypted Alice") || []) {
      assert.equal(insertQuery?.includes(hash), true);
    }
  });
});

test("normalizeBackupCollectionReceipt keeps receipt restore fallbacks stable", () => {
  const restoredReceipt = normalizeBackupCollectionReceipt({
    id: "22222222-2222-2222-2222-222222222222",
    collectionRecordId: "11111111-1111-1111-1111-111111111111",
    storagePath: "collection-receipts/receipt.pdf",
    originalFileName: "",
    originalMimeType: "",
    originalExtension: ".PDF",
    fileSize: 1234,
    receiptAmountCents: 505,
    receiptAmount: "5.05",
    extractedAmountCents: null,
    extractedAmount: "",
    extractionStatus: "",
    extractionConfidence: "0.42",
    receiptDate: new Date("2026-03-31T08:00:00.000Z"),
    receiptReference: "  Ref-100  ",
    fileHash: "  ABCDEF  ",
    createdAt: "2026-03-31T08:00:00.000Z",
  });

  assert.ok(restoredReceipt);
  assert.equal(restoredReceipt.originalFileName, "receipt");
  assert.equal(restoredReceipt.originalMimeType, "application/octet-stream");
  assert.equal(restoredReceipt.receiptAmount, 505);
  assert.equal(restoredReceipt.extractedAmount, null);
  assert.equal(restoredReceipt.extractionStatus, "unprocessed");
  assert.equal(restoredReceipt.extractionConfidence, 0.42);
  assert.equal(restoredReceipt.receiptDate, "2026-03-31");
  assert.equal(restoredReceipt.receiptReference, "Ref-100");
  assert.equal(restoredReceipt.fileHash, "abcdef");

  assert.equal(
    normalizeBackupCollectionReceipt({
      collectionRecordId: "11111111-1111-1111-1111-111111111111",
      storagePath: "",
    } as unknown as BackupCollectionReceipt),
    null,
  );
});
