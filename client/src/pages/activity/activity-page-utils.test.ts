import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityRecord } from "@/pages/activity/types";
import {
  getActivityAccessLabel,
  getActivityPageDescription,
  toggleActivitySelection,
  toggleAllVisibleActivitySelection,
} from "@/pages/activity/activity-page-utils";

test("getActivityPageDescription returns mobile copy", () => {
  assert.equal(
    getActivityPageDescription(true),
    "Monitor user activity and moderation events in real-time.",
  );
});

test("getActivityAccessLabel reflects moderation capability", () => {
  assert.equal(getActivityAccessLabel(true), "Moderation enabled");
  assert.equal(getActivityAccessLabel(false), "Read-only view");
});

test("toggleActivitySelection adds and removes a selected id", () => {
  const selected = new Set(["a"]);

  assert.deepEqual([...toggleActivitySelection(selected, "b", true)], ["a", "b"]);
  assert.deepEqual([...toggleActivitySelection(selected, "a", false)], []);
});

test("toggleAllVisibleActivitySelection toggles all visible rows", () => {
  const selected = new Set(["stale", "1"]);
  const activities: ActivityRecord[] = [
    { id: "1" },
    { id: "2" },
  ] as ActivityRecord[];

  assert.deepEqual(
    [...toggleAllVisibleActivitySelection(selected, activities, true)],
    ["stale", "1", "2"],
  );
  assert.deepEqual(
    [...toggleAllVisibleActivitySelection(selected, activities, false)],
    ["stale"],
  );
});
