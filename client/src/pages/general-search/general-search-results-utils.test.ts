import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeneralSearchPaginationItems,
  buildGeneralSearchResultsRange,
  buildGeneralSearchVirtualRowsState,
  getGeneralSearchPopulatedHeaders,
} from "@/pages/general-search/general-search-results-utils";

test("buildGeneralSearchResultsRange computes visible page range and total pages", () => {
  assert.deepEqual(buildGeneralSearchResultsRange(3, 25, 140), {
    rangeEnd: 75,
    rangeStart: 51,
    totalPages: 6,
  });
});

test("buildGeneralSearchPaginationItems inserts ellipsis for skipped pages", () => {
  assert.deepEqual(buildGeneralSearchPaginationItems(5, 10), [
    1,
    "ellipsis",
    4,
    5,
    6,
    10,
  ]);
});

test("buildGeneralSearchVirtualRowsState enables virtualization for large low-spec result sets", () => {
  assert.deepEqual(buildGeneralSearchVirtualRowsState(100, true, 520), {
    bottomSpacerHeight: 3692,
    enableVirtualRows: true,
    topSpacerHeight: 104,
    virtualEndRow: 29,
    virtualStartRow: 2,
  });
});

test("getGeneralSearchPopulatedHeaders falls back to all headers when row is empty", () => {
  assert.deepEqual(
    getGeneralSearchPopulatedHeaders(["Name", "IC", "Address"], {
      Name: "Ali",
      IC: "",
      Address: null,
    }),
    ["Name"],
  );
  assert.deepEqual(
    getGeneralSearchPopulatedHeaders(["Name", "IC"], { Name: "", IC: null }),
    ["Name", "IC"],
  );
});

test("virtual rows fill measured short and tall viewports including the sticky header", () => {
  const short = buildGeneralSearchVirtualRowsState(250, true, 0, 184, 52, 44);
  const tall = buildGeneralSearchVirtualRowsState(250, true, 0, 832, 52, 44);
  assert.equal(short.virtualEndRow, 19);
  assert.equal(tall.virtualEndRow, 32);
  assert.equal(short.topSpacerHeight, 0);
  assert.ok(tall.virtualEndRow > short.virtualEndRow);
});

test("virtual rows preserve total measured body height and cover every visible row", () => {
  for (const rowHeight of [52, 65.5, 104]) {
    for (const viewportHeight of [160, 340, 832, 1600]) {
      for (const scrollTop of [0, 520, 5000, 20_000]) {
        const totalRows = 250;
        const headerHeight = 55;
        const result = buildGeneralSearchVirtualRowsState(totalRows, true, scrollTop, viewportHeight, rowHeight, headerHeight);
        assert.equal(result.enableVirtualRows, true);
        const renderedCount = result.virtualEndRow - result.virtualStartRow;
        assert.equal(result.topSpacerHeight + renderedCount * rowHeight + result.bottomSpacerHeight, totalRows * rowHeight);
        assert.ok(renderedCount > 0);
        assert.ok(result.virtualStartRow >= 0 && result.virtualEndRow <= totalRows);
        const bodyTop = Math.min(Math.max(0, totalRows * rowHeight - (viewportHeight - headerHeight)), Math.max(0, scrollTop));
        assert.ok(result.topSpacerHeight <= bodyTop);
        assert.ok(result.virtualEndRow * rowHeight >= Math.min(totalRows * rowHeight, bodyTop + viewportHeight - headerHeight));
      }
    }
  }
});

test("virtual rows clamp stale scroll positions after shrinking results or resizing", () => {
  for (const height of [184, 832]) {
    const result = buildGeneralSearchVirtualRowsState(50, true, 100_000, height, 52, 44);
    assert.equal(result.virtualEndRow, 50);
    assert.equal(result.bottomSpacerHeight, 0);
    assert.ok(result.virtualStartRow < result.virtualEndRow);
  }
});

test("ordinary and short result sets remain unvirtualized regardless of scroll geometry", () => {
  for (const [length, lowSpec] of [[250, false], [40, true], [0, true]] as const) {
    assert.deepEqual(buildGeneralSearchVirtualRowsState(length, lowSpec, 50_000, 184, 65, 44), {
      bottomSpacerHeight: 0, enableVirtualRows: false, topSpacerHeight: 0,
      virtualEndRow: length, virtualStartRow: 0,
    });
  }
});

test("virtual row geometry falls back safely before measurements are available", () => {
  for (const invalid of [0, -1, NaN, Infinity]) {
    const result = buildGeneralSearchVirtualRowsState(100, true, NaN, invalid, invalid, NaN);
    assert.equal(result.virtualStartRow, 0);
    assert.equal(result.virtualEndRow, 27);
    assert.equal(result.bottomSpacerHeight, 73 * 52);
  }
});
