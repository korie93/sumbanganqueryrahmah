import assert from "node:assert/strict";
import test from "node:test";
import { getCollectionTodayDateString, isFutureCollectionDate, isValidCollectionDate } from "../../routes/collection.validation";

test("Collection today and future-date validation use Kuala Lumpur midnight, not host timezone", () => {
  for (const [instant, expected] of [
    ["2026-09-05T15:59:59.999Z", "2026-09-05"],
    ["2026-09-05T16:00:00.000Z", "2026-09-06"],
    ["2026-09-06T00:01:00.000Z", "2026-09-06"],
    ["2026-12-31T16:00:00.000Z", "2027-01-01"],
  ]) assert.equal(getCollectionTodayDateString(new Date(instant)), expected);
  const entered = new Date("2026-09-05T16:01:00Z");
  assert.equal(isFutureCollectionDate("2026-08-27", entered), false);
  assert.equal(isFutureCollectionDate("2026-09-06", entered), false);
  assert.equal(isFutureCollectionDate("2026-09-07", entered), true);
});

test("Payment Date remains a strict date-only value across leap days and timestamps", () => {
  for (const invalid of ["0000-01-01", "2026-02-29", "2026-08-32", "2026-8-27", "2026-08-27T00:00:00Z", " 2026-08-27"]) {
    assert.equal(isValidCollectionDate(invalid), false);
  }
  assert.equal(isValidCollectionDate("2028-02-29"), true);
  assert.equal(isValidCollectionDate("2026-08-27"), true);
});
