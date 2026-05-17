import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarAttentionSummary } from "@/pages/collection/collection-daily-calendar-attention-summary-utils";

const days: CollectionDailyOverviewDay[] = [
  {
    day: 1,
    date: "2026-05-01",
    amount: 1200,
    target: 1000,
    calendarStatus: "HOLIDAY",
    leaveType: "OFF",
    note: "Company closed",
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "OFF",
    customerCount: 2,
    status: "neutral",
  },
  {
    day: 2,
    date: "2026-05-02",
    amount: 0,
    target: 1000,
    calendarStatus: "WORKING",
    leaveType: null,
    note: null,
    isWorkingDay: true,
    isHoliday: false,
    holidayName: null,
    customerCount: 0,
    status: "red",
  },
];

const editableDays = new Map<number, EditableCalendarDay>();

test("attention summary prioritizes holiday collection conflicts", () => {
  const summary = buildCollectionDailyCalendarAttentionSummary({
    days,
    editableCalendarByDay: editableDays,
    dirtyCalendarDayNumbers: new Set<number>(),
    todayKey: "2026-05-03",
  });

  assert.equal(summary.tone, "warning");
  assert.equal(summary.holidayWithCollectionCount, 1);
  assert.equal(summary.workingWithoutCollectionCount, 1);
  assert.match(summary.description, /Holiday\/OFF/);
});

test("attention summary reports unsaved changes when no conflict exists", () => {
  const summary = buildCollectionDailyCalendarAttentionSummary({
    days: [days[1]],
    editableCalendarByDay: new Map([
      [
        2,
        {
          day: 2,
          status: "HOLIDAY",
          leaveType: "AL",
          note: "",
          isWorkingDay: false,
          isHoliday: true,
          holidayName: "AL",
        },
      ],
    ]),
    dirtyCalendarDayNumbers: new Set([2]),
    todayKey: "2026-05-01",
  });

  assert.equal(summary.tone, "notice");
  assert.equal(summary.unsavedChangesCount, 1);
  assert.match(summary.description, /belum disimpan/);
});
