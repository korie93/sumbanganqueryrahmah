import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  parseBodyLimitToBytes,
} from "../../config/body-limit";

test("parseBodyLimitToBytes understands common size labels", () => {
  assert.equal(parseBodyLimitToBytes("64mb"), 64 * 1024 * 1024);
  assert.equal(parseBodyLimitToBytes("64M"), 64 * 1024 * 1024);
  assert.equal(parseBodyLimitToBytes("512kb"), 512 * 1024);
});

test("parseBodyLimitToBytes falls back for invalid values", () => {
  assert.equal(parseBodyLimitToBytes("not-a-limit"), DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES);
  assert.equal(parseBodyLimitToBytes(undefined, 1024), 1024);
});
