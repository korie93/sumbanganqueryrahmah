import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { COLLECTION_RECEIPT_DIR } from "../../lib/collection-receipt-files";
import {
  pruneMissingCollectionReceiptRelation,
  resolveSelectedCollectionReceipt,
} from "../collection-receipt-relation-utils";

test("collection receipt relation helpers prefer hydrated receipt matches before hitting storage", async () => {
  let getByIdCalls = 0;
  let listCalls = 0;
  const hydratedReceipt = {
    id: "receipt-1",
    collectionRecordId: "record-1",
    storagePath: "/uploads/collection-receipts/receipt-1.pdf",
    originalFileName: "receipt-1.pdf",
    originalMimeType: "application/pdf",
    originalExtension: ".pdf",
    fileSize: 256,
    receiptAmount: null,
    extractedAmount: null,
    extractionStatus: "unprocessed" as const,
    extractionConfidence: null,
    receiptDate: null,
    receiptReference: null,
    fileHash: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const selected = await resolveSelectedCollectionReceipt({
    storage: {
      listCollectionRecordReceipts: async () => {
        listCalls += 1;
        return [];
      },
      getCollectionRecordReceiptById: async () => {
        getByIdCalls += 1;
        return null as never;
      },
      createCollectionRecordReceipts: async () => [],
      deleteCollectionRecordReceipts: async () => [],
    },
    record: {
      id: "record-1",
      receipts: [hydratedReceipt],
    },
    receiptIdRaw: "receipt-1",
  });

  assert.equal(selected?.id, "receipt-1");
  assert.equal(getByIdCalls, 0);
  assert.equal(listCalls, 0);
});

test("collection receipt relation helpers promote legacy receipt files into receipt rows when needed", async () => {
  const fileName = `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const absolutePath = path.join(COLLECTION_RECEIPT_DIR, fileName);
  const storagePath = `/uploads/collection-receipts/${fileName}`;
  const createdRows: Array<Record<string, unknown>> = [];
  let listCalls = 0;

  await fs.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });
  await fs.writeFile(absolutePath, Buffer.from("legacy-receipt"));

  try {
    const selected = await resolveSelectedCollectionReceipt({
      storage: {
        listCollectionRecordReceipts: async () => {
          listCalls += 1;
          if (listCalls === 1) {
            return [];
          }

          return [
            {
              id: "receipt-promoted",
              collectionRecordId: "record-legacy",
              storagePath,
              originalFileName: fileName,
              originalMimeType: "application/pdf",
              originalExtension: ".pdf",
              fileSize: 14,
              receiptAmount: null,
              extractedAmount: null,
              extractionStatus: "unprocessed" as const,
              extractionConfidence: null,
              receiptDate: null,
              receiptReference: null,
              fileHash: null,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          ];
        },
        getCollectionRecordReceiptById: async () => null as never,
        createCollectionRecordReceipts: async (_recordId, rows) => {
          createdRows.push(...rows);
          return [];
        },
        deleteCollectionRecordReceipts: async () => [],
      },
      record: {
        id: "record-legacy",
        receiptFile: storagePath,
        receipts: [],
        createdAt: "2026-02-01T12:00:00.000Z",
      },
      receiptIdRaw: null,
    });

    assert.equal(selected?.id, "receipt-promoted");
    assert.equal(createdRows.length, 1);
    assert.equal(createdRows[0].storagePath, storagePath);
    assert.equal(createdRows[0].originalMimeType, "application/pdf");
    assert.equal(createdRows[0].originalExtension, ".pdf");
    assert.equal(createdRows[0].fileSize, Buffer.byteLength("legacy-receipt"));
  } finally {
    await fs.rm(absolutePath, { force: true });
  }
});

test("collection receipt relation prune helper skips synthetic legacy ids and deletes normalized relation ids", async () => {
  const deleted: Array<{ recordId: string; receiptIds: string[] }> = [];

  await pruneMissingCollectionReceiptRelation({
    storage: {
      listCollectionRecordReceipts: async () => [],
      getCollectionRecordReceiptById: async () => null as never,
      createCollectionRecordReceipts: async () => [],
      deleteCollectionRecordReceipts: async (recordId, receiptIds) => {
        deleted.push({ recordId, receiptIds });
        return [];
      },
    },
    recordId: "record-1",
    receipt: {
      id: "legacy-record-1",
      collectionRecordId: "record-1",
      storagePath: "/uploads/collection-receipts/legacy.pdf",
      originalFileName: "legacy.pdf",
      originalMimeType: "application/pdf",
      originalExtension: ".pdf",
      fileSize: 0,
      receiptAmount: null,
      extractedAmount: null,
      extractionStatus: "unprocessed",
      extractionConfidence: null,
      receiptDate: null,
      receiptReference: null,
      fileHash: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  await pruneMissingCollectionReceiptRelation({
    storage: {
      listCollectionRecordReceipts: async () => [],
      getCollectionRecordReceiptById: async () => null as never,
      createCollectionRecordReceipts: async () => [],
      deleteCollectionRecordReceipts: async (recordId, receiptIds) => {
        deleted.push({ recordId, receiptIds });
        return [];
      },
    },
    recordId: "record-2",
    receipt: {
      id: " receipt-2 ",
      collectionRecordId: "record-2",
      storagePath: "/uploads/collection-receipts/receipt-2.pdf",
      originalFileName: "receipt-2.pdf",
      originalMimeType: "application/pdf",
      originalExtension: ".pdf",
      fileSize: 0,
      receiptAmount: null,
      extractedAmount: null,
      extractionStatus: "unprocessed",
      extractionConfidence: null,
      receiptDate: null,
      receiptReference: null,
      fileHash: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  assert.equal(deleted.length, 1);
  assert.deepEqual(deleted[0], {
    recordId: "record-2",
    receiptIds: ["receipt-2"],
  });
});
