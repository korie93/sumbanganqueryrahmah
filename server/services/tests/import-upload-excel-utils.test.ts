import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import * as xlsx from "xlsx";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
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

test("parseExcelBuffer rejects a highly expanding archive before workbook parsing", () => {
  const compressedArchive = Buffer.from(zipSync({
    "xl/worksheets/sheet1.xml": new Uint8Array(128 * 1024).fill(65),
  }, { level: 9 }));

  const result = parseExcelBuffer(compressedArchive, {
    maxArchiveUncompressedBytes: 64 * 1024,
  });

  assert.ok(compressedArchive.length < 2 * 1024);
  assert.match(String(result.error), /safe processing limit/i);
  assert.deepEqual(result.rows, []);
});

test("parseExcelBuffer rejects archives with excessive entry counts", () => {
  const compressedArchive = Buffer.from(zipSync({
    "entry-1.xml": new Uint8Array([1]),
    "entry-2.xml": new Uint8Array([2]),
    "entry-3.xml": new Uint8Array([3]),
  }, { level: 0 }));

  const result = parseExcelBuffer(compressedArchive, {
    maxArchiveEntries: 2,
  });

  assert.match(String(result.error), /safe processing limit/i);
  assert.deepEqual(result.rows, []);
});

test("parseExcelBuffer rejects suspicious per-entry compression ratios", () => {
  const compressedArchive = Buffer.from(zipSync({
    "xl/sharedStrings.xml": new Uint8Array(32 * 1024).fill(32),
  }, { level: 9 }));

  const result = parseExcelBuffer(compressedArchive, {
    maxArchiveCompressionRatio: 2,
  });

  assert.match(String(result.error), /safe processing limit/i);
  assert.deepEqual(result.rows, []);
});

test("parseExcelBuffer rejects malformed ZIP containers with a safe error", () => {
  const malformedArchive = Buffer.from([
    0x50, 0x4b, 0x03, 0x04,
    0x00, 0x00, 0x00, 0x00,
  ]);

  const result = parseExcelBuffer(malformedArchive);

  assert.match(String(result.error), /corrupted|unsupported/i);
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

test("parseExcelFile records bounded archive rejection from the isolated worker", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-excel-worker-limit-"));
  const filePath = path.join(tempDir, "expanding.xlsx");
  const compressedArchive = Buffer.from(zipSync({
    "xl/worksheets/sheet1.xml": new Uint8Array(128 * 1024).fill(65),
  }, { level: 9 }));
  const before = getInternalMetricsSnapshot()
    .counters.spreadsheetArchivePreflightRejectionsTotal;

  try {
    await writeFile(filePath, compressedArchive);
    const result = await parseExcelFile(filePath, {
      maxArchiveUncompressedBytes: 64 * 1024,
    });

    assert.match(String(result.error), /safe processing limit/i);
    assert.equal(
      getInternalMetricsSnapshot().counters.spreadsheetArchivePreflightRejectionsTotal,
      before + 1,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
