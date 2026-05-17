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
    leaveType: "OFF",
    note: "Company closed",
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "OFF",
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
      leaveType: "OFF",
      note: "Company closed",
      isWorkingDay: false,
      isHoliday: true,
      holidayName: "OFF",
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
      activeFilter: "unsaved",
      canManage: true,
      editableCalendarByDay: editableDays,
      dirtyCalendarDayNumbers: new Set([2]),
      onEditDay: () => undefined,
      onSelectDate: () => undefined,
    }),
  );

  assert.match(markup, /Edit status/);
  assert.match(markup, /Unsaved change/);
  assert.match(markup, /OFF/);
  assert.match(markup, /Company Closed/);
  assert.match(markup, /Company closed/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /collection-daily-day-card-filter-muted/);
  assert.doesNotMatch(markup, /Status day 1/);
  assert.doesNotMatch(markup, /Status day 2/);
});

test("CollectionDailyCalendarEditPanel renders the selected day status form and save guidance", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarEditPanel, {
      day: overviewDays[1],
      editableDay: editableDays.get(2) ?? null,
      canManage: true,
      isDirty: true,
      savingCalendar: false,
      onSaveCalendar: () => undefined,
      onChange: () => undefined,
      onViewDetails: () => undefined,
    }),
  );

  assert.match(markup, /Selected Day/);
  assert.match(markup, /02\/05\/2026/);
  assert.match(markup, /OFF - Company Closed/);
  assert.match(markup, /Status untuk nickname dipilih/);
  assert.match(markup, /Perubahan belum disimpan/);
  assert.match(markup, /Save changed status/);
});
