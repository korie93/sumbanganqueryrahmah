import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ACTIVITY_FILTERS } from "@/pages/activity/types";
import type { ActivityRecord } from "@/pages/activity/types";
import {
  countActivitiesByStatus,
  formatActivityTime,
  getActivityFilterCount,
  getSessionDuration,
  hasActiveActivityFilters,
  parseActivityUserAgent,
} from "@/pages/activity/utils";

test("formatActivityTime renders activity timestamps with AM and PM in Malaysia time", () => {
  assert.equal(
    formatActivityTime("2026-03-29T16:30:00.000Z"),
    "30/03/2026, 12:30 AM",
  );
});

test("activity filter helpers count active fields", () => {
  const filters = {
    ...DEFAULT_ACTIVITY_FILTERS,
    browser: "Chrome",
    status: ["ONLINE", "IDLE"],
  };

  assert.equal(hasActiveActivityFilters(DEFAULT_ACTIVITY_FILTERS), false);
  assert.equal(hasActiveActivityFilters(filters), true);
  assert.equal(getActivityFilterCount(filters), 3);
});

test("getSessionDuration formats minute and hour ranges", () => {
  assert.equal(getSessionDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:30.000Z"), "< 1 min");
  assert.equal(getSessionDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:45:00.000Z"), "45 min");
  assert.equal(getSessionDuration("2026-01-01T00:00:00.000Z", "2026-01-01T02:15:00.000Z"), "2h 15m");
});

test("parseActivityUserAgent detects common and plain user agents", () => {
  assert.deepEqual(parseActivityUserAgent("Chrome 120"), {
    browser: "Chrome",
    version: "120",
  });
  assert.deepEqual(parseActivityUserAgent("Mozilla/5.0 Chrome/121.0 Safari/537.36"), {
    browser: "Chrome",
    version: "121",
  });
});

test("countActivitiesByStatus counts matching visible rows", () => {
  const activities = [
    { status: "ONLINE" },
    { status: "IDLE" },
    { status: "ONLINE" },
  ] as ActivityRecord[];

  assert.equal(countActivitiesByStatus(activities, "ONLINE"), 2);
});
