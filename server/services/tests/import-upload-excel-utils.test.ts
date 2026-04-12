import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as xlsx from "xlsx";
import {
  parseExcelBuffer,
  parseExcelFile,
} from "../import-upload-excel-utils";

function createWorkbookBuffer(rows: unknown[][]) {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
}

test("parseExcelBuffer rejects rows beyond the configured spreadsheet row limit", () => {
  const result = parseExcelBuffer(
    createWorkbookBuffer([
      ["name", "amount"],
      ["Alice", 15],
      ["Bob", 27],
    ]),
    { maxRows: 1 },
  );

  assert.match(String(result.error), /configured row limit of 1 rows/i);
  assert.deepEqual(result.rows, []);
});

test("parseExcelBuffer rejects oversized Excel uploads before parsing the workbook", () => {
  const buffer = createWorkbookBuffer([
    ["name", "amount"],
    ["Alice", 15],
  ]);
  const result = parseExcelBuffer(buffer, {
    maxBytes: Math.max(1, buffer.length - 1),
  });

  assert.match(String(result.error), /too large to import/i);
  assert.deepEqual(result.rows, []);
});

test("parseExcelFile rejects oversized Excel files before reading them into memory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-excel-utils-"));
  const filePath = path.join(tempDir, "customers.xlsx");
  const buffer = createWorkbookBuffer([
    ["name", "amount"],
    ["Alice", 15],
  ]);

  try {
    await writeFile(filePath, buffer);

    const result = await parseExcelFile(filePath, {
      maxBytes: Math.max(1, buffer.length - 1),
    });

    assert.match(String(result.error), /too large to import/i);
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
