import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { CollectionDailySummaryCard } from "@/pages/collection/CollectionDailySummaryCard";
import { CollectionDailyCalendarCard } from "@/pages/collection/CollectionDailyCalendarCard";

const overview: CollectionDailyOverviewResponse = {
  ok: true,
  username: "ALPHA",
  usernames: ["ALPHA"],
  role: "admin",
  month: {
    year: 2026,
    month: 5,
    daysInMonth: 31,
  },
  summary: {
    monthlyTarget: 100000,
    collectedToDate: 42000,
    collectedAmount: 42000,
    remainingTarget: 58000,
    balancedAmount: 58000,
    workingDays: 22,
    elapsedWorkingDays: 10,
    remainingWorkingDays: 12,
    requiredPerRemainingWorkingDay: 4833.33,
    completedDays: 7,
    incompleteDays: 3,
    noCollectionDays: 1,
    neutralDays: 0,
    baseDailyTarget: 4545.45,
    dailyTarget: 4545.45,
    expectedProgressAmount: 45454.55,
    progressVarianceAmount: -3454.55,
    achievedAmount: 42000,
    remainingAmount: 58000,
    metDays: 7,
    yellowDays: 3,
    redDays: 1,
  },
  days: [],
  carryForwardRule: "none",
  freshness: {
    status: "fresh",
    pendingCount: 0,
    runningCount: 0,
    retryCount: 0,
    oldestPendingAgeMs: 0,
    message: "Fresh rollups",
  },
};

test("CollectionDailySummaryCard separates primary and supporting indicators", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailySummaryCard, {
      overview,
    }),
  );

  assert.match(markup, /Daily Performance Summary/);
  assert.match(markup, /Monthly Target/);
  assert.match(markup, /Required Per Remaining Day/);
  assert.match(markup, /Supporting Indicators/);
  assert.match(markup, /Progress Variance/);
  assert.match(markup, /<details class="collection-daily-supporting-panel collection-daily-disclosure"><summary>Supporting Indicators<\/summary>/);
  assert.equal((markup.match(/collection-daily-summary-metrics/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /<details[^>]* open/);
  assert.doesNotMatch(markup, /rounded-2xl|shadow-sm/);
  assert.match(markup, /value="42"/);
  for (const value of ["100,000.00", "42,000.00", "58,000.00", "4,833.33", "3,454.55"]) {
    assert.ok(markup.includes(value), value);
  }
});

test("Daily summary gives currency values a content-aware column and never splits digits", () => {
  const css = readFileSync(new URL("./CollectionDailyPage.css", import.meta.url), "utf8");
  assert.match(css, /\.collection-daily-page \.collection-daily-summary-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 12rem\), 1fr\)\)/);
  assert.match(css, /\.collection-daily-summary-metrics \.ops-metric-value\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow-wrap:\s*normal;[^}]*overflow-x:\s*auto;/);
});

test("Daily calendar secondary detail disclosures retain content and bulk permission guards", () => {
  for (const canManage of [true, false]) {
    const markup = renderToStaticMarkup(createElement(CollectionDailyCalendarCard, {
      loadingOverview: false, overview, emptyOverviewMessage: "No daily overview",
      firstWeekday: 0, selectedDate: null, canManage,
      editableCalendarByDay: new Map(), dirtyCalendarDayNumbers: new Set<number>(),
      savingCalendar: false, onSaveCalendar() {}, onSelectDate() {},
      onUpdateEditableDay() {}, onUpdateEditableDays() {},
    }));
    assert.match(markup, /<summary>Calendar legend and status codes<\/summary>/);
    assert.match(markup, /<summary>Monthly status and collection breakdown<\/summary>/);
    assert.match(markup, /aria-label="Daily status and leave type codes"/);
    assert.match(markup, /aria-label="Leave type totals"/);
    assert.doesNotMatch(markup, /aria-label="Daily calendar attention summary"/);
    assert.doesNotMatch(markup, /<details[^>]* open/);
    if (canManage) {
      assert.match(markup, /data-testid="collection-daily-management-toggle"/);
      assert.match(markup, /aria-pressed="false" aria-controls="collection-daily-calendar-management"/);
    } else {
      assert.doesNotMatch(markup, /collection-daily-management-toggle/);
    }
    assert.doesNotMatch(markup, /aria-label="Bulk daily status"|Apply to selected days/);
    assert.match(markup, /id="collection-daily-calendar-management" hidden=""/);
  }
});

test("Daily conflict and unsaved-change feedback stays outside optional disclosures", () => {
  const source = readFileSync(new URL("./CollectionDailyCalendarCard.tsx", import.meta.url), "utf8");
  const disclosures = source.match(/<details\b[\s\S]*?<\/details>/g) ?? [];
  assert.equal(disclosures.length, 2);
  for (const disclosure of disclosures) {
    assert.doesNotMatch(disclosure, /CollectionDailyCalendar(?:ConflictReport|ChangeReview|AttentionSummary)/);
  }
  assert.match(source, /<CollectionDailyCalendarConflictReport/);
  assert.match(source, /<CollectionDailyCalendarChangeReview/);
  assert.match(source, /onApply=\{handleBulkApply\}/);
  assert.match(source, /onSaveCalendar=\{onSaveCalendar\}/);
  assert.match(source, /canManage=\{calendarManagementActive\}/);
  assert.ok(source.indexOf("<CollectionDailyCalendarChangeReview") < source.indexOf("<CollectionDailyMobileDayList"));
});

test("calendar browse mode retains actionable dirty review and only one visible conflict warning", () => {
  const day = {
    day: 1, date: "2026-05-01", amount: 500, target: 1000,
    calendarStatus: "HOLIDAY" as const, leaveType: "OFF" as const, note: "Company closed",
    isWorkingDay: false, isHoliday: true, holidayName: "OFF", customerCount: 2, status: "neutral" as const,
  };
  const markup = renderToStaticMarkup(createElement(CollectionDailyCalendarCard, {
    loadingOverview: false, overview: { ...overview, days: [day] }, emptyOverviewMessage: "No daily overview",
    firstWeekday: 5, selectedDate: null, canManage: true,
    editableCalendarByDay: new Map([[1, { ...day, status: "HOLIDAY" as const, note: "Changed closure note" }]]),
    dirtyCalendarDayNumbers: new Set([1]), savingCalendar: false,
    onSaveCalendar() {}, onSelectDate() {}, onUpdateEditableDay() {}, onUpdateEditableDays() {},
  }));
  assert.match(markup, /1 conflict status/);
  assert.doesNotMatch(markup, /Daily calendar attention summary/);
  assert.match(markup, /Semakan perubahan status harian belum disimpan/);
  assert.match(markup, /Simpan perubahan/);
  assert.match(markup, /id="collection-daily-calendar-management" hidden=""/);
  assert.doesNotMatch(markup, /aria-label="Bulk daily status"/);
});

test("conflict report text follows readable light and dark foreground tokens", () => {
  const css = readFileSync(new URL("./CollectionDailyCalendarConflictReport.css", import.meta.url), "utf8");
  assert.match(css, /\.collection-daily-conflict-report-summary\s*\{[^}]*color: hsl\(var\(--foreground\)\)/);
  assert.doesNotMatch(css, /color: hsl\(31 92% 28%\)/);
  const badges = readFileSync(new URL("./CollectionDailyCalendarDayBadge.css", import.meta.url), "utf8");
  assert.match(badges, /\.dark \.collection-daily-calendar-day-badge-working \.collection-daily-calendar-day-badge-code\s*\{\s*color: hsl\(var\(--foreground\)\)/);
});
