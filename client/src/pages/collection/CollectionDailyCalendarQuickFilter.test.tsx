import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarQuickFilter } from "@/pages/collection/CollectionDailyCalendarQuickFilter";

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
    leaveType: "OFF",
    note: "Company closed",
    isWorkingDay: false,
    isHoliday: true,
    holidayName: "Company closed",
    customerCount: 0,
    status: "neutral",
  },
];

test("CollectionDailyCalendarQuickFilter renders accessible filter buttons with counts", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarQuickFilter, {
      days,
      dirtyCalendarDayNumbers: new Set([2]),
      activeFilter: "off",
      canManage: true,
      onFilterChange: () => undefined,
    }),
  );

  assert.match(markup, /Quick filter/);
  assert.match(markup, /Desktop highlights matching days/);
  assert.match(markup, /All/);
  assert.match(markup, /Working/);
  assert.match(markup, /Holiday \/ Leave/);
  assert.match(markup, /OFF/);
  assert.match(markup, /Unsaved/);
  assert.match(markup, /1 of 2 days match this filter/);
  assert.match(markup, /aria-pressed="true"/);
});
