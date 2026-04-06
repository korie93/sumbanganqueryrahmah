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
