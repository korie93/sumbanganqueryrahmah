import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionSummaryCacheKey,
  createCollectionSummaryCache,
  normalizeCollectionSummaryNicknames,
} from "@/pages/collection-summary/summary-cache";

test("normalizeCollectionSummaryNicknames dedupes and sorts summary filters", () => {
  assert.deepEqual(
    normalizeCollectionSummaryNicknames([
      " Collector Beta ",
      "collector alpha",
      "COLLECTOR BETA",
      "",
    ]),
    ["collector alpha", "collector beta"],
  );
});

test("buildCollectionSummaryCacheKey normalizes nickname casing and order", () => {
  const first = buildCollectionSummaryCacheKey({
    year: 2026,
    nicknames: ["Collector Beta", "collector alpha"],
  });
  const second = buildCollectionSummaryCacheKey({
    year: 2026,
    nicknames: [" collector alpha ", "COLLECTOR BETA"],
  });

  assert.equal(first, second);
});

test("createCollectionSummaryCache evicts least-recently-used entries", () => {
  const cache = createCollectionSummaryCache(2);

  cache.set("2026-a", { summaryRows: [{ month: 1 } as any], freshness: null });
  cache.set("2026-b", { summaryRows: [{ month: 2 } as any], freshness: null });
  assert.equal(cache.size(), 2);

  assert.equal(cache.get("2026-a")?.summaryRows[0]?.month, 1);

  cache.set("2026-c", { summaryRows: [{ month: 3 } as any], freshness: null });

  assert.equal(cache.get("2026-b"), null);
  assert.equal(cache.get("2026-a")?.summaryRows[0]?.month, 1);
  assert.equal(cache.get("2026-c")?.summaryRows[0]?.month, 3);
});

test("createCollectionSummaryCache clear removes cached summary rows", () => {
  const cache = createCollectionSummaryCache(3);

  cache.set("2026-a", { summaryRows: [{ month: 1 } as any], freshness: null });
  cache.set("2026-b", { summaryRows: [{ month: 2 } as any], freshness: null });
  cache.clear();

  assert.equal(cache.size(), 0);
  assert.equal(cache.get("2026-a"), null);
  assert.equal(cache.get("2026-b"), null);
});
