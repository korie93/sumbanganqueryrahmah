import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCollectionOptionalAmount,
  getCollectionCpStatusLabel,
  getCollectionMatchAccuracyLabel,
} from "./collection-coverage";

test("collection coverage labels distinguish CP, Abort CP, and unverified states", () => {
  assert.equal(getCollectionCpStatusLabel({ cpStatus: "cp" }), "CP");
  assert.equal(getCollectionCpStatusLabel({ cpStatus: "abort_cp" }), "Abort CP");
  assert.equal(getCollectionCpStatusLabel({ cpStatus: "unverified" }), "Unverified");
  assert.equal(getCollectionCpStatusLabel({}), "Unverified");
  const manualLabel = getCollectionCpStatusLabel({
    cpStatus: "abort_cp",
    effectiveSettlementSource: "MANUAL_VERIFIED",
    manualSettlement: {
      status: "ACTIVE",
      validity: "EFFECTIVE",
      poolAmount: "350.00",
    } as never,
  });
  assert.equal(
    manualLabel,
    ["Abort CP", "Manual Verified", `POOL ${formatCollectionOptionalAmount("350.00")}`]
      .join(` ${String.fromCodePoint(0xb7)} `),
  );
});

test("collection coverage formatting keeps missing source values explicit", () => {
  assert.equal(formatCollectionOptionalAmount(null), "-");
  assert.equal(formatCollectionOptionalAmount("1250.50"), "RM 1,250.50");
  assert.equal(getCollectionMatchAccuracyLabel(87), "87%");
  assert.equal(getCollectionMatchAccuracyLabel(null), "-");
});
