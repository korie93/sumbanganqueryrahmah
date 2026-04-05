import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCollectionMultipartField,
  isCollectionReceiptMultipartField,
  normalizeCollectionMultipartFieldName,
  type MultipartCollectionBody,
} from "../collection/collection-multipart-body-utils";

test("normalizeCollectionMultipartFieldName trims trailing [] suffixes", () => {
  assert.equal(normalizeCollectionMultipartFieldName("receipts[]"), "receipts");
  assert.equal(normalizeCollectionMultipartFieldName(" removeReceiptIds[] "), "removeReceiptIds");
  assert.equal(normalizeCollectionMultipartFieldName("customerName"), "customerName");
});

test("appendCollectionMultipartField preserves receipt removal booleans and ids", () => {
  const body: MultipartCollectionBody = {};

  appendCollectionMultipartField(body, "removeReceipt", "true");
  appendCollectionMultipartField(body, "removeReceiptIds[]", "receipt-1");
  appendCollectionMultipartField(body, "removeReceiptIds", "receipt-2");

  assert.equal(body.removeReceipt, true);
  assert.deepEqual(body.removeReceiptIds, ["receipt-1", "receipt-2"]);
});

test("appendCollectionMultipartField collapses repeated values into arrays", () => {
  const body: MultipartCollectionBody = {};

  appendCollectionMultipartField(body, "customerName", "Alice");
  appendCollectionMultipartField(body, "customerName", "Bob");
  appendCollectionMultipartField(body, "batch[]", "P1");
  appendCollectionMultipartField(body, "batch[]", "P2");

  assert.deepEqual(body.customerName, ["Alice", "Bob"]);
  assert.deepEqual(body.batch, ["P1", "P2"]);
});

test("isCollectionReceiptMultipartField only accepts receipt upload field names", () => {
  assert.equal(isCollectionReceiptMultipartField("receipt"), true);
  assert.equal(isCollectionReceiptMultipartField("receipts[]"), true);
  assert.equal(isCollectionReceiptMultipartField("receipts"), true);
  assert.equal(isCollectionReceiptMultipartField("document"), false);
});
