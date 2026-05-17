import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import {
  buildCollectionDailyCalendarChangeReviewItems,
  describeEditableCalendarDayStatus,
} from "@/pages/collection/collection-daily-calendar-change-review-utils";

const overviewDays: CollectionDailyOverviewDay[] = [
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

function buildEditableDay(day: Partial<EditableCalendarDay> & Pick<EditableCalendarDay, "day">) {
  return {
    status: "WORKING",
    leaveType: null,
    note: "",
    isWorkingDay: true,
    isHoliday: false,
    holidayName: "",
    ...day,
  } satisfies EditableCalendarDay;
}

test("describeEditableCalendarDayStatus explains working, leave, and missing leave type states", () => {
  assert.deepEqual(describeEditableCalendarDayStatus(buildEditableDay({ day: 1 })), {
    label: "Working",
    detail: "Hari bekerja untuk nickname dipilih.",
    missingLeaveType: false,
  });
  assert.deepEqual(
    describeEditableCalendarDayStatus(buildEditableDay({
      day: 2,
      status: "HOLIDAY",
      leaveType: "MC",
    })),
    {
      label: "MC",
      detail: "Medical Checkup / Medical Leave",
      missingLeaveType: false,
    },
  );
  assert.equal(
    describeEditableCalendarDayStatus(buildEditableDay({ day: 3, status: "HOLIDAY" }))
      .missingLeaveType,
    true,
  );
});

test("buildCollectionDailyCalendarChangeReviewItems returns dirty days in calendar order", () => {
  const items = buildCollectionDailyCalendarChangeReviewItems({
    days: overviewDays,
    editableCalendarByDay: new Map([
      [1, buildEditableDay({ day: 1, status: "HOLIDAY", leaveType: "AL", note: "Annual leave" })],
      [2, buildEditableDay({ day: 2, status: "WORKING" })],
    ]),
    dirtyCalendarDayNumbers: new Set([2, 1]),
  });

  assert.deepEqual(items.map((item) => item.day), [1, 2]);
  assert.equal(items[0]?.label, "AL");
  assert.equal(items[0]?.note, "Annual leave");
  assert.equal(items[0]?.hasCollectionConflict, true);
  assert.equal(items[1]?.label, "Working");
});
