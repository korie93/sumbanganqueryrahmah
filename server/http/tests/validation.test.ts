import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import { readBooleanFlag, readNonEmptyString, readStringList } from "../../http/validation";

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

test("readNonEmptyString rejects unsafe control characters while keeping ordinary whitespace safe", () => {
  assert.throws(
    () => readNonEmptyString("hello\u0000world"),
    (error) =>
      error instanceof HttpError
      && error.statusCode === 400
      && error.code === "REQUEST_BODY_INVALID"
      && /unsupported control characters/i.test(error.message),
  );

  assert.equal(readNonEmptyString("line 1\nline 2"), "line 1\nline 2");
});
