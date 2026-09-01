import assert from "node:assert/strict";
import test from "node:test";
import { mapCollectionRecordRow } from "../collection-repository-mappers";

function buildRow(
  amount: string,
  totalDue: string | null,
  cumulativeCollected: string | null = amount,
  classification: "cp" | "abort_cp" | null = totalDue === null ? null : "cp",
  remainingAmount: string | null = null,
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
    remaining_amount: remainingAmount,
    classification,
    source_obligation_key: "obligation-dummy-1",
    settlement_cycle_key: "cycle-dummy-1",
    card_number_last4: "1234",
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

test("collection mapper uses the persisted sole Abort CP classification", () => {
  const exact = mapCollectionRecordRow(buildRow(
    "80.00",
    "1000.00",
    "1000.00",
    "abort_cp",
    "0.00",
  ));
  const afterCrossing = mapCollectionRecordRow(buildRow(
    "10.00",
    "1000.00",
    "1010.00",
    "cp",
    "0.00",
  ));

  assert.equal(exact.totalDueCovered, true);
  assert.equal(exact.cpStatus, "abort_cp");
  assert.equal(afterCrossing.totalDueCovered, true);
  assert.equal(afterCrossing.cpStatus, "cp");
  assert.equal(exact.cumulativeCollected, "1000.00");
  assert.equal(exact.remainingAmount, "0.00");
  assert.equal(exact.callingDate, "2026-08-12");
  assert.equal(exact.callingWindowEnd, "2026-09-11");
  assert.equal(exact.callingWindowEndExclusive, "2026-09-12");
  assert.equal(exact.billingPrincipalOsp, "880.25");
  assert.equal(exact.agingBucket, "D5");
  assert.equal(exact.sourceMatchAccuracy, 100);
  assert.equal(exact.sourceObligationKey, "obligation-dummy-1");
  assert.equal(exact.settlementCycleKey, "cycle-dummy-1");
  assert.equal(exact.cardNumberLast4, "1234");
});

test("collection mapper reads persisted CP amounts and fails closed without settlement", () => {
  const below = mapCollectionRecordRow(buildRow("499.99", "1000.00", "999.99", "cp", "0.01"));
  const missing = mapCollectionRecordRow(buildRow("999.99", null));
  const missingClassification = mapCollectionRecordRow(buildRow(
    "1000.00",
    "1000.00",
    "1000.00",
    null,
    "0.00",
  ));

  assert.equal(below.totalDueCovered, false);
  assert.equal(below.cpStatus, "cp");
  assert.equal(below.cumulativeCollected, "999.99");
  assert.equal(below.remainingAmount, "0.01");
  assert.equal(missing.totalDueCovered, null);
  assert.equal(missing.cpStatus, "unverified");
  assert.equal(missingClassification.totalDueCovered, null);
  assert.equal(missingClassification.cpStatus, "unverified");
});

test("collection mapper compares integer cents without floating-point drift", () => {
  const exact = mapCollectionRecordRow(buildRow("0.10", "0.30", "0.30", "abort_cp", "0.00"));
  const below = mapCollectionRecordRow(buildRow("0.10", "0.30", "0.29", "cp", "0.01"));

  assert.equal(exact.cpStatus, "abort_cp");
  assert.equal(below.cpStatus, "cp");
  assert.equal(below.remainingAmount, "0.01");
});
