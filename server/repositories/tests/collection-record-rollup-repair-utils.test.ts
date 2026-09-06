import assert from "node:assert/strict";
import test from "node:test";
import { parseBoundedCollectionRollupRepair } from "../collection-record-rollup-repair-utils";

const valid = { mode: "bounded", from: "2026-08-12", to: "2026-09-10", createdByLogin: "admin", collectionStaffNickname: "SW.ABU_324" };
test("bounded rollup repair defaults to dry-run and rejects broad/ambiguous input", () => {
  assert.deepEqual(parseBoundedCollectionRollupRepair(valid), { ...valid, dryRun: true, maxSlices: 100 });
  for (const input of [null, [], {}, { ...valid, mode: "all" }, { ...valid, extra: true },
    { ...valid, from: "2026-02-30" }, { ...valid, to: "2026-01-01" }, { ...valid, to: "2028-01-01" },
    { ...valid, createdByLogin: "" }, { ...valid, collectionStaffNickname: "" },
    { ...valid, maxSlices: 0 }, { ...valid, maxSlices: 367 }, { ...valid, maxSlices: 1.5 },
    { ...valid, dryRun: "false" },
  ]) assert.throws(() => parseBoundedCollectionRollupRepair(input), /./);
  assert.equal(parseBoundedCollectionRollupRepair({ ...valid, dryRun: false }).dryRun, false);
});
