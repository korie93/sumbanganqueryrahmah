import assert from "node:assert/strict";
import test from "node:test";
import { resolveCollectionMonthFieldCommitValue } from "./collection-month-field-utils";

test("typing waits for the complete month so October through December remain enterable", () => {
  for (const month of ["10", "11", "12"]) {
    const value = `2026-${month}`;
    for (let length = 0; length < value.length; length += 1) {
      assert.equal(resolveCollectionMonthFieldCommitValue(value.slice(0, length), false), null);
    }
    assert.equal(resolveCollectionMonthFieldCommitValue(value, false), value);
  }
});

test("blur or Enter accepts a one-digit month while typing preserves its raw draft", () => {
  for (const month of [1, 5, 9]) {
    const draft = `2026-${month}`;
    assert.equal(resolveCollectionMonthFieldCommitValue(draft, false), null);
    assert.equal(resolveCollectionMonthFieldCommitValue(draft, true), `2026-0${month}`);
  }
});

test("both commit modes retain the existing 1 through 12 month boundary and reject incomplete input", () => {
  for (const finalize of [false, true]) {
    for (const draft of ["", "2026-", "2026-0", "2026-00", "2026-13", "2026-99", "2026-012"]) {
      assert.equal(resolveCollectionMonthFieldCommitValue(draft, finalize), null, draft);
    }
    assert.equal(resolveCollectionMonthFieldCommitValue(" 2026-01 ", finalize), "2026-01");
    assert.equal(resolveCollectionMonthFieldCommitValue("2026-12", finalize), "2026-12");
  }
});
