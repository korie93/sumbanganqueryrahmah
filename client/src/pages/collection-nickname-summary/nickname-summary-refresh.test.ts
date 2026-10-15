import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCollectionNicknameSummaryRefreshScope } from "./nickname-summary-refresh";

const applied = {
  canAccess: true, hasApplied: true, loadingSummary: false,
  appliedNicknames: ["Alpha", "Beta"], appliedFromDate: "2026-09-01", appliedToDate: "2026-09-30",
};

test("background refresh retains the last applied scope despite pending draft edits", () => {
  const selection = {
    ...applied, selectedNicknames: ["Gamma"], fromDate: "2026-10-01", toDate: "2026-10-31",
  };
  assert.deepEqual(getCollectionNicknameSummaryRefreshScope(selection), {
    from: "2026-09-01", to: "2026-09-30", nicknames: ["Alpha", "Beta"],
  });
  assert.deepEqual(selection.selectedNicknames, ["Gamma"]);
});

test("an invalid or empty draft cannot change the applied refresh scope", () => {
  for (const draft of [
    { selectedNicknames: [], fromDate: "", toDate: "" },
    { selectedNicknames: ["Gamma"], fromDate: "2026-10-31", toDate: "2026-10-01" },
    { selectedNicknames: ["Gamma"], fromDate: "invalid", toDate: "2026-10-01" },
  ]) {
    assert.deepEqual(getCollectionNicknameSummaryRefreshScope({ ...applied, ...draft }), {
      from: "2026-09-01", to: "2026-09-30", nicknames: ["Alpha", "Beta"],
    });
  }
});

test("background refresh respects access, Reset, pending Apply and valid applied filters", () => {
  for (const changes of [
    { canAccess: false }, { hasApplied: false }, { loadingSummary: true },
    { appliedNicknames: [] }, { appliedNicknames: [" "] },
    { appliedFromDate: "" }, { appliedToDate: "invalid" },
    { appliedFromDate: "2026-10-01", appliedToDate: "2026-09-30" },
  ]) {
    assert.equal(getCollectionNicknameSummaryRefreshScope({ ...applied, ...changes }), null);
  }
});

test("refresh copies the applied nickname selection", () => {
  const selection = { ...applied, appliedNicknames: [" Alpha ", "Beta"] };
  const scope = getCollectionNicknameSummaryRefreshScope(selection);
  assert.ok(scope);
  scope.nicknames.push("Gamma");
  assert.deepEqual(selection.appliedNicknames, [" Alpha ", "Beta"]);
});

test("data and target event refreshes use only applied scope while explicit Apply uses drafts", () => {
  const source = readFileSync(new URL("./useCollectionNicknameSummaryData.ts", import.meta.url), "utf8");
  const eventHandler = source.slice(source.indexOf("const handleCollectionDataChanged"), source.indexOf("const reset ="));
  assert.match(eventHandler, /summaryCacheRef\.current\.clear\(\)/);
  assert.match(eventHandler, /getCollectionNicknameSummaryRefreshScope\(\{\s*canAccess,\s*hasApplied,\s*loadingSummary,\s*appliedNicknames,\s*appliedFromDate,\s*appliedToDate/);
  assert.match(eventHandler, /if \(!refreshScope\) return/);
  assert.match(eventHandler, /loadSummary\(refreshScope\.from, refreshScope\.to, refreshScope\.nicknames\)/);
  assert.doesNotMatch(eventHandler, /\bselectedNicknames\b|\bfromDate\b|\btoDate\b/);
  assert.match(source, /await loadSummary\(fromDate, toDate, selectedNicknames\)/);
  assert.match(source, /const reset = [\s\S]*?setHasApplied\(false\)/);
});
