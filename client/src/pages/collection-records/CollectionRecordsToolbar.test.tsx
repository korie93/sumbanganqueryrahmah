import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionRecordsToolbar } from "@/pages/collection-records/CollectionRecordsToolbar";

test("CollectionRecordsToolbar renders compact summary, actions, and pagination surfaces", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionRecordsToolbar, {
      summary: { totalRecords: 146, totalAmount: 82900 },
      loadingRecords: false,
      viewAllLoading: false,
      exportingExcel: false,
      exportingPdf: false,
      canPurgeOldRecords: false,
      purgeSummaryLoading: false,
      purgingOldRecords: false,
      purgeSummary: null,
      pagedStart: 51,
      pagedEnd: 100,
      totalRecords: 146,
      tablePage: 2,
      totalPages: 3,
      tablePageSize: 50,
      hasNextPage: true,
      hasPreviousPage: true,
      onOpenViewAll: () => undefined,
      onOpenPurgeDialog: () => undefined,
      onExportExcel: () => undefined,
      onExportPdf: () => undefined,
      onTablePageSizeChange: () => undefined,
      onPrevPage: () => undefined,
      onNextPage: () => undefined,
    }),
  );

  assert.match(markup, /Total Records/);
  assert.match(markup, /Total Collection Amount/);
  assert.match(markup, /Showing Now/);
  assert.match(markup, /Actions/);
  assert.match(markup, /View All/);
  assert.match(markup, /Export Excel/);
  assert.match(markup, /Export PDF/);
  assert.match(markup, /Showing 51-100 of 146 records/);
  assert.match(markup, /Page 2 \/ 3/);
  assert.match(markup, /rounded-2xl border border-border\/60 bg-background p-3 shadow-sm/);
});
