import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { parseImportUploadFile, stripImportUploadExtension } from "../import-upload-parser";

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

test("stripImportUploadExtension removes supported spreadsheet extensions", () => {
  assert.equal(stripImportUploadExtension("report.xlsx"), "report");
  assert.equal(stripImportUploadExtension("report.csv"), "report");
  assert.equal(stripImportUploadExtension("report.xlsb"), "report");
});
