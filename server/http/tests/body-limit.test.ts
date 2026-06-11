import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  formatBodyLimitBytes,
  parseImportMaxFileSizeMbToBytes,
  parseBodyLimitToBytes,
  resolveImportBodyLimit,
} from "../../config/body-limit";

test("parseBodyLimitToBytes understands common size labels", () => {
  assert.equal(parseBodyLimitToBytes("64mb"), 64 * 1024 * 1024);
  assert.equal(parseBodyLimitToBytes("64M"), 64 * 1024 * 1024);
  assert.equal(parseBodyLimitToBytes("96mb"), 96 * 1024 * 1024);
  assert.equal(parseBodyLimitToBytes("512kb"), 512 * 1024);
});

test("parseBodyLimitToBytes falls back for invalid values", () => {
  assert.equal(parseBodyLimitToBytes("not-a-limit"), DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES);
  assert.equal(parseBodyLimitToBytes(undefined, 1024), 1024);
});

test("parseImportMaxFileSizeMbToBytes accepts the deployment-friendly MB alias", () => {
  assert.equal(parseImportMaxFileSizeMbToBytes("50"), 50 * 1024 * 1024);
  assert.equal(parseImportMaxFileSizeMbToBytes("512"), 512 * 1024 * 1024);
  assert.equal(parseImportMaxFileSizeMbToBytes("not-a-number", 1234), 1234);
});

test("resolveImportBodyLimit lets IMPORT_MAX_FILE_SIZE_MB override the legacy body limit", () => {
  assert.equal(resolveImportBodyLimit("5mb", "50"), "50mb");
  assert.equal(resolveImportBodyLimit("5mb", ""), "5mb");
  assert.equal(resolveImportBodyLimit("", undefined), "96mb");
});

test("formatBodyLimitBytes returns readable upload labels", () => {
  assert.equal(formatBodyLimitBytes(512 * 1024), "512 KB");
  assert.equal(formatBodyLimitBytes(50 * 1024 * 1024), "50 MB");
});
