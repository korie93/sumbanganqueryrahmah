import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionDailyBulkPatch,
  hasCollectionDailyBulkDraftError,
  toggleCollectionDailyBulkDay,
} from "@/pages/collection/collection-daily-calendar-bulk-utils";

test("buildCollectionDailyBulkPatch normalizes working days", () => {
  assert.deepEqual(
    buildCollectionDailyBulkPatch({ status: "WORKING", leaveType: "OFF", note: "ignored" }),
    {
      status: "WORKING",
      leaveType: null,
      note: "",
      holidayName: "",
      isWorkingDay: true,
      isHoliday: false,
    },
  );
});

test("buildCollectionDailyBulkPatch keeps holiday leave type and note", () => {
  assert.deepEqual(
    buildCollectionDailyBulkPatch({ status: "HOLIDAY", leaveType: "OFF", note: " Company closed " }),
    {
      status: "HOLIDAY",
      leaveType: "OFF",
      note: "Company closed",
      holidayName: "OFF",
      isWorkingDay: false,
      isHoliday: true,
    },
  );
});

test("toggleCollectionDailyBulkDay and validation stay deterministic", () => {
  const selected = toggleCollectionDailyBulkDay(new Set<number>(), 3);
  assert.equal(selected.has(3), true);
  assert.equal(hasCollectionDailyBulkDraftError(selected, { status: "HOLIDAY", leaveType: null, note: "" }), true);
  assert.equal(hasCollectionDailyBulkDraftError(selected, { status: "HOLIDAY", leaveType: "AL", note: "" }), false);
});
