import assert from "node:assert/strict";
import test from "node:test";
import { ApiCircuitOpenError } from "@/lib/api-client-retry";
import { shouldRetainSavedPage } from "@/pages/saved/saved-refresh-policy";

const SAME_PAGE = {
  loadedKey: "account-a:all:page-2:search-batch",
  requestKey: "account-a:all:page-2:search-batch",
  currentKey: "account-a:all:page-2:search-batch",
};

test("Saved can retain the last-good page for allowlisted temporary HTTP failures", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(shouldRetainSavedPage({
      ...SAME_PAGE,
      error: new Error(`${status}: {"message":"Temporarily unavailable"}`),
    }), true, String(status));
  }
});

test("Saved recognizes concrete browser fetch, offline and API timeout errors", () => {
  for (const error of [
    new TypeError("Failed to fetch"),
    new TypeError("NetworkError when attempting to fetch resource."),
    new TypeError("Load failed"),
    new TypeError("Network request failed"),
    new TypeError("fetch failed"),
    new Error("You appear to be offline. Check your internet connection and try again."),
    new Error("Request timed out after 60000ms: GET /api/imports?page=2"),
    new DOMException("A network error occurred.", "NetworkError"),
    new DOMException("The operation timed out.", "TimeoutError"),
  ]) {
    assert.equal(shouldRetainSavedPage({ ...SAME_PAGE, error }), true, error.message);
  }
});

test("Saved recognizes the actual circuit error and its explicit named error shape", () => {
  const circuitError = new ApiCircuitOpenError(1500);
  assert.equal(shouldRetainSavedPage({ ...SAME_PAGE, error: circuitError }), true);
  const namedError = new Error(circuitError.message);
  namedError.name = "ApiCircuitOpenError";
  assert.equal(shouldRetainSavedPage({ ...SAME_PAGE, error: namedError }), true);
  namedError.message = "API contract mismatch for /api/imports";
  assert.equal(shouldRetainSavedPage({ ...SAME_PAGE, error: namedError }), false);
});

test("HTTP status takes precedence over network, offline, timeout and circuit words", () => {
  for (const status of [200, 301, 400, 401, 403, 404, 409, 410, 422, 499, 501, 505, 599]) {
    const error = new Error(`${status}: {"message":"Failed to fetch; You appear to be offline; Request timed out"}`);
    assert.equal(shouldRetainSavedPage({ ...SAME_PAGE, error }), false, String(status));
  }
  const misleadingCircuit = new ApiCircuitOpenError(1000);
  misleadingCircuit.message = '403: {"message":"API retry circuit is open. Try again in 1 seconds."}';
  assert.equal(shouldRetainSavedPage({ ...SAME_PAGE, error: misleadingCircuit }), false);
});

test("aborts, malformed responses and unknown programming errors fail closed", () => {
  for (const error of [
    new DOMException("Failed to fetch", "AbortError"),
    Object.assign(new Error('503: {"message":"unavailable"}'), { name: "AbortError" }),
    new TypeError("Cannot read properties of undefined (reading 'imports')"),
    new TypeError("Failed to execute 'fetch' on 'Window': Failed to parse URL from invalid"),
    new TypeError("Failed to fetch field 'imports' from local state"),
    new Error("API contract mismatch for /api/imports (1 issue; message: Failed to fetch)"),
    new Error("API response JSON parse failed for /api/imports: Unexpected token"),
    new SyntaxError("Failed to fetch"),
    new RangeError("Load failed"),
    new Error("Something went wrong"),
    new Error("Network connection was lost"),
    new Error("Request timed out"),
    { name: "Error", message: "Failed to fetch" },
    "Failed to fetch",
    null,
    undefined,
  ]) {
    assert.equal(shouldRetainSavedPage({ ...SAME_PAGE, error }), false);
  }
});

test("a last-good page is never retained across request, query or account boundaries", () => {
  const error = new TypeError("Failed to fetch");
  for (const keys of [
    { ...SAME_PAGE, loadedKey: null },
    { ...SAME_PAGE, loadedKey: "account-b:all:page-2:search-batch" },
    { ...SAME_PAGE, requestKey: "account-a:all:page-3:search-batch" },
    { ...SAME_PAGE, currentKey: "account-a:all:page-2:search-other" },
    { loadedKey: "previous", requestKey: "current", currentKey: "current" },
    { loadedKey: "previous", requestKey: "previous", currentKey: "current" },
  ]) {
    assert.equal(shouldRetainSavedPage({ ...keys, error }), false);
  }
});
