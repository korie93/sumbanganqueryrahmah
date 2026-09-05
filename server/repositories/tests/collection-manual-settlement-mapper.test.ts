import assert from "node:assert/strict";
import test from "node:test";
import { mapCollectionRecordRow } from "../collection-repository-mappers";

test("manual POOL changes effective settlement without inflating the collector amount", () => {
  const mapped = mapCollectionRecordRow({
    id: "record-1",
    customer_name: "Account holder",
    account_number: "A001",
    batch: "P10",
    payment_date: "2026-09-06",
    amount: "150.00",
    created_by_login: "collector.login",
    collection_staff_nickname: "collector.alpha",
    created_at: "2026-09-06T08:00:00.000Z",
    source_import_id: "source-1",
    source_data_row_id: "source-row-1",
    source_match_basis: "account_number",
    source_obligation_key: "obligation-a001",
    settlement_cycle_key: "2026-09-01:obligation-a001",
    calling_date: "2026-09-01",
    calling_window_end_exclusive: "2026-10-01",
    total_due: "500.00",
    billing_principal_osp: "8000.00",
    classification: "cp",
    cumulative_collected: "150.00",
    remaining_amount: "350.00",
    cycle_system_collected_at_manual_date: "150.00",
    cycle_has_automatic_abort: false,
    settlement_override_status: "ACTIVE",
    pool_amount: "350.00",
    manual_settlement_date: "2026-09-06",
    manual_settlement_reason: "EXTERNAL_UNASSIGNED_PAYMENT",
    manual_settlement_version: 1,
    manual_settlement_verified_by: "superuser.actor",
    manual_settlement_verified_at: "2026-09-06T08:05:00.000Z",
    manual_settlement_updated_by: "superuser.actor",
    manual_settlement_updated_at: "2026-09-06T08:05:00.000Z",
  });

  assert.equal(mapped.amount, "150.00");
  assert.equal(mapped.collectionStaffNickname, "collector.alpha");
  assert.equal(mapped.automaticCpStatus, "cp");
  assert.equal(mapped.cpStatus, "abort_cp");
  assert.equal(mapped.effectiveSettlementSource, "MANUAL_VERIFIED");
  assert.equal(mapped.manualSettlement?.poolAmount, "350.00");
  assert.equal(mapped.manualSettlement?.systemCollectedAtSettlement, "150.00");
  assert.equal(mapped.manualSettlement?.effectiveTotal, "500.00");
});

test("underlying Collection invalidation removes stale Manual Verified ABORT", () => {
  const mapped = mapCollectionRecordRow({
    id: "record-invalidated",
    customer_name: "Account holder",
    account_number: "A001",
    batch: "P10",
    payment_date: "2026-09-06",
    amount: "150.00",
    created_by_login: "collector.login",
    collection_staff_nickname: "collector.alpha",
    created_at: "2026-09-06T08:00:00.000Z",
    source_import_id: "source-1",
    source_data_row_id: "source-row-1",
    source_match_basis: "account_number",
    source_obligation_key: "obligation-a001",
    settlement_cycle_key: "2026-09-01:obligation-a001",
    calling_date: "2026-09-01",
    calling_window_end_exclusive: "2026-10-01",
    total_due: "500.00",
    classification: "cp",
    cumulative_collected: "150.00",
    remaining_amount: "350.00",
    cycle_system_collected_at_manual_date: "0.00",
    cycle_has_automatic_abort: false,
    duplicate_receipt_flag: false,
    settlement_override_status: "ACTIVE",
    pool_amount: "350.00",
    manual_settlement_date: "2026-09-06",
    manual_settlement_reason: "EXTERNAL_UNASSIGNED_PAYMENT",
    manual_settlement_version: 1,
    manual_settlement_verified_by: "superuser.actor",
    manual_settlement_verified_at: "2026-09-06T08:05:00.000Z",
    manual_settlement_updated_by: "superuser.actor",
    manual_settlement_updated_at: "2026-09-06T08:05:00.000Z",
  });

  assert.equal(mapped.manualSettlement?.validity, "REQUIRES_REVALIDATION");
  assert.equal(mapped.manualSettlement?.systemCollectedAtSettlement, "0.00");
  assert.equal(mapped.manualSettlement?.effectiveTotal, "350.00");
  assert.equal(mapped.cpStatus, "cp");
  assert.equal(mapped.effectiveSettlementSource, "NONE");
  assert.equal(mapped.amount, "150.00");
});

test("revoking Manual Verified ABORT restores the automatic status and retains audit state", () => {
  const mapped = mapCollectionRecordRow({
    id: "record-revoked",
    customer_name: "Account holder",
    account_number: "A001",
    batch: "P10",
    payment_date: "2026-09-06",
    amount: "150.00",
    created_by_login: "collector.login",
    collection_staff_nickname: "collector.alpha",
    created_at: "2026-09-06T08:00:00.000Z",
    source_import_id: "source-1",
    source_data_row_id: "source-row-1",
    source_match_basis: "account_number",
    source_obligation_key: "obligation-a001",
    settlement_cycle_key: "2026-09-01:obligation-a001",
    calling_date: "2026-09-01",
    calling_window_end_exclusive: "2026-10-01",
    total_due: "500.00",
    classification: "cp",
    cumulative_collected: "150.00",
    remaining_amount: "350.00",
    cycle_system_collected_at_manual_date: "150.00",
    cycle_has_automatic_abort: false,
    duplicate_receipt_flag: false,
    settlement_override_status: "REVOKED",
    pool_amount: "350.00",
    manual_settlement_date: "2026-09-06",
    manual_settlement_reason: "EXTERNAL_UNASSIGNED_PAYMENT",
    manual_settlement_version: 2,
    manual_settlement_verified_by: "superuser.actor",
    manual_settlement_verified_at: "2026-09-06T08:05:00.000Z",
    manual_settlement_updated_by: "superuser.actor",
    manual_settlement_updated_at: "2026-09-07T08:05:00.000Z",
    manual_settlement_revoked_by: "superuser.actor",
    manual_settlement_revoked_at: "2026-09-07T08:05:00.000Z",
    manual_settlement_revoked_reason: "Evidence withdrawn",
  });

  assert.equal(mapped.manualSettlement?.status, "REVOKED");
  assert.equal(mapped.manualSettlement?.validity, "REVOKED");
  assert.equal(mapped.manualSettlement?.revokedReason, "Evidence withdrawn");
  assert.equal(mapped.cpStatus, "cp");
  assert.equal(mapped.effectiveSettlementSource, "NONE");
});
