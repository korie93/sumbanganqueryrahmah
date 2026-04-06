import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityFilters } from "@/lib/api";
import {
  buildActivitySummaryCounts,
  countSelectedVisibleActivities,
  reconcileSelectedActivityIds,
  toggleActivityStatusFilter,
} from "@/pages/activity/activity-page-state-utils";
import type { ActivityRecord } from "@/pages/activity/types";

const ACTIVITY_FIXTURES: ActivityRecord[] = [
  {
    id: "1",
    username: "alpha",
    role: "user",
    status: "ONLINE",
    loginTime: "2026-04-07T08:00:00.000Z",
    isActive: true,
  },
  {
    id: "2",
    username: "beta",
    role: "user",
    status: "IDLE",
    loginTime: "2026-04-07T08:05:00.000Z",
    isActive: true,
  },
  {
    id: "3",
    username: "gamma",
    role: "admin",
    status: "KICKED",
    loginTime: "2026-04-07T08:10:00.000Z",
    isActive: false,
  },
];

test("reconcileSelectedActivityIds keeps only visible ids", () => {
  const selected = new Set(["1", "stale"]);

  assert.deepEqual(
    [...reconcileSelectedActivityIds(selected, ACTIVITY_FIXTURES)],
    ["1"],
  );
});

test("toggleActivityStatusFilter adds and removes statuses immutably", () => {
  const initialFilters: ActivityFilters = {
    status: ["ONLINE"],
    username: "",
    ipAddress: "",
    browser: "",
    dateFrom: "",
    dateTo: "",
  };

  assert.deepEqual(toggleActivityStatusFilter(initialFilters, "IDLE").status, ["ONLINE", "IDLE"]);
  assert.deepEqual(toggleActivityStatusFilter(initialFilters, "ONLINE").status, []);
});

test("countSelectedVisibleActivities only counts visible selections", () => {
  assert.equal(
    countSelectedVisibleActivities(ACTIVITY_FIXTURES, new Set(["1", "3", "missing"])),
    2,
  );
});

test("buildActivitySummaryCounts groups visible activity statuses", () => {
  assert.deepEqual(buildActivitySummaryCounts(ACTIVITY_FIXTURES), {
    idleCount: 1,
    kickedCount: 1,
    logoutCount: 0,
    onlineCount: 1,
  });
});
