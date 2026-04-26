import assert from "node:assert/strict";
import test from "node:test";
import { resolveRequestId, sanitizeRequestId } from "../request-id";

test("sanitizeRequestId preserves ordinary correlation ids", () => {
  assert.equal(sanitizeRequestId("api-123_ABC.def:456"), "api-123_ABC.def:456");
});

test("sanitizeRequestId strips unsafe characters and caps length", () => {
  const raw = ` api-<script>|bad id/${"x".repeat(160)} `;
  const sanitized = sanitizeRequestId(raw);

  assert.equal(sanitized.includes("<"), false);
  assert.equal(sanitized.includes("|"), false);
  assert.equal(sanitized.includes(" "), false);
  assert.equal(sanitized.includes("/"), false);
  assert.equal(sanitized.length, 128);
  assert.match(sanitized, /^[A-Za-z0-9._:-]+$/);
});

test("resolveRequestId generates an id when the caller id has no safe characters", () => {
  const resolved = resolveRequestId("<> /");

  assert.match(resolved, /^[0-9a-f-]{36}$/i);
});
