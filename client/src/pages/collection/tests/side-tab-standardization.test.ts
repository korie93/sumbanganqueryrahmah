import test from "node:test";
import assert from "node:assert/strict";
import { STANDARD_PAGE_SIZE_OPTIONS } from "@/components/data/AppPaginationBar";
import { getPaginatedTotalPages, paginateItems } from "@/hooks/usePaginatedItems";

test("standard sidetab page-size options follow the required increments", () => {
  assert.deepEqual([...STANDARD_PAGE_SIZE_OPTIONS], [10, 20, 30, 40, 50]);
});

test("getPaginatedTotalPages keeps at least one page and scales with item count", () => {
  assert.equal(getPaginatedTotalPages(0, 10), 1);
  assert.equal(getPaginatedTotalPages(9, 10), 1);
  assert.equal(getPaginatedTotalPages(11, 10), 2);
  assert.equal(getPaginatedTotalPages(51, 20), 3);
});

test("paginateItems returns only the current page slice and clamps invalid page numbers", () => {
  const values = Array.from({ length: 23 }, (_, index) => index + 1);

  assert.deepEqual(paginateItems(values, 1, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(paginateItems(values, 2, 10), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual(paginateItems(values, 3, 10), [21, 22, 23]);
  assert.deepEqual(paginateItems(values, 99, 10), [21, 22, 23]);
  assert.deepEqual(paginateItems(values, 0, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
