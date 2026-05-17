import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarConflictReportItems } from "@/pages/collection/collection-daily-calendar-conflict-report-utils";

const days: CollectionDailyOverviewDay[] = [
  {
    day: 1,
    date: "2026-05-01",
    amount: 100,
    target: 0,
    calendarStatus: "HOLIDAY",
    leaveType: "OFF",
    note: null,
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "OFF",
    customerCount: 1,
    status: "neutral",
  },
  {
    day: 2,
    date: "2026-05-02",
    amount: 50,
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
];

const editableDay: EditableCalendarDay = {
  day: 2,
  status: "HOLIDAY",
  leaveType: "AL",
  note: "",
  isWorkingDay: false,
  isHoliday: true,
  holidayName: "AL",
};

test("buildCollectionDailyCalendarConflictReportItems includes saved and draft conflicts", () => {
  const items = buildCollectionDailyCalendarConflictReportItems(
    days,
    new Map([[2, editableDay]]),
    new Set([2]),
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.source, "saved");
  assert.equal(items[1]?.source, "draft");
});
