import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionRecordsCacheKey,
  createCollectionRecordsCache,
  normalizeCollectionRecordFilterValue,
} from "@/pages/collection-records/records-query-cache";

test("normalizeCollectionRecordFilterValue trims blanks to null", () => {
  assert.equal(normalizeCollectionRecordFilterValue("  abc  "), "abc");
  assert.equal(normalizeCollectionRecordFilterValue(""), null);
  assert.equal(normalizeCollectionRecordFilterValue("   "), null);
  assert.equal(normalizeCollectionRecordFilterValue(undefined), null);
});

test("buildCollectionRecordsCacheKey normalizes filter casing and whitespace", () => {
  const first = buildCollectionRecordsCacheKey({
    from: "2026-03-01",
    to: "2026-03-31",
    search: " Alice Tan ",
    nickname: " Collector Alpha ",
    page: 1,
    pageSize: 1000,
  });
  const second = buildCollectionRecordsCacheKey({
    from: "2026-03-01",
    to: "2026-03-31",
    search: "alice tan",
    nickname: "collector alpha",
    limit: 1000,
    offset: 0,
  });

  assert.equal(first, second);
});

test("createCollectionRecordsCache evicts least-recently-used entries", () => {
  const cache = createCollectionRecordsCache(2);

  cache.set("page-1", { records: [{ id: "1" } as any] });
  cache.set("page-2", { records: [{ id: "2" } as any] });
  assert.equal(cache.size(), 2);

  assert.equal(cache.get("page-1")?.records[0]?.id, "1");

  cache.set("page-3", { records: [{ id: "3" } as any] });

  assert.equal(cache.get("page-2"), null);
  assert.equal(cache.get("page-1")?.records[0]?.id, "1");
  assert.equal(cache.get("page-3")?.records[0]?.id, "3");
});

test("createCollectionRecordsCache clear removes cached record pages", () => {
  const cache = createCollectionRecordsCache(3);

  cache.set("page-1", { records: [{ id: "1" } as any] });
  cache.set("page-2", { records: [{ id: "2" } as any] });
  cache.clear();

  assert.equal(cache.size(), 0);
  assert.equal(cache.get("page-1"), null);
  assert.equal(cache.get("page-2"), null);
});

test("createCollectionRecordsCache preserves summary metadata for cached pages", () => {
  const cache = createCollectionRecordsCache(2);

  cache.set("page-1", {
    records: [{ id: "1" } as any],
    totalRecords: 42,
    totalAmount: 1234.5,
  });

  const cachedEntry = cache.get("page-1");

  assert.equal(cachedEntry?.records[0]?.id, "1");
  assert.equal(cachedEntry?.totalRecords, 42);
  assert.equal(cachedEntry?.totalAmount, 1234.5);
});
