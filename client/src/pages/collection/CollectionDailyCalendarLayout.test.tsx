import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarEditPanel } from "@/pages/collection/CollectionDailyCalendarEditPanel";
import { CollectionDailyDesktopCalendarGrid } from "@/pages/collection/CollectionDailyDesktopCalendarGrid";
import { CollectionDailyMobileDayList } from "@/pages/collection/CollectionDailyMobileDayList";
import { COLLECTION_DAILY_CALENDAR_VIEW_MODES } from "./collection-daily-calendar-view-mode-utils";
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
      viewMode: "content",
      firstWeekday: 0,
      selectedDate: null,
      editingDayNumber: 2,
      activeFilter: "unsaved",
      canManage: true,
      editableCalendarByDay: editableDays,
      dirtyCalendarDayNumbers: new Set([2]),
      bulkSelectedDayNumbers: new Set([2]),
      onEditDay: () => undefined,
      onSelectDate: () => undefined,
      onToggleBulkDay: () => undefined,
    }),
  );

  assert.match(markup, /Bulk select/);
  assert.match(markup, /Edit status/);
  assert.match(markup, /Unsaved change/);
  assert.match(markup, /OFF/);
  assert.match(markup, /Company Closed/);
  assert.match(markup, /Company closed/);
  assert.match(markup, /aria-pressed="true"/);
  assert.equal((markup.match(/aria-haspopup="dialog"/g) || []).length, 4);
  assert.match(markup, /collection-daily-day-card-filter-muted/);
  assert.match(markup, /collection-daily-desktop-grid-mode-content/);
  assert.doesNotMatch(markup, /Status day 1/);
  assert.doesNotMatch(markup, /Status day 2/);
});

test("CollectionDailyDesktopCalendarGrid supports compact icon calendar view", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDesktopCalendarGrid, {
      days: overviewDays,
      viewMode: "icon-sm",
      firstWeekday: 0,
      selectedDate: null,
      editingDayNumber: null,
      activeFilter: "all",
      canManage: false,
      editableCalendarByDay: editableDays,
      dirtyCalendarDayNumbers: new Set<number>(),
      bulkSelectedDayNumbers: new Set<number>(),
      onEditDay: () => undefined,
      onSelectDate: () => undefined,
      onToggleBulkDay: () => undefined,
    }),
  );

  assert.match(markup, /collection-daily-desktop-grid-mode-icon-sm/);
  assert.match(markup, /collection-daily-day-view-icon-sm/);
  assert.match(markup, /collection-daily-day-progress-band-complete/);
  assert.doesNotMatch(markup, /Collected:/);
});

test("CollectionDailyDesktopCalendarGrid supports heatmap calendar view", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDesktopCalendarGrid, {
      days: overviewDays,
      viewMode: "heatmap",
      firstWeekday: 0,
      selectedDate: null,
      editingDayNumber: null,
      activeFilter: "all",
      canManage: false,
      editableCalendarByDay: editableDays,
      dirtyCalendarDayNumbers: new Set<number>(),
      bulkSelectedDayNumbers: new Set<number>(),
      onEditDay: () => undefined,
      onSelectDate: () => undefined,
      onToggleBulkDay: () => undefined,
    }),
  );

  assert.match(markup, /collection-daily-desktop-grid-mode-heatmap/);
  assert.match(markup, /collection-daily-day-view-heatmap/);
  assert.match(markup, /RM/);
});

