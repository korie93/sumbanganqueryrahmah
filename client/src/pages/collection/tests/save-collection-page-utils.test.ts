import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSaveCollectionMutationPayload,
  formatSaveCollectionRestoreNoticeLabel,
  removeSaveCollectionReceiptAtIndex,
  getSaveCollectionReadiness,
  validateSaveCollectionForm,
  validateSaveCollectionFormFields,
  validateSaveCollectionIdentityFields,
} from "@/pages/collection/save-collection-page-utils";

test("validateSaveCollectionForm rejects invalid customer and payment inputs", () => {
  assert.equal(
    validateSaveCollectionForm({
      staffNickname: "ab",
      customerName: "",
      icNumber: "900101-10-1234",
      customerPhone: "0123456789",
      accountNumber: "ACC-1",
      cardNumber: "",
      batch: "P10",
      paymentDate: "2026-03-01",
      amount: "10.00",
    }),
    "Customer Name is required.",
  );

  assert.equal(
    validateSaveCollectionForm({
      staffNickname: "ab",
      customerName: "Siti",
      icNumber: "900101-10-1234",
      customerPhone: "bad",
      accountNumber: "ACC-1",
      cardNumber: "",
      batch: "P10",
      paymentDate: "2026-03-01",
      amount: "10.00",
    }),
    "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.",
  );
});

test("validateSaveCollectionFormFields returns inline field-level errors", () => {
  assert.deepEqual(
    validateSaveCollectionFormFields({
      staffNickname: "ab",
      customerName: "",
      icNumber: "",
      customerPhone: "bad",
      accountNumber: "",
      cardNumber: "",
      batch: "P10",
      paymentDate: "not-a-date",
      amount: "0",
    }),
    {
      customerName: "Customer Name is required.",
      icNumber: "IC Number is required.",
      customerPhone: "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.",
      accountNumber: "Enter an Account Number or Card Number.",
      cardNumber: "Enter an Account Number or Card Number.",
      paymentDate: "Payment Date is invalid.",
      amount: "Amount must be greater than 0.",
    },
  );
});

test("source matching identity validation catches incomplete and oversized values locally", () => {
  assert.deepEqual(
    validateSaveCollectionIdentityFields({
      customerName: " ",
      icNumber: "1".repeat(65),
      customerPhone: "not-a-phone",
      accountNumber: "A".repeat(129),
      cardNumber: "",
    }),
    {
      customerName: "Customer Name is required.",
      icNumber: "IC Number must not exceed 64 characters.",
      customerPhone: "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.",
      accountNumber: "Account Number must not exceed 128 characters.",
    },
  );
});

test("save readiness does not require a manually selected source", () => {
  const readiness = getSaveCollectionReadiness({
    staffNickname: "staff1",
    customerName: "Siti",
    icNumber: "900101101234",
    customerPhone: "0123456789",
    accountNumber: "ACC-1",
    cardNumber: "",
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "10.00",
  } as unknown as Parameters<typeof getSaveCollectionReadiness>[0]);

  assert.equal(readiness.isReady, true);
  assert.equal(readiness.firstError, null);
  assert.deepEqual(readiness.invalidFields, []);
});

test("save readiness is true only when the shared field validator has no errors", () => {
  const readiness = getSaveCollectionReadiness({
    staffNickname: "staff1",
    customerName: "Siti",
    icNumber: "900101101234",
    customerPhone: "0123456789",
    accountNumber: "ACC-1",
    cardNumber: "",
    batch: "P25",
    paymentDate: "2026-03-01",
    amount: "10.00",
  });

  assert.equal(readiness.isReady, true);
  assert.equal(readiness.firstError, null);
  assert.deepEqual(readiness.errors, {});
});

test("buildSaveCollectionMutationPayload trims values and maps receipt metadata", () => {
  const payload = buildSaveCollectionMutationPayload({
    values: {
      staffNickname: " staff1 ",
      customerName: " Siti ",
      icNumber: " 900101-10-1234 ",
      customerPhone: " 0123456789 ",
      accountNumber: " ACC-1 ",
      cardNumber: " 0000123412345678 ",
      batch: "P25",
      paymentDate: "2026-03-01",
      amount: "100.50",
    },
    receiptDrafts: [
      {
        draftLocalId: "draft-1",
        receiptAmount: " 100.50 ",
        receiptDate: " 2026-03-01 ",
        receiptReference: " ABC123 ",
      },
    ],
  });

  assert.equal(payload.customerName, "Siti");
  assert.equal(payload.cardNumber, "0000123412345678");
  assert.equal("sourceImportId" in payload, false);
  assert.equal("agingBucket" in payload, false);
  assert.equal(payload.collectionStaffNickname, "staff1");
  assert.equal(payload.amount, 100.5);
  assert.deepEqual(payload.newReceiptMetadata, [
    {
      receiptId: undefined,
      receiptAmount: "100.50",
      receiptDate: "2026-03-01",
      receiptReference: "ABC123",
      fileHash: null,
    },
  ]);
});

test("buildSaveCollectionMutationPayload normalizes grouped amount strings", () => {
  const payload = buildSaveCollectionMutationPayload({
    values: {
      staffNickname: " staff1 ",
      customerName: " Siti ",
      icNumber: " 900101-10-1234 ",
      customerPhone: " 0123456789 ",
      accountNumber: " ACC-1 ",
      cardNumber: "",
      batch: "P25",
      paymentDate: "2026-03-01",
      amount: "1,200.50",
    },
    receiptDrafts: [],
  });

  assert.equal(payload.amount, 1200.5);
});

test("save validation and payload preserve an exact 16-digit Card-only identifier", () => {
  const values = {
    staffNickname: "staff1",
    customerName: "Siti",
    icNumber: "900101101234",
    customerPhone: "0123456789",
    accountNumber: "",
    cardNumber: "0000123412345678",
    batch: "P10" as const,
    paymentDate: "2026-03-01",
    amount: "10.00",
  };

  assert.deepEqual(validateSaveCollectionIdentityFields(values), {});
  const payload = buildSaveCollectionMutationPayload({ values, receiptDrafts: [] });
  assert.equal(payload.accountNumber, "");
  assert.equal(payload.cardNumber, "0000123412345678");
});

test("removeSaveCollectionReceiptAtIndex removes only the targeted item", () => {
  assert.deepEqual(removeSaveCollectionReceiptAtIndex(["a", "b", "c"], 1), ["a", "c"]);
});

test("formatSaveCollectionRestoreNoticeLabel returns null for invalid timestamps", () => {
  assert.equal(formatSaveCollectionRestoreNoticeLabel("not-a-date"), null);
});
