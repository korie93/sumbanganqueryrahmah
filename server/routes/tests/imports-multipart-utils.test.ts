import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import {
  IMPORT_TOO_LARGE_MESSAGE,
  normalizeImportName,
  parseMultipartImportUpload,
  resolveImportMultipartFailure,
} from "../imports-multipart-utils";

test("normalizeImportName trims explicit names and falls back to the upload filename", () => {
  assert.equal(normalizeImportName("  March batch  ", "users.xlsx"), "March batch");
  assert.equal(normalizeImportName("", "users.xlsx"), "users");
});

test("resolveImportMultipartFailure upgrades size limit errors to the standard 413 payload", () => {
  assert.deepEqual(
    resolveImportMultipartFailure(new Error("File too large for upload")),
    {
      message: IMPORT_TOO_LARGE_MESSAGE,
      statusCode: 413,
    },
  );
});

test("parseMultipartImportUpload parses CSV streams through the shared temp-file helper", async () => {
  const file = Readable.from("name,amount\nAlice,12\nBob,33\n");
  const parsed = await parseMultipartImportUpload({
    file,
    filename: "multipart-import.csv",
  });

  assert.equal(parsed.filename, "multipart-import.csv");
  assert.deepEqual(parsed.dataRows, [
    { amount: "12", name: "Alice" },
    { amount: "33", name: "Bob" },
  ]);
});
