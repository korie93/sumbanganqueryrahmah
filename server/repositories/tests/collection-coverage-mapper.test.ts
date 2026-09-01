import assert from "node:assert/strict";
import test from "node:test";
import { mapCollectionRecordRow } from "../collection-repository-mappers";

function buildRow(
  amount: string,
  totalDue: string | null,
  cumulativeCollected: string | null = amount,
) {
  return {
    id: "collection-1",
    customer_name: "Customer",
    ic_number: "900101101234",
    customer_phone: "0123456789",
    account_number: "ACC-1",
    source_import_id: "import-1",
    source_data_row_id: "saved-row-1",
    batch: "P10",
    payment_date: "2026-08-29",
    amount,
    calling_date: "2026-08-12",
    calling_window_end_exclusive: "2026-09-12",
    total_due: totalDue,
    cumulative_collected: cumulativeCollected,
    billing_principal_osp: "880.25",
    aging_bucket: "D5",
    source_match_basis: "ic",
    source_match_accuracy: 100,
    receipt_total_amount: 0,
    receipt_validation_status: "unverified",
    receipt_count: 0,
    duplicate_receipt_flag: false,
    created_by_login: "staff.user",
    collection_staff_nickname: "Collector Alpha",
    created_at: new Date("2026-08-29T00:00:00.000Z"),
    updated_at: new Date("2026-08-29T00:00:00.000Z"),
  };
}

test("collection mapper derives Abort CP from exact cumulative collections", () => {
  const exact = mapCollectionRecordRow(buildRow("80.00", "1000.00", "1000.00"));
  const over = mapCollectionRecordRow(buildRow("10.00", "1000.00", "1010.00"));

  assert.equal(exact.totalDueCovered, true);
  assert.equal(exact.cpStatus, "abort_cp");
  assert.equal(over.cpStatus, "abort_cp");
  assert.equal(exact.cumulativeCollected, "1000.00");
  assert.equal(exact.remainingAmount, "0.00");
  assert.equal(exact.callingDate, "2026-08-12");
  assert.equal(exact.callingWindowEnd, "2026-09-11");
  assert.equal(exact.callingWindowEndExclusive, "2026-09-12");
  assert.equal(exact.billingPrincipalOsp, "880.25");
  assert.equal(exact.agingBucket, "D5");
  assert.equal(exact.sourceMatchAccuracy, 100);
});

test("collection mapper derives CP below cumulative TOTAL DUE and unverified without it", () => {
  const below = mapCollectionRecordRow(buildRow("499.99", "1000.00", "999.99"));
  const missing = mapCollectionRecordRow(buildRow("999.99", null));

  assert.equal(below.totalDueCovered, false);
  assert.equal(below.cpStatus, "cp");
  assert.equal(below.cumulativeCollected, "999.99");
  assert.equal(below.remainingAmount, "0.01");
  assert.equal(missing.totalDueCovered, null);
  assert.equal(missing.cpStatus, "unverified");
});

test("collection mapper compares integer cents without floating-point drift", () => {
  const exact = mapCollectionRecordRow(buildRow("0.10", "0.30", "0.30"));
  const below = mapCollectionRecordRow(buildRow("0.10", "0.30", "0.29"));

  assert.equal(exact.cpStatus, "abort_cp");
  assert.equal(below.cpStatus, "cp");
  assert.equal(below.remainingAmount, "0.01");
});
