import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { buildCollectionDailyCalendarAuditHistoryItems } from "@/pages/collection/collection-daily-calendar-audit-history-utils";

const baseDay: CollectionDailyOverviewDay = {
  day: 1,
  date: "2026-05-01",
  amount: 0,
  target: 0,
  calendarStatus: "WORKING",
  leaveType: null,
  note: null,
  isWorkingDay: true,
  isHoliday: false,
  holidayName: null,
  customerCount: 0,
  status: "red",
};

test("buildCollectionDailyCalendarAuditHistoryItems returns default entry without metadata", () => {
  const items = buildCollectionDailyCalendarAuditHistoryItems(baseDay);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.label, "Status default");
});

test("buildCollectionDailyCalendarAuditHistoryItems summarizes created and updated metadata", () => {
  const items = buildCollectionDailyCalendarAuditHistoryItems({
    ...baseDay,
    calendarStatus: "HOLIDAY",
    leaveType: "AL",
    note: "Annual leave",
    createdBy: "superuser",
    createdAt: "2026-05-01T01:00:00.000Z",
    updatedBy: "superuser",
    updatedAt: "2026-05-01T02:00:00.000Z",
  });

  assert.equal(items.length, 2);
  assert.equal(items[0]?.label, "Rekod dibuat");
  assert.match(items[1]?.detail ?? "", /AL/);
  assert.match(items[1]?.detail ?? "", /Annual leave/);
});