test("all desktop modes retain actual date triggers and only seven-column calendars use blank offsets", () => {
  for (const viewMode of COLLECTION_DAILY_CALENDAR_VIEW_MODES) {
    const markup = renderToStaticMarkup(createElement(CollectionDailyDesktopCalendarGrid, {
      days: overviewDays, viewMode, firstWeekday: 5, selectedDate: null,
      editingDayNumber: null, activeFilter: "all", canManage: false,
      editableCalendarByDay: editableDays, dirtyCalendarDayNumbers: new Set<number>(),
      bulkSelectedDayNumbers: new Set<number>(), onEditDay() {}, onSelectDate() {}, onToggleBulkDay() {},
    }));
    assert.equal((markup.match(/data-collection-daily-date=/g) || []).length, 2, viewMode);
    assert.equal((markup.match(/collection-daily-calendar-blank/g) || []).length,
      viewMode === "content" || viewMode === "heatmap" ? 5 : 0, viewMode);
    assert.doesNotMatch(markup, /Bulk select|Edit calendar status for/);
    if (viewMode !== "content" && viewMode !== "heatmap") {
      assert.match(markup, /collection-daily-day-weekday">Fri</);
      assert.match(markup, /collection-daily-day-weekday">Sat</);
    }
  }
});

test("mobile day cards use a single performance label and keep detail actions outside management mode", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyMobileDayList, {
    days: overviewDays, viewMode: "content", selectedDate: null, editingDayNumber: null,
    canManage: false, dirtyCalendarDayNumbers: new Set<number>(),
    bulkSelectedDayNumbers: new Set<number>(), onSelectDate() {}, onEditDay() {}, onToggleBulkDay() {},
  }));
  assert.equal((markup.match(/Target achieved/g) || []).length, 1);
  assert.equal((markup.match(/data-collection-daily-date=/g) || []).length, 2);
  assert.equal((markup.match(/View details/g) || []).length, 2);
  assert.doesNotMatch(markup, /Pilih untuk bulk update|Edit calendar status/);
  assert.match(markup, /min-h-11 rounded-xl bg-background/);
});

test("all seven desktop and mobile modes identify actual today without treating the selected date as today", () => {
  for (const viewMode of COLLECTION_DAILY_CALENDAR_VIEW_MODES) {
    const common = {
      days: overviewDays, viewMode, selectedDate: "2026-05-02", todayDate: "2026-05-01",
      editingDayNumber: null, canManage: false, dirtyCalendarDayNumbers: new Set<number>(),
      bulkSelectedDayNumbers: new Set<number>(), onSelectDate() {}, onEditDay() {}, onToggleBulkDay() {},
    };
    const desktop = renderToStaticMarkup(createElement(CollectionDailyDesktopCalendarGrid, {
      ...common, firstWeekday: 5, activeFilter: "all", editableCalendarByDay: editableDays,
    }));
    const mobile = renderToStaticMarkup(createElement(CollectionDailyMobileDayList, common));
    for (const markup of [desktop, mobile]) {
      assert.equal((markup.match(/aria-current="date"/g) ?? []).length, 1, viewMode);
      assert.equal((markup.match(/class="collection-daily-today-marker"/g) ?? []).length, 1, viewMode);
      assert.match(markup, /aria-current="date"[^>]*data-collection-daily-date="2026-05-01"/, viewMode);
      assert.doesNotMatch(markup, /aria-current="date"[^>]*data-collection-daily-date="2026-05-02"/, viewMode);
    }
  }
});

test("calendar months not containing today do not invent a current date marker", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyMobileDayList, {
    days: overviewDays, viewMode: "content", selectedDate: "2026-05-01", todayDate: "2026-10-17",
    editingDayNumber: null, canManage: false, dirtyCalendarDayNumbers: new Set<number>(),
    bulkSelectedDayNumbers: new Set<number>(), onSelectDate() {}, onEditDay() {}, onToggleBulkDay() {},
  }));
  assert.doesNotMatch(markup, /aria-current|collection-daily-today-marker|Hari ini/);
});

test("CollectionDailyCalendarEditPanel renders the selected day status form and save guidance", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarEditPanel, {
      day: overviewDays[1],
      editableDay: editableDays.get(2) ?? null,
      canManage: true,
      isDirty: true,
      savingCalendar: false,
      username: "alice",
      year: 2026,
      month: 5,
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
