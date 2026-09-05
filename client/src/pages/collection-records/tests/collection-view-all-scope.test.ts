import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionViewAllRequestFilters } from "@/pages/collection-records/useCollectionViewAllRecords";

test("View All preserves Team Leader scope with every compatible server filter", () => {
  const result = buildCollectionViewAllRequestFilters({
    from: "2026-09-01",
    to: "2026-09-30",
    search: "account-1",
    nickname: "SW.STAFF_1",
    leaderId: "5a992a46-4c1d-4d6c-91b3-005a2156cfa4",
    sourceImportIds: ["source-1"],
    agingBuckets: ["D3"],
    classifications: ["abort_cp"],
    sortBy: "amount",
    sortDirection: "desc",
  }, 3, 25);

  assert.deepEqual(result, {
    from: "2026-09-01",
    to: "2026-09-30",
    search: "account-1",
    nickname: "SW.STAFF_1",
    leaderId: "5a992a46-4c1d-4d6c-91b3-005a2156cfa4",
    sourceImportIds: ["source-1"],
    agingBuckets: ["D3"],
    classifications: ["abort_cp"],
    sortBy: "amount",
    sortDirection: "desc",
    page: 3,
    pageSize: 25,
  });
});
