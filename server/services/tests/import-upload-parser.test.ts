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

    assert.match(String(result.error), /csv or excel/i);
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

test("parseImportUploadFile rejects CSV paths that resolve outside the allowed upload root", async () => {
  const allowedRootDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-allowed-"));
  const fileDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-parser-file-"));
  const filePath = path.join(fileDir, "customers.csv");

  try {
    await writeFile(filePath, "name,amount\nAlice,15\n", "utf8");

    const result = await parseImportUploadFile("customers.csv", filePath, {
      allowedRootDir,
    });

    assert.equal(result.error, "Cannot access the uploaded file. Please try again.");
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(allowedRootDir, { recursive: true, force: true });
    await rm(fileDir, { recursive: true, force: true });
  }
});

test("stripImportUploadExtension removes supported spreadsheet extensions", () => {
  assert.equal(stripImportUploadExtension("report.xlsx"), "report");
  assert.equal(stripImportUploadExtension("report.csv"), "report");
  assert.equal(stripImportUploadExtension("report.xlsb"), "report");
});
