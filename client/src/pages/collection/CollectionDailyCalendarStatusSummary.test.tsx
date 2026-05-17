import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarStatusSummary } from "@/pages/collection/CollectionDailyCalendarStatusSummary";
import { summarizeCollectionDailyCalendarStatus } from "@/pages/collection/collection-daily-calendar-summary-utils";

const days: CollectionDailyOverviewDay[] = [
  {
    day: 1,
    date: "2026-05-01",
    amount: 100,
    target: 100,
    calendarStatus: "WORKING",
    leaveType: null,
    note: null,
    isWorkingDay: true,
    isHoliday: false,
    holidayName: null,
    customerCount: 1,
    status: "green",
  },
  {
    day: 2,
    date: "2026-05-02",
    amount: 0,
    target: 100,
    calendarStatus: "HOLIDAY",
    leaveType: "AL",
    note: "Annual leave",
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "Annual leave",
    customerCount: 0,
    status: "neutral",
  },
  {
    day: 3,
    date: "2026-05-03",
    amount: 0,
    target: 100,
    calendarStatus: "HOLIDAY",
    leaveType: "OFF",
    note: "Company closed",
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "Company closed",
    customerCount: 0,
    status: "neutral",
  },
];

test("summarizeCollectionDailyCalendarStatus counts working, holiday, OFF, and dirty days", () => {
  assert.deepEqual(summarizeCollectionDailyCalendarStatus(days, new Set([2, 3])), {
    totalDays: 3,
    workingDays: 1,
    holidayDays: 2,
    offDays: 1,
    unsavedChanges: 2,
  });
});

test("CollectionDailyCalendarStatusSummary renders compact manager summary", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarStatusSummary, {
      days,
      dirtyCalendarDayNumbers: new Set([3]),
      canManage: true,
    }),
  );

  assert.match(markup, /Monthly daily status summary/);
  assert.match(markup, /Working/);
  assert.match(markup, /Holiday \/ Leave/);
  assert.match(markup, /OFF/);
  assert.match(markup, /Unsaved/);
  assert.match(markup, /changed day/);
});

test("CollectionDailyCalendarStatusSummary hides unsaved count for non-managers", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarStatusSummary, {
      days,
      dirtyCalendarDayNumbers: new Set([3]),
      canManage: false,
    }),
  );

  assert.doesNotMatch(markup, /Unsaved/);
});
