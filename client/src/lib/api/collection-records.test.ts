import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionMutationFingerprint,
  buildCollectionRecordFormData,
} from "./collection-records";

test("buildCollectionRecordFormData appends scalar fields and repeated receipt ids", () => {
  const formData = buildCollectionRecordFormData({
    customerName: "Collector Test",
    amount: 55.3,
    removeReceipt: true,
    removeReceiptIds: ["receipt-1", "receipt-2"],
    expectedUpdatedAt: "2026-03-01T09:00:00.000Z",
  });

  assert.equal(formData.get("customerName"), "Collector Test");
  assert.equal(formData.get("amount"), "55.3");
  assert.equal(formData.get("removeReceipt"), "true");
  assert.deepEqual(formData.getAll("removeReceiptIds"), ["receipt-1", "receipt-2"]);
  assert.equal(formData.get("expectedUpdatedAt"), "2026-03-01T09:00:00.000Z");
});

test("buildCollectionRecordFormData appends receipt files for multipart uploads", () => {
  const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47])], "receipt.png", {
    type: "image/png",
  });

  const formData = buildCollectionRecordFormData({
    customerName: "Collector Test",
  }, [file]);

  const appendedFiles = formData.getAll("receipts");
  assert.equal(appendedFiles.length, 1);
  assert.equal((appendedFiles[0] as File).name, "receipt.png");
});

test("buildCollectionMutationFingerprint stays stable for the same logical payload", () => {
  const left = buildCollectionMutationFingerprint({
    operation: "update",
    recordId: "collection-1",
    payload: {
      amount: 10,
      customerName: "Alice",
      nested: {
        batch: "P10",
        paymentDate: "2026-03-24",
      },
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-a.png",
        size: 123,
        type: "image/png",
      },
    ],
  });
  const right = buildCollectionMutationFingerprint({
    operation: "update",
    recordId: "collection-1",
    payload: {
      customerName: "Alice",
      nested: {
        paymentDate: "2026-03-24",
        batch: "P10",
      },
      amount: 10,
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-a.png",
        size: 123,
        type: "image/png",
      },
    ],
  });

  assert.equal(left, right);
});

test("buildCollectionMutationFingerprint changes when receipt metadata changes", () => {
  const base = buildCollectionMutationFingerprint({
    operation: "create",
    payload: {
      customerName: "Alice",
      amount: 10,
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-a.png",
        size: 123,
        type: "image/png",
      },
    ],
  });
  const changed = buildCollectionMutationFingerprint({
    operation: "create",
    payload: {
      customerName: "Alice",
      amount: 10,
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-b.png",
        size: 123,
        type: "image/png",
      },
    ],
  });

  assert.notEqual(base, changed);
});
