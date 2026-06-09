import assert from "node:assert/strict";
import test from "node:test";
import { normalizeToastRequestId } from "@/components/ui/toast-request-reference";

test("normalizeToastRequestId preserves safe correlation identifiers", () => {
  assert.equal(normalizeToastRequestId("req-api_123:retry.2"), "req-api_123:retry.2");
});

test("normalizeToastRequestId strips unsafe characters and bounds output", () => {
  const normalized = normalizeToastRequestId(` req-<script>|${"x".repeat(200)} `);

  assert.ok(normalized);
  assert.doesNotMatch(normalized, /[<>\s|]/);
  assert.ok(normalized.length <= 128);
});

test("normalizeToastRequestId rejects empty identifiers", () => {
  assert.equal(normalizeToastRequestId(" <> "), null);
  assert.equal(normalizeToastRequestId(null), null);
});
