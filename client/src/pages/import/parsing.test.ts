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

test("parseImportPreview keeps quoted multiline cells in one row", async () => {
  const file = new File([
    'name,notes\r\nAlice,"line 1\r\nline 2"\r\n',
  ], "multiline.csv", { type: "text/csv" });

  const result = await parseImportPreview(file);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.headers, ["name", "notes"]);
  assert.deepEqual(result.rows, [{ name: "Alice", notes: "line 1\nline 2" }]);
});

test("parseImportPreview rejects duplicate or empty CSV headers", async () => {
  const duplicateResult = await parseImportPreview(
    new File(["Name,name\nAlice,Alias\n"], "duplicate.csv", { type: "text/csv" }),
  );
  const emptyResult = await parseImportPreview(
    new File(["name,\nAlice,value\n"], "empty-header.csv", { type: "text/csv" }),
  );

  assert.match(String(duplicateResult.error), /duplicate column headers/i);
  assert.deepEqual(duplicateResult.rows, []);
  assert.match(String(emptyResult.error), /empty column header/i);
  assert.deepEqual(emptyResult.rows, []);
});

test("parseImportPreview preserves numeric customer, home, and office phones as exact text", async () => {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["Name", "Phone", "IC No", "OfficePhone", "No. Telefon Rumah", "Overdue Days"],
    ["Alice", 123456789, 10203561001, 312345678, 41234567, 181],
    ["Bob", 6591234567, 780101010197, 60351634137, 60398765432, 61],
    ["Charlie", 123456789, 900101101234, 1123456789, "", 30],
  ]);
  (worksheet.B2 as { z?: string }).z = "0000000000";
  (worksheet.D2 as { z?: string }).z = "0000000000";
  (worksheet.E2 as { z?: string }).z = "000000000";
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const workbookBuffer = xlsx.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
  const file = new File([workbookBuffer], "identifiers.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const result = await parseImportPreview(file);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows, [
    {
      Name: "Alice",
      Phone: "0123456789",
      "IC No": "010203561001",
      OfficePhone: "0312345678",
      "No. Telefon Rumah": "041234567",
      "Overdue Days": "181",
    },
    {
      Name: "Bob",
      Phone: "6591234567",
      "IC No": "780101010197",
      OfficePhone: "60351634137",
      "No. Telefon Rumah": "60398765432",
      "Overdue Days": "61",
    },
    {
      Name: "Charlie",
      Phone: "0123456789",
      "IC No": "900101101234",
      OfficePhone: "01123456789",
      "No. Telefon Rumah": "",
      "Overdue Days": "30",
    },
  ]);
});

test("parseImportPreview rejects lossy row widths and unterminated quoted fields", async () => {
  const wideResult = await parseImportPreview(
    new File(["name,amount\nAlice,10,ignored\n"], "wide-row.csv", { type: "text/csv" }),
  );
  const malformedResult = await parseImportPreview(
    new File(['name,notes\nAlice,"not closed\n'], "malformed.csv", { type: "text/csv" }),
  );

  assert.match(String(wideResult.error), /more values than column headers/i);
  assert.deepEqual(wideResult.rows, []);
  assert.match(String(malformedResult.error), /unterminated quoted field/i);
  assert.deepEqual(malformedResult.rows, []);
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
