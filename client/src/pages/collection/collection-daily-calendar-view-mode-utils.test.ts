import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE,
  getCollectionDailyCalendarViewModeStatusText,
  isCollectionDailyCalendarIconViewMode,
  normalizeCollectionDailyCalendarViewMode,
} from "@/pages/collection/collection-daily-calendar-view-mode-utils";

test("normalizeCollectionDailyCalendarViewMode accepts supported modes only", () => {
  assert.equal(normalizeCollectionDailyCalendarViewMode("list"), "list");
  assert.equal(normalizeCollectionDailyCalendarViewMode("icon-sm"), "icon-sm");
  assert.equal(normalizeCollectionDailyCalendarViewMode("icon-md"), "icon-md");
  assert.equal(normalizeCollectionDailyCalendarViewMode("icon-lg"), "icon-lg");
  assert.equal(normalizeCollectionDailyCalendarViewMode("tiles"), "tiles");
  assert.equal(normalizeCollectionDailyCalendarViewMode("heatmap"), "heatmap");
  assert.equal(normalizeCollectionDailyCalendarViewMode("content"), "content");
  assert.equal(
    normalizeCollectionDailyCalendarViewMode("broken"),
    DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE,
  );
});

test("calendar view mode helpers keep icon and status copy predictable", () => {
  assert.equal(isCollectionDailyCalendarIconViewMode("icon-sm"), true);
  assert.equal(isCollectionDailyCalendarIconViewMode("icon-md"), true);
  assert.equal(isCollectionDailyCalendarIconViewMode("icon-lg"), true);
  assert.equal(isCollectionDailyCalendarIconViewMode("list"), false);
  assert.match(getCollectionDailyCalendarViewModeStatusText("tiles"), /Tiles/);
});
