import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityRecord } from "@/pages/activity/types";
import {
  shouldRenderBannedUsersSection,
  updateActivitySelection,
  updateAllVisibleActivitySelection,
} from "@/pages/activity/activity-page-content-utils";

test("shouldRenderBannedUsersSection only shows moderator-only non-empty state", () => {
  assert.equal(shouldRenderBannedUsersSection(true, 2), true);
  assert.equal(shouldRenderBannedUsersSection(true, 0), false);
  assert.equal(shouldRenderBannedUsersSection(false, 3), false);
});

test("updateActivitySelection toggles a single selected row", () => {
  const selected = new Set(["row-1"]);

  assert.deepEqual([...updateActivitySelection(selected, "row-2", true)], ["row-1", "row-2"]);
  assert.deepEqual([...updateActivitySelection(selected, "row-1", false)], []);
});

test("updateAllVisibleActivitySelection toggles all visible rows while preserving stale ids", () => {
  const selected = new Set(["stale", "row-1"]);
  const activities = [{ id: "row-1" }, { id: "row-2" }] as ActivityRecord[];

  assert.deepEqual(
    [...updateAllVisibleActivitySelection(selected, activities, true)],
    ["stale", "row-1", "row-2"],
  );
  assert.deepEqual(
    [...updateAllVisibleActivitySelection(selected, activities, false)],
    ["stale"],
  );
});
