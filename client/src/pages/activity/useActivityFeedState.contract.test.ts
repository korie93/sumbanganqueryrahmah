import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client", "src", "pages", "activity", "useActivityFeedState.ts"),
  "utf8",
);

test("useActivityFeedState records activity fetch failures instead of dropping them silently", () => {
  assert.match(source, /const recordActivityFeedFailure = useCallback\(\(error: unknown\) => \{/);
  assert.match(source, /setErrorMessage\(nextErrorMessage\)/);
  assert.match(source, /event: "activity_feed_fetch_failed"/);
  assert.match(source, /logClientError\("Failed to fetch activities:", error, \{/);
});

test("useActivityFeedState attaches catch handlers to background refresh promises", () => {
  assert.match(source, /const runFetchActivities = useCallback\(\(useFilters = false\) => \{/);
  assert.match(source, /void fetchActivities\(useFilters\)\.catch\(handleUnexpectedActivityFeedFailure\);/);
  assert.doesNotMatch(source, /void fetchActivities\((?:false|true)\);/);
});
