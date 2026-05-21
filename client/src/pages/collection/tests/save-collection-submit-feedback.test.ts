import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSaveCollectionRequestFailure,
  buildSaveCollectionValidationFailure,
} from "../save-collection-submit-feedback";

test("buildSaveCollectionValidationFailure keeps validation errors inline and non-retryable", () => {
  const failure = buildSaveCollectionValidationFailure({
    message: "Amount is required.",
    receiptCount: 1,
  });

  assert.equal(failure.kind, "validation");
  assert.equal(failure.canRetry, false);
  assert.equal(failure.receiptCount, 1);
  assert.match(failure.message, /Amount is required/i);
});

test("buildSaveCollectionRequestFailure turns receipt scan timeout into clear retry guidance", () => {
  const failure = buildSaveCollectionRequestFailure({
    error: new Error(
      '400: {"ok":false,"message":"Receipt external malware scan failed for file.upload (timed out after 15000ms).","requestId":"api-test-123"}',
    ),
    receiptCount: 2,
  });

  assert.equal(failure.kind, "request");
  assert.equal(failure.canRetry, true);
  assert.equal(failure.requestId, "api-test-123");
  assert.equal(failure.receiptCount, 2);
  assert.match(failure.title, /Receipt/i);
  assert.match(failure.helperText, /Save Collection semula/i);
});

test("buildSaveCollectionRequestFailure keeps scanner config internals hidden and points to admin", () => {
  const failure = buildSaveCollectionRequestFailure({
    error: new Error(
      '400: {"ok":false,"message":"Imbasan keselamatan receipt belum tersedia. Sila hubungi admin untuk semak konfigurasi scanner.","error":{"code":"COLLECTION_RECEIPT_EXTERNAL_SCAN_CONFIG_INVALID","message":"Imbasan keselamatan receipt belum tersedia. Sila hubungi admin untuk semak konfigurasi scanner."},"requestId":"api-test-456"}',
    ),
    receiptCount: 1,
  });

  assert.equal(failure.kind, "request");
  assert.equal(failure.canRetry, false);
  assert.equal(failure.requestId, "api-test-456");
  assert.match(failure.title, /Receipt/i);
  assert.match(failure.message, /hubungi admin/i);
  assert.match(failure.helperText, /konfigurasi scanner/i);
  assert.doesNotMatch(failure.message, /COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON/i);
});

test("buildSaveCollectionRequestFailure preserves non-scan API messages", () => {
  const failure = buildSaveCollectionRequestFailure({
    error: new Error('400: {"ok":false,"message":"Payment Date cannot be in the future."}'),
    receiptCount: 0,
  });

  assert.equal(failure.title, "Collection gagal disimpan");
  assert.match(failure.message, /Payment Date cannot be in the future/i);
});
