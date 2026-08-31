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
      sourceImportId: "import-1",
      agingBucket: "D3",
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
      sourceImportId: "import-1",
      agingBucket: "D3",
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
      sourceImportId: "",
      agingBucket: "D3",
      batch: "P10",
      paymentDate: "not-a-date",
      amount: "0",
    }),
    {
      customerName: "Customer Name is required.",
      icNumber: "IC Number is required.",
      customerPhone: "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.",
      accountNumber: "Account Number is required.",
      sourceImportId: "Pilih fail Saved yang telah disahkan matching.",
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
    }),
    {
      customerName: "Customer Name is required.",
      icNumber: "IC Number must not exceed 64 characters.",
      customerPhone: "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.",
      accountNumber: "Account Number must not exceed 128 characters.",
    },
  );
});

test("save readiness requires a verified source even when a legacy value is undefined", () => {
  const readiness = getSaveCollectionReadiness({
    staffNickname: "staff1",
    customerName: "Siti",
    icNumber: "900101101234",
    customerPhone: "0123456789",
    accountNumber: "ACC-1",
    sourceImportId: undefined,
    agingBucket: "D3",
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "10.00",
  } as unknown as Parameters<typeof getSaveCollectionReadiness>[0]);

  assert.equal(readiness.isReady, false);
  assert.equal(readiness.firstError, "Pilih fail Saved yang telah disahkan matching.");
  assert.deepEqual(readiness.invalidFields, ["sourceImportId"]);
});

test("save readiness is true only when the shared field validator has no errors", () => {
  const readiness = getSaveCollectionReadiness({
    staffNickname: "staff1",
    customerName: "Siti",
    icNumber: "900101101234",
    customerPhone: "0123456789",
    accountNumber: "ACC-1",
    sourceImportId: "import-verified",
    agingBucket: "D5",
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
      sourceImportId: " import-verified ",
      agingBucket: "D5",
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
  assert.equal(payload.sourceImportId, "import-verified");
  assert.equal(payload.agingBucket, "D5");
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
      sourceImportId: " import-verified ",
      agingBucket: "D3",
      batch: "P25",
      paymentDate: "2026-03-01",
      amount: "1,200.50",
    },
    receiptDrafts: [],
  });

  assert.equal(payload.amount, 1200.5);
});

test("removeSaveCollectionReceiptAtIndex removes only the targeted item", () => {
  assert.deepEqual(removeSaveCollectionReceiptAtIndex(["a", "b", "c"], 1), ["a", "c"]);
});

test("formatSaveCollectionRestoreNoticeLabel returns null for invalid timestamps", () => {
  assert.equal(formatSaveCollectionRestoreNoticeLabel("not-a-date"), null);
});
