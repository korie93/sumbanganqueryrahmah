import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_READ_STRING_MAX_LENGTH,
  readNonEmptyString,
  readOptionalString,
} from "../validation";

test("readNonEmptyString rejects strings longer than the configured maximum", () => {
  assert.equal(readNonEmptyString("  ok  ", 8), "ok");
  assert.throws(
    () => readNonEmptyString("x".repeat(DEFAULT_READ_STRING_MAX_LENGTH + 1)),
    /exceeds maximum length/i,
  );
});

test("readOptionalString applies the same max length guard", () => {
  assert.equal(readOptionalString("   "), undefined);
  assert.throws(
    () => readOptionalString("abcdef", 5),
    /exceeds maximum length/i,
  );
});

