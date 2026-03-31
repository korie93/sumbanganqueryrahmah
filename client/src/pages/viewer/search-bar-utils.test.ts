import assert from "node:assert/strict";
import test from "node:test";
import {
  buildViewerSearchResultsSummary,
  buildViewerSearchShortcutHint,
} from "@/pages/viewer/search-bar-utils";

test("buildViewerSearchShortcutHint returns the expected quick-focus key", () => {
  assert.equal(buildViewerSearchShortcutHint(), "/");
});

test("buildViewerSearchResultsSummary formats current page search summary", () => {
  assert.equal(
    buildViewerSearchResultsSummary(8, 25),
    "8 shown on this page of 25",
  );
});
