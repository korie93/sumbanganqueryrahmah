import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyDayDetailsEmptyState } from "@/pages/collection/CollectionDailyDayDetailsEmptyState";
import { CollectionDailyDayDetailsFooter } from "@/pages/collection/CollectionDailyDayDetailsFooter";
import { CollectionDailyDayDetailsPendingSummary, CollectionDailyDayDetailsRecordState } from "@/pages/collection/CollectionDailyDayDetailsDialog";
import { CollectionDailyDayDetailsStickySummary } from "@/pages/collection/CollectionDailyDayDetailsStickySummary";
import { CollectionDailyDayDetailsSummary } from "@/pages/collection/CollectionDailyDayDetailsSummary";
import { CollectionDailyRecordCard, resolveTargetProgressPercent } from "@/pages/collection/CollectionDailyDayDetailsDialogParts";
import { formatAmountRM } from "@/pages/collection/utils";

const baseDayDetails: CollectionDailyDayDetailsResponse = {
  ok: true,
  username: "ali",
  usernames: ["Ali"],
  date: "2026-05-15",
  status: "neutral",
  message: "No collection records for this date.",
  amount: 1234.5,
  dailyTarget: 2000,
  customers: [],
  summary: {
    monthlyTarget: 100000,
    collected: 1234.5,
    balanced: 765.5,
    totalForDate: 1234.5,
    targetForDate: 2000,
  },
  pagination: {
    page: 1,
    pageSize: 10,
    totalRecords: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  records: [],
};

const holidayDay: CollectionDailyOverviewDay = {
  day: 15,
  date: "2026-05-15",
  amount: 1234.5,
  target: 2000,
  calendarStatus: "HOLIDAY",
  leaveType: "OFF",
  note: "Company closed for event",
  isWorkingDay: false,
  isHoliday: true,
  holidayName: "OFF",
  customerCount: 0,
  status: "neutral",
};

test("CollectionDailyDayDetailsStickySummary keeps counts and operational status without repeating date or amounts", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayDetailsStickySummary, {
      customerCount: 3,
      dayDetails: {
        ...baseDayDetails,
        pagination: { ...baseDayDetails.pagination, totalRecords: 7 },
      },
      selectedOverviewDay: holidayDay,
    }),
  );

  assert.match(markup, /Ringkasan hari/);
  assert.match(markup, /role="group" aria-label="Ringkasan hari kutipan yang sedang dilihat"/);
  assert.doesNotMatch(markup, /15\/05\/2026/);
  assert.match(markup, /OFF - Company Closed/);
  assert.match(markup, /rekod/);
  assert.match(markup, /pelanggan/);
  assert.doesNotMatch(markup, /RM|ringkasan hari<|bg-rose|text-rose|bg-emerald/);
  assert.match(markup, />7</);
  assert.match(markup, />3</);
});

test("CollectionDailyDayDetailsEmptyState explains no-record days without duplicating the visible remark", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayDetailsEmptyState, {
      dayDetails: baseDayDetails,
      selectedOverviewDay: holidayDay,
    }),
  );

  assert.match(markup, /Tiada kutipan direkodkan untuk tarikh ini/);
  assert.match(markup, /OFF - Company Closed/);
  assert.match(markup, /Tidak dikira sebagai working day/);
  assert.doesNotMatch(markup, /Company closed for event/);
  assert.match(markup, /No collection records for this date/);
});

test("CollectionDailyDayDetailsFooter renders localized pagination controls", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayDetailsFooter, {
      dayDetails: {
        ...baseDayDetails,
        pagination: {
          page: 2,
          pageSize: 10,
          totalRecords: 25,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: true,
        },
      },
      isMobile: false,
      loadingDayDetails: false,
      onChangePage: () => undefined,
      recordRangeLabel: "Paparan 11-20 daripada 25 rekod",
      selectedDate: "2026-05-15",
    }),
  );

  assert.match(markup, /Paparan 11-20 daripada 25 rekod/);
  assert.match(markup, /Halaman 2 daripada 3/);
  assert.match(markup, /Sebelumnya/);
  assert.match(markup, /Seterusnya/);
  assert.match(markup, /<nav[^>]*collection-day-pagination/);
  assert.match(markup, /collection-day-pagination-buttons/);
  assert.doesNotMatch(markup, /flex-col/);
});

test("daily footer retains navigation geometry with disabled controls before details arrive", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayDetailsFooter, {
    dayDetails: null, isMobile: true, loadingDayDetails: true, onChangePage: () => undefined,
    recordRangeLabel: "Tiada rekod", selectedDate: "2026-05-15",
  }));
  assert.match(markup, /Memuatkan halaman rekod/);
  assert.match(markup, /Halaman belum tersedia/);
  assert.equal((markup.match(/disabled=""/g) || []).length, 2);
  assert.equal((markup.match(/min-h-11/g) || []).length, 2);
  assert.doesNotMatch(markup, /Halaman 0|daripada 0|Tiada rekod/);
});

test("pending daily summary preserves three metric labels without invented financial values", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayDetailsPendingSummary));
  for (const label of ["Target", "Kutipan", "Baki", "Ringkasan harian belum dimuatkan"]) assert.ok(markup.includes(label));
  assert.equal((markup.match(/class="collection-day-metric-value"/g) || []).length, 3);
  assert.doesNotMatch(markup, /RM|0\.00|<progress/);
});

