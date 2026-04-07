import assert from "node:assert/strict";
import test from "node:test";
import {
  createClientRandomHex,
  createClientRandomId,
  createClientRandomUnitInterval,
} from "./secure-id";

test("createClientRandomId returns prefixed unique identifiers", () => {
  const left = createClientRandomId("api");
  const right = createClientRandomId("api");

  assert.match(left, /^api-/);
  assert.match(right, /^api-/);
  assert.notEqual(left, right);
});

test("createClientRandomHex returns hex content with the requested byte length", () => {
  const token = createClientRandomHex(4);

  assert.match(token, /^[0-9a-f]{8}$/);
});

test("createClientRandomUnitInterval stays within Math.random-compatible bounds", () => {
  const value = createClientRandomUnitInterval();

  assert.ok(value >= 0);
  assert.ok(value < 1);
});
