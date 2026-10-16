import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyDayDetailsResponse } from "@/lib/api/collection-types";
import {
  collectionDailyDayDetailsReducer as reduce,
  initialCollectionDailyDayDetailsState as initial,
} from "@/pages/collection/collection-daily-day-details-state";

function details(date = "2026-10-17", page = 1): CollectionDailyDayDetailsResponse {
  return {
    ok: true, username: "synthetic", usernames: ["synthetic"], date,
    amount: 500, dailyTarget: 700, status: "yellow", message: "Synthetic daily fixture", customers: [],
    summary: { monthlyTarget: 14000, collected: 500, balanced: 200, totalForDate: 500, targetForDate: 700 },
    pagination: { page, pageSize: 10, totalRecords: 12, totalPages: 2, hasPreviousPage: page > 1, hasNextPage: page < 2 },
    records: [],
  };
}

function loaded() {
  const pending = reduce(initial, { type: "begin", requestId: 1, scopeKey: "synthetic", date: "2026-10-17" });
  return reduce(pending, { type: "success", requestId: 1, details: details() });
}

test("daily details keeps summary only for pagination within the same date and staff scope", () => {
  const current = loaded();
  const nextPage = reduce(current, { type: "begin", requestId: 2, scopeKey: "synthetic", date: "2026-10-17" });
  assert.equal(nextPage.dayDetails, current.dayDetails);
  assert.equal(nextPage.loadingDayDetails, true);
  assert.equal(nextPage.dayDetailsError, null);
  const complete = reduce(nextPage, { type: "success", requestId: 2, details: details("2026-10-17", 2) });
  assert.equal(complete.dayDetails?.pagination.page, 2);
  assert.equal(complete.loadingDayDetails, false);
});

test("daily details clears previous-date data before an adjacent date request finishes", () => {
  const nextDate = reduce(loaded(), { type: "begin", requestId: 2, scopeKey: "synthetic", date: "2026-10-18" });
  assert.equal(nextDate.selectedDate, "2026-10-18");
  assert.equal(nextDate.dayDetails, null);
  assert.equal(nextDate.loadingDayDetails, true);
});

test("daily details never retains data when changing staff scope on the same date", () => {
  const nextScope = reduce(loaded(), { type: "begin", requestId: 2, scopeKey: "other-synthetic", date: "2026-10-17" });
  assert.equal(nextScope.dayDetails, null);
  assert.equal(nextScope.scopeKey, "other-synthetic");
});

test("daily details ignores late successful and failed requests after a later request", () => {
  const pending = reduce(loaded(), { type: "begin", requestId: 3, scopeKey: "synthetic", date: "2026-10-18" });
  assert.equal(reduce(pending, { type: "success", requestId: 2, details: details() }), pending);
  assert.equal(reduce(pending, { type: "failure", requestId: 2, message: "Old error" }), pending);
  assert.equal(reduce(pending, { type: "success", requestId: 3, details: details() }), pending);
});

test("closing daily details resets busy and error state and late responses cannot reopen it", () => {
  const pending = reduce(loaded(), { type: "begin", requestId: 2, scopeKey: "synthetic", date: "2026-10-17" });
  const closed = reduce(pending, { type: "clear", requestId: 3 });
  assert.deepEqual(closed, { ...initial, requestId: 3 });
  assert.equal(reduce(closed, { type: "success", requestId: 2, details: details() }), closed);
  assert.equal(reduce(closed, { type: "failure", requestId: 2, message: "Late error" }), closed);
});

test("failed pagination retains matching summary and retry clears the error", () => {
  const current = loaded();
  const pending = reduce(current, { type: "begin", requestId: 2, scopeKey: "synthetic", date: "2026-10-17" });
  const failed = reduce(pending, { type: "failure", requestId: 2, message: "Synthetic unavailable" });
  assert.equal(failed.dayDetails, current.dayDetails);
  assert.equal(failed.loadingDayDetails, false);
  assert.equal(failed.dayDetailsError, "Synthetic unavailable");
  const retry = reduce(failed, { type: "begin", requestId: 3, scopeKey: "synthetic", date: "2026-10-17" });
  assert.equal(retry.dayDetailsError, null);
  assert.equal(retry.loadingDayDetails, true);
});

test("cached date/page selection replaces the previous date without transient busy state", () => {
  const cached = details("2026-10-18", 2);
  const next = reduce(loaded(), { type: "begin", requestId: 2, scopeKey: "synthetic", date: cached.date, cachedDetails: cached });
  assert.equal(next.dayDetails, cached);
  assert.equal(next.selectedDate, cached.date);
  assert.equal(next.loadingDayDetails, false);
  assert.equal(next.dayDetailsError, null);
});
