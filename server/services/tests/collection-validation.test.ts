import assert from "node:assert/strict";
import test from "node:test";

import { isValidCollectionMonthKey } from "../../routes/collection.validation";

test("collection month key validation accepts strict bounded YYYY-MM values", () => {
  assert.equal(isValidCollectionMonthKey("2026-03"), true);
  assert.equal(isValidCollectionMonthKey("2000-01"), true);
  assert.equal(isValidCollectionMonthKey("2100-12"), true);
});

test("collection month key validation rejects malformed or out-of-range values", () => {
  assert.equal(isValidCollectionMonthKey(""), false);
  assert.equal(isValidCollectionMonthKey("2026-3"), false);
  assert.equal(isValidCollectionMonthKey("2026-03junk"), false);
  assert.equal(isValidCollectionMonthKey("1999-12"), false);
  assert.equal(isValidCollectionMonthKey("2101-01"), false);
  assert.equal(isValidCollectionMonthKey("2026-00"), false);
  assert.equal(isValidCollectionMonthKey("2026-13"), false);
});
