import assert from "node:assert/strict";
import test from "node:test";
import {
  createBackupPayloadChunkReader,
  createBackupPayloadSectionReader,
} from "../backups-restore-utils";
import type { BackupDataPayload } from "../backups-repository-types";

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
