import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import {
  CollectionDailyCalendarDayBadge,
  getCollectionDailyCalendarDayBadgeLabel,
} from "@/pages/collection/CollectionDailyCalendarDayBadge";

const holidayDay: CollectionDailyOverviewDay = {
  day: 15,
  date: "2026-05-15",
  amount: 0,
  target: 1000,
  calendarStatus: "HOLIDAY",
  leaveType: "AL",
  note: "Annual leave approved",
  isWorkingDay: false,
  isHoliday: true,
  holidayName: "AL",
  customerCount: 0,
  status: "neutral",
};

test("CollectionDailyCalendarDayBadge shows leave type and superuser remark", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarDayBadge, { day: holidayDay }),
  );

  assert.match(markup, /AL/);
  assert.match(markup, /Annual Leave/);
  assert.match(markup, /Annual leave approved/);
  assert.match(markup, /aria-label="AL - Annual Leave\. Remark: Annual leave approved"/);
});

test("CollectionDailyCalendarDayBadge stays empty for ordinary working days", () => {
  const workingDay: CollectionDailyOverviewDay = {
    ...holidayDay,
    calendarStatus: "WORKING",
    leaveType: null,
    note: null,
    isWorkingDay: true,
    isHoliday: false,
    holidayName: null,
    status: "green",
  };

  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarDayBadge, { day: workingDay }),
  );

  assert.equal(markup, "");
  assert.equal(getCollectionDailyCalendarDayBadgeLabel(workingDay), "");
});
