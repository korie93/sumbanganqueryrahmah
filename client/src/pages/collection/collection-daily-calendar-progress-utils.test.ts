import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import {
  getCollectionDailyCalendarProgressBand,
  getCollectionDailyCalendarProgressPercent,
} from "@/pages/collection/collection-daily-calendar-progress-utils";

function makeDay(amount: number, target: number): CollectionDailyOverviewDay {
  return {
    day: 1,
    date: "2026-05-01",
    amount,
    target,
    calendarStatus: "WORKING",
    leaveType: null,
    note: null,
    isWorkingDay: true,
    isHoliday: false,
    holidayName: null,
    customerCount: 1,
    status: "green",
  };
}

test("calendar progress percent is bounded and defensive", () => {
  assert.equal(getCollectionDailyCalendarProgressPercent(makeDay(0, 1000)), 0);
  assert.equal(getCollectionDailyCalendarProgressPercent(makeDay(250, 1000)), 25);
  assert.equal(getCollectionDailyCalendarProgressPercent(makeDay(1500, 1000)), 100);
  assert.equal(getCollectionDailyCalendarProgressPercent(makeDay(100, 0)), 100);
  assert.equal(getCollectionDailyCalendarProgressPercent(makeDay(0, 0)), 0);
});

test("calendar progress band maps visual states predictably", () => {
  assert.equal(getCollectionDailyCalendarProgressBand(makeDay(0, 1000)), "empty");
  assert.equal(getCollectionDailyCalendarProgressBand(makeDay(300, 1000)), "low");
  assert.equal(getCollectionDailyCalendarProgressBand(makeDay(700, 1000)), "medium");
  assert.equal(getCollectionDailyCalendarProgressBand(makeDay(950, 1000)), "high");
  assert.equal(getCollectionDailyCalendarProgressBand(makeDay(1000, 1000)), "complete");
});
