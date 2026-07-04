import assert from "node:assert/strict";
import test from "node:test";
import { normalizeToastRequestId } from "@/components/ui/toast-request-reference";

test("normalizeToastRequestId preserves safe correlation identifiers", () => {
  assert.equal(normalizeToastRequestId("req-api_123:retry.2"), "req-api_123:retry.2");
  assert.equal(
    normalizeToastRequestId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.equal(normalizeToastRequestId(" req-valid-1 "), "req-valid-1");
});

test("normalizeToastRequestId rejects unsafe or malformed identifiers", () => {
  assert.equal(normalizeToastRequestId("req-<script>"), null);
  assert.equal(normalizeToastRequestId("req-|bad"), null);
  assert.equal(normalizeToastRequestId("req bad"), null);
  assert.equal(normalizeToastRequestId("-req-bad"), null);
  assert.equal(normalizeToastRequestId("req-bad-"), null);
  assert.equal(normalizeToastRequestId("ab"), null);
  assert.equal(normalizeToastRequestId(`req-${"x".repeat(200)}`), null);
});

test("normalizeToastRequestId rejects empty identifiers", () => {
  assert.equal(normalizeToastRequestId(" <> "), null);
  assert.equal(normalizeToastRequestId(null), null);
});
