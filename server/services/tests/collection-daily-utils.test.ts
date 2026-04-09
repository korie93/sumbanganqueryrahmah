import assert from "node:assert/strict";
import test from "node:test";
import { computeCollectionDailyTimeline } from "../collection/collection-daily-utils";

function buildCalendarMonth(
  year: number,
  month: number,
  workingDays: number[],
) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const workingSet = new Set(workingDays);
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const isWorkingDay = workingSet.has(day);
    return {
      day,
      isWorkingDay,
      isHoliday: !isWorkingDay,
      holidayName: isWorkingDay ? null : "OFF",
    };
  });
}

function buildDayRange(start: number, end: number): number[] {
  const values: number[] = [];
  for (let day = start; day <= end; day += 1) {
    values.push(day);
  }
  return values;
}

test("computeCollectionDailyTimeline keeps daily requirements capped by remaining target and working days", () => {
  const year = 2026;
  const month = 3;
  const timeline = computeCollectionDailyTimeline({
    year,
    month,
    monthlyTarget: 16000,
    calendarRows: buildCalendarMonth(year, month, [2, 3, 5, 6]),
    amountByDate: new Map<string, number>([
      ["2026-03-02", 2500],
      ["2026-03-03", 6000],
      ["2026-03-05", 3500],
      ["2026-03-06", 0],
    ]),
    customerCountByDate: new Map<string, number>([
      ["2026-03-02", 2],
      ["2026-03-03", 3],
      ["2026-03-05", 1],
    ]),
    referenceDate: new Date("2026-03-05T12:00:00.000Z"),
  });

  const day2 = timeline.days.find((day) => day.date === "2026-03-02");
  const day3 = timeline.days.find((day) => day.date === "2026-03-03");
  const day5 = timeline.days.find((day) => day.date === "2026-03-05");
  const day6 = timeline.days.find((day) => day.date === "2026-03-06");

  assert.ok(day2);
  assert.ok(day3);
  assert.ok(day5);
  assert.ok(day6);

  assert.equal(timeline.summary.baseDailyTarget, 4000);
  assert.equal(day2.target, 4000);
  assert.equal(day2.carryOut, 1500);
  assert.equal(day2.status, "yellow");

  assert.equal(day3.target, 4500);
  assert.equal(day3.carryOut, 0);
  assert.equal(day3.status, "green");

  assert.equal(day5.target, 3750);
  assert.equal(day5.status, "yellow");

  assert.equal(day6.target, 4000);
  assert.equal(day6.status, "red");

  assert.equal(timeline.summary.collectedToDate, 12000);
  assert.equal(timeline.summary.remainingTarget, 4000);
  assert.equal(timeline.summary.workingDays, 4);
  assert.equal(timeline.summary.elapsedWorkingDays, 3);
  assert.equal(timeline.summary.remainingWorkingDays, 1);
  assert.equal(timeline.summary.requiredPerRemainingWorkingDay, 4000);
  assert.equal(timeline.summary.completedDays, 1);
  assert.equal(timeline.summary.incompleteDays, 2);
  assert.equal(timeline.summary.noCollectionDays, 1);
  assert.equal(timeline.summary.expectedProgressAmount, 12000);
  assert.equal(timeline.summary.progressVarianceAmount, 0);
});

test("computeCollectionDailyTimeline keeps non-working days neutral", () => {
  const timeline = computeCollectionDailyTimeline({
    year: 2026,
    month: 4,
    monthlyTarget: 1000,
    calendarRows: buildCalendarMonth(2026, 4, []),
    amountByDate: new Map<string, number>([["2026-04-01", 200]]),
    referenceDate: new Date("2026-04-10T12:00:00.000Z"),
  });

  const day1 = timeline.days.find((day) => day.date === "2026-04-01");
  assert.ok(day1);
  assert.equal(day1.status, "neutral");
  assert.equal(day1.target, 0);
  assert.equal(timeline.summary.workingDays, 0);
  assert.equal(timeline.summary.elapsedWorkingDays, 0);
  assert.equal(timeline.summary.requiredPerRemainingWorkingDay, 0);
  assert.equal(timeline.summary.expectedProgressAmount, 0);
  assert.equal(timeline.summary.progressVarianceAmount, 200);
  assert.equal(timeline.summary.neutralDays, timeline.daysInMonth);
});

