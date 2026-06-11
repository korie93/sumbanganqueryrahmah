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

test("parseExcelBuffer rejects workbooks beyond configured sheet and column limits", () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet([["a", "b", "c"], ["1", "2", "3"]]),
    "Sheet1",
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet([["extra"]]),
    "Sheet2",
  );
  const buffer = xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  const tooManySheets = parseExcelBuffer(buffer, { maxSheets: 1 });
  assert.match(String(tooManySheets.error), /sheet limit of 1/i);

  const tooManyColumns = parseExcelBuffer(buffer, { maxSheets: 2, maxColumns: 2 });
  assert.match(String(tooManyColumns.error), /column limit of 2/i);
});

test("parseExcelBuffer rejects cells beyond the configured character limit", () => {
  const result = parseExcelBuffer(
    createWorkbookBuffer([
      ["name"],
      ["Alice"],
    ]),
    { maxCellLength: 4 },
  );

  assert.match(String(result.error), /4 character limit/i);
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
