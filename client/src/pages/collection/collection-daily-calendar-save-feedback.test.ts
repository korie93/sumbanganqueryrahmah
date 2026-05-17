import assert from "node:assert/strict";
import test from "node:test";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import {
  buildCollectionDailyCalendarSavedDescription,
  describeCollectionDailyEditableDayStatus,
} from "@/pages/collection/collection-daily-calendar-save-feedback";

const workingDay: EditableCalendarDay = {
  day: 1,
  status: "WORKING",
  leaveType: null,
  note: "",
  isWorkingDay: true,
  isHoliday: false,
  holidayName: "",
};

const leaveDay: EditableCalendarDay = {
  day: 15,
  status: "HOLIDAY",
  leaveType: "AL",
  note: "Annual leave approved",
  isWorkingDay: false,
  isHoliday: true,
  holidayName: "Annual leave approved",
};

test("describeCollectionDailyEditableDayStatus explains working and leave days", () => {
  assert.equal(describeCollectionDailyEditableDayStatus(workingDay), "Working");
  assert.equal(
    describeCollectionDailyEditableDayStatus(leaveDay),
    "AL - Annual Leave. Remark: Annual leave approved",
  );
});

test("buildCollectionDailyCalendarSavedDescription includes staff, date, and saved status", () => {
  assert.equal(
    buildCollectionDailyCalendarSavedDescription({
      username: "Ali",
      year: 2026,
      month: 5,
      days: [leaveDay],
    }),
    "Status Ali pada 15/05/2026 ditetapkan kepada AL - Annual Leave. Remark: Annual leave approved.",
  );
});

test("buildCollectionDailyCalendarSavedDescription summarizes multi-day saves", () => {
  assert.equal(
    buildCollectionDailyCalendarSavedDescription({
      username: "Abu",
      year: 2026,
      month: 5,
      days: [workingDay, leaveDay],
    }),
    "2 changed days saved for Abu.",
  );
});
