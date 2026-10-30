import assert from "node:assert/strict";
import test from "node:test";
import { ApiCircuitOpenError } from "@/lib/api-client-retry";
import { ReadDeadlineError, READ_DEADLINE_MESSAGE } from "@/lib/read-deadline";
import type { ColumnFilter } from "@/pages/viewer/types";
import { buildViewerQueryKey, isViewerRetryableError } from "@/pages/viewer/viewer-retry-policy";

test("Viewer retries a real full-read deadline while denial and arbitrary text retain precedence", () => {
  const error = new ReadDeadlineError();
  assert.equal(isViewerRetryableError(error), true);
  assert.equal(isViewerRetryableError(new Error(READ_DEADLINE_MESSAGE)), false);
  error.message = "404: missing";
  assert.equal(isViewerRetryableError(error), false);
});

test("Viewer retry allows only explicit temporary HTTP statuses", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isViewerRetryableError(new Error(`${status}: {"message":"Unavailable"}`)), true, String(status));
  }
  for (const status of [200, 301, 400, 401, 403, 404, 409, 410, 422, 499, 501, 505, 599]) {
    const error = new Error(`${status}: {"message":"Failed to fetch; Request timed out; offline"}`);
    assert.equal(isViewerRetryableError(error), false, String(status));
  }
});

test("Viewer retry recognizes concrete network, offline and API timeout messages", () => {
  for (const error of [
    new TypeError("Failed to fetch"),
    new TypeError("NetworkError when attempting to fetch resource."),
    new TypeError("Load failed"),
    new TypeError("Network request failed"),
    new TypeError("fetch failed"),
    new Error("You appear to be offline. Check your internet connection and try again."),
    new Error("Request timed out after 60000ms: GET /api/imports/example/data?page=2"),
    new DOMException("A network error occurred.", "NetworkError"),
    new DOMException("The operation timed out.", "TimeoutError"),
  ]) {
    assert.equal(isViewerRetryableError(error), true, error.message);
  }
});

test("Viewer retry recognizes circuit failures without overriding HTTP denial", () => {
  const error = new ApiCircuitOpenError(1500);
  assert.equal(isViewerRetryableError(error), true);
  const namedError = new Error(error.message);
  namedError.name = "ApiCircuitOpenError";
  assert.equal(isViewerRetryableError(namedError), true);
  namedError.message = "API contract mismatch for /api/imports/example/data";
  assert.equal(isViewerRetryableError(namedError), false);
  error.message = '403: {"message":"API retry circuit is open. Try again in 2 seconds."}';
  assert.equal(isViewerRetryableError(error), false);
});

test("Viewer retry fails closed for aborts, malformed responses and programming errors", () => {
  for (const error of [
    new DOMException("Failed to fetch", "AbortError"),
    Object.assign(new Error('503: {"message":"Unavailable"}'), { name: "AbortError" }),
    new TypeError("Cannot read properties of undefined (reading 'rows')"),
    new TypeError("Failed to execute 'fetch' on 'Window': Failed to parse URL from invalid"),
    new TypeError("Failed to fetch row from local state"),
    new Error("API contract mismatch for /api/imports/example/data (message: Failed to fetch)"),
    new Error("API response JSON parse failed for /api/imports/example/data: Unexpected token"),
    new SyntaxError("Failed to fetch"),
    new RangeError("Load failed"),
    new Error("Something went wrong"),
    new Error("Request timed out"),
    { name: "Error", message: "Failed to fetch" },
    "Failed to fetch",
    null,
    undefined,
  ]) {
    assert.equal(isViewerRetryableError(error), false);
  }
});

const FILTER: ColumnFilter = { id: "row-original", column: "Customer", operator: "contains", value: "Alice" };

test("Viewer query identity excludes filter row IDs and inactive filters and trims search", () => {
  const filters: readonly ColumnFilter[] = [
    { ...FILTER, id: "row-recreated" },
    { column: "Customer", operator: "equals", value: "   " },
    { column: "   ", operator: "equals", value: "ignored" },
  ];
  const expected = buildViewerQueryKey("import-a", 25, "Alice", [FILTER], false);
  assert.equal(buildViewerQueryKey("import-a", 25, "  Alice  ", filters, false), expected);
  assert.equal(filters[0]?.id, "row-recreated");
  assert.equal(filters.length, 3);
});

test("Viewer query identity changes across import, page size, semantic filters and clear state", () => {
  const original = buildViewerQueryKey("import-a", 25, "Alice", [FILTER], false);
  for (const changed of [
    buildViewerQueryKey("import-b", 25, "Alice", [FILTER], false),
    buildViewerQueryKey(undefined, 25, "Alice", [FILTER], false),
    buildViewerQueryKey("import-a", 50, "Alice", [FILTER], false),
    buildViewerQueryKey("import-a", 25, "Bob", [FILTER], false),
    buildViewerQueryKey("import-a", 25, "Alice", [{ ...FILTER, column: "Account" }], false),
    buildViewerQueryKey("import-a", 25, "Alice", [{ ...FILTER, operator: "equals" }], false),
    buildViewerQueryKey("import-a", 25, "Alice", [{ ...FILTER, value: "Bob" }], false),
    buildViewerQueryKey("import-a", 25, "Alice", [{ ...FILTER, value: " Alice " }], false),
    buildViewerQueryKey("import-a", 25, "Alice", [FILTER], true),
  ]) {
    assert.notEqual(changed, original);
  }
});

test("Viewer query keys preserve filter values and serialize delimiter-like input unambiguously", () => {
  const value = 'Alice,"[import-b]"';
  const filters = [{ ...FILTER, value }];
  const key = buildViewerQueryKey("import-a", 25, "Alice", filters, false);
  assert.deepEqual(JSON.parse(key), ["import-a", 25, "Alice", [["Customer", "contains", value]], false]);
  assert.notEqual(key, buildViewerQueryKey("import-a", 25, value, [FILTER], false));
});

test("numeric query identity includes only complete ranges and their effective upper bounds", () => {
  const range: ColumnFilter = { id: "first", column: "Amount", operator: "between", value: "0", valueTo: "100" };
  const key = buildViewerQueryKey("import-a", 25, "", [range], false);
  assert.notEqual(key, buildViewerQueryKey("import-a", 25, "", [{ ...range, valueTo: "200" }], false));
  assert.equal(key, buildViewerQueryKey("import-a", 25, "", [{ ...range, id: "recreated" }], false));
  const emptyKey = buildViewerQueryKey("import-a", 25, "", [], false);
  for (const incomplete of [{ ...range, valueTo: "" }, { ...range, valueTo: "-1" }, { ...range, value: "x" }]) {
    assert.equal(buildViewerQueryKey("import-a", 25, "", [incomplete], false), emptyKey);
  }
  const single: ColumnFilter = { column: "Amount", operator: "greaterThan", value: "0" };
  assert.equal(buildViewerQueryKey("import-a", 25, "", [single], false), buildViewerQueryKey("import-a", 25, "", [{ ...single, valueTo: "irrelevant" }], false));
});
