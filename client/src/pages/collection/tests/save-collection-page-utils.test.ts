import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSaveCollectionMutationPayload,
  formatSaveCollectionRestoreNoticeLabel,
  removeSaveCollectionReceiptAtIndex,
  validateSaveCollectionForm,
  validateSaveCollectionFormFields,
} from "@/pages/collection/save-collection-page-utils";

const sourceFields = {
  sourceImportId: "import-1",
  sourceImportName: "NPL CC P10 JULY",
  sourceFilename: "npl-cc-p10-july.xlsx",
};

test("validateSaveCollectionForm rejects invalid customer and payment inputs", () => {
  assert.equal(
    validateSaveCollectionForm({
      ...sourceFields,
      staffNickname: "ab",
      customerName: "",
      icNumber: "900101-10-1234",
      customerPhone: "0123456789",
      accountNumber: "ACC-1",
      batch: "P10",
      paymentDate: "2026-03-01",
      amount: "10.00",
    }),
    "Customer Name is required.",
  );

  assert.equal(
    validateSaveCollectionForm({
      ...sourceFields,
      staffNickname: "ab",
      customerName: "Siti",
      icNumber: "900101-10-1234",
      customerPhone: "bad",
      accountNumber: "ACC-1",
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
      ...sourceFields,
      sourceImportId: "",
      staffNickname: "ab",
      customerName: "",
      icNumber: "",
      customerPhone: "bad",
      accountNumber: "",
      batch: "P10",
      paymentDate: "not-a-date",
      amount: "0",
    }),
    {
      sourceImportId: "Source File is required. Select an active file from Saved.",
      customerName: "Customer Name is required.",
      icNumber: "IC Number is required.",
      customerPhone: "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.",
      accountNumber: "Account Number is required.",
      paymentDate: "Payment Date is invalid.",
      amount: "Amount must be greater than 0.",
    },
  );
});

test("buildSaveCollectionMutationPayload trims values and maps receipt metadata", () => {
  const payload = buildSaveCollectionMutationPayload({
    values: {
      ...sourceFields,
      staffNickname: " staff1 ",
      customerName: " Siti ",
      icNumber: " 900101-10-1234 ",
      customerPhone: " 0123456789 ",
      accountNumber: " ACC-1 ",
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
  assert.equal(payload.sourceImportId, "import-1");
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
      ...sourceFields,
      staffNickname: " staff1 ",
      customerName: " Siti ",
      icNumber: " 900101-10-1234 ",
      customerPhone: " 0123456789 ",
      accountNumber: " ACC-1 ",
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
