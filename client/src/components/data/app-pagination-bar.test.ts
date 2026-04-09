import assert from "node:assert/strict";
import test from "node:test";

import { buildAppPaginationSummary } from "@/components/data/AppPaginationBar";

test("buildAppPaginationSummary reports visible pagination ranges", () => {
  assert.equal(
    buildAppPaginationSummary({
      itemLabel: "records",
      loading: false,
      page: 2,
      pageSize: 25,
      totalItems: 90,
      totalPages: 4,
    }),
    "Showing 26-50 of 90 records",
  );
});

test("buildAppPaginationSummary switches to loading copy while pagination is refreshing", () => {
  assert.equal(
    buildAppPaginationSummary({
      itemLabel: "audit logs",
      loading: true,
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
    }),
    "Updating audit logs...",
  );
});
