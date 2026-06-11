import assert from "node:assert/strict";
import test from "node:test";
import {
  IMPORT_PREVIEW_MAX_FILE_BYTES,
  IMPORT_PREVIEW_MAX_CSV_ROWS,
  normalizeExcelMatrixRows,
  parseCsvLine,
  parseImportPreview,
  shouldDeferImportPreview,
} from "@/pages/import/parsing";

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

test("shouldDeferImportPreview avoids reading large files into browser memory", () => {
  const atLimit = new File([new Uint8Array(1)], "at-limit.csv");
  Object.defineProperty(atLimit, "size", { value: IMPORT_PREVIEW_MAX_FILE_BYTES });
  const overLimit = new File([new Uint8Array(1)], "over-limit.xlsx");
  Object.defineProperty(overLimit, "size", { value: IMPORT_PREVIEW_MAX_FILE_BYTES + 1 });

  assert.equal(shouldDeferImportPreview(atLimit), false);
  assert.equal(shouldDeferImportPreview(overLimit), true);
});

test("parseImportPreview rejects CSV files beyond the preview row limit", async () => {
  const csv = [
    "name,amount",
    ...Array.from({ length: IMPORT_PREVIEW_MAX_CSV_ROWS + 1 }, (_, index) => `User ${index},${index}`),
  ].join("\n");
  const file = new File([csv], "large.csv", { type: "text/csv" });

  const result = await parseImportPreview(file);

  assert.match(String(result.error), /preview row limit/i);
  assert.deepEqual(result.rows, []);
});
