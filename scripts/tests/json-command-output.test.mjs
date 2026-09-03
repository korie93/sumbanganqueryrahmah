import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJsonCommandOutput } from "../lib/json-command-output.mjs";

test("normalizes JSON command output without retaining npm banners", () => {
  const output = [
    "",
    "> sqr-local@1.0.0 collection:v7-pii-status",
    "> tsx scripts/collection-v7-pii-status.ts --json",
    "",
    '{"encryptionConfigured":true,"processedRows":0}',
  ].join("\n");

  assert.equal(
    normalizeJsonCommandOutput(output, { label: "Collection V7 PII status" }),
    '{\n  "encryptionConfigured": true,\n  "processedRows": 0\n}\n',
  );
});

test("accepts an already clean JSON array", () => {
  assert.equal(normalizeJsonCommandOutput('[{"ok":true}]'), '[\n  {\n    "ok": true\n  }\n]\n');
});

test("rejects malformed output without including captured values in the error", () => {
  const sensitiveOutput = 'diagnostic customer-name-value\n{"ok":';

  assert.throws(
    () => normalizeJsonCommandOutput(sensitiveOutput, { label: "PII status" }),
    (error) => {
      assert.match(error.message, /PII status did not produce a valid JSON/i);
      assert.doesNotMatch(error.message, /customer-name-value/);
      return true;
    },
  );
});
