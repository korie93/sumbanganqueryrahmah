import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyDayStatusNotice } from "@/pages/collection/CollectionDailyDayStatusNotice";

const baseDayDetails: CollectionDailyDayDetailsResponse = {
  ok: true,
  username: "ali",
  usernames: ["Ali"],
  date: "2026-05-15",
  status: "neutral",
  message: "No collection records for this date.",
  amount: 0,
  dailyTarget: 0,
  customers: [],
  summary: {
    monthlyTarget: 0,
    collected: 0,
    balanced: 0,
    totalForDate: 0,
    targetForDate: 0,
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
  amount: 0,
  target: 0,
  calendarStatus: "HOLIDAY",
  leaveType: "AL",
  note: "Annual leave approved by superuser",
  isWorkingDay: false,
  isHoliday: true,
  holidayName: "AL",
  customerCount: 0,
  status: "neutral",
};

test("CollectionDailyDayStatusNotice highlights leave type and superuser remark", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayStatusNotice, {
      day: holidayDay,
      dayDetails: baseDayDetails,
    }),
  );

  assert.match(markup, /Daily Calendar Status/);
  assert.match(markup, /AL - Annual Leave/);
  assert.match(markup, /AL - Annual Leave/);
  assert.match(markup, /Remark Superuser/);
  assert.match(markup, /Annual leave approved by superuser/);
  assert.match(markup, /Nickname: Ali/);
});

test("CollectionDailyDayStatusNotice keeps working days clear without fake leave data", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayStatusNotice, {
      day: {
        ...holidayDay,
        calendarStatus: "WORKING",
        leaveType: null,
        note: null,
        isWorkingDay: true,
        isHoliday: false,
        holidayName: null,
        status: "green",
      },
      dayDetails: baseDayDetails,
    }),
  );

  assert.match(markup, /Working/);
  assert.match(markup, /Tidak berkaitan/);
  assert.match(markup, /Dikira sebagai working day/);
  assert.match(markup, /Tiada remark daripada superuser untuk tarikh ini/);
});
