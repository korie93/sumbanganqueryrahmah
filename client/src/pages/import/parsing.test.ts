import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExcelMatrixRows, parseCsvLine } from "@/pages/import/parsing";

test("normalizeExcelMatrixRows coerces non-array rows into safe worksheet rows", () => {
  assert.deepEqual(
    normalizeExcelMatrixRows([
      ["name", "amount"],
      "unexpected-row",
      null,
      ["Ali", 10],
    ]),
    [
      ["name", "amount"],
      ["unexpected-row"],
      [],
      ["Ali", 10],
    ],
  );
});

test("parseCsvLine preserves escaped quotes in quoted cells", () => {
  assert.deepEqual(
    parseCsvLine('"Ali","He said ""hello""",123'),
    ["Ali", 'He said "hello"', "123"],
  );
});
