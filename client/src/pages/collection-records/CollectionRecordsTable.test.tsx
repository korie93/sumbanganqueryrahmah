import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionRecord } from "@/lib/api";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";
import { CollectionRecordsDesktopTable } from "@/pages/collection-records/CollectionRecordsDesktopTable";

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

  assert.match(markup, /rounded-lg border border-border bg-card/);
  assert.match(markup, /Loading records table\.\.\./);
  assert.doesNotMatch(markup, /bg-background\/40/);
});

test("mobile collection keeps complete record fields under details and respects action access", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: 390, matchMedia: () => ({ matches: true }) },
  });
  try {
    const render = (canEdit: boolean, canDelete: boolean) => renderToStaticMarkup(
      createElement(CollectionRecordsTable, {
        loadingRecords: false,
        visibleRecords: [collectionRecord],
        paginatedRecords: [{ ...collectionRecord, cardNumber: "00009007199254740993" }],
        pageOffset: 0,
        canEdit,
        onViewReceipt: () => undefined,
        onEdit: () => undefined,
        onDelete: () => undefined,
        canDeleteRow: () => canDelete,
      }),
    );
    const markup = render(true, true);
    assert.match(markup, /<details/);
    assert.match(markup, /<summary[^>]*>Record details/);
    assert.match(markup, /00009007199254740993/);
    assert.match(markup, /880101105432/);
    assert.match(markup, /0123456789/);
    assert.match(markup, /Billing Principal \(OSP\)/);
    assert.match(markup, /View Receipt/);
    assert.match(markup, /aria-label="Actions for record 1"/);
    assert.doesNotMatch(render(false, false), /aria-label="Actions for record/);
    assert.match(render(false, true), /aria-label="Actions for record 1"/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("desktop collection preserves full identifiers and receipt access with permission-aware action menus", () => {
  const render = (canEdit: boolean, canDelete: boolean) => renderToStaticMarkup(
    createElement(CollectionRecordsDesktopTable, {
      loadingRecords: false,
      visibleRecords: [collectionRecord],
      paginatedRecords: [{ ...collectionRecord, cardNumber: "00009007199254740993" }],
      pageOffset: 50,
      canEdit,
      canDeleteRow: () => canDelete,
      onViewReceipt: () => undefined,
      onEdit: () => undefined,
      onDelete: () => undefined,
    }),
  );
  const markup = render(true, true);
  assert.match(markup, /00009007199254740993/);
  assert.match(markup, /880101105432/);
  assert.match(markup, /0123456789/);
  assert.match(markup, /aria-label="Actions for record 51"/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, />View<\/button>/);
  assert.doesNotMatch(render(false, false), /aria-label="Actions for record/);
  assert.match(render(false, true), /aria-label="Actions for record 51"/);
});
