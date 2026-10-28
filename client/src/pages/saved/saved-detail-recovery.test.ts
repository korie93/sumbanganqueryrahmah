import assert from "node:assert/strict";
import test from "node:test";
import { ApiCircuitOpenError } from "@/lib/api-client-retry";
import { isSavedRetryableReadError } from "@/pages/saved/saved-refresh-policy";

test("Saved detail retry recognizes only temporary read failures", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isSavedRetryableReadError(new Error(`${status}: temporary outage`)), true);
  }
  for (const error of [
    new TypeError("Failed to fetch"), new TypeError("Load failed"),
    new Error("You appear to be offline. Check your internet connection and try again."),
    new Error("Request timed out after 60000ms: GET /api/imports/synthetic/summary"),
    new DOMException("The operation timed out.", "TimeoutError"),
    new ApiCircuitOpenError(1000),
  ]) assert.equal(isSavedRetryableReadError(error), true, error.message);
});

test("Saved detail access denials and missing files cannot become retries through response text", () => {
  for (const status of [400, 401, 403, 404, 409, 410, 422, 501]) {
    const error = new Error(`${status}: Failed to fetch; Request timed out; temporarily unavailable`);
    assert.equal(isSavedRetryableReadError(error), false, String(status));
  }
});

test("Saved detail aborts, malformed summaries and unknown failures require no retry action", () => {
  for (const error of [
    new DOMException("Failed to fetch", "AbortError"),
    Object.assign(new Error("503: unavailable"), { name: "AbortError" }),
    new Error("API contract mismatch for /api/imports/synthetic/summary"),
    new SyntaxError("Unexpected end of JSON input"),
    new TypeError("Cannot read properties of undefined"),
    new Error("Something went wrong"), null, "Failed to fetch",
  ]) assert.equal(isSavedRetryableReadError(error), false);
});
