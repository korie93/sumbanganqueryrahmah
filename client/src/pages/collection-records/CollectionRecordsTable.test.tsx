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

test("record loading preserves its exact accessible status markup", () => {
  const markup = renderToStaticMarkup(createElement(CollectionRecordsTable, {
    loadingRecords: true,
    visibleRecords: [collectionRecord],
    paginatedRecords: [collectionRecord],
    pageOffset: 0,
    canEdit: false,
    onViewReceipt: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
    canDeleteRow: () => false,
  }));
  const status = markup.match(/<div role="status"[^>]*>[^<]*<\/div>/g);
  assert.deepEqual(status, ['<div role="status" class="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Loading records...</div>']);
  assert.doesNotMatch(markup, /<button\b|data-record-trigger|role="dialog"/);
});

test("mobile collection opens details through the name and respects action access", () => {
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
    assert.match(markup, /<button[^>]*aria-haspopup="dialog"[^>]*>Siti Aminah<\/button>/);
    assert.doesNotMatch(markup, /<details|<summary|role="dialog"/);
    assert.match(markup, /00009007199254740993/);
    assert.deepEqual([...markup.matchAll(/<dt[^>]*>(.*?)<\/dt>/g)].map((match) => match[1]), ["Nombor kad", "Nombor akaun", "Jumlah dibayar", "Tarikh bayaran"]);
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
      viewMode: "full",
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

test("full records table explains an unverified payment with a duplicate receipt", () => {
  const record = {
    ...collectionRecord, amount: "140.00", totalDue: "40.00",
    cpStatus: "unverified" as const, duplicateReceiptFlag: true,
  };
  const markup = renderToStaticMarkup(createElement(CollectionRecordsDesktopTable, {
    viewMode: "full", loadingRecords: false, visibleRecords: [record], paginatedRecords: [record],
    pageOffset: 0, canEdit: false, onViewReceipt: () => {}, onEdit: () => {},
    onDelete: () => {}, canDeleteRow: () => false,
  }));
  assert.match(markup, /Unverified · Semak resit pendua<\/td>/);
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
          ...(layout === "desktop" ? { viewMode: "full" as const } : {}),
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
      const identifiers = ["00009007199254740993", firstRecord.accountNumber];
      if (layout === "desktop") identifiers.push(firstRecord.icNumber, firstRecord.customerPhone);
      for (const identifier of identifiers) {
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

function renderDesktopRecords(overrides: Partial<CollectionRecordsTableProps> & { viewMode?: "compact" | "full" } = {}) {
  return renderToStaticMarkup(createElement(CollectionRecordsDesktopTable, {
    loadingRecords: false,
    visibleRecords: [collectionRecord],
    paginatedRecords: [{ ...collectionRecord, accountNumber: "0000007788", cardNumber: "00009007199254740993" }],
    pageOffset: 0,
    canEdit: true,
    canDeleteRow: () => true,
    onViewReceipt: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
    ...overrides,
  }));
}

function getDesktopHeaders(markup: string) {
  // Customer Name shares its header with the page-selection control.
  return Array.from(markup.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g),
    ([, content]) => content!.split(/<[^>]+>/).join("").trim());
}

test("desktop defaults to eight compact columns with complete authorized Account and Card strings", () => {
  const markup = renderDesktopRecords();
  assert.match(markup, /<div class="table-scroll-frame\b[^"]*"><div[^>]*role="region"[^>]*>/);
  assert.deepEqual(getDesktopHeaders(markup), [
    "No.", "Nama pelanggan", "Kad / Akaun", "Jumlah", "Tarikh bayaran", "Resit", "Nama panggilan staf", "Tindakan",
  ]);
  assert.match(markup, /collection-records-table--compact min-w-\[64rem\] table-fixed/);
  assert.match(markup, /<dt[^>]*>Nombor akaun<\/dt><dd>0000007788<\/dd>/);
  assert.match(markup, /<dt[^>]*>Nombor kad<\/dt><dd>00009007199254740993<\/dd>/);
  assert.match(markup, /<dl class="space-y-1\.5 whitespace-normal wrap-anywhere"/);
  assert.match(markup, /<td[^>]*whitespace-normal wrap-anywhere[^>]*>SW\.AFIQAH_1332<\/td>/);
  assert.doesNotMatch(markup, /880101105432|0123456789|No\. kad pengenalan|Telefon pelanggan|Jumlah perlu dibayar/);
  assert.match(markup, />View<\/button>/);
  assert.match(markup, /aria-label="Actions for record 1"/);
  assert.equal((markup.match(/<td\b/g) ?? []).length, 8);
});

test("full desktop view retains all eighteen columns and full supplied record values", () => {
  const markup = renderDesktopRecords({ viewMode: "full" });
  assert.deepEqual(getDesktopHeaders(markup), [
    "No.", "Nama pelanggan", "Nombor kad", "Nombor akaun", "Jumlah", "Tarikh bayaran", "Resit", "No. kad pengenalan", "Telefon pelanggan", "Kelompok",
    "Jumlah perlu dibayar", "Prinsipal bil (OSP)", "Status CP", "Tempoh tunggakan", "Padanan", "Nama panggilan staf", "Fail sumber", "Tindakan",
  ]);
  assert.equal((markup.match(/<td\b/g) ?? []).length, 18);
  for (const value of ["0000007788", "00009007199254740993", collectionRecord.icNumber, collectionRecord.customerPhone]) {
    assert.ok(markup.includes(value));
  }
  assert.match(markup, /min-w-\[2140px\]/);
  assert.doesNotMatch(markup, /collection-records-table--compact/);
});

for (const viewMode of ["compact", "full"] as const) {
  test(`${viewMode} desktop leaves masked data masked and uses a neutral amount color`, () => {
    const markup = renderDesktopRecords({
      viewMode,
      paginatedRecords: [{ ...collectionRecord, accountNumber: "••••7788", cardNumber: "••••0993" }],
    });
    assert.match(markup, /••••7788/);
    assert.match(markup, /••••0993/);
    assert.doesNotMatch(markup, /0000007788|00009007199254740993|text-success/);
    assert.match(markup, /<td[^>]*font-medium tabular-nums text-right text-foreground[^>]*>RM\s*1,250\.00<\/td>/);
  });
}

test("compact desktop omits Actions when no row is editable or deletable without losing receipt access", () => {
  const markup = renderDesktopRecords({ canEdit: false, canDeleteRow: () => false });
  assert.equal(getDesktopHeaders(markup).length, 7);
  assert.equal((markup.match(/<td\b/g) ?? []).length, 7);
  assert.doesNotMatch(markup, /Tindakan|Actions|collection-records-table-actions|collection-records-table-scroll--actions/);
  assert.match(markup, />View<\/button>/);
  for (const access of [{ canEdit: true, canDeleteRow: () => false }, { canEdit: false, canDeleteRow: () => true }]) {
    const allowedMarkup = renderDesktopRecords(access);
    assert.equal(getDesktopHeaders(allowedMarkup).length, 8);
    assert.match(allowedMarkup, /aria-label="Actions for record 1"/);
  }
});

test("compact desktop retains per-row delete checks and last-opened markers by stable ID", () => {
  const secondRecord = { ...collectionRecord, id: "record-2" };
  const markup = renderDesktopRecords({
    canEdit: false,
    canDeleteRow: (record) => record.id === secondRecord.id,
    visibleRecords: [collectionRecord, secondRecord],
    paginatedRecords: [collectionRecord, secondRecord],
    lastViewedRecordId: secondRecord.id,
  });
  assert.equal(getDesktopHeaders(markup).length, 8);
  assert.doesNotMatch(markup, /aria-label="Actions for record 1"/);
  assert.match(markup, /aria-label="Actions for record 2"/);
  const rows = markup.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];
  const highlightedRows = rows.filter((row) => row.includes('data-last-viewed="true"'));
  assert.equal(highlightedRows.length, 1);
  assert.match(highlightedRows[0]!, /aria-label="Collection record 2,/);
  assert.equal((markup.match(/Last opened record/g) ?? []).length, 1);
});

test("compact desktop uses existing placeholders for missing Account or Card identifiers", () => {
  const markup = renderDesktopRecords({ paginatedRecords: [{ ...collectionRecord, accountNumber: "", cardNumber: null }] });
  assert.match(markup, /<dt[^>]*>Nombor akaun<\/dt><dd>-<\/dd>/);
  assert.match(markup, /<dt[^>]*>Nombor kad<\/dt><dd>-<\/dd>/);
});
