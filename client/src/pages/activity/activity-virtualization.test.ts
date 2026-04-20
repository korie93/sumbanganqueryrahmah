import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_DESKTOP_ROW_HEIGHT_PX,
  getActivityDesktopGridClassName,
  getVirtualizedListHeight,
  shouldVirtualizeActivityDesktopLogs,
} from "@/pages/activity/activity-virtualization";

test("getVirtualizedListHeight returns a single-row height when no items are present", () => {
  assert.equal(getVirtualizedListHeight(0, 72, 360), 72);
});

test("getVirtualizedListHeight clamps list height to the configured maximum", () => {
  assert.equal(getVirtualizedListHeight(20, 72, 360), 360);
  assert.equal(getVirtualizedListHeight(2, ACTIVITY_DESKTOP_ROW_HEIGHT_PX, 360), 144);
});

test("getActivityDesktopGridClassName reserves selection and action columns only for moderation views", () => {
  assert.match(getActivityDesktopGridClassName(true), /^grid-cols-\[3rem_/);
  assert.doesNotMatch(getActivityDesktopGridClassName(false), /^grid-cols-\[3rem_/);
});

test("shouldVirtualizeActivityDesktopLogs only enables virtualization once the bounded desktop list becomes large enough", () => {
  assert.equal(shouldVirtualizeActivityDesktopLogs(10), false);
  assert.equal(shouldVirtualizeActivityDesktopLogs(11), true);
});
