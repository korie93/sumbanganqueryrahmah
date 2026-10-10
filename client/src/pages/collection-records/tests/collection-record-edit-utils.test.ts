import test from "node:test";
import assert from "node:assert/strict";
import type {
  CollectionBatch,
  CollectionRecord,
  CollectionStaffNickname,
} from "@/lib/api";
import {
  cloneReceiptIds,
  getCollectionRecordEditFieldErrors,
  getCollectionRecordEditValidationError,
  type CollectionRecordEditFieldErrors,
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

test("getCollectionRecordEditValidationError permits an existing Card-only governed record", () => {
  assert.equal(
    getCollectionRecordEditValidationError(
      buildValidationArgs({
        accountNumber: "",
        editingRecord: {
          ...baseEditingRecord,
          accountNumber: "",
          cardNumberLast4: "5678",
          sourceMatchBasis: "card_number",
        } as CollectionRecord,
      }),
    ),
    null,
  );
});

test("field errors preserve every existing rule, message, and first-error order", () => {
  const expected: CollectionRecordEditFieldErrors = {
    customerName: "Customer Name is required.",
    icNumber: "IC Number is required.",
    customerPhone: "Customer Phone Number is invalid.",
    accountNumber: "Account Number or a previously matched Card Number is required.",
    batch: "Batch is not valid.",
    paymentDate: "Payment Date is invalid.",
    amount: "Amount must be greater than 0.",
    staffNickname: "Sila pilih Staff Nickname rasmi daripada senarai.",
  };
  const invalidArgs = buildValidationArgs({
    customerName: " ", icNumber: " ", customerPhone: "123", accountNumber: " ",
    batch: "invalid" as CollectionBatch, paymentDate: "not-a-date", amount: "0",
    staffNickname: "staff-inactive",
  });
  assert.deepEqual(getCollectionRecordEditFieldErrors(invalidArgs), expected);
  const validArgs = buildValidationArgs();
  for (const [field, message] of Object.entries(expected)) {
    assert.equal(getCollectionRecordEditValidationError(invalidArgs), message);
    Object.assign(invalidArgs, { [field]: validArgs[field as keyof typeof validArgs] });
    assert.equal(getCollectionRecordEditFieldErrors(invalidArgs)[field as keyof typeof expected], undefined);
  }
  assert.deepEqual(getCollectionRecordEditFieldErrors(invalidArgs), {});
  assert.equal(getCollectionRecordEditValidationError(invalidArgs), null);
});

test("date feedback keeps invalid format before future-date validation", () => {
  for (const [paymentDate, message] of [
    ["9999-not-a-date", "Payment Date is invalid."],
    ["9999-01-01", "Payment Date cannot be in the future."],
  ]) {
    const args = buildValidationArgs({ paymentDate });
    assert.deepEqual(getCollectionRecordEditFieldErrors(args), { paymentDate: message });
    assert.equal(getCollectionRecordEditValidationError(args), message);
  }
});

test("field feedback preserves nickname exceptions and existing card-only records", () => {
  for (const args of [
    buildValidationArgs({ staffNickname: " staff-b " }),
    buildValidationArgs({
      nicknameOptions: [], staffNickname: "legacy-staff",
      editingRecord: { ...baseEditingRecord, collectionStaffNickname: "legacy-staff" },
    }),
    buildValidationArgs({
      accountNumber: "", editingRecord: { ...baseEditingRecord, cardNumberLast4: "5678" },
    }),
  ]) {
    assert.deepEqual(getCollectionRecordEditFieldErrors(args), {});
    assert.equal(getCollectionRecordEditValidationError(args), null);
  }
});

test("missing-record errors remain generic and retain existing priority", () => {
  const args = buildValidationArgs({ editingRecord: null, staffNickname: "unlisted" });
  assert.deepEqual(getCollectionRecordEditFieldErrors(args), {});
  assert.equal(getCollectionRecordEditValidationError(args), "No record selected for editing.");
  assert.deepEqual(getCollectionRecordEditFieldErrors({ ...args, amount: "0" }), {
    amount: "Amount must be greater than 0.",
  });
  assert.equal(getCollectionRecordEditValidationError({ ...args, amount: "0" }), "Amount must be greater than 0.");
});

test("field feedback contains fixed messages, never submitted sensitive field values", () => {
  const args = buildValidationArgs({
    customerPhone: "synthetic-private-phone", paymentDate: "synthetic-private-date",
    amount: "synthetic-private-amount", staffNickname: "synthetic-private-nickname",
  });
  const messages = JSON.stringify(getCollectionRecordEditFieldErrors(args));
  assert.doesNotMatch(messages, /synthetic-private/);
  assert.deepEqual(Object.keys(getCollectionRecordEditFieldErrors(args)), [
    "customerPhone", "paymentDate", "amount", "staffNickname",
  ]);
});
