import assert from "node:assert/strict";
import test from "node:test";
import { createBackupPayloadSectionReader } from "../backups-restore-utils";

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
