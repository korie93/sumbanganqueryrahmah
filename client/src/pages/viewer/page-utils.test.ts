import assert from "node:assert/strict";
import test from "node:test";
import {
  buildViewerActiveFilterChips,
  normalizeViewerPageResult,
  resolveViewerImportName,
} from "@/pages/viewer/page-utils";

test("resolveViewerImportName prefers selected import name and falls back safely", () => {
  const storage = {
    getItem(key: string) {
      if (key === "selectedImportName") return "March Import";
      if (key === "analysisImportName") return "Analysis Import";
      return null;
    },
  };

  assert.equal(resolveViewerImportName(storage), "March Import");
  assert.equal(resolveViewerImportName(null), "Data Viewer");
});

test("normalizeViewerPageResult preserves paging metadata and injects stable row ids", () => {
  const normalized = normalizeViewerPageResult(
    {
      rows: [
        { jsonDataJsonb: { name: "A" } },
        { jsonDataJsonb: { name: "B" } },
      ],
      total: 24,
      page: 2,
      limit: 10,
      nextCursor: "cursor-2",
    },
    1,
    25,
  );

  assert.deepEqual(normalized, {
    rows: [
      { __rowId: 10, name: "A" },
      { __rowId: 11, name: "B" },
    ],
    total: 24,
    page: 2,
    limit: 10,
    nextCursor: "cursor-2",
  });
});

test("buildViewerActiveFilterChips includes search and filter chips with working removal callbacks", () => {
  let clearedSearch = false;
  let removedFilterIndex = -1;

  const chips = buildViewerActiveFilterChips({
    search: "  account  ",
    activeColumnFilters: [
      { column: "status", operator: "equals", value: "active" },
    ],
    onClearSearch: () => {
      clearedSearch = true;
    },
    onRemoveFilter: (index) => {
      removedFilterIndex = index;
    },
  });

  assert.equal(chips.length, 2);
  assert.equal(chips[0]?.label, "Search: account");
  assert.equal(chips[1]?.label, "status is active");

  const searchChip = chips[0]!;
  const filterChip = chips[1]!;

  assert.ok(searchChip.onRemove);
  assert.ok(filterChip.onRemove);

  searchChip.onRemove();
  filterChip.onRemove();

  assert.equal(clearedSearch, true);
  assert.equal(removedFilterIndex, 0);
});
