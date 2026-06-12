import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBulkDeleteToastPayload,
  getActivityActionErrorDescription,
  getUnbanActionLoadingKey,
  removeSelectedActivityId,
} from "@/pages/activity/activity-action-state-utils";

test("activity action state utils build bulk delete success and partial payloads", () => {
  assert.deepEqual(
    buildBulkDeleteToastPayload({
      deletedCount: 3,
      requestedCount: 3,
      notFoundIds: [],
      protectedIds: [],
    }),
    {
      title: "Success",
      description: "3 activity log(s) deleted.",
      variant: "default",
    },
  );

  assert.deepEqual(
    buildBulkDeleteToastPayload({
      deletedCount: 2,
      requestedCount: 4,
      notFoundIds: ["a", "b"],
      protectedIds: [],
    }),
    {
      title: "Partial cleanup",
      description: "2 deleted, 0 protected by active bans, 2 missing.",
      variant: "warning",
    },
  );

  assert.deepEqual(
    buildBulkDeleteToastPayload({
      deletedCount: 1,
      requestedCount: 2,
      notFoundIds: [],
      protectedIds: ["banned-activity"],
    }),
    {
      title: "Partial cleanup",
      description: "1 deleted, 1 protected by active bans, 0 missing.",
      variant: "warning",
    },
  );
});

test("activity action state utils derive error and loading keys", () => {
  assert.equal(getActivityActionErrorDescription(new Error("boom"), "fallback"), "boom");
  assert.equal(getActivityActionErrorDescription("boom", "fallback"), "fallback");
  assert.equal(getUnbanActionLoadingKey({ banId: "ban-1", username: "alice" }), "ban-1");
  assert.equal(getUnbanActionLoadingKey({ username: "alice" }), "alice");
});

test("removeSelectedActivityId removes selected ids immutably", () => {
  const previous = new Set(["a", "b"]);
  const next = removeSelectedActivityId(previous, "a");

  assert.deepEqual([...next], ["b"]);
  assert.deepEqual([...previous], ["a", "b"]);
  assert.equal(removeSelectedActivityId(previous, "missing"), previous);
});
