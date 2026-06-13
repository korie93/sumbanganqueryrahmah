import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAnalysisColumnProfiles,
  formatAnalysisUniqueCount,
  getAnalysisColumnIssueCount,
  getAnalysisColumnTypeLabel,
  getAnalysisQualityLabel,
} from "@/pages/analysis/analysis-quality-utils";
import type { AnalysisColumnProfile } from "@/pages/analysis/types";

const profile: AnalysisColumnProfile = {
  name: "Account Number",
  inferredType: "mixed",
  applicableRows: 10,
  populatedCount: 8,
  emptyCount: 2,
  completenessPercent: 80,
  typeConsistencyPercent: 75,
  uniqueCount: 512,
  uniqueCountIsApproximate: true,
  duplicateCount: 1,
  typeDistribution: {
    boolean: 0,
    date: 0,
    number: 6,
    structured: 0,
    text: 2,
  },
};

test("analysis quality helpers expose readable labels and issue counts", () => {
  assert.equal(getAnalysisQualityLabel("review"), "Needs review");
  assert.equal(getAnalysisColumnTypeLabel("mixed"), "Mixed");
  assert.equal(getAnalysisColumnIssueCount(profile), 2);
  assert.equal(formatAnalysisUniqueCount(profile), "512+");
});

test("analysis column profiles can be searched by name or inferred type", () => {
  assert.deepEqual(filterAnalysisColumnProfiles([profile], "account"), [profile]);
  assert.deepEqual(filterAnalysisColumnProfiles([profile], "mixed"), [profile]);
  assert.deepEqual(filterAnalysisColumnProfiles([profile], "date"), []);
});
