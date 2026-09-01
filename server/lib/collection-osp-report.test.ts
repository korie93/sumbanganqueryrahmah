import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionBillingPrincipalReport } from "./collection-osp-report";

test("Billing Principal report uses the reference OSP column instead of Total OSB", () => {
  const report = buildCollectionBillingPrincipalReport({
    rawTotalOspByAging: {
      D3: "1879275.07",
      D4: "1148077.87",
      D5: "1383194.79",
      D6: "1222480.62",
    },
    ospClosedByAging: {},
  });

  assert.equal(report.all.totalOsp, "5633028.35");
  assert.notEqual(report.all.totalOsp, "8060803.83");
  assert.deepEqual(report.rows.map((row) => row.totalOsp), [
    "1879275.07",
    "1148077.87",
    "1383194.79",
    "1222480.62",
  ]);
});

test("Billing Principal targets and ALL percentages use exact fixed-point arithmetic", () => {
  const report = buildCollectionBillingPrincipalReport({
    rawTotalOspByAging: {
      D3: "100.00",
      D4: "200.00",
      D5: "300.00",
      D6: "400.00",
    },
    ospClosedByAging: {
      D3: "50.00",
      D4: "25.00",
      D5: "0.00",
      D6: "100.00",
    },
    closedAccountCountByAging: { D3: 1, D4: 1, D6: 2 },
    targets: [
      { agingBucket: "D3", totalOspBaseline: null, targetPercentage: "33.0000" },
      { agingBucket: "D4", totalOspBaseline: null, targetPercentage: "14.1800" },
      { agingBucket: "D5", totalOspBaseline: null, targetPercentage: "7.0000" },
      { agingBucket: "D6", totalOspBaseline: null, targetPercentage: "5.0000" },
    ],
  });

  assert.equal(report.rows[0]?.targetOsp, "33.00");
  assert.equal(report.rows[1]?.targetOsp, "28.36");
  assert.equal(report.rows[0]?.resultPercentage, "50.00");
  assert.equal(report.all.totalOsp, "1000.00");
  assert.equal(report.all.targetOsp, "102.36");
  assert.equal(report.all.targetPercentage, "10.24");
  assert.equal(report.all.ospClosed, "175.00");
  assert.equal(report.all.resultPercentage, "17.50");
  assert.equal(report.all.closedAccountCount, 4);
});

test("Billing Principal report returns zero percentages for a zero baseline", () => {
  const report = buildCollectionBillingPrincipalReport({
    rawTotalOspByAging: {},
    ospClosedByAging: { D3: "50.00" },
  });

  assert.equal(report.rows[0]?.resultPercentage, "0.00");
  assert.equal(report.all.resultPercentage, "0.00");
});
