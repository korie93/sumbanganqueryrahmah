import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import {
  buildCollectionDailyCalendarFilterOptions,
  filterCollectionDailyCalendarDays,
  getCollectionDailyCalendarFilterStatusText,
  matchesCollectionDailyCalendarFilter,
} from "@/pages/collection/collection-daily-calendar-filter-utils";

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

test("collection daily calendar filters match working, holiday, OFF, and unsaved days", () => {
  const dirtyDays = new Set([3]);

  assert.equal(matchesCollectionDailyCalendarFilter(days[0], "working", dirtyDays), true);
  assert.equal(matchesCollectionDailyCalendarFilter(days[1], "holiday", dirtyDays), true);
  assert.equal(matchesCollectionDailyCalendarFilter(days[2], "off", dirtyDays), true);
  assert.equal(matchesCollectionDailyCalendarFilter(days[2], "unsaved", dirtyDays), true);
  assert.deepEqual(
    filterCollectionDailyCalendarDays(days, "off", dirtyDays).map((day) => day.day),
    [3],
  );
});

test("buildCollectionDailyCalendarFilterOptions hides unsaved option from non-managers", () => {
  const managerOptions = buildCollectionDailyCalendarFilterOptions(days, new Set([2, 3]), true);
  const userOptions = buildCollectionDailyCalendarFilterOptions(days, new Set([2, 3]), false);

  assert.deepEqual(
    managerOptions.map((option) => `${option.id}:${option.count}`),
    ["all:3", "working:1", "holiday:2", "off:1", "unsaved:2"],
  );
  assert.equal(userOptions.some((option) => option.id === "unsaved"), false);
});

test("getCollectionDailyCalendarFilterStatusText keeps all and filtered copy clear", () => {
  assert.equal(getCollectionDailyCalendarFilterStatusText("all", 3, 3), "Showing all 3 days.");
  assert.equal(
    getCollectionDailyCalendarFilterStatusText("off", 1, 3),
    "1 of 3 days match this filter.",
  );
});
