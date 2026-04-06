import test from "node:test";
import assert from "node:assert/strict";
import type {
  CollectionBatch,
  CollectionRecord,
  CollectionStaffNickname,
} from "@/lib/api";
import {
  cloneReceiptIds,
  getCollectionRecordEditValidationError,
} from "@/pages/collection-records/collection-record-edit-utils";

const baseEditingRecord = {
  id: "record-1",
  collectionStaffNickname: "staff-a",
} as CollectionRecord;

const nicknameOptions = [
  { id: "nick-1", nickname: "staff-a", isActive: true },
  { id: "nick-2", nickname: "staff-b", isActive: true },
  { id: "nick-3", nickname: "staff-inactive", isActive: false },
] as CollectionStaffNickname[];

function buildValidationArgs(overrides: Partial<{
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  staffNickname: string;
  editingRecord: CollectionRecord | null;
  nicknameOptions: CollectionStaffNickname[];
}> = {}) {
  return {
    customerName: "Customer One",
    icNumber: "900101-10-1010",
    customerPhone: "0123456789",
    accountNumber: "ACC-1001",
    batch: "P10" as CollectionBatch,
    paymentDate: "2026-04-01",
    amount: "120.50",
    staffNickname: "staff-a",
    editingRecord: baseEditingRecord,
    nicknameOptions,
    ...overrides,
  };
}

test("cloneReceiptIds trims, dedupes, and removes blanks", () => {
  assert.deepEqual(
    cloneReceiptIds([" receipt-1 ", "", "receipt-2", "receipt-1", "   "]),
    ["receipt-1", "receipt-2"],
  );
});

test("getCollectionRecordEditValidationError rejects invalid changed nickname", () => {
  assert.equal(
    getCollectionRecordEditValidationError(
      buildValidationArgs({ staffNickname: "staff-inactive" }),
    ),
    "Sila pilih Staff Nickname rasmi daripada senarai.",
  );
});

test("getCollectionRecordEditValidationError allows unchanged nickname even if options differ", () => {
  assert.equal(
    getCollectionRecordEditValidationError(
      buildValidationArgs({
        editingRecord: {
          ...baseEditingRecord,
          collectionStaffNickname: "legacy-staff",
        } as CollectionRecord,
        staffNickname: "legacy-staff",
      }),
    ),
    null,
  );
});

test("getCollectionRecordEditValidationError rejects invalid phone before save", () => {
  assert.equal(
    getCollectionRecordEditValidationError(
      buildValidationArgs({ customerPhone: "123" }),
    ),
    "Customer Phone Number is invalid.",
  );
});
