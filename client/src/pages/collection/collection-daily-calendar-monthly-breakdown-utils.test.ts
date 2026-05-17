import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { summarizeCollectionDailyCalendarMonthlyBreakdown } from "@/pages/collection/collection-daily-calendar-monthly-breakdown-utils";

const days: CollectionDailyOverviewDay[] = [
  {
    day: 1,
    date: "2026-05-01",
    amount: 100,
    target: 0,
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
    amount: 20,
    target: 0,
    calendarStatus: "HOLIDAY",
    leaveType: "MC",
    note: null,
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "MC",
    customerCount: 1,
    status: "neutral",
  },
];

test("summarizeCollectionDailyCalendarMonthlyBreakdown totals status and conflict data", () => {
  const summary = summarizeCollectionDailyCalendarMonthlyBreakdown(days);
  assert.equal(summary.workingDays, 1);
  assert.equal(summary.holidayDays, 1);
  assert.equal(summary.workingAmount, 100);
  assert.equal(summary.holidayAmount, 20);
  assert.equal(summary.conflictDays, 1);
  assert.equal(summary.leaveTypeCounts.MC, 1);
});