test("computeCollectionDailyTimeline aligns expected progress with working days and monthly ceiling", () => {
  const timeline = computeCollectionDailyTimeline({
    year: 2026,
    month: 3,
    monthlyTarget: 100000,
    calendarRows: buildCalendarMonth(2026, 3, buildDayRange(1, 22)),
    amountByDate: new Map<string, number>([["2026-03-01", 40000]]),
    referenceDate: new Date("2026-03-15T12:00:00.000Z"),
  });

  assert.equal(timeline.summary.monthlyTarget, 100000);
  assert.equal(timeline.summary.collectedToDate, 40000);
  assert.equal(timeline.summary.baseDailyTarget, 4545.45);
  assert.equal(timeline.summary.workingDays, 22);
  assert.equal(timeline.summary.elapsedWorkingDays, 15);
  assert.equal(timeline.summary.remainingWorkingDays, 7);
  assert.equal(timeline.summary.expectedProgressAmount, 68181.75);
  assert.equal(timeline.summary.progressVarianceAmount, -28181.75);
  assert.equal(timeline.summary.remainingTarget, 60000);
  assert.equal(timeline.summary.requiredPerRemainingWorkingDay, 8571.43);
  assert.ok(timeline.summary.expectedProgressAmount <= timeline.summary.monthlyTarget);
});

test("computeCollectionDailyTimeline never inflates remaining target when collected exceeds monthly target", () => {
  const timeline = computeCollectionDailyTimeline({
    year: 2026,
    month: 3,
    monthlyTarget: 1000,
    calendarRows: buildCalendarMonth(2026, 3, [1, 2]),
    amountByDate: new Map<string, number>([
      ["2026-03-01", 1200],
      ["2026-03-02", 300],
    ]),
    referenceDate: new Date("2026-03-02T12:00:00.000Z"),
  });

  assert.equal(timeline.summary.collectedToDate, 1500);
  assert.equal(timeline.summary.expectedProgressAmount, 1000);
  assert.equal(timeline.summary.remainingTarget, 0);
  assert.equal(timeline.summary.requiredPerRemainingWorkingDay, 0);
  assert.equal(timeline.summary.progressVarianceAmount, 500);
  assert.equal(timeline.summary.remainingWorkingDays, 0);
});

test("computeCollectionDailyTimeline normalizes grouped MYR strings consistently", () => {
  const timeline = computeCollectionDailyTimeline({
    year: 2026,
    month: 3,
    monthlyTarget: Number("1"),
    calendarRows: buildCalendarMonth(2026, 3, [1]),
    amountByDate: new Map<string, number>([["2026-03-01", Number("0")]]),
    referenceDate: new Date("2026-03-01T12:00:00.000Z"),
  });

  const groupedTimeline = computeCollectionDailyTimeline({
    year: 2026,
    month: 3,
    monthlyTarget: "1,200.50" as unknown as number,
    calendarRows: buildCalendarMonth(2026, 3, [1]),
    amountByDate: new Map<string, number>([["2026-03-01", "1,000.25" as unknown as number]]),
    referenceDate: new Date("2026-03-01T12:00:00.000Z"),
  });

  assert.equal(timeline.summary.monthlyTarget, 1);
  assert.equal(groupedTimeline.summary.monthlyTarget, 1200.5);
  assert.equal(groupedTimeline.summary.collectedToDate, 1000.25);
  assert.equal(groupedTimeline.summary.remainingTarget, 200.25);
  assert.equal(groupedTimeline.days[0]?.amount, 1000.25);
  assert.equal(groupedTimeline.days[0]?.target, 1200.5);
});
