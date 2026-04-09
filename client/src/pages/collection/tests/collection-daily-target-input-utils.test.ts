import assert from "node:assert/strict";
import test from "node:test";

import { formatCollectionDailyTargetInput } from "@/pages/collection/collection-daily-target-input-utils";

test("formatCollectionDailyTargetInput keeps monthly target inputs normalized as MYR strings", () => {
  assert.equal(formatCollectionDailyTargetInput(1200.5), "1200.50");
  assert.equal(formatCollectionDailyTargetInput("1,200.5"), "1200.50");
  assert.equal(formatCollectionDailyTargetInput("invalid"), "0.00");
});
