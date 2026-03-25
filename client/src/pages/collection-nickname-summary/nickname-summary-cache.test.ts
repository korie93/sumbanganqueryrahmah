import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionNicknameSummaryCacheKey,
  createCollectionNicknameSummaryCache,
  normalizeCollectionNicknameSummaryNicknames,
} from "@/pages/collection-nickname-summary/nickname-summary-cache";

test("normalizeCollectionNicknameSummaryNicknames dedupes and sorts values", () => {
  assert.deepEqual(
    normalizeCollectionNicknameSummaryNicknames([
      " Beta ",
      "alpha",
      "ALPHA",
      "",
      " beta",
    ]),
    ["alpha", "beta"],
  );
});

test("buildCollectionNicknameSummaryCacheKey normalizes nickname casing and dates", () => {
  const first = buildCollectionNicknameSummaryCacheKey({
    from: "2026-03-01",
    to: "2026-03-31",
    nicknames: [" Collector Beta ", "collector alpha"],
  });
  const second = buildCollectionNicknameSummaryCacheKey({
    from: "2026-03-01",
    to: "2026-03-31",
    nicknames: ["collector alpha", "COLLECTOR BETA"],
  });

  assert.equal(first, second);
});

test("createCollectionNicknameSummaryCache evicts least-recently-used entries", () => {
  const cache = createCollectionNicknameSummaryCache(2);

  cache.set("summary-1", {
    nicknameTotals: [{ nickname: "Alpha", totalAmount: 10, totalRecords: 1 }],
    totalAmount: 10,
    totalRecords: 1,
    freshness: null,
  });
  cache.set("summary-2", {
    nicknameTotals: [{ nickname: "Beta", totalAmount: 20, totalRecords: 2 }],
    totalAmount: 20,
    totalRecords: 2,
    freshness: null,
  });
  assert.equal(cache.size(), 2);

  assert.equal(cache.get("summary-1")?.nicknameTotals[0]?.nickname, "Alpha");

  cache.set("summary-3", {
    nicknameTotals: [{ nickname: "Gamma", totalAmount: 30, totalRecords: 3 }],
    totalAmount: 30,
    totalRecords: 3,
    freshness: null,
  });

  assert.equal(cache.get("summary-2"), null);
  assert.equal(cache.get("summary-1")?.totalAmount, 10);
  assert.equal(cache.get("summary-3")?.totalRecords, 3);
});

test("createCollectionNicknameSummaryCache clear removes cached summaries", () => {
  const cache = createCollectionNicknameSummaryCache(2);

  cache.set("summary-1", {
    nicknameTotals: [{ nickname: "Alpha", totalAmount: 10, totalRecords: 1 }],
    totalAmount: 10,
    totalRecords: 1,
    freshness: null,
  });
  cache.clear();

  assert.equal(cache.size(), 0);
  assert.equal(cache.get("summary-1"), null);
});
