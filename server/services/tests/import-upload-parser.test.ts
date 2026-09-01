import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as xlsx from "xlsx";
import {
  parseImportUploadBuffer,
  parseImportUploadFile,
  stripImportUploadExtension,
} from "../import-upload-parser";
import { DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS } from "../import-upload-csv-utils";
import {
  normalizeAndValidateImportUploadFilename,
  validateImportUploadMimeType,
} from "../import-upload-file-utils";
import { extractSavedCollectionFinancials } from "../../lib/saved-collection-link-utils";

test("parseImportUploadBuffer parses CSV uploads directly from memory", () => {
  const result = parseImportUploadBuffer(
    "customers.csv",
    Buffer.from("name,amount\nAlice,15\nBob,27\n", "utf8"),
  );

  assert.equal(result.error, undefined);
  assert.deepEqual(result.headers, ["name", "amount"]);
  assert.deepEqual(result.rows, [
    { name: "Alice", amount: "15" },
    { name: "Bob", amount: "27" },
  ]);
});

test("parseImportUploadFile parses CSV uploads from a temporary file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-"));
  const filePath = path.join(tempDir, "customers.csv");

  try {
    await writeFile(filePath, "name,amount\nAlice,15\nBob,27\n", "utf8");

    const result = await parseImportUploadFile("customers.csv", filePath);

    assert.equal(result.error, undefined);
    assert.deepEqual(result.headers, ["name", "amount"]);
    assert.deepEqual(result.rows, [
      { name: "Alice", amount: "15" },
      { name: "Bob", amount: "27" },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseImportUploadFile rejects unsupported upload extensions", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-"));
  const filePath = path.join(tempDir, "customers.txt");

  try {
    await writeFile(filePath, "hello", "utf8");

    const result = await parseImportUploadFile("customers.txt", filePath);

    assert.equal(result.error, "Please select a CSV, XLSX, or XLSB file.");
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseImportUploadFile parses Excel uploads from a temporary file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-"));
  const filePath = path.join(tempDir, "customers.xlsx");
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["name", "amount"],
    ["Alice", 15],
    ["Bob", 27],
  ]);

  try {
    xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const workbookBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;
    await writeFile(filePath, workbookBuffer);

    const result = await parseImportUploadFile("customers.xlsx", filePath);

    assert.equal(result.error, undefined);
    assert.deepEqual(result.headers, ["name", "amount"]);
    assert.deepEqual(result.rows, [
      { name: "Alice", amount: "15" },
      { name: "Bob", amount: "27" },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Excel imports preserve numeric customer, home, and office phones as exact text", () => {
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
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  const result = parseImportUploadBuffer("identifiers.xlsx", workbookBuffer);

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

test("parseImportUploadBuffer parses XLSB uploads through the spreadsheet adapter", () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet([
      ["name", "amount"],
      ["Alice", 15],
    ]),
    "Sheet1",
  );
  const workbookBuffer = xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsb",
  }) as Buffer;

  const result = parseImportUploadBuffer("customers.xlsb", workbookBuffer);

  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows, [{ name: "Alice", amount: "15" }]);
});

test("XLSB master-list TOTAL DUE header remains detectable after import parsing", () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet([
      ["Account No", "Card No", "Total Amount Due (TOTAL DUE)", "Calling Date"],
      ["00000000000000001", "0000000000000002", 1234.5, "20260115"],
    ]),
    "Synthetic Master List",
  );
  const workbookBuffer = xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsb",
  }) as Buffer;

  const result = parseImportUploadBuffer("synthetic-master-list.xlsb", workbookBuffer);

  assert.equal(result.error, undefined);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.["Account No"], "00000000000000001");
  assert.equal(result.rows[0]?.["Card No"], "0000000000000002");
  assert.equal(
    extractSavedCollectionFinancials(result.rows[0]).totalDue,
    "1234.50",
  );
});

