import assert from "node:assert/strict";
import test from "node:test";
import {
  getActivityLogsCountLabel,
  getActivityLogsEmptyLabel,
  getActivitySelectionCountLabel,
} from "@/pages/activity/activity-logs-table-utils";

test("getActivityLogsCountLabel keeps records summary copy", () => {
  assert.equal(getActivityLogsCountLabel(12), "12 records");
});

test("getActivitySelectionCountLabel keeps selected summary copy", () => {
  assert.equal(getActivitySelectionCountLabel(3), "3 selected");
});

test("getActivityLogsEmptyLabel returns empty state copy", () => {
  assert.equal(getActivityLogsEmptyLabel(), "No activity records");
});
