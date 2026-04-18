import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../errors";

test("HttpError normalizes invalid status codes to 500", () => {
  const error = new HttpError(200, "Not a valid HTTP error status");

  assert.equal(error.statusCode, 500);
  assert.equal(error.expose, false);
});
