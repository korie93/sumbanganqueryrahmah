import assert from "node:assert/strict";
import test from "node:test";
import {
  getActivityFilterActionButtonClassName,
  getActivityFilterActionContainerClassName,
  getActivityFiltersPanelHeaderClassName,
  getActivityFiltersPanelTitle,
  getActivityFiltersPanelTitleClassName,
  getActivityStatusOptionClassName,
} from "@/pages/activity/activity-filters-panel-utils";

test("activity filters panel utils reflect mobile and desktop copy", () => {
  assert.equal(getActivityFiltersPanelHeaderClassName(true), "pb-2.5");
  assert.equal(getActivityFiltersPanelHeaderClassName(false), "pb-3");
  assert.equal(getActivityFiltersPanelTitle(true), "Search & Filters");
  assert.equal(getActivityFiltersPanelTitle(false), "Filter Activity Logs");
  assert.equal(getActivityFiltersPanelTitleClassName(true), "text-base flex items-center gap-2");
  assert.equal(getActivityFiltersPanelTitleClassName(false), "text-lg flex items-center gap-2");
});

test("activity filters panel utils keep mobile layout classes", () => {
  assert.equal(
    getActivityStatusOptionClassName(true),
    "flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5",
  );
  assert.equal(getActivityStatusOptionClassName(false), "flex items-center gap-2");
  assert.equal(
    getActivityFilterActionContainerClassName(true),
    "flex flex-wrap gap-2 pt-2 grid grid-cols-2",
  );
  assert.equal(
    getActivityFilterActionContainerClassName(false),
    "flex gap-2 flex-wrap pt-2",
  );
  assert.equal(getActivityFilterActionButtonClassName(true), "w-full");
  assert.equal(getActivityFilterActionButtonClassName(false), undefined);
});
