import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_RESTORE_TRANSACTION_PHASES,
  buildSlowRestoreTransactionLogMetadata,
  createBackupPayloadChunkReader,
  createBackupPayloadSectionReader,
  executeBackupRestorePhases,
  resolveBackupPayloadSourceKind,
  shouldLogSlowRestoreTransaction,
} from "../backups-restore-utils";
import type { BackupDataPayload } from "../backups-repository-types";
import type { BackupRestoreExecutor } from "../backups-restore-shared-utils";

type BackupCollectionRecord = NonNullable<BackupDataPayload["collectionRecords"]>[number];

async function collectChunkIds(
  chunks: AsyncIterable<Array<{ id: string }>>,
): Promise<string[][]> {
  const collected: string[][] = [];
  for await (const chunk of chunks) {
    collected.push(chunk.map((row) => row.id));
  }
  return collected;
}

function createBackupCollectionRecord(
  overrides?: Partial<BackupCollectionRecord>,
): BackupCollectionRecord {
  return {
    id: "record-1",
    customerName: "Alice",
    batch: "P10",
    paymentDate: "2026-03-31",
    amount: 10,
    receiptFile: null,
    createdByLogin: "staff.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: "2026-03-31T00:00:00.000Z",
    ...overrides,
  };
}

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

test("createBackupPayloadSectionReader reads top-level backup arrays from a raw JSON string", () => {
  const payloadJson = JSON.stringify({
    imports: [
      {
        id: "import-1",
        name: "March Backup",
        filename: "march.csv",
      },
    ],
    dataRows: [
      {
        id: "row-1",
        importId: "import-1",
        jsonDataJsonb: {
          note: "value with [brackets], {braces}, and \\\"quotes\\\"",
        },
      },
    ],
    users: [
      {
        username: "super.user",
        role: "superuser",
        passwordHash: "hash-1",
      },
    ],
    auditLogs: [
      {
        id: "audit-1",
        action: "CREATE_BACKUP",
        details: "{\"nested\":[1,2,3]}",
      },
    ],
    collectionRecords: [
      {
        id: "record-1",
        customerName: "Alice",
        paymentDate: "2026-03-31",
        amount: 10,
      },
    ],
    collectionRecordReceipts: [
      {
        id: "receipt-1",
        collectionRecordId: "record-1",
        storagePath: "receipts/receipt-1.pdf",
      },
    ],
  });

  const reader = createBackupPayloadSectionReader(payloadJson);

  assert.deepEqual(reader.getArray("imports"), [
    {
      id: "import-1",
      name: "March Backup",
      filename: "march.csv",
    },
  ]);
  assert.deepEqual(reader.getArray("dataRows"), [
    {
      id: "row-1",
      importId: "import-1",
      jsonDataJsonb: {
        note: "value with [brackets], {braces}, and \\\"quotes\\\"",
      },
    },
  ]);
  assert.equal(reader.getArray("users").length, 1);
  assert.equal(reader.getArray("auditLogs").length, 1);
  assert.equal(reader.getArray("collectionRecords").length, 1);
  assert.equal(reader.getArray("collectionRecordReceipts").length, 1);
});

test("createBackupPayloadSectionReader returns empty arrays for missing optional datasets", () => {
  const reader = createBackupPayloadSectionReader(JSON.stringify({
    imports: [],
    dataRows: [],
    users: [],
    auditLogs: [],
  }));

  assert.deepEqual(reader.getArray("collectionRecords"), []);
  assert.deepEqual(reader.getArray("collectionRecordReceipts"), []);
});

test("createBackupPayloadSectionReader iterates JSON array datasets in bounded chunks", async () => {
  const reader = createBackupPayloadSectionReader(JSON.stringify({
    imports: [],
    dataRows: [],
    users: [],
    auditLogs: [],
    collectionRecords: [
      { id: "record-1", customerName: "Alice", paymentDate: "2026-03-31", amount: 10 },
      { id: "record-2", customerName: "Bob", paymentDate: "2026-03-31", amount: 20 },
      { id: "record-3", customerName: "Cara", paymentDate: "2026-03-31", amount: 30 },
    ],
    collectionRecordReceipts: [],
  }));

  assert.deepEqual(
    await collectChunkIds(reader.iterateArrayChunks<{ id: string }>("collectionRecords", 2)),
    [["record-1", "record-2"], ["record-3"]],
  );
});

test("createBackupPayloadSectionReader iterates object-source datasets in bounded chunks", async () => {
  const payload: BackupDataPayload = {
    imports: [],
    dataRows: [],
    users: [],
    auditLogs: [],
    collectionRecords: [
      createBackupCollectionRecord(),
      createBackupCollectionRecord({ id: "record-2", customerName: "Bob", amount: 20 }),
      createBackupCollectionRecord({ id: "record-3", customerName: "Cara", amount: 30 }),
    ],
    collectionRecordReceipts: [],
  };
  const reader = createBackupPayloadSectionReader(payload);

  assert.deepEqual(
    await collectChunkIds(reader.iterateArrayChunks<{ id: string }>("collectionRecords", 2)),
    [["record-1", "record-2"], ["record-3"]],
  );
});

test("createBackupPayloadChunkReader hides eager array parsing for restore paths", async () => {
  const reader = createBackupPayloadChunkReader(JSON.stringify({
    imports: [],
    dataRows: [],
    users: [],
    auditLogs: [],
    collectionRecords: Array.from({ length: 5 }, (_, index) => ({
      id: `record-${index + 1}`,
      customerName: "Restore Row",
      paymentDate: "2026-03-31",
      amount: 10 + index,
    })),
    collectionRecordReceipts: [],
  }));

  assert.equal("getArray" in reader, false);
  assert.deepEqual(
    await collectChunkIds(reader.iterateArrayChunks<{ id: string }>("collectionRecords", 2)),
    [["record-1", "record-2"], ["record-3", "record-4"], ["record-5"]],
  );
});

