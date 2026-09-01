import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionRecordFilterSnapshot } from "@/pages/collection-records/collection-record-filters";

test("buildCollectionRecordFilterSnapshot trims filter values and preserves pagination", () => {
  assert.deepEqual(
    buildCollectionRecordFilterSnapshot({
      fromDate: " 2026-03-01 ",
      toDate: "2026-03-31 ",
      searchInput: " Smoke Stale Delete 1775086852984 ",
      canUseNicknameFilter: true,
      nicknameFilter: " Collector Alpha ",
      sourceImportFilter: " source-1 ",
      agingFilter: "d4",
      classificationFilter: "ABORT_CP",
      sortValue: "amount_desc",
      limit: 50,
      offset: 100,
    }),
    {
      from: "2026-03-01",
      to: "2026-03-31",
      search: "Smoke Stale Delete 1775086852984",
      nickname: "Collector Alpha",
      sourceImportIds: ["source-1"],
      agingBuckets: ["D4"],
      classifications: ["abort_cp"],
      sortBy: "amount",
      sortDirection: "desc",
      limit: 50,
      offset: 100,
    },
  );
});

test("buildCollectionRecordFilterSnapshot ignores blank and all nickname filters", () => {
  assert.deepEqual(
    buildCollectionRecordFilterSnapshot({
      searchInput: "  ",
      canUseNicknameFilter: true,
      nicknameFilter: "all",
      sourceImportFilter: "all",
      agingFilter: "all",
      classificationFilter: "all",
      limit: 50,
      offset: 0,
    }),
    {
      from: undefined,
      to: undefined,
      search: undefined,
      nickname: undefined,
      sourceImportIds: undefined,
      agingBuckets: undefined,
      classifications: undefined,
      sortBy: "paymentDate",
      sortDirection: "desc",
      limit: 50,
      offset: 0,
    },
  );
});
