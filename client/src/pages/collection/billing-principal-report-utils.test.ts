import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingPrincipalSavedTargetRows,
  calculateTargetOspPreview,
  filterBillingPrincipalRows,
  formatOspCurrency,
  getCurrentMonthDateRange,
} from "./billing-principal-report-utils";

test("Billing Principal date range uses local date-only month boundaries", () => {
  assert.deepEqual(getCurrentMonthDateRange(new Date(2026, 8, 15, 12)), {
    from: "2026-09-01",
    to: "2026-09-30",
  });
});

test("Billing Principal target preview derives amount from baseline and target percentage", () => {
  assert.equal(calculateTargetOspPreview("1000.00", "33"), "330.00");
  assert.equal(calculateTargetOspPreview("invalid", "33"), "—");
});

test("Billing Principal rows retain only selected trusted aging buckets", () => {
  const rows = [
    { aging: "D3" as const, totalOsp: "10.00", targetPercentage: "10", targetOsp: "1.00", resultPercentage: "0", ospClosed: "0", closedAccountCount: 0 },
    { aging: "D4" as const, totalOsp: "20.00", targetPercentage: "10", targetOsp: "2.00", resultPercentage: "0", ospClosed: "0", closedAccountCount: 0 },
  ];
  assert.deepEqual(filterBillingPrincipalRows(rows, ["D4"]).map((row) => row.aging), ["D4"]);
  assert.deepEqual(buildBillingPrincipalSavedTargetRows(rows, ["D4"]), [{
    agingBucket: "D4",
    totalOspBaseline: "20.00",
    targetPercentage: "10",
  }]);
});

test("Billing Principal currency formatter does not confuse invalid values with source data", () => {
  assert.match(formatOspCurrency("123456.78"), /123,456\.78/);
  assert.equal(formatOspCurrency("0.00"), "RM0.00");
  assert.equal(formatOspCurrency("not-money"), "—");
});
