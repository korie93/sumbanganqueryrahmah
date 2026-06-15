import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionNicknameSummaryChartResetKey,
  countCollectionNicknameSummaryControls,
  formatCollectionNicknameSummaryMobileDateRange,
  getCollectionNicknameSummaryPreview,
} from "../collection-nickname-summary-page-utils";

test("countCollectionNicknameSummaryControls counts selected scope and date filters", () => {
  assert.equal(countCollectionNicknameSummaryControls({
    selectedNicknames: [],
    fromDate: "",
    toDate: "",
  }), 0);
  assert.equal(countCollectionNicknameSummaryControls({
    selectedNicknames: ["staff-a"],
    fromDate: "2026-04-01",
    toDate: "2026-04-07",
  }), 3);
});

test("formatCollectionNicknameSummaryMobileDateRange describes partial and complete ranges", () => {
  assert.equal(
    formatCollectionNicknameSummaryMobileDateRange("", ""),
    "Choose a date range before applying the nickname summary.",
  );
  assert.equal(formatCollectionNicknameSummaryMobileDateRange("2026-04-01", ""), "From 01/04/2026");
  assert.equal(formatCollectionNicknameSummaryMobileDateRange("", "2026-04-07"), "To 07/04/2026");
  assert.equal(
    formatCollectionNicknameSummaryMobileDateRange("2026-04-01", "2026-04-07"),
    "01/04/2026 - 07/04/2026",
  );
});

test("getCollectionNicknameSummaryPreview limits preview chips", () => {
  assert.deepEqual(getCollectionNicknameSummaryPreview(["a", "b", "c"]), {
    selectedNicknamePreview: ["a", "b"],
    remainingNicknameCount: 1,
  });
});

test("buildCollectionNicknameSummaryChartResetKey is stable for the same filter scope", () => {
  const first = buildCollectionNicknameSummaryChartResetKey({
    selectedNicknames: [" Collector Beta ", "collector alpha", "Collector Beta"],
    fromDate: "2026-06-01",
    toDate: "2026-06-15",
  });
  const second = buildCollectionNicknameSummaryChartResetKey({
    selectedNicknames: ["COLLECTOR ALPHA", "collector beta"],
    fromDate: "2026-06-01",
    toDate: "2026-06-15",
  });

  assert.equal(first, second);
  assert.notEqual(
    first,
    buildCollectionNicknameSummaryChartResetKey({
      selectedNicknames: ["collector alpha", "collector beta"],
      fromDate: "2026-06-02",
      toDate: "2026-06-15",
    }),
  );
});