test("createBackupPayloadChunkReader can stream restore chunks from an async JSON source", async () => {
  const payloadJson = JSON.stringify({
    imports: [{ id: "import-1" }],
    dataRows: [{ id: "row-1" }],
    users: [{ username: "super.user" }],
    auditLogs: [{ id: "audit-1" }],
    collectionRecords: Array.from({ length: 3 }, (_, index) => ({
      id: `record-${index + 1}`,
      customerName: "Restore Row",
      paymentDate: "2026-03-31",
      amount: 10 + index,
    })),
    collectionRecordReceipts: [{ id: "receipt-1", collectionRecordId: "record-1", storagePath: "receipt-1.jpg" }],
  });

  const reader = createBackupPayloadChunkReader((async function* () {
    yield payloadJson.slice(0, 41);
    yield payloadJson.slice(41, 119);
    yield payloadJson.slice(119);
  })());

  assert.deepEqual(
    await collectChunkIds(reader.iterateArrayChunks<{ id: string }>("collectionRecords", 2)),
    [["record-1", "record-2"], ["record-3"]],
  );
});

test("restore observability helpers classify payload sources and slow-threshold crossings", () => {
  assert.equal(resolveBackupPayloadSourceKind("{}"), "json-string");
  assert.equal(resolveBackupPayloadSourceKind({
    imports: [],
    dataRows: [],
    users: [],
    auditLogs: [],
  }), "structured-object");
  assert.equal(resolveBackupPayloadSourceKind((async function* () {
    yield "{}";
  })()), "json-stream");

  assert.equal(shouldLogSlowRestoreTransaction(15_000, 15_000), true);
  assert.equal(shouldLogSlowRestoreTransaction(14_999, 15_000), false);
});

test("restore observability log metadata stays aggregate-only and excludes warning payloads", () => {
  const metadata = buildSlowRestoreTransactionLogMetadata({
    durationMs: 18_500,
    maxPayloadBytes: 16_777_216,
    slowThresholdMs: 15_000,
    sourceKind: "json-string",
    stats: {
      imports: { inserted: 1, processed: 2, reactivated: 0, skipped: 1 },
      dataRows: { inserted: 3, processed: 3, reactivated: 0, skipped: 0 },
      users: { inserted: 1, processed: 1, reactivated: 0, skipped: 0 },
      auditLogs: { inserted: 5, processed: 5, reactivated: 0, skipped: 0 },
      collectionRecords: { inserted: 2, processed: 2, reactivated: 0, skipped: 0 },
      collectionRecordReceipts: { inserted: 2, processed: 2, reactivated: 0, skipped: 0 },
      warnings: ["record-1 missing optional receipt metadata"],
      totalProcessed: 15,
      totalInserted: 14,
      totalSkipped: 1,
      totalReactivated: 0,
    },
  });

  assert.equal(metadata.warningCount, 1);
  assert.equal("warnings" in metadata, false);
  assert.deepEqual(metadata.datasetStats.imports, {
    inserted: 1,
    processed: 2,
    reactivated: 0,
    skipped: 1,
  });
  assert.equal(metadata.stagedTransactions, BACKUP_RESTORE_TRANSACTION_PHASES.length);
});

test("executeBackupRestorePhases runs core and collection work in separate ordered transactions", async () => {
  const phases: string[] = [];
  const executedQueriesByPhase = new Map<string, string[]>();
  const reader = createBackupPayloadChunkReader({
    imports: [],
    dataRows: [],
    users: [],
    auditLogs: [],
    collectionRecords: [
      createBackupCollectionRecord({
        id: "11111111-1111-1111-1111-111111111111",
      }),
    ],
    collectionRecordReceipts: [],
  });
  const stats = {
    imports: { inserted: 0, processed: 0, reactivated: 0, skipped: 0 },
    dataRows: { inserted: 0, processed: 0, reactivated: 0, skipped: 0 },
    users: { inserted: 0, processed: 0, reactivated: 0, skipped: 0 },
    auditLogs: { inserted: 0, processed: 0, reactivated: 0, skipped: 0 },
    collectionRecords: { inserted: 0, processed: 0, reactivated: 0, skipped: 0 },
    collectionRecordReceipts: { inserted: 0, processed: 0, reactivated: 0, skipped: 0 },
    warnings: [],
    totalInserted: 0,
    totalProcessed: 0,
    totalReactivated: 0,
    totalSkipped: 0,
  };

  await executeBackupRestorePhases({
    backupDataReader: reader,
    maxTrackedRecordIds: 1_000,
    runTransaction: async (phase, operation) => {
      phases.push(phase);
      const executedQueries: string[] = [];
      executedQueriesByPhase.set(phase, executedQueries);
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
        "Unexpected insert() call during staged restore test.",
      );
      await operation(tx);
    },
    stats,
  });

  assert.deepEqual(phases, [
    "core-datasets",
    "collection-datasets",
  ]);
  assert.deepEqual(executedQueriesByPhase.get("core-datasets"), []);
  assert.equal(
    executedQueriesByPhase.get("collection-datasets")?.some((query) =>
      query.includes("CREATE TEMP TABLE sqr_restored_collection_record_ids"),
    ),
    true,
  );
  assert.equal(stats.collectionRecords.processed, 1);
  assert.equal(stats.collectionRecords.inserted, 1);
});
