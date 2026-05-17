import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarChangeReview } from "@/pages/collection/CollectionDailyCalendarChangeReview";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

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

const editableCalendarByDay = new Map<number, EditableCalendarDay>([
  [
    1,
    {
      day: 1,
      status: "HOLIDAY",
      leaveType: "OFF",
      note: "Company closed",
      isWorkingDay: false,
      isHoliday: true,
      holidayName: "OFF",
    },
  ],
  [
    2,
    {
      day: 2,
      status: "HOLIDAY",
      leaveType: null,
      note: "",
      isWorkingDay: false,
      isHoliday: true,
      holidayName: "",
    },
  ],
]);

test("CollectionDailyCalendarChangeReview summarizes dirty days and blocks incomplete leave saves", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarChangeReview, {
      days,
      editableCalendarByDay,
      dirtyCalendarDayNumbers: new Set([1, 2]),
      savingCalendar: false,
      onSaveCalendar: () => undefined,
    }),
  );

  assert.match(markup, /2 perubahan belum disimpan/);
  assert.match(markup, /01\/05\/2026/);
  assert.match(markup, /OFF/);
  assert.match(markup, /Company closed/);
  assert.match(markup, /Leave type belum dipilih/);
  assert.match(markup, /Ada kutipan pada tarikh ini/);
  assert.match(markup, /disabled=""/);
});

test("CollectionDailyCalendarChangeReview renders nothing without dirty days", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarChangeReview, {
      days,
      editableCalendarByDay,
      dirtyCalendarDayNumbers: new Set<number>(),
      savingCalendar: false,
      onSaveCalendar: () => undefined,
    }),
  );

  assert.equal(markup, "");
});
