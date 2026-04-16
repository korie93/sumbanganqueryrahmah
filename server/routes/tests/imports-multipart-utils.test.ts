import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  IMPORT_TOO_LARGE_MESSAGE,
  cleanupPreparedMultipartImportUpload,
  normalizeImportName,
  parseMultipartImportUpload,
  resolveImportMultipartFailure,
} from "../imports-multipart-utils";
import { DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS } from "../../services/import-upload-csv-utils";
import { logger } from "../../lib/logger";

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

test("resolveImportMultipartFailure falls back cleanly for unknown error payloads", () => {
  assert.deepEqual(
    resolveImportMultipartFailure(null, "Multipart import failed."),
    {
      message: "Multipart import failed.",
      statusCode: 400,
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

test("parseMultipartImportUpload rejects unsupported upload extensions", async () => {
  const file = Readable.from("unsupported");

  await assert.rejects(
    () =>
      parseMultipartImportUpload({
        file,
        filename: "multipart-import.txt",
      }),
    /csv or excel/i,
  );
});

test("parseMultipartImportUpload rejects mismatched upload mime types before parsing", async () => {
  const file = Readable.from("name,amount\nAlice,12\n");

  await assert.rejects(
    () =>
      parseMultipartImportUpload({
        file,
        filename: "multipart-import.csv",
        mimeType: "image/png",
      }),
    /csv or excel/i,
  );
});

test("parseMultipartImportUpload rejects files that exceed the configured size limit", async () => {
  class LimitReadable extends Readable {
    private hasSentData = false;

    override _read() {
      if (this.hasSentData) {
        this.push(null);
        return;
      }

      this.hasSentData = true;
      this.emit("limit");
      this.push("name,amount\nAlice,12\n");
    }
  }

  const parsingPromise = parseMultipartImportUpload({
    file: new LimitReadable(),
    filename: "multipart-import.csv",
  });

  await assert.rejects(
    () => parsingPromise,
    new RegExp(IMPORT_TOO_LARGE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("parseMultipartImportUpload rejects CSV files that exceed the in-memory materialization safety limit", async () => {
  const lines = ["name,amount"];
  for (let index = 0; index <= DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS; index += 1) {
    lines.push(`User ${index},${index}`);
  }

  await assert.rejects(
    () =>
      parseMultipartImportUpload({
        file: Readable.from(lines.join("\n")),
        filename: "multipart-import.csv",
      }),
    /in-memory materialization safety limit/i,
  );
});

test("cleanupPreparedMultipartImportUpload logs cleanup failures before removing the staged directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-cleanup-test-"));
  const warnings: Array<{ message: string; meta: Record<string, unknown> | undefined }> = [];
  const originalWarn = logger.warn;
  logger.warn = (message, meta) => {
    warnings.push({ message, meta });
  };

  try {
    await cleanupPreparedMultipartImportUpload({
      kind: "csv-file",
      filename: "sample.csv",
      filePath: tempDir,
      tempDir,
    });
  } finally {
    logger.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, "Failed to cleanup staged import upload path");
  assert.equal(warnings[0]?.meta?.targetType, "file");
});
