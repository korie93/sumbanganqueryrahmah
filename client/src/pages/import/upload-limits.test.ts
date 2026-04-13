import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  buildImportFileTooLargeMessage,
  formatImportUploadSize,
  isImportFileTooLarge,
  resolveImportUploadLimitBytes,
} from "./upload-limits";

test("resolveImportUploadLimitBytes falls back to the default limit", () => {
  assert.equal(resolveImportUploadLimitBytes(undefined), DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES);
  assert.equal(resolveImportUploadLimitBytes(Number.NaN), DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES);
});

test("formatImportUploadSize returns readable labels", () => {
  assert.equal(formatImportUploadSize(512 * 1024), "512 KB");
  assert.equal(formatImportUploadSize(96 * 1024 * 1024), "96 MB");
});

test("isImportFileTooLarge compares against the configured limit", () => {
  assert.equal(isImportFileTooLarge({ size: 10 }, 9), true);
  assert.equal(isImportFileTooLarge({ size: 10 }, 10), false);
});

test("buildImportFileTooLargeMessage includes the file and limit sizes", () => {
  const message = buildImportFileTooLargeMessage(100 * 1024 * 1024, 96 * 1024 * 1024);
  assert.match(message, /100 MB/i);
  assert.match(message, /96 MB/i);
});
