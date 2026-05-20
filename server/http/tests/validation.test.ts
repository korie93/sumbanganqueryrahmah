import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import { readBooleanFlag, readDate, readStringList } from "../../http/validation";

test("readBooleanFlag accepts explicit truthy and falsy literals", () => {
  assert.equal(readBooleanFlag(true), true);
  assert.equal(readBooleanFlag(false), false);
  assert.equal(readBooleanFlag("true"), true);
  assert.equal(readBooleanFlag(" YES "), true);
  assert.equal(readBooleanFlag("0"), false);
  assert.equal(readBooleanFlag("off"), false);
  assert.equal(readBooleanFlag(undefined), false);
  assert.equal(readBooleanFlag(""), false);
});

test("readBooleanFlag rejects ambiguous string values instead of silently coercing them", () => {
  assert.throws(
    () => readBooleanFlag("maybe"),
    (error) =>
      error instanceof HttpError
      && error.statusCode === 400
      && error.code === "REQUEST_BODY_INVALID"
      && /Boolean flag must be one of/i.test(error.message),
  );
});

test("readStringList supports escaped commas and backslashes", () => {
  assert.deepEqual(
    readStringList("active\\,trial,pending,team\\\\lead,\\,, trailing\\\\"),
    ["active,trial", "pending", "team\\lead", ",", "trailing\\"],
  );
});

test("readStringList trims blank values after parsing escaped segments", () => {
  assert.deepEqual(
    readStringList(" first \\, value , ,second,,\\,,  "),
    ["first , value", "second", ","],
  );
});

test("readDate accepts strict ISO date and datetime values", () => {
  assert.equal(readDate("2026-01-01")?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(readDate("2026-01-01T12:34")?.getFullYear(), 2026);
  assert.equal(readDate("2026-01-01T12:34:56.789Z")?.toISOString(), "2026-01-01T12:34:56.789Z");
  assert.equal(readDate("")?.toISOString(), undefined);
});

test("readDate rejects ambiguous or invalid date strings", () => {
  for (const value of ["1/1/2026", "Jan 1 2026", "2026-02-31", "2026-01-01 12:00:00", "2026-01-01T24:00:00Z"]) {
    assert.throws(
      () => readDate(value),
      (error) =>
        error instanceof HttpError
        && error.statusCode === 400
        && error.code === "REQUEST_BODY_INVALID"
        && /ISO 8601 date or datetime/i.test(error.message),
    );
  }
});
