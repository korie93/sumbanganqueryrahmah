import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionMonthlySummary } from "@/lib/api";
import { CollectionSummaryBarChartDialog } from "@/pages/collection-summary/CollectionSummaryBarChartDialog";
import { CollectionSummaryBarChartDialogContent } from "@/pages/collection-summary/CollectionSummaryBarChartDialogContent";

const summaryRows: CollectionMonthlySummary[] = [
  { month: 1, monthName: "January", totalRecords: 0, totalAmount: 0 },
  { month: 2, monthName: "February", totalRecords: 7, totalAmount: 7000 },
  { month: 3, monthName: "March", totalRecords: 3, totalAmount: 1500 },
];

test("CollectionSummaryBarChartDialog renders an accessible non-submit chart trigger", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionSummaryBarChartDialog, {
      loading: false,
      summaryRows,
      selectedYear: "2026",
      selectedNicknameLabel: "Semua staff",
      selectedNicknamesCount: 0,
      grandTotal: {
        totalRecords: 10,
        totalAmount: 8500,
      },
    }),
  );

  assert.match(markup, /type="button"/);
  assert.match(markup, /aria-label="Lihat graf bar ringkasan kutipan"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, />Graf bar</);
});

test("CollectionSummaryBarChartDialogContent renders chart context from summary rows", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionSummaryBarChartDialogContent, {
      loading: false,
      summaryRows,
      selectedYear: "2026",
      selectedNicknameLabel: "Semua staff",
      selectedNicknamesCount: 0,
      grandTotal: {
        totalRecords: 10,
        totalAmount: 8500,
      },
    }),
  );

  assert.match(markup, /role="img"/);
  assert.match(markup, /Collection summary bar chart for 2026, Semua staff/);
  assert.match(markup, /Chart total/);
  assert.match(markup, /Peak month/);
  assert.match(markup, /February/);
  assert.match(markup, /Collection summary chart data/);
  assert.match(markup, /March: RM(?:&nbsp;|\u00a0| )1,500\.00, 3 record\(s\)/);
});

test("CollectionSummaryBarChartDialogContent keeps loading and empty states accessible", () => {
  const loadingMarkup = renderToStaticMarkup(
    createElement(CollectionSummaryBarChartDialogContent, {
      loading: true,
      summaryRows,
      selectedYear: "2026",
      selectedNicknameLabel: "Semua staff",
      selectedNicknamesCount: 0,
      grandTotal: {
        totalRecords: 10,
        totalAmount: 8500,
      },
    }),
  );
  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /Loading collection summary chart/);

  const emptyMarkup = renderToStaticMarkup(
    createElement(CollectionSummaryBarChartDialogContent, {
      loading: false,
      summaryRows: [
        { month: 1, monthName: "January", totalRecords: 0, totalAmount: 0 },
        { month: 2, monthName: "February", totalRecords: 0, totalAmount: 0 },
      ],
      selectedYear: "2026",
      selectedNicknameLabel: "Semua staff",
      selectedNicknamesCount: 0,
      grandTotal: {
        totalRecords: 0,
        totalAmount: 0,
      },
    }),
  );
  assert.match(emptyMarkup, /role="status"/);
  assert.match(emptyMarkup, /No collection data to chart/);
  assert.doesNotMatch(emptyMarkup, /role="img"/);
});
