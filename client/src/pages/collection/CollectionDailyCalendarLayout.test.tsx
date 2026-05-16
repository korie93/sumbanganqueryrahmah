import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarEditPanel } from "@/pages/collection/CollectionDailyCalendarEditPanel";
import { CollectionDailyDesktopCalendarGrid } from "@/pages/collection/CollectionDailyDesktopCalendarGrid";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

const overviewDays: CollectionDailyOverviewDay[] = [
  {
    day: 1,
    date: "2026-05-01",
    amount: 1500,
    target: 1000,
    calendarStatus: "WORKING",
    leaveType: null,
    note: null,
    isWorkingDay: true,
    isHoliday: false,
    holidayName: null,
    customerCount: 2,
    status: "green",
  },
  {
    day: 2,
    date: "2026-05-02",
    amount: 0,
    target: 1000,
    calendarStatus: "HOLIDAY",
    leaveType: "AL",
    note: "Annual leave",
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "AL",
    customerCount: 0,
    status: "neutral",
  },
];

const editableDays = new Map<number, EditableCalendarDay>([
  [
    1,
    {
      day: 1,
      status: "WORKING",
      leaveType: null,
      note: "",
      isWorkingDay: true,
      isHoliday: false,
      holidayName: "",
    },
  ],
  [
    2,
    {
      day: 2,
      status: "HOLIDAY",
      leaveType: "AL",
      note: "Annual leave",
      isWorkingDay: false,
      isHoliday: true,
      holidayName: "AL",
    },
  ],
]);

test("CollectionDailyDesktopCalendarGrid keeps day cards compact with a separate edit action", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDesktopCalendarGrid, {
      days: overviewDays,
      firstWeekday: 0,
      selectedDate: null,
      editingDayNumber: 2,
      canManage: true,
      editableCalendarByDay: editableDays,
      onEditDay: () => undefined,
      onSelectDate: () => undefined,
    }),
  );

  assert.match(markup, /Edit status/);
  assert.match(markup, /aria-pressed="true"/);
  assert.doesNotMatch(markup, /Status day 1/);
  assert.doesNotMatch(markup, /Status day 2/);
});

test("CollectionDailyCalendarEditPanel renders the selected day status form and save guidance", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarEditPanel, {
      day: overviewDays[1],
      editableDay: editableDays.get(2) ?? null,
      canManage: true,
      onChange: () => undefined,
      onViewDetails: () => undefined,
    }),
  );

  assert.match(markup, /Selected Day/);
  assert.match(markup, /02\/05\/2026/);
  assert.match(markup, /AL - Annual Leave/);
  assert.match(markup, /Status untuk nickname dipilih/);
  assert.match(markup, /Save Calendar/);
});
