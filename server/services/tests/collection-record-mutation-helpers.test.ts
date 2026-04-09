import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionAuditFieldChanges,
  buildCollectionAuditSnapshot,
  buildCollectionRecordUpdateDraft,
  maskCollectionAuditCustomerName,
  normalizeCollectionReceiptMetadata,
  normalizeCollectionRecordFields,
  normalizeExtractionConfidence,
  readCollectionReceiptMetadataList,
  readUploadedReceiptRows,
  resolveCollectionAuditReceiptState,
} from "../collection/collection-record-mutation-helpers";

test("collection audit helpers preserve receipt source precedence and changed fields", () => {
  assert.deepEqual(
    resolveCollectionAuditReceiptState({
      legacyReceiptFile: "legacy.pdf",
      relationCount: 2,
    }),
    { count: 2, source: "relation" },
  );
  assert.deepEqual(
    resolveCollectionAuditReceiptState({
      legacyReceiptFile: "legacy.pdf",
      relationCount: 0,
    }),
    { count: 1, source: "legacy" },
  );

  const before = buildCollectionAuditSnapshot({
    customerName: " A ",
    paymentDate: "2026-01-01",
    amount: "10.005",
    collectionStaffNickname: "Collector A",
    activeReceiptCount: -1,
    activeReceiptSource: "none",
  });
  const after = buildCollectionAuditSnapshot({
    customerName: " A ",
    paymentDate: "2026-01-02",
    amount: "12.10",
    collectionStaffNickname: "Collector B",
    activeReceiptCount: 1,
    activeReceiptSource: "relation",
  });

  assert.equal(before.amount, 10.01);
  assert.equal(
    buildCollectionAuditSnapshot({
      customerName: "Grouped Customer",
      paymentDate: "2026-01-03",
      amount: "1,200.50",
      collectionStaffNickname: "Collector C",
      activeReceiptCount: 0,
      activeReceiptSource: "none",
    }).amount,
    1200.5,
  );
  assert.equal(before.customerName, maskCollectionAuditCustomerName("A"));
  assert.deepEqual(buildCollectionAuditFieldChanges(before, after), {
    amount: { from: 10.01, to: 12.1 },
    collectionStaffNickname: { from: "Collector A", to: "Collector B" },
    paymentDate: { from: "2026-01-01", to: "2026-01-02" },
  });
});

test("collection audit helpers mask customer names while preserving change detection", () => {
  const before = buildCollectionAuditSnapshot({
    customerName: "Bob Lee",
    paymentDate: "2026-01-01",
    amount: 10,
    collectionStaffNickname: "Collector A",
    activeReceiptCount: 0,
    activeReceiptSource: "none",
  });
  const after = buildCollectionAuditSnapshot({
    customerName: "Bobby Lee",
    paymentDate: "2026-01-01",
    amount: 10,
    collectionStaffNickname: "Collector A",
    activeReceiptCount: 0,
    activeReceiptSource: "none",
  });

  assert.equal(before.customerName, maskCollectionAuditCustomerName("Bob Lee"));
  assert.notEqual(before.customerName, "Bob Lee");
  assert.deepEqual(buildCollectionAuditFieldChanges(before, after), {
    customerName: {
      from: maskCollectionAuditCustomerName("Bob Lee"),
      to: maskCollectionAuditCustomerName("Bobby Lee"),
    },
  });
});

test("collection record field helpers normalize create/update payloads", () => {
  const fields = normalizeCollectionRecordFields({
    accountNumber: " acc-1 ",
    amount: "1,200.50",
    batch: " p10 ",
    collectionStaffNickname: " Collector Alpha ",
    customerName: " Customer A ",
    customerPhone: "+60123456789",
    icNumber: " 900101 ",
    paymentDate: "2020-01-01",
  });

  assert.deepEqual(fields, {
    accountNumber: "acc-1",
    amount: 1200.5,
    amountCents: 120050,
    batch: "P10",
    collectionStaffNickname: "Collector Alpha",
    customerName: "Customer A",
    customerPhone: "+60123456789",
    icNumber: "900101",
    paymentDate: "2020-01-01",
  });

  assert.deepEqual(
    normalizeCollectionRecordFields({
      amount: "12.345",
    }),
    {
      accountNumber: "",
      amount: null,
      amountCents: null,
      batch: "",
      collectionStaffNickname: "",
      customerName: "",
      customerPhone: "",
      icNumber: "",
      paymentDate: "",
    },
  );

  const updateDraft = buildCollectionRecordUpdateDraft(
    {
      amount: "20.00",
      collectionStaffNickname: " Collector Beta ",
      customerName: "Customer B",
    },
    normalizeCollectionRecordFields({
      amount: "20.00",
      collectionStaffNickname: " Collector Beta ",
      customerName: "Customer B",
    }),
  );

  assert.deepEqual(updateDraft, {
    nextCollectionStaffNickname: "Collector Beta",
    updatePayload: {
      amount: 20,
      customerName: "Customer B",
    },
  });
});

test("collection receipt helpers normalize metadata and uploaded receipt rows", () => {
  assert.equal(normalizeExtractionConfidence("85"), 0.85);
  assert.equal(normalizeExtractionConfidence("0.75"), 0.75);
  assert.equal(normalizeExtractionConfidence("-1"), null);

  const metadataItems = readCollectionReceiptMetadataList(JSON.stringify([
    {
      extractedAmount: "12.30",
      extractionConfidence: "87",
      extractionStatus: "suggested",
      fileHash: " ABC ",
      receiptAmount: "12.30",
      receiptDate: "2020-01-01",
      receiptId: " receipt-1 ",
      receiptReference: " REF-1 ",
    },
  ]));
  const metadata = normalizeCollectionReceiptMetadata(metadataItems[0] || {});

  assert.deepEqual(metadata, {
    extractedAmountCents: 1230,
    extractionConfidence: 0.87,
    extractionStatus: "suggested",
    fileHash: "abc",
    receiptAmountCents: 1230,
    receiptDate: "2020-01-01",
    receiptId: "receipt-1",
    receiptReference: "REF-1",
  });

  assert.throws(
    () => readCollectionReceiptMetadataList("{not json"),
    /COLLECTION_RECEIPT_METADATA_INVALID/,
  );

  const uploadedRows = readUploadedReceiptRows({
    uploadedReceipts: [
      {
        extractedAmountCents: "5.00",
        extractionConfidence: "99",
        extractionStatus: "ambiguous",
        fileHash: " Hash-1 ",
        fileSize: 100,
        originalExtension: ".pdf",
        originalFileName: " receipt.pdf ",
        originalMimeType: "",
        receiptAmountCents: "5.00",
        receiptDate: "2020-01-01",
        receiptReference: " REF ",
        storagePath: " collection-receipts/receipt.pdf ",
      },
      {
        fileSize: 10,
        originalFileName: "",
        storagePath: "",
      },
    ],
  });

  assert.equal(uploadedRows.length, 1);
  assert.equal(uploadedRows[0]?.originalMimeType, "application/octet-stream");
  assert.equal(uploadedRows[0]?.receiptAmountCents, 500);
  assert.equal(uploadedRows[0]?.fileHash, "hash-1");
});
