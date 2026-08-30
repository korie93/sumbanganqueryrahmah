import assert from "node:assert/strict";
import test from "node:test";
import { mapCollectionRecordRow } from "../collection-repository-mappers";

function buildRow(amount: string, totalDue: string | null) {
  return {
    id: "collection-1",
    customer_name: "Customer",
    ic_number: "900101101234",
    customer_phone: "0123456789",
    account_number: "ACC-1",
    batch: "P10",
    payment_date: "2026-08-29",
    amount,
    total_due: totalDue,
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

test("collection mapper derives Abort CP when Amount covers TOTAL DUE", () => {
  const exact = mapCollectionRecordRow(buildRow("1000.00", "1000.00"));
  const over = mapCollectionRecordRow(buildRow("1200.00", "1000.00"));

  assert.equal(exact.totalDueCovered, true);
  assert.equal(exact.cpStatus, "abort_cp");
  assert.equal(over.cpStatus, "abort_cp");
  assert.equal(exact.billingPrincipalOsp, "880.25");
  assert.equal(exact.agingBucket, "D5");
  assert.equal(exact.sourceMatchAccuracy, 100);
});

test("collection mapper derives CP below TOTAL DUE and unverified without it", () => {
  const below = mapCollectionRecordRow(buildRow("999.99", "1000.00"));
  const missing = mapCollectionRecordRow(buildRow("999.99", null));

  assert.equal(below.totalDueCovered, false);
  assert.equal(below.cpStatus, "cp");
  assert.equal(missing.totalDueCovered, null);
  assert.equal(missing.cpStatus, "unverified");
});
