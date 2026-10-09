import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionRecordsToolbar, type CollectionRecordsToolbarProps } from "@/pages/collection-records/CollectionRecordsToolbar";
import { CollectionRecordsPurgeSummaryCard } from "@/pages/collection-records/CollectionRecordsPurgeSummaryCard";

function renderToolbar(overrides: Partial<CollectionRecordsToolbarProps> = {}) {
  return renderToStaticMarkup(createElement(CollectionRecordsToolbar, {
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
      ...overrides,
  }));
}

test("CollectionRecordsToolbar shows two useful totals and one export menu without duplicate pagination metrics", () => {
  const markup = renderToolbar();
  assert.match(markup, /Total Records/);
  assert.match(markup, /Total Collection Amount/);
  assert.match(markup, /<dl /);
  assert.equal((markup.match(/<dt /g) ?? []).length, 2);
  assert.doesNotMatch(markup, /Showing Now/);
  assert.match(markup, /View All/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, />Export</);
  assert.match(markup, /Showing 51-100 of 146 records/);
  assert.match(markup, /Page 2 \/ 3/);
  assert.match(markup, /role="group" aria-label="Record Actions"/);
  assert.doesNotMatch(markup, /shadow-sm/);
  assert.doesNotMatch(markup, /Manual Purge/);
});

test("collection export remains disabled while records load or either download is running", () => {
  for (const overrides of [{ loadingRecords: true }, { exportingExcel: true }, { exportingPdf: true }]) {
    const markup = renderToolbar(overrides);
    const exportButton = markup.match(/<button[^>]*aria-haspopup="menu"[^>]*>/)?.[0];
    assert.ok(exportButton);
    assert.match(exportButton, /disabled=""/);
  }
  const source = readFileSync("client/src/pages/collection-records/CollectionRecordsToolbar.tsx", "utf8");
  for (const callback of ["onExportExcel", "onExportPdf"]) {
    assert.ok(source.includes(`disabled={loadingRecords || exportBusy} onSelect={${callback}}`));
  }
  assert.match(source, /ref=\{exportTriggerRef\}/);
  assert.match(source, /if \(exportTriggerRef\.current\?\.disabled\)/);
  assert.match(source, /restoreExportFocus\.current = true/);
  assert.match(source, /document\.activeElement === document\.body \|\| document\.activeElement === trigger/);
  assert.match(source, /trigger\.focus\(\{ preventScroll: true \}\)/);
});

test("collection export describes all pages with applied filters without promising a stale row count", () => {
  for (const summary of [{ totalRecords: 146, totalAmount: 82900 }, { totalRecords: 0, totalAmount: 0 }]) {
    const markup = renderToolbar({ summary });
    const exportButton = markup.match(/<button[^>]*aria-haspopup="menu"[^>]*>/)?.[0];
    const scope = markup.match(/<p[^>]*id="collection-records-export-scope"[^>]*>(.*?)<\/p>/)?.[0];
    assert.ok(exportButton);
    assert.ok(scope);
    assert.match(exportButton, /aria-describedby="collection-records-export-scope"/);
    assert.doesNotMatch(exportButton, /disabled=/);
    assert.match(scope, /Excel and PDF include records across all pages using the filters last applied to the table\./);
    assert.doesNotMatch(scope, /sr-only|\b146\b|\b0\b/);
    assert.doesNotMatch(markup, /id="collection-records-export-disabled-reason"/);
  }
});

test("collection export gives a visible reason for each existing disabled state", () => {
  for (const [overrides, message] of [
    [{ loadingRecords: true }, "Wait for records to finish loading before exporting."],
    [{ exportingExcel: true }, "Your export is being prepared. Please wait before starting another."],
    [{ exportingPdf: true }, "Your export is being prepared. Please wait before starting another."],
    [{ loadingRecords: true, exportingPdf: true }, "Your export is being prepared. Please wait before starting another."],
  ] as const) {
    const markup = renderToolbar(overrides);
    const exportButton = markup.match(/<button[^>]*aria-haspopup="menu"[^>]*>/)?.[0];
    const reason = markup.match(/<p[^>]*id="collection-records-export-disabled-reason"[^>]*>(.*?)<\/p>/)?.[0];
    assert.ok(exportButton);
    assert.ok(reason);
    assert.match(exportButton, /aria-describedby="collection-records-export-scope collection-records-export-disabled-reason"/);
    assert.match(reason, /role="status"/);
    assert.doesNotMatch(reason, /sr-only/);
    assert.ok(reason.includes(message));
  }
});

test("purge disclosure retains cutoff, amount and guarded destructive action", () => {
  const renderPurge = (eligibleRecords: number) => renderToStaticMarkup(createElement(CollectionRecordsPurgeSummaryCard, {
    loadingRecords: false,
    purgeSummaryLoading: false,
    purgingOldRecords: false,
    purgeSummary: { cutoffDate: "2026-03-23", eligibleRecords, totalAmount: 1234.5 },
    onOpenPurgeDialog: () => undefined,
  }));
  const markup = renderPurge(3);
  assert.match(markup, /<details class=/);
  assert.doesNotMatch(markup, /<details[^>]* open/);
  assert.match(markup, /<summary[^>]*>Manual Purge Data Lama/);
  assert.match(markup, /3 eligible/);
  assert.match(markup, /2026-03-23/);
  assert.match(markup, /RM\s*1,234\.50/);
  assert.match(markup, /Purge &gt; 6 Months/);
  assert.doesNotMatch(markup, /disabled=""/);
  assert.match(renderPurge(0), /disabled=""/);
});
