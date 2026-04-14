import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionNicknameSummaryRowAriaLabel } from "@/pages/collection-nickname-summary/collection-nickname-summary-row-aria";

test("buildCollectionNicknameSummaryRowAriaLabel summarizes nickname totals", () => {
  assert.equal(
    buildCollectionNicknameSummaryRowAriaLabel({
      formattedAmount: "RM 1,250.00",
      index: 2,
      item: {
        nickname: "Collector Beta",
        totalAmount: 1250,
        totalRecords: 18,
      },
    }),
    "Nickname summary 2, Collector Beta, 18 records, total RM 1,250.00",
  );
});
