import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicAuthLocationWithoutToken,
  formatPublicAuthExpiry,
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
} from "@/pages/public-auth-runtime-utils";

test("getPublicAuthTokenFromLocation extracts the token from the hash before falling back to the query string", () => {
  assert.equal(getPublicAuthTokenFromLocation("?token=abc123"), "abc123");
  assert.equal(getPublicAuthTokenFromLocation("", "#token=hash456"), "hash456");
  assert.equal(getPublicAuthTokenFromLocation("?token=query123", "#token=hash456"), "hash456");
  assert.equal(getPublicAuthTokenFromLocation("?other=value"), "");
  assert.equal(getPublicAuthTokenFromLocation(""), "");
});

test("buildPublicAuthLocationWithoutToken preserves other params while stripping token exposure", () => {
  assert.equal(
    buildPublicAuthLocationWithoutToken("/reset-password", "?token=query123&lang=ms", "#token=hash456"),
    "/reset-password?lang=ms",
  );
  assert.equal(
    buildPublicAuthLocationWithoutToken("/activate-account", "", "#token=hash456&from=email"),
    "/activate-account#from=email",
  );
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
