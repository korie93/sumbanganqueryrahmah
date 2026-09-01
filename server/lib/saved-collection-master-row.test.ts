import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCanonicalSavedCollectionCompatibility,
  extractCanonicalSavedCollectionMasterRow,
} from "./saved-collection-link-utils";

const completeMasterRow = {
  " Account No  ": "00000000000000001",
  "Card No ": "0000000000000002",
  "Total Amount Due (TOTAL DUE) ": "RM 1,234.50",
  "Billing Principal (OSP) ": "500.25",
  "Total OSB (Statement Closing Balance) ": "900.00",
  "Delinquency Status (DC_STS)": 5,
  "Calling Date ": "20260115",
};

test("canonical master extraction preserves Account No/Card No strings and maps financial fields", () => {
  const row = extractCanonicalSavedCollectionMasterRow(completeMasterRow);

  assert.equal(row.accountNumber, "00000000000000001");
  assert.equal(row.cardNumber, "0000000000000002");
  assert.equal(row.totalDue, "1234.50");
  assert.equal(row.billingPrincipalOsp, "500.25");
  assert.equal(row.totalOsb, "900.00");
  assert.equal(row.agingBucket, "D5");
  assert.equal(row.callingDate, "2026-01-15");
  assert.equal(row.callingWindowEnd, "2026-02-14");
  assert.equal(row.callingWindowEndExclusive, "2026-02-15");
});

test("OSP extraction is independent from Total OSB even when both headers are present", () => {
  const row = extractCanonicalSavedCollectionMasterRow({
    ...completeMasterRow,
    "Billing Principal (OSP) ": "123.45",
    "Total OSB (Statement Closing Balance) ": "9876.54",
  });

  assert.equal(row.billingPrincipalOsp, "123.45");
  assert.equal(row.totalOsb, "9876.54");
});

test("canonical compatibility accepts Account No or Card No and keeps Total OSB optional", () => {
  const requiredFields = {
    "Total Amount Due (TOTAL DUE)": "125.00",
    "Billing Principal (OSP)": "100.00",
    "Delinquency Status (DC_STS)": 3,
    "Calling Date": "20260115",
  };

  const accountOnly = assessCanonicalSavedCollectionCompatibility({
    ...requiredFields,
    "Account No": "00000000000000001",
  });
  const cardOnly = assessCanonicalSavedCollectionCompatibility({
    ...requiredFields,
    "Card No": "0000000000000002",
  });

  assert.equal(accountOnly.compatible, true);
  assert.deepEqual(accountOnly.issues, []);
  assert.equal(accountOnly.row.totalOsb, null);
  assert.equal(cardOnly.compatible, true);
  assert.deepEqual(cardOnly.issues, []);
  assert.equal(cardOnly.row.totalOsb, null);
});

test("canonical DC_STS production header accepts only delinquency values 3 through 6", () => {
  for (const value of [3, "4", "D5", "d6"] as const) {
    const row = extractCanonicalSavedCollectionMasterRow({
      "Delinquency Status (DC_STS)": value,
    });
    assert.equal(row.agingBucket, `D${String(value).replace(/d/i, "")}`);
  }

  for (const value of [2, 7, "D0", "D10", "unknown"] as const) {
    assert.equal(
      extractCanonicalSavedCollectionMasterRow({
        "Delinquency Status (DC_STS)": value,
      }).agingBucket,
      null,
    );
  }
});

test("canonical compatibility reports missing required source fields without exposing row data", () => {
  const compatibility = assessCanonicalSavedCollectionCompatibility({});

  assert.equal(compatibility.compatible, false);
  assert.deepEqual(compatibility.issues, [
    "missing_account_or_card",
    "missing_total_due",
    "missing_billing_principal_osp",
    "missing_dc_sts",
    "missing_calling_date",
  ]);
  assert.equal(compatibility.row.accountNumber, null);
  assert.equal(compatibility.row.totalDue, null);
});

test("canonical compatibility rejects malformed money, date, and DC_STS values", () => {
  const compatibility = assessCanonicalSavedCollectionCompatibility({
    "Account No": "00000000000000001",
    "Total Amount Due (TOTAL DUE)": "not-a-money-value",
    "Billing Principal (OSP)": "RM ???",
    DC_STS: "D7",
    "Calling Date": "31/02/2026",
  });

  assert.equal(compatibility.compatible, false);
  assert.deepEqual(compatibility.issues, [
    "invalid_total_due",
    "invalid_billing_principal_osp",
    "invalid_dc_sts",
    "invalid_calling_date",
  ]);
});

test("canonical compatibility rejects zero TOTAL DUE but permits a zero OSP baseline", () => {
  const compatibility = assessCanonicalSavedCollectionCompatibility({
    "Account No": "00000000000000001",
    "Total Amount Due (TOTAL DUE)": "0.00",
    "Billing Principal (OSP)": "0.00",
    DC_STS: "D3",
    "Calling Date": "20260115",
  });

  assert.equal(compatibility.compatible, false);
  assert.deepEqual(compatibility.issues, ["invalid_total_due"]);
  assert.equal(compatibility.row.totalDue, null);
  assert.equal(compatibility.row.billingPrincipalOsp, "0.00");
});

test("canonical compatibility treats blank fields as missing rather than malformed", () => {
  const compatibility = assessCanonicalSavedCollectionCompatibility({
    "Account No": "",
    "Card No": "  ",
    "Total Amount Due (TOTAL DUE)": "",
    "Billing Principal (OSP)": "",
    "Total OSB (Statement Closing Balance)": "",
    DC_STS: "",
    "Calling Date": "",
  });

  assert.deepEqual(compatibility.issues, [
    "missing_account_or_card",
    "missing_total_due",
    "missing_billing_principal_osp",
    "missing_dc_sts",
    "missing_calling_date",
  ]);
});

test("canonical identifiers fail closed for numeric 16-digit Account/Card values", () => {
  const requiredFields = {
    "Total Amount Due (TOTAL DUE)": "125.00",
    "Billing Principal (OSP)": "100.00",
    DC_STS: 4,
    "Calling Date": "20260115",
  };

  for (const header of ["Account No", "Card No"] as const) {
    const compatibility = assessCanonicalSavedCollectionCompatibility({
      ...requiredFields,
      [header]: 1_234_567_890_123_456,
    });

    assert.equal(compatibility.compatible, false);
    assert.deepEqual(compatibility.issues, ["invalid_account_or_card"]);
    assert.equal(compatibility.row.accountNumber, null);
    assert.equal(compatibility.row.cardNumber, null);
  }
});

test("a safe text identifier remains sufficient when the alternate identifier is unsafe", () => {
  const compatibility = assessCanonicalSavedCollectionCompatibility({
    "Account No": 1_234_567_890_123_456,
    "Card No": "0000000000000002",
    "Total Amount Due (TOTAL DUE)": "125.00",
    "Billing Principal (OSP)": "100.00",
    DC_STS: 6,
    "Calling Date": "20260115",
  });

  assert.equal(compatibility.compatible, true);
  assert.deepEqual(compatibility.issues, []);
  assert.equal(compatibility.row.accountNumber, null);
  assert.equal(compatibility.row.cardNumber, "0000000000000002");
});
