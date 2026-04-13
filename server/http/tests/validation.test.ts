import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import { readBooleanFlag, readStringList } from "../../http/validation";

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
