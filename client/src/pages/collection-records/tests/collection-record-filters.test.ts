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
      limit: 50,
      offset: 100,
    }),
    {
      from: "2026-03-01",
      to: "2026-03-31",
      search: "Smoke Stale Delete 1775086852984",
      nickname: "Collector Alpha",
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
      limit: 50,
      offset: 0,
    }),
    {
      from: undefined,
      to: undefined,
      search: undefined,
      nickname: undefined,
      limit: 50,
      offset: 0,
    },
  );
});
