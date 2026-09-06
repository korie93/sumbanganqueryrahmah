import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingPrincipalSavedTargetRows,
  calculateTargetOspPreview,
  calculateOspClientPreview,
  filterBillingPrincipalRows,
  formatOspCurrency,
  getCurrentMonthDateRange,
  isValidOspPercentageInput,
} from "./billing-principal-report-utils";

test("Private client percentage inputs accept unsigned decimals within backend precision and range", () => {
  for (const value of ["0", "00", "01", "0.0001", "25.1250", "99.9999", "100", "100.0000", " 25.1250 ", 0, 100]) {
    assert.equal(isValidOspPercentageInput(value), true, `Must accept ${JSON.stringify(value)}`);
  }
});

test("Private client percentage inputs reject malformed syntax instead of silently normalizing it", () => {
  const invalidValues = [
    "", " ", "1,0", "1,00", "0,0", "+25", "-0", "-1", "101", "100.0001",
    "12.12345", "1e2", "25%", ".5", "25.", "000", "025", "1 0", "NaN", "Infinity", null, undefined,
  ];
  for (const value of invalidValues) {
    assert.equal(isValidOspPercentageInput(value), false, `Must reject ${JSON.stringify(value)}`);
  }
});

test("Private client previews remain unavailable when either editable percentage has invalid syntax", () => {
  const validRow = { aging: "D3" as const, totalOsp: "1000000.00", targetPercentage: "30", resultPercentage: "25" };
  for (const field of ["targetPercentage", "resultPercentage"] as const) {
    for (const value of ["1,0", "+25", "-0", "12.12345", "100.0001"]) {
      assert.equal(calculateOspClientPreview([{ ...validRow, [field]: value }]), null, `${field} must reject ${value}`);
    }
  }
  const preview = calculateOspClientPreview([{ ...validRow, targetPercentage: " 30.0000 ", resultPercentage: " 25 " }]);
  assert.equal(preview?.all.targetOsp, "300000.00");
  assert.equal(preview?.all.ospClosed, "250000.00");
  assert.equal(preview?.all.balanceOsp, "50000.00");
});

test("Private client previews use own target, weighted ALL and signed exact balances", () => {
  const preview = calculateOspClientPreview([
    { aging: "D3", totalOsp: "1000000.00", targetPercentage: "30", resultPercentage: "25" },
    { aging: "D4", totalOsp: "500000.00", targetPercentage: "60", resultPercentage: "24" },
  ]);
  assert.equal(preview?.rows[0]?.balanceOsp, "50000.00");
  assert.deepEqual(preview?.all, { aging: "ALL", totalOsp: "1500000.00", targetOsp: "600000.00", ospClosed: "370000.00", balanceOsp: "230000.00", targetPercentage: "40.0000", resultPercentage: "24.6667" });
  assert.equal(calculateOspClientPreview([{ aging: "D3", totalOsp: "1000000", targetPercentage: "20", resultPercentage: "25" }])?.all.balanceOsp, "-50000.00");
  assert.equal(calculateOspClientPreview([{ aging: "D3", totalOsp: "0", targetPercentage: "20", resultPercentage: "0" }])?.all.resultPercentage, "0.0000");
  assert.equal(calculateOspClientPreview([{ aging: "D3", totalOsp: "99999999999999.99", targetPercentage: "100", resultPercentage: "0" }])?.all.balanceOsp, "99999999999999.99");
  assert.equal(calculateOspClientPreview([{ aging: "D3", totalOsp: "100", targetPercentage: "101", resultPercentage: "0" }]), null);
});

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
