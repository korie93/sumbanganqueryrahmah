import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableAIChatFailure, takeAIChatFailedQuery, type AIChatFailedQuery } from "./ai-chat-manual-retry";

const details = { status: null, retryAfter: null, gateNotice: null, timedOut: false };

test("manual AI retry accepts actual network and timeout failures, not arbitrary errors", () => {
  assert.equal(isRetryableAIChatFailure(new TypeError("Failed to fetch"), details), true);
  assert.equal(isRetryableAIChatFailure(new Error("timeout"), { ...details, timedOut: true }), true);
  assert.equal(isRetryableAIChatFailure(new Error("Invalid payload"), details), false);
  assert.equal(isRetryableAIChatFailure({ name: "AbortError" }, details), false);
  assert.equal(isRetryableAIChatFailure(new Error("body timeout"), { ...details, status: 200, timedOut: true }), true);
  assert.equal(isRetryableAIChatFailure(new Error("authentication response timed out"), { ...details, status: 401, timedOut: true }), false);
});

test("manual AI retry classifies raw HTTP status before error messages lose transport details", () => {
  for (const status of [408, 500, 502, 503, 504]) {
    assert.equal(isRetryableAIChatFailure(new Error("unavailable"), { ...details, status }), true, String(status));
  }
  for (const status of [200, 400, 401, 403, 404, 409, 422, 429, 501]) {
    assert.equal(isRetryableAIChatFailure(new TypeError("not a network failure"), { ...details, status }), false, String(status));
  }
});

test("server queue gates and Retry-After suppress retry even for otherwise transient failures", () => {
  for (const retryAfter of ["30", "Wed, 21 Oct 2026 07:28:00 GMT"]) {
    assert.equal(isRetryableAIChatFailure(new TypeError("offline"), { ...details, retryAfter }), false);
    assert.equal(isRetryableAIChatFailure(new Error("unavailable"), { ...details, status: 503, retryAfter }), false);
  }
  assert.equal(isRetryableAIChatFailure(new Error("busy"), { ...details, status: 503, gateNotice: "Queue busy" }), false);
});

test("failed query is consumed once and keeps its exact text", () => {
  const failed = { current: { text: "  akaun 00123  ", sessionId: 7 } as AIChatFailedQuery | null };
  assert.equal(takeAIChatFailedQuery(failed, 7, true, false), "  akaun 00123  ");
  assert.equal(takeAIChatFailedQuery(failed, 7, true, false), null);
  assert.equal(failed.current, null);
});

test("failed query cannot be replayed while busy, after a context switch, or after unmount", () => {
  const failed = { current: { text: "private query", sessionId: 7 } as AIChatFailedQuery | null };
  assert.equal(takeAIChatFailedQuery(failed, 7, true, true), null);
  assert.equal(takeAIChatFailedQuery(failed, 7, false, false), null);
  assert.equal(takeAIChatFailedQuery(failed, 8, true, false), null);
  assert.equal(failed.current, null);
});
