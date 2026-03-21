import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_COLLECTION_DAILY_YEAR,
  MIN_COLLECTION_DAILY_YEAR,
  normalizeCollectionDailyMonthInput,
  normalizeCollectionDailyYearInput,
  parseIntegerInput,
} from "@/pages/collection/useCollectionDailyPeriod";
import {
  formatCollectionDailySelectedUsersLabel,
  reconcileCollectionDailySelectedUsers,
} from "@/pages/collection/useCollectionDailyUserSelection";
import {
  buildCollectionDailyCalendarPayloadDays,
  getCollectionDailyEmptyOverviewMessage,
  getCollectionDailyFirstWeekday,
  mapCollectionDailyEditableCalendarDays,
  shouldLoadCollectionDailyOverview,
  updateCollectionDailyEditableCalendarDay,
} from "@/pages/collection/useCollectionDailyData";
import { buildCollectionDailyReceiptKey } from "@/pages/collection/useCollectionDailyReceiptViewer";

test("parseIntegerInput returns integer values and rejects blanks", () => {
  assert.equal(parseIntegerInput("12"), 12);
  assert.equal(parseIntegerInput(" 08 "), 8);
  assert.equal(parseIntegerInput(""), null);
  assert.equal(parseIntegerInput("abc"), null);
});

test("normalizeCollectionDailyYearInput clamps to supported range", () => {
  assert.equal(normalizeCollectionDailyYearInput("1990", 2026), MIN_COLLECTION_DAILY_YEAR);
  assert.equal(normalizeCollectionDailyYearInput("9999", 2026), MAX_COLLECTION_DAILY_YEAR);
  assert.equal(normalizeCollectionDailyYearInput("", 2026), 2026);
  assert.equal(normalizeCollectionDailyYearInput("2027", 2026), 2027);
});

test("normalizeCollectionDailyMonthInput clamps to valid months", () => {
  assert.equal(normalizeCollectionDailyMonthInput("0", 3), 1);
  assert.equal(normalizeCollectionDailyMonthInput("13", 3), 12);
  assert.equal(normalizeCollectionDailyMonthInput("", 3), 3);
  assert.equal(normalizeCollectionDailyMonthInput("11", 3), 11);
});

test("reconcileCollectionDailySelectedUsers keeps valid selections", () => {
  const users = [
    { id: "1", username: "alice", role: "admin" },
    { id: "2", username: "bob", role: "user" },
  ];
  assert.deepEqual(reconcileCollectionDailySelectedUsers(["ALICE"], users), ["ALICE"]);
  assert.deepEqual(reconcileCollectionDailySelectedUsers(["carol"], users), ["alice"]);
  assert.deepEqual(reconcileCollectionDailySelectedUsers([], users, "bob"), ["bob"]);
  assert.deepEqual(reconcileCollectionDailySelectedUsers([], users), ["alice"]);
  assert.deepEqual(reconcileCollectionDailySelectedUsers(["carol"], []), []);
});

test("formatCollectionDailySelectedUsersLabel returns business-friendly labels", () => {
  const users = [
    { id: "1", username: "alice", role: "admin" },
    { id: "2", username: "bob", role: "user" },
  ];
  assert.equal(
    formatCollectionDailySelectedUsersLabel({
      canManage: false,
      currentUsername: "staff1",
      selectedUsernames: [],
      users,
    }),
    "staff1",
  );
  assert.equal(
    formatCollectionDailySelectedUsersLabel({
      canManage: true,
      currentUsername: "",
      selectedUsernames: [],
      users,
    }),
    "Select staff nicknames",
  );
  assert.equal(
    formatCollectionDailySelectedUsersLabel({
      canManage: true,
      currentUsername: "",
      selectedUsernames: ["alice"],
      users,
    }),
    "alice",
  );
  assert.equal(
    formatCollectionDailySelectedUsersLabel({
      canManage: true,
      currentUsername: "",
      selectedUsernames: ["alice", "bob"],
      users,
    }),
    "2 staff nicknames selected",
  );
});

test("shouldLoadCollectionDailyOverview blocks invalid loading states", () => {
  assert.equal(
    shouldLoadCollectionDailyOverview({
      canManage: true,
      currentUsername: "admin1",
      selectedUsernames: [],
    }),
    false,
  );
  assert.equal(
    shouldLoadCollectionDailyOverview({
      canManage: false,
      currentUsername: "",
      selectedUsernames: ["staff1"],
    }),
    false,
  );
  assert.equal(
    shouldLoadCollectionDailyOverview({
      canManage: true,
      currentUsername: "admin1",
      selectedUsernames: ["staff1"],
    }),
    true,
  );
});

