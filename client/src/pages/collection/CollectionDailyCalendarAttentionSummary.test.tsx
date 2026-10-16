import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarAttentionSummary } from "./CollectionDailyCalendarAttentionSummary";

const day: CollectionDailyOverviewDay = {
  day: 1, date: "2020-01-01", amount: 0, target: 100,
  calendarStatus: "WORKING", leaveType: null, note: null,
  isWorkingDay: true, isHoliday: false, holidayName: null, customerCount: 0, status: "red",
};

function render(days: CollectionDailyOverviewDay[], compact = true) {
  return renderToStaticMarkup(createElement(CollectionDailyCalendarAttentionSummary, {
    days, compact, editableCalendarByDay: new Map(), dirtyCalendarDayNumbers: new Set<number>(),
  }));
}

test("compact calendar attention keeps working-day notice without duplicate zero/count cards", () => {
  const markup = render([day]);
  assert.match(markup, /1 working day setakat hari ini tiada kutipan/);
  assert.match(markup, /collection-daily-attention-summary-compact/);
  assert.doesNotMatch(markup, /Attention counts|0 cuti|belum save/);
});

test("compact calendar attention suppresses calm and duplicate conflict warnings", () => {
  assert.equal(render([]), "");
  assert.equal(render([{ ...day, calendarStatus: "HOLIDAY", isWorkingDay: false, isHoliday: true, leaveType: "OFF", amount: 100 }]), "");
});

test("full attention summary retains all counts for independent callers", () => {
  const markup = render([day], false);
  assert.match(markup, /role="group" aria-label="Attention counts"/);
  assert.match(markup, /0 cuti ada kutipan/);
});
