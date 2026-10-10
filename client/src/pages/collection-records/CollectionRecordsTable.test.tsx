import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionRecord } from "@/lib/api";
import { CollectionRecordsTable, type CollectionRecordsTableProps } from "@/pages/collection-records/CollectionRecordsTable";
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

for (const layout of ["desktop", "mobile"] as const) {
  test(`${layout} collection highlights only the last opened stable record ID`, () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { innerWidth: layout === "mobile" ? 390 : 1280, matchMedia: () => ({ matches: layout === "mobile" }) },
    });
    try {
      const firstRecord = { ...collectionRecord, cardNumber: "00009007199254740993" };
      // Customer details can repeat; only the record ID identifies the opened row.
      const secondRecord = { ...firstRecord, id: "record-2" };
      const render = (overrides: Partial<CollectionRecordsTableProps> = {}) => renderToStaticMarkup(
        createElement(layout === "mobile" ? CollectionRecordsTable : CollectionRecordsDesktopTable, {
          loadingRecords: false,
          visibleRecords: [firstRecord, secondRecord],
          paginatedRecords: [firstRecord, secondRecord],
          pageOffset: 50,
          canEdit: false,
          canDeleteRow: () => false,
          onViewReceipt: () => undefined,
          onEdit: () => undefined,
          onDelete: () => undefined,
          ...overrides,
        }),
      );
      const getHighlightedRecord = (markup: string) => {
        const records = markup.match(layout === "mobile" ? /<article\b[\s\S]*?<\/article>/g : /<tr\b[\s\S]*?<\/tr>/g) ?? [];
        return records.filter((recordMarkup) => recordMarkup.includes('data-last-viewed="true"'));
      };

      for (const markup of [render(), render({ lastViewedRecordId: undefined }), render({ lastViewedRecordId: null }), render({ lastViewedRecordId: "missing-record" })]) {
        assert.equal(getHighlightedRecord(markup).length, 0);
        assert.doesNotMatch(markup, /Last opened record/);
      }

      const markup = render({ lastViewedRecordId: secondRecord.id });
      const highlightedRecords = getHighlightedRecord(markup);
      assert.equal(highlightedRecords.length, 1);
      assert.match(highlightedRecords[0]!, /aria-label="Collection record 52,/);
      assert.match(highlightedRecords[0]!, /<span class="sr-only">Last opened record<\/span>/);
      assert.equal((markup.match(/Last opened record/g) ?? []).length, 1);
      assert.doesNotMatch(markup, /aria-selected|data-state="selected"/);
      for (const identifier of ["00009007199254740993", firstRecord.icNumber, firstRecord.customerPhone, firstRecord.accountNumber]) {
        assert.ok(highlightedRecords[0]!.includes(identifier));
      }

      const reordered = render({ paginatedRecords: [secondRecord, firstRecord], pageOffset: 0, lastViewedRecordId: secondRecord.id });
      const reorderedHighlight = getHighlightedRecord(reordered);
      assert.equal(reorderedHighlight.length, 1);
      assert.match(reorderedHighlight[0]!, /aria-label="Collection record 1,/);
      assert.equal(getHighlightedRecord(render({ paginatedRecords: [firstRecord], lastViewedRecordId: secondRecord.id })).length, 0);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
}
