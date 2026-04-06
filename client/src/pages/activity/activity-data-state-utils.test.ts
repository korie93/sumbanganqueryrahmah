import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ACTIVITY_FILTERS } from "@/pages/activity/types";
import {
  shouldAutoRefreshVisibleActivity,
  shouldUseFilteredActivityFetch,
} from "@/pages/activity/activity-data-state-utils";

test("shouldUseFilteredActivityFetch only enables filtered mode for active filters", () => {
  assert.equal(shouldUseFilteredActivityFetch(DEFAULT_ACTIVITY_FILTERS, false), false);
  assert.equal(shouldUseFilteredActivityFetch(DEFAULT_ACTIVITY_FILTERS, true), false);
  assert.equal(
    shouldUseFilteredActivityFetch({ ...DEFAULT_ACTIVITY_FILTERS, username: "admin" }, true),
    true,
  );
});

test("shouldAutoRefreshVisibleActivity requires visible page and no active filters", () => {
  assert.equal(shouldAutoRefreshVisibleActivity(DEFAULT_ACTIVITY_FILTERS, "visible"), true);
  assert.equal(shouldAutoRefreshVisibleActivity(DEFAULT_ACTIVITY_FILTERS, "hidden"), false);
  assert.equal(
    shouldAutoRefreshVisibleActivity({ ...DEFAULT_ACTIVITY_FILTERS, browser: "Chrome" }, "visible"),
    false,
  );
});
