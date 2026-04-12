import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPublicAuthExpiry,
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
} from "@/pages/public-auth-runtime-utils";

test("getPublicAuthTokenFromLocation extracts the token query param safely", () => {
  assert.equal(getPublicAuthTokenFromLocation("?token=abc123"), "abc123");
  assert.equal(getPublicAuthTokenFromLocation("?other=value"), "");
  assert.equal(getPublicAuthTokenFromLocation(""), "");
});

test("formatPublicAuthExpiry keeps DB timestamps readable in the operational timezone", () => {
  assert.equal(formatPublicAuthExpiry("2026-04-12T04:30:00"), "12/04/2026, 12:30");
});

test("isPublicAuthAbortError only accepts abort-shaped errors", () => {
  assert.equal(isPublicAuthAbortError(new DOMException("aborted", "AbortError")), true);
  const namedError = new Error("aborted");
  namedError.name = "AbortError";
  assert.equal(isPublicAuthAbortError(namedError), true);
  assert.equal(isPublicAuthAbortError(new Error("boom")), false);
});
