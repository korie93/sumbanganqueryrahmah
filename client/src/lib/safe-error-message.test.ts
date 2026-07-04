import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeUntrustedErrorMessage } from "@/lib/safe-error-message";

const FALLBACK = "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.";

const XSS_PAYLOADS = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "javascript:alert(1)",
  '<div onclick="alert(1)">click</div>',
];

test("sanitizeUntrustedErrorMessage rejects active XSS payloads before UI state", () => {
  for (const payload of XSS_PAYLOADS) {
    const sanitized = sanitizeUntrustedErrorMessage(payload, FALLBACK);

    assert.equal(sanitized, FALLBACK);
    assert.doesNotMatch(sanitized, /<script|<img|<svg|onclick=|onerror=|onload=|javascript:/i);
  }
});

test("sanitizeUntrustedErrorMessage strips passive HTML while preserving useful text", () => {
  assert.equal(
    sanitizeUntrustedErrorMessage("  <b>AI queue busy</b>  ", FALLBACK),
    "AI queue busy",
  );
});

test("sanitizeUntrustedErrorMessage hides leaked secrets, stack traces, and file paths", () => {
  const unsafeMessages = [
    "token=super-secret",
    "Error: failed\n    at query (C:\\app\\server\\db.ts:12:3)",
    "Cannot open /home/deploy/apps/sqr/.env",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopq",
  ];

  for (const unsafeMessage of unsafeMessages) {
    assert.equal(sanitizeUntrustedErrorMessage(unsafeMessage, FALLBACK), FALLBACK);
  }
});

test("sanitizeUntrustedErrorMessage clamps oversized backend messages", () => {
  const sanitized = sanitizeUntrustedErrorMessage("x".repeat(50), FALLBACK, { maxLength: 12 });

  assert.equal(sanitized, "xxxxxxxxx...");
});
