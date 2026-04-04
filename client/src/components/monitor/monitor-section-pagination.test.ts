import test from "node:test";
import assert from "node:assert/strict";
import {
  paginateMonitorSectionItems,
  resolveMonitorSectionPageSize,
} from "@/components/monitor/monitor-section-pagination";

test("resolveMonitorSectionPageSize keeps mobile monitor sections compact", () => {
  assert.equal(resolveMonitorSectionPageSize("metrics", true), 2);
  assert.equal(resolveMonitorSectionPageSize("charts", true), 2);
});

test("resolveMonitorSectionPageSize allows denser desktop monitor sections", () => {
  assert.equal(resolveMonitorSectionPageSize("metrics", false), 3);
  assert.equal(resolveMonitorSectionPageSize("charts", false), 4);
});

test("paginateMonitorSectionItems clamps page and slices items safely", () => {
  const result = paginateMonitorSectionItems(["a", "b", "c", "d", "e"], 9, 2);

  assert.deepEqual(result, {
    page: 3,
    pageSize: 2,
    totalItems: 5,
    totalPages: 3,
    items: ["e"],
  });
});

test("paginateMonitorSectionItems falls back to safe defaults", () => {
  const result = paginateMonitorSectionItems(["a", "b"], 0, 0);

  assert.deepEqual(result, {
    page: 1,
    pageSize: 1,
    totalItems: 2,
    totalPages: 2,
    items: ["a"],
  });
});
