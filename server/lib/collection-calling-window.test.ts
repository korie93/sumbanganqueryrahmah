import assert from "node:assert/strict";
import test from "node:test";
import {
  addOneCalendarMonthDateOnly,
  buildCollectionCallingWindow,
  isDateInsideCollectionCallingWindow,
  parseSavedCallingDate,
} from "./collection-calling-window";

test("Saved Calling Date parser handles masterlisting and Excel formats without timezone shifts", () => {
  assert.equal(parseSavedCallingDate("20260812"), "2026-08-12");
  assert.equal(parseSavedCallingDate("2026-08-12"), "2026-08-12");
  assert.equal(parseSavedCallingDate("12/08/2026"), "2026-08-12");
  assert.equal(parseSavedCallingDate("12-08-2026"), "2026-08-12");
  assert.equal(parseSavedCallingDate(46_246), "2026-08-12");
  assert.equal(parseSavedCallingDate("2026-02-30"), null);
  assert.equal(parseSavedCallingDate("not-a-date"), null);
});

test("Calling Date window uses one calendar month with inclusive start and exclusive end", () => {
  assert.deepEqual(buildCollectionCallingWindow("2026-08-12"), {
    start: "2026-08-12",
    endInclusive: "2026-09-11",
    endExclusive: "2026-09-12",
  });

  const window = { start: "2026-08-12", endExclusive: "2026-09-12" };
  assert.equal(isDateInsideCollectionCallingWindow("2026-08-12", window), true);
  assert.equal(isDateInsideCollectionCallingWindow("2026-09-11", window), true);
  assert.equal(isDateInsideCollectionCallingWindow("2026-09-12", window), false);
});

test("calendar-month addition clamps month-end instead of adding 30 days", () => {
  assert.equal(addOneCalendarMonthDateOnly("2024-01-31"), "2024-02-29");
  assert.equal(addOneCalendarMonthDateOnly("2025-01-31"), "2025-02-28");
  assert.equal(addOneCalendarMonthDateOnly("2026-08-12"), "2026-09-12");
});
