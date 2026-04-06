import test from "node:test";
import assert from "node:assert/strict";
import {
  toCollectionRecordsPurgeSummaryViewModel,
} from "@/pages/collection-records/collection-records-actions-shared";

test("toCollectionRecordsPurgeSummaryViewModel keeps only the toolbar-safe fields", () => {
  assert.deepEqual(
    toCollectionRecordsPurgeSummaryViewModel({
      ok: true,
      retentionMonths: 6,
      cutoffDate: "2026-04-01",
      eligibleRecords: 12,
      totalAmount: 3450,
    }),
    {
      cutoffDate: "2026-04-01",
      eligibleRecords: 12,
      totalAmount: 3450,
    },
  );
  assert.equal(toCollectionRecordsPurgeSummaryViewModel(null), null);
});
