import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCollectionMatchingError,
  normalizeCollectionMatchingInput,
  type CollectionMatchingErrorKind,
  type CollectionSourceMatchingInput,
} from "../collection-source-matching-policy";

const validInput: CollectionSourceMatchingInput = {
  customerName: "Synthetic Customer",
  icNumber: "SYNTHETIC-001",
  customerPhone: "0100000000",
  accountNumber: "TEST-ACCOUNT",
  cardNumber: "",
  paymentDate: "2024-02-29",
  amount: "1250.50",
};

test("matching normalizes whitespace and equivalent money values to a stable identity", () => {
  const padded = Object.fromEntries(Object.entries(validInput).map(([key, value]) => [key, ` ${value} `]));
  assert.deepEqual(normalizeCollectionMatchingInput({
    ...validInput,
    ...padded,
    amount: " 001,250.5 ",
  }), validInput);
  assert.equal(normalizeCollectionMatchingInput({ ...validInput, amount: "20" })?.amount, "20.00");
});

test("matching accepts account-only, card-only, and combined identity", () => {
  assert.ok(normalizeCollectionMatchingInput(validInput));
  assert.ok(normalizeCollectionMatchingInput({ ...validInput, accountNumber: "", cardNumber: "TEST-CARD" }));
  assert.ok(normalizeCollectionMatchingInput({ ...validInput, cardNumber: "TEST-CARD" }));
  assert.equal(normalizeCollectionMatchingInput({ ...validInput, accountNumber: "", cardNumber: "" }), null);
});

test("matching waits silently for complete valid identity", () => {
  const invalidInputs: Partial<CollectionSourceMatchingInput>[] = [
    { customerName: " " }, { customerName: "x".repeat(201) },
    { icNumber: "" }, { icNumber: "x".repeat(65) },
    { customerPhone: "123" }, { customerPhone: "invalid-phone" },
    { accountNumber: "x".repeat(129) }, { cardNumber: "x".repeat(129) },
  ];
  for (const invalid of invalidInputs) {
    assert.equal(normalizeCollectionMatchingInput({ ...validInput, ...invalid }), null);
  }
});

test("matching rejects invalid, rolled-over, and future payment dates", () => {
  for (const paymentDate of ["", "2024-2-01", "2023-02-29", "2024-02-30", "2024-13-01", "2999-01-01"]) {
    assert.equal(normalizeCollectionMatchingInput({ ...validInput, paymentDate }), null, paymentDate);
  }
});

test("matching rejects absent, non-positive, imprecise, and unsafe amounts", () => {
  for (const amount of ["", "0", "0.00", "-1", "1.005", "NaN", "1e3", "100.", "9007199254740991"]) {
    assert.equal(normalizeCollectionMatchingInput({ ...validInput, amount }), null, amount);
  }
});

test("matching payload is limited to the normalized identity, date, and amount", () => {
  const result = normalizeCollectionMatchingInput({ ...validInput, batch: "P10", receipts: ["synthetic"] } as CollectionSourceMatchingInput);
  assert.deepEqual(Object.keys(result!).sort(), Object.keys(validInput).sort());
});

test("matching classifies backend decisions without offering transient retry", () => {
  const cases: Array<[string, CollectionMatchingErrorKind]> = [
    ["COLLECTION_SOURCE_NO_MATCH", "no-match"],
    ["COLLECTION_SOURCE_NOT_CONFIGURED", "no-config"],
    ["COLLECTION_SOURCE_AMBIGUOUS_MATCH", "ambiguous"],
    ["COLLECTION_SOURCE_IDENTITY_CONFLICT", "ambiguous"],
    ["COLLECTION_SOURCE_TOTAL_DUE_MISSING", "other"],
    ["COLLECTION_SOURCE_CALLING_DATE_INVALID", "other"],
    ["COLLECTION_PAYMENT_OUTSIDE_CALLING_WINDOW", "other"],
  ];
  for (const [code, errorKind] of cases) {
    const failure = classifyCollectionMatchingError(new Error(`400: ${JSON.stringify({ code, message: "Synthetic decision", retryAfterMs: 5000 })}`));
    assert.equal(failure.errorKind, errorKind, code);
    assert.equal(failure.retryAfterMs, 0);
    assert.equal(failure.message, "Synthetic decision");
  }
});

test("matching reads nested API errors and denies retries for access failures", () => {
  const nested = classifyCollectionMatchingError(new Error('400: {"error":{"code":"COLLECTION_SOURCE_NO_MATCH","message":"No match"}}'));
  assert.equal(nested.errorKind, "no-match");
  assert.equal(nested.message, "No match");
  for (const status of [401, 403]) {
    assert.equal(classifyCollectionMatchingError(new Error(`${status}: {"message":"Denied","retryAfterMs":5000}`)).errorKind, "access");
  }
});

test("only transient HTTP and transport failures allow retry classification", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(classifyCollectionMatchingError(new Error(`${status}: {"message":"Unavailable"}`)).errorKind, "transient");
  }
  for (const error of [
    new TypeError("Failed to fetch"), new TypeError("Load failed"),
    new Error("Network request failed"), new Error("Request timed out after 60000ms"),
    new Error("You appear to be offline. Check your internet connection and try again."),
    new DOMException("Timed out", "TimeoutError"),
  ]) {
    assert.equal(classifyCollectionMatchingError(error).errorKind, "transient", error.message);
  }
  for (const error of [
    new TypeError("Unexpected program error"), new Error("API contract mismatch"),
    new Error('400: {"message":"Request timed out"}'), new DOMException("Cancelled", "AbortError"),
  ]) {
    assert.equal(classifyCollectionMatchingError(error).errorKind, "other", error.message);
  }
});

test("transient retry cooldown accepts API payload, nested payload, and circuit metadata", () => {
  assert.equal(classifyCollectionMatchingError(new Error('429: {"retryAfterMs":2500}')).retryAfterMs, 2500);
  assert.equal(classifyCollectionMatchingError(new Error('429: {"error":{"retryAfterMs":3500}}')).retryAfterMs, 3500);
  const circuit = Object.assign(new Error("Circuit open"), { name: "ApiCircuitOpenError", retryAfterMs: 4500 });
  assert.equal(classifyCollectionMatchingError(circuit).retryAfterMs, 4500);
  for (const value of [-100, null, "invalid"]) {
    assert.equal(classifyCollectionMatchingError(new Error(`429: ${JSON.stringify({ retryAfterMs: value })}`)).retryAfterMs, 0);
  }
});

test("malformed error payloads are safe and never displayed as raw JSON", () => {
  for (const error of [null, undefined, "failed", new Error("{bad-json"), new Error("400: null"), new Error('400: {"message":{}}')]) {
    const failure = classifyCollectionMatchingError(error);
    assert.equal(failure.errorKind, "other");
    assert.equal(failure.message, "Padanan tidak dapat disemak. Semak maklumat yang dimasukkan.");
  }
});
