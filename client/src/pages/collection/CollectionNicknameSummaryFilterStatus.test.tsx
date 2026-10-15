import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionNicknameSummaryFilterStatus } from "./CollectionNicknameSummaryFilterStatus";
import { hasCollectionNicknameSummaryDraftChanges } from "./collection-nickname-summary-page-utils";

const applied = {
  hasApplied: true, selectedNicknames: ["Alpha", "Beta"], fromDate: "2026-09-01", toDate: "2026-09-30",
  appliedNicknames: ["Alpha", "Beta"], appliedFromDate: "2026-09-01", appliedToDate: "2026-09-30",
};

test("nickname filters compare the applied scope by nickname set and dates", () => {
  assert.equal(hasCollectionNicknameSummaryDraftChanges(applied), false);
  assert.equal(hasCollectionNicknameSummaryDraftChanges({ ...applied, selectedNicknames: ["BETA", "Alpha"] }), false);
  assert.equal(hasCollectionNicknameSummaryDraftChanges({ ...applied, selectedNicknames: ["Alpha"] }), true);
  assert.equal(hasCollectionNicknameSummaryDraftChanges({ ...applied, fromDate: "2026-09-02" }), true);
  assert.equal(hasCollectionNicknameSummaryDraftChanges({ ...applied, toDate: "2026-09-29" }), true);
  assert.equal(hasCollectionNicknameSummaryDraftChanges({ ...applied, hasApplied: false }), false);
});

test("draft edits clearly describe the result scope that is still applied", () => {
  const html = renderToStaticMarkup(createElement(CollectionNicknameSummaryFilterStatus, {
    selection: { ...applied, selectedNicknames: ["Gamma"], fromDate: "2026-10-01", toDate: "2026-10-31" },
  }));
  assert.match(html, /role="status"/);
  assert.match(html, /break-words[^\"]*\[overflow-wrap:anywhere\]/);
  assert.match(html, /Draft changes are not applied/);
  assert.match(html, /Showing results for Alpha, Beta/);
  assert.match(html, /01\/09\/2026 - 30\/09\/2026/);
  assert.match(html, /Choose Apply to update/);
  assert.doesNotMatch(html, /Gamma|10\/2026/);
});

test("initial nickname filters do not claim that results are applied", () => {
  const html = renderToStaticMarkup(createElement(CollectionNicknameSummaryFilterStatus, {
    selection: { ...applied, hasApplied: false },
  }));
  assert.match(html, /then Apply to load results/);
  assert.doesNotMatch(html, /Showing results|Filters applied/);
  const mobile = readFileSync(new URL("./CollectionNicknameSummaryMobileFilters.tsx", import.meta.url), "utf8");
  assert.match(mobile, /hasDraftChanges \? "Unapplied changes" : summaryData.hasApplied \? "Applied" : "Pending"/);
  const page = readFileSync(new URL("./CollectionNicknameSummaryPage.tsx", import.meta.url), "utf8");
  assert.match(page, /buildCollectionNicknameSummaryChartResetKey\(\{\s*selectedNicknames: summaryData.appliedNicknames/);
});
