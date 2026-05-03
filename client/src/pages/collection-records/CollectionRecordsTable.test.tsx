import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionRecord } from "@/lib/api";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";

const collectionRecord: CollectionRecord = {
  id: "record-1",
  customerName: "Siti Aminah",
  icNumber: "880101105432",
  customerPhone: "0123456789",
  accountNumber: "ACC-7788",
  batch: "P10",
  paymentDate: "2026-05-12",
  amount: "1250.00",
  receiptFile: null,
  receipts: [
    {
      id: "receipt-1",
      collectionRecordId: "record-1",
      storagePath: "/receipts/receipt-1.jpg",
      originalFileName: "receipt-1.jpg",
      originalMimeType: "image/jpeg",
      originalExtension: ".jpg",
      fileSize: 1024,
      receiptAmount: "1250.00",
      extractedAmount: "1250.00",
      extractionStatus: "suggested",
      extractionConfidence: 0.98,
      receiptDate: "2026-05-12",
      receiptReference: "REF-001",
      fileHash: "hash-1",
      createdAt: "2026-05-12T02:00:00.000Z",
    },
  ],
  archivedReceipts: [],
  receiptTotalAmount: "1250.00",
  receiptValidationStatus: "matched",
  receiptValidationMessage: "Matched",
  receiptCount: 1,
  duplicateReceiptFlag: false,
  createdByLogin: "superuser",
  collectionStaffNickname: "SW.AFIQAH_1332",
  createdAt: "2026-05-12T02:00:00.000Z",
  updatedAt: "2026-05-12T02:10:00.000Z",
};

test("CollectionRecordsTable renders a solid desktop table with clear actions", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionRecordsTable, {
      loadingRecords: false,
      visibleRecords: [collectionRecord],
      paginatedRecords: [collectionRecord],
      pageOffset: 0,
      canEdit: true,
      onViewReceipt: () => undefined,
      onEdit: () => undefined,
      onDelete: () => undefined,
      canDeleteRow: () => true,
    }),
  );

  assert.match(markup, /rounded-\[1\.5rem\] border border-border\/60 bg-background/);
  assert.match(markup, /Loading records table\.\.\./);
  assert.doesNotMatch(markup, /bg-background\/40/);
});