test("XLSB imports fail closed for numeric 16-digit Account/Card identifiers", () => {
  for (const header of ["Account No", "Card No"] as const) {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        [header, "Total Amount Due (TOTAL DUE)"],
        [1_234_567_890_123_456, 125],
      ]),
      "Synthetic Identifiers",
    );
    const workbookBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsb",
    }) as Buffer;

    const result = parseImportUploadBuffer("numeric-identifiers.xlsb", workbookBuffer);

    assert.match(String(result.error), /unsafe numeric Account\/Card identifier/i);
    assert.deepEqual(result.rows, []);
  }
});

test("XLSB imports reject numeric Account/Card cells padded to 16 displayed digits", () => {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["Card No", "Total Amount Due (TOTAL DUE)"],
    [123_456_789_012, 125],
  ]);
  (worksheet.A2 as { z?: string }).z = "0000000000000000";
  xlsx.utils.book_append_sheet(workbook, worksheet, "Synthetic Identifiers");
  const workbookBuffer = xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsb",
  }) as Buffer;

  const result = parseImportUploadBuffer("padded-numeric-identifier.xlsb", workbookBuffer);

  assert.match(String(result.error), /unsafe numeric Account\/Card identifier/i);
  assert.deepEqual(result.rows, []);
});

test("parseImportUploadBuffer rejects executable content disguised as CSV", () => {
  const result = parseImportUploadBuffer(
    "customers.csv",
    Buffer.from("MZ\u0000\u0000fake executable payload", "utf8"),
  );

  assert.match(String(result.error), /could not be verified/i);
  assert.deepEqual(result.rows, []);
});

test("parseImportUploadBuffer rejects non-ZIP content disguised as XLSX", () => {
  const result = parseImportUploadBuffer(
    "customers.xlsx",
    Buffer.from("not a spreadsheet", "utf8"),
  );

  assert.match(String(result.error), /could not be verified/i);
  assert.deepEqual(result.rows, []);
});

test("import upload metadata rejects traversal, dangerous double extensions, and MIME mismatches", () => {
  assert.throws(
    () => normalizeAndValidateImportUploadFilename("../customers.csv"),
    /CSV, XLSX, or XLSB/i,
  );
  assert.throws(
    () => normalizeAndValidateImportUploadFilename("payload.exe.csv"),
    /CSV, XLSX, or XLSB/i,
  );
  assert.doesNotThrow(() => validateImportUploadMimeType("customers.xlsx", "application/octet-stream"));
  assert.throws(
    () => validateImportUploadMimeType("customers.csv", "application/pdf"),
    /CSV, XLSX, or XLSB/i,
  );
});

test("parseImportUploadFile returns a safe error when the uploaded file cannot be accessed", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-"));
  const filePath = path.join(tempDir, "missing.xlsx");

  try {
    const result = await parseImportUploadFile("missing.xlsx", filePath);
    assert.equal(result.error, "Cannot access the uploaded file. Please try again.");
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseImportUploadFile returns a safe error when a CSV stream cannot be opened", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-"));
  const filePath = path.join(tempDir, "missing.csv");

  try {
    const result = await parseImportUploadFile("missing.csv", filePath);
    assert.equal(result.error, "Cannot access the uploaded file. Please try again.");
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseImportUploadFile rejects CSV files that exceed the in-memory materialization safety limit", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-"));
  const filePath = path.join(tempDir, "customers.csv");
  const lines = ["name,amount"];

  try {
    for (let index = 0; index <= DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS; index += 1) {
      lines.push(`User ${index},${index}`);
    }
    await writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseImportUploadFile("customers.csv", filePath);

    assert.match(String(result.error), /in-memory materialization safety limit/i);
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("stripImportUploadExtension removes supported spreadsheet extensions", () => {
  assert.equal(stripImportUploadExtension("report.xlsx"), "report");
  assert.equal(stripImportUploadExtension("report.csv"), "report");
  assert.equal(stripImportUploadExtension("report.xlsb"), "report");
});
