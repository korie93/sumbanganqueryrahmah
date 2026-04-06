import assert from "node:assert/strict";
import test from "node:test";
import {
  getBanDialogDescription,
  getBulkDeleteDialogDescription,
  getDeleteDialogDescription,
  getKickDialogDescription,
  getUnbanDialogDescription,
} from "@/pages/activity/activity-action-dialog-utils";

test("activity action dialog descriptions preserve usernames", () => {
  assert.equal(
    getKickDialogDescription("alice"),
    'Are you sure you want to force logout "alice"? The user can log in again.',
  );
  assert.equal(
    getBanDialogDescription("alice"),
    'Are you sure you want to ban "alice"? The user will not be able to log in until unbanned.',
  );
  assert.equal(
    getDeleteDialogDescription("alice"),
    'Are you sure you want to delete the activity log for "alice"? This action cannot be undone.',
  );
  assert.equal(
    getUnbanDialogDescription("alice"),
    'Are you sure you want to unban "alice"? The user will be able to log in again.',
  );
});

test("getBulkDeleteDialogDescription reflects selected row count", () => {
  assert.equal(
    getBulkDeleteDialogDescription(3),
    "Are you sure you want to delete 3 selected activity log(s)? This action cannot be undone.",
  );
});