test("daily record loading is announced locally and retry is offered only after failure", () => {
  const loading = renderToStaticMarkup(createElement(CollectionDailyDayDetailsRecordState, {
    loading: true, hasError: false, onRetry: () => undefined,
  }));
  assert.match(loading, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(loading, /Memuatkan maklumat harian/);
  assert.doesNotMatch(loading, /<button|Cuba lagi/);
  const error = renderToStaticMarkup(createElement(CollectionDailyDayDetailsRecordState, {
    loading: false, hasError: true, onRetry: () => undefined,
  }));
  assert.match(error, /Rekod kutipan tidak dapat dimuatkan/);
  assert.match(error, /min-h-11/);
  assert.match(error, /Cuba lagi/);
  assert.doesNotMatch(error, /animate-spin/);
});

test("day financial summary shows exactly three complete amounts and one progress indicator", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayDetailsSummary, {
    balancedAmount: 765.5,
    dayDetails: baseDayDetails,
    targetProgressPercent: 62,
  }));

  assert.equal((markup.match(/class="collection-day-metric-value"/g) || []).length, 3);
  assert.equal((markup.match(/<progress /g) || []).length, 1);
  for (const amount of [2000, 1234.5, 765.5]) assert.ok(markup.includes(formatAmountRM(amount)));
  assert.match(markup, /collection-day-metric--collected/);
  assert.doesNotMatch(markup, /truncate|text-ellipsis|Records|customers|No collection records/);
});

test("day financial summary preserves large amount precision instead of truncating the value", () => {
  const amount = 9876543210.99;
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayDetailsSummary, {
    balancedAmount: 0,
    dayDetails: { ...baseDayDetails, amount, dailyTarget: 10000000000 },
    targetProgressPercent: resolveTargetProgressPercent(amount, 10000000000),
  }));
  assert.ok(markup.includes(formatAmountRM(amount)));
  assert.doesNotMatch(markup, /truncate|text-ellipsis/);
});

test("missing daily target explains the state without a misleading percentage", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayDetailsSummary, {
    balancedAmount: 0,
    dayDetails: { ...baseDayDetails, dailyTarget: 0 },
    targetProgressPercent: resolveTargetProgressPercent(baseDayDetails.amount, 0),
  }));
  assert.match(markup, /Tiada target harian ditetapkan/);
  assert.doesNotMatch(markup, /<progress|%/);
});

test("updating or stale data is explained visibly rather than only in a hover title", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayDetailsSummary, {
    balancedAmount: 0,
    dayDetails: { ...baseDayDetails, freshness: {
      status: "stale", pendingCount: 2, runningCount: 0, retryCount: 1,
      oldestPendingAgeMs: 121000, message: "Rollup is being refreshed; totals may change.",
    } },
    targetProgressPercent: 100,
  }));
  assert.match(markup, /role="status"/);
  assert.match(markup, /Rollup is being refreshed; totals may change/);
});

const dailyRecord: CollectionDailyDayDetailsResponse["records"][number] = {
  id: "record-synthetic-1", customerName: "Synthetic Customer", accountNumber: "SYNTHETIC-ACCOUNT-1234",
  paymentDate: "2026-05-15", amount: 1234.5, batch: "P10", paymentReference: "SYNTHETIC-PAYMENT-REFERENCE",
  username: "synthetic.user", collectionStaffNickname: "Synthetic Collector", createdAt: "2026-05-15T03:15:00Z",
  receiptFile: null, receipts: [],
};

test("compact record cards preserve all metadata without bordered nested detail boxes", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyRecordCard, {
    isMobile: true, loadingReceiptKey: null, onViewReceipt: () => undefined, record: dailyRecord,
  }));
  for (const value of [dailyRecord.customerName, dailyRecord.accountNumber, dailyRecord.paymentReference,
    dailyRecord.username, dailyRecord.collectionStaffNickname, dailyRecord.batch, formatAmountRM(dailyRecord.amount)]) {
    assert.ok(markup.includes(value), value);
  }
  assert.match(markup, /15\/05\/2026/);
  assert.match(markup, /collection-day-record-details-grid/);
  assert.match(markup, /No stored receipt for this record/);
  assert.doesNotMatch(markup, /Stored Receipts|rounded-lg border|truncate/);
});

test("stored receipt buttons keep file identity and receipt-specific loading state", () => {
  const record = { ...dailyRecord, receipts: [{
    id: "receipt-synthetic-1", storagePath: "/not-a-real-file", originalFileName: "synthetic-receipt.pdf",
    originalMimeType: "application/pdf", fileSize: 2048, createdAt: "2026-05-15T03:15:00Z",
  }] };
  const markup = renderToStaticMarkup(createElement(CollectionDailyRecordCard, {
    isMobile: false, loadingReceiptKey: "record-synthetic-1:receipt-synthetic-1", onViewReceipt: () => undefined, record,
  }));
  assert.match(markup, /Stored Receipts/);
  assert.match(markup, /View stored receipt synthetic-receipt.pdf for Synthetic Customer/);
  assert.match(markup, /PDF/);
  assert.match(markup, /disabled=""/);
});

test("target progress math remains clamped with unchanged over-target and missing-target handling", () => {
  assert.equal(resolveTargetProgressPercent(1234.5, 2000), 62);
  assert.equal(resolveTargetProgressPercent(2500, 2000), 100);
  assert.equal(resolveTargetProgressPercent(-1, 2000), 0);
  assert.equal(resolveTargetProgressPercent(100, 0), 100);
  assert.equal(resolveTargetProgressPercent(0, 0), 0);
});
