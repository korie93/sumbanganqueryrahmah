import assert from "node:assert/strict";
import test from "node:test";

import { safeParseInteger } from "../../lib/safe-parse";

test("safeParseInteger accepts bounded integer strings and numbers", () => {
  assert.equal(safeParseInteger("123", { min: 1, max: 1_000 }), 123);
  assert.equal(safeParseInteger(" 42 "), 42);
  assert.equal(safeParseInteger(7, { min: 1, max: 10 }), 7);
});

test("safeParseInteger rejects malformed, partial, and decimal input", () => {
  assert.equal(safeParseInteger(""), null);
  assert.equal(safeParseInteger("abc"), null);
  assert.equal(safeParseInteger("2abc"), null);
  assert.equal(safeParseInteger("1.5"), null);
  assert.equal(safeParseInteger(Number.NaN), null);
  assert.equal(safeParseInteger({ value: 1 }), null);
});

test("safeParseInteger enforces min, max, and safe integer bounds", () => {
  assert.equal(safeParseInteger("-1", { min: 1 }), null);
  assert.equal(safeParseInteger("2147483648", { max: 2_147_483_647 }), null);
  assert.equal(safeParseInteger(String(Number.MAX_SAFE_INTEGER + 1)), null);
});

test("safeParseInteger uses only valid configured fallbacks", () => {
  assert.equal(safeParseInteger("bad", { fallback: 5, min: 1, max: 10 }), 5);
  assert.equal(safeParseInteger("bad", { fallback: 0, min: 1, max: 10 }), null);
  assert.equal(safeParseInteger("bad", { fallback: 11, min: 1, max: 10 }), null);
});