test("getCollectionDailyEmptyOverviewMessage returns the correct empty-state copy", () => {
  assert.equal(
    getCollectionDailyEmptyOverviewMessage({
      canManage: true,
      currentUsername: "admin1",
      selectedUsernames: [],
    }),
    "Select at least one staff nickname to view Collection Daily.",
  );
  assert.equal(
    getCollectionDailyEmptyOverviewMessage({
      canManage: false,
      currentUsername: "",
      selectedUsernames: ["staff1"],
    }),
    "Current staff nickname session could not be resolved.",
  );
  assert.equal(
    getCollectionDailyEmptyOverviewMessage({
      canManage: true,
      currentUsername: "admin1",
      selectedUsernames: ["staff1"],
    }),
    "No overview data found.",
  );
});

test("mapCollectionDailyEditableCalendarDays normalizes nullable holiday names", () => {
  const response = {
    ok: true,
    username: "staff1",
    usernames: ["staff1"],
    role: "user",
    month: { year: 2026, month: 3, daysInMonth: 31 },
    summary: {
      monthlyTarget: 1000,
      collectedToDate: 100,
      collectedAmount: 100,
      remainingTarget: 900,
      balancedAmount: 900,
      workingDays: 20,
      elapsedWorkingDays: 2,
      remainingWorkingDays: 18,
      requiredPerRemainingWorkingDay: 50,
      completedDays: 1,
      incompleteDays: 1,
      noCollectionDays: 1,
      neutralDays: 0,
      baseDailyTarget: 50,
      dailyTarget: 50,
      expectedProgressAmount: 100,
      progressVarianceAmount: 0,
      achievedAmount: 100,
      remainingAmount: 900,
      metDays: 1,
      yellowDays: 1,
      redDays: 1,
    },
    days: [
      {
        day: 1,
        date: "2026-03-01",
        amount: 0,
        target: 50,
        isWorkingDay: true,
        isHoliday: false,
        holidayName: null,
        customerCount: 0,
        status: "red" as const,
      },
      {
        day: 2,
        date: "2026-03-02",
        amount: 100,
        target: 50,
        isWorkingDay: false,
        isHoliday: true,
        holidayName: "Public Holiday",
        customerCount: 1,
        status: "neutral" as const,
      },
    ],
  };
  assert.deepEqual(mapCollectionDailyEditableCalendarDays(response), [
    { day: 1, isWorkingDay: true, isHoliday: false, holidayName: "" },
    { day: 2, isWorkingDay: false, isHoliday: true, holidayName: "Public Holiday" },
  ]);
});

test("buildCollectionDailyCalendarPayloadDays converts blank holiday names to null", () => {
  assert.deepEqual(
    buildCollectionDailyCalendarPayloadDays([
      { day: 1, isWorkingDay: true, isHoliday: false, holidayName: "" },
      { day: 2, isWorkingDay: false, isHoliday: true, holidayName: "Public Holiday" },
    ]),
    [
      { day: 1, isWorkingDay: true, isHoliday: false, holidayName: null },
      { day: 2, isWorkingDay: false, isHoliday: true, holidayName: "Public Holiday" },
    ],
  );
});

test("updateCollectionDailyEditableCalendarDay updates only the targeted day", () => {
  const previous = [
    { day: 1, isWorkingDay: true, isHoliday: false, holidayName: "" },
    { day: 2, isWorkingDay: true, isHoliday: false, holidayName: "" },
  ];
  assert.deepEqual(
    updateCollectionDailyEditableCalendarDay(previous, 2, { isHoliday: true, holidayName: "Holiday" }),
    [
      { day: 1, isWorkingDay: true, isHoliday: false, holidayName: "" },
      { day: 2, isWorkingDay: true, isHoliday: true, holidayName: "Holiday" },
    ],
  );
});

test("getCollectionDailyFirstWeekday matches JavaScript month indexing correctly", () => {
  assert.equal(getCollectionDailyFirstWeekday(2026, 3), 0);
  assert.equal(getCollectionDailyFirstWeekday(2026, 4), 3);
});

test("buildCollectionDailyReceiptKey normalizes primary and specific receipt keys", () => {
  assert.equal(buildCollectionDailyReceiptKey("record-1"), "record-1:primary");
  assert.equal(buildCollectionDailyReceiptKey("record-1", ""), "record-1:primary");
  assert.equal(buildCollectionDailyReceiptKey("record-1", "receipt-2"), "record-1:receipt-2");
});
