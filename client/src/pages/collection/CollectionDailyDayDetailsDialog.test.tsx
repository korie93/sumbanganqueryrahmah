import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyDayDetailsEmptyState } from "@/pages/collection/CollectionDailyDayDetailsEmptyState";
import { CollectionDailyDayDetailsFooter } from "@/pages/collection/CollectionDailyDayDetailsFooter";
import { CollectionDailyDayDetailsStickySummary } from "@/pages/collection/CollectionDailyDayDetailsStickySummary";

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

test("CollectionDailyDayDetailsStickySummary keeps core day context visible", () => {
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
  assert.match(markup, /15\/05\/2026/);
  assert.match(markup, /OFF - Company Closed/);
  assert.match(markup, /Kutipan/);
  assert.match(markup, /Rekod/);
  assert.match(markup, /Customer/);
  assert.match(markup, />7</);
  assert.match(markup, />3</);
});

test("CollectionDailyDayDetailsEmptyState explains no-record days with status and remark", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayDetailsEmptyState, {
      dayDetails: baseDayDetails,
      selectedOverviewDay: holidayDay,
    }),
  );

  assert.match(markup, /Tiada kutipan direkodkan untuk tarikh ini/);
  assert.match(markup, /OFF - Company Closed/);
  assert.match(markup, /Tidak dikira sebagai working day/);
  assert.match(markup, /Company closed for event/);
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
});
