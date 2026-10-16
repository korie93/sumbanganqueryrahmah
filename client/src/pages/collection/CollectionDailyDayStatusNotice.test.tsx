import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyDayDetailsResponse, CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyDayStatusNotice } from "@/pages/collection/CollectionDailyDayStatusNotice";

const baseDayDetails: CollectionDailyDayDetailsResponse = {
  ok: true,
  username: "ali",
  usernames: ["Ali"],
  date: "2026-05-15",
  status: "neutral",
  message: "No collection records for this date.",
  amount: 0,
  dailyTarget: 0,
  customers: [],
  summary: {
    monthlyTarget: 0,
    collected: 0,
    balanced: 0,
    totalForDate: 0,
    targetForDate: 0,
  },
  pagination: {
    page: 1,
    pageSize: 10,
    totalRecords: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  records: [],
};

const holidayDay: CollectionDailyOverviewDay = {
  day: 15,
  date: "2026-05-15",
  amount: 0,
  target: 0,
  calendarStatus: "HOLIDAY",
  leaveType: "AL",
  note: "Annual leave approved by superuser",
  isWorkingDay: false,
  isHoliday: true,
  holidayName: "AL",
  customerCount: 0,
  status: "neutral",
};

test("CollectionDailyDayStatusNotice highlights leave type and superuser remark", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayStatusNotice, {
      day: holidayDay,
      dayDetails: baseDayDetails,
    }),
  );

  assert.match(markup, /Daily Calendar Status/);
  assert.match(markup, /AL - Annual Leave/);
  assert.match(markup, /AL - Annual Leave/);
  assert.match(markup, /Remark Superuser/);
  assert.match(markup, /Annual leave approved by superuser/);
  assert.match(markup, /Nickname: Ali/);
  const importantContext = markup.slice(0, markup.indexOf("<details"));
  assert.match(importantContext, /AL - Annual Leave/);
  assert.match(importantContext, /Annual leave approved by superuser/);
  assert.doesNotMatch(markup, /<details[^>]*\bopen=/);
});

test("CollectionDailyDayStatusNotice keeps working days clear without fake leave data", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyDayStatusNotice, {
      day: {
        ...holidayDay,
        calendarStatus: "WORKING",
        leaveType: null,
        note: null,
        isWorkingDay: true,
        isHoliday: false,
        holidayName: null,
        status: "green",
      },
      dayDetails: baseDayDetails,
    }),
  );

  assert.match(markup, /Working/);
  assert.match(markup, /Tidak berkaitan/);
  assert.match(markup, /Dikira sebagai working day/);
  assert.match(markup, /Tiada remark daripada superuser untuk tarikh ini/);
  assert.match(markup, /<details class="collection-day-operation-details">/);
  assert.doesNotMatch(markup, /collection-day-important-context|bg-emerald|bg-rose/);
});

test("working-day remarks remain visible outside the collapsed audit details", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayStatusNotice, {
    day: { ...holidayDay, calendarStatus: "WORKING", leaveType: null, note: "Important superuser instruction.",
      isWorkingDay: true, isHoliday: false, holidayName: null },
    dayDetails: baseDayDetails,
  }));
  assert.match(markup.slice(0, markup.indexOf("<details")), /Important superuser instruction/);
  assert.equal((markup.match(/Important superuser instruction/g) || []).length, 1);
});

test("collection recorded on leave is explicitly highlighted without mislabelling performance as operation", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayStatusNotice, {
    day: holidayDay, dayDetails: { ...baseDayDetails, status: "green", amount: 100 },
  }));
  assert.match(markup.slice(0, markup.indexOf("<details")), /Kutipan direkodkan pada hari cuti \/ tidak bekerja/);
  assert.doesNotMatch(markup, /Target achieved|bg-emerald|text-rose/);
});

test("missing calendar context still leaves the response explanation and audit disclosure available", () => {
  const markup = renderToStaticMarkup(createElement(CollectionDailyDayStatusNotice, {
    day: null, dayDetails: baseDayDetails,
  }));
  assert.match(markup, /Status belum tersedia/);
  assert.match(markup, /No collection records for this date/);
  assert.match(markup, /Maklumat operasi &amp; audit/);
});
