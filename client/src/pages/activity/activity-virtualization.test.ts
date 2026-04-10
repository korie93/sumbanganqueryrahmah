import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_DESKTOP_ROW_HEIGHT_PX,
  getActivityDesktopGridTemplate,
  getVirtualizedListHeight,
} from "@/pages/activity/activity-virtualization";

test("getVirtualizedListHeight returns a single-row height when no items are present", () => {
  assert.equal(getVirtualizedListHeight(0, 72, 360), 72);
});

test("getVirtualizedListHeight clamps list height to the configured maximum", () => {
  assert.equal(getVirtualizedListHeight(20, 72, 360), 360);
  assert.equal(getVirtualizedListHeight(2, ACTIVITY_DESKTOP_ROW_HEIGHT_PX, 360), 144);
});

test("getActivityDesktopGridTemplate reserves selection and action columns only for moderation views", () => {
  assert.match(getActivityDesktopGridTemplate(true), /^3rem /);
  assert.doesNotMatch(getActivityDesktopGridTemplate(false), /^3rem /);
});
