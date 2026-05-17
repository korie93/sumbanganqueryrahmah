import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarConflictNotice } from "@/pages/collection/CollectionDailyCalendarConflictNotice";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { hasCollectionDailyCalendarCollectionConflict } from "@/pages/collection/collection-daily-calendar-conflict-utils";

const day: CollectionDailyOverviewDay = {
  day: 1,
  date: "2026-05-01",
  amount: 250,
  target: 100,
  calendarStatus: "WORKING",
  leaveType: null,
  note: null,
  isWorkingDay: true,
  isHoliday: false,
  holidayName: null,
  customerCount: 2,
  status: "green",
};

const editableDay: EditableCalendarDay = {
  day: 1,
  status: "HOLIDAY",
  leaveType: "OFF",
  note: "Company closed",
  isWorkingDay: false,
  isHoliday: true,
  holidayName: "OFF",
};

test("hasCollectionDailyCalendarCollectionConflict warns only when holiday draft has collection", () => {
  assert.equal(hasCollectionDailyCalendarCollectionConflict(day, editableDay), true);
  assert.equal(
    hasCollectionDailyCalendarCollectionConflict(day, { ...editableDay, status: "WORKING" }),
    false,
  );
});

test("CollectionDailyCalendarConflictNotice renders a clear warning", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarConflictNotice, {
      day,
      editableDay,
    }),
  );

  assert.match(markup, /Tarikh ini ada/);
  assert.match(markup, /2 rekod/);
});

