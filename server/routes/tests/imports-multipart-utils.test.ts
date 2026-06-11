import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  IMPORT_TOO_LARGE_MESSAGE,
  cleanupPreparedMultipartImportUpload,
  normalizeImportName,
  parseMultipartImportUpload,
  prepareMultipartImportUpload,
  resolveImportUploadTempRootDir,
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
    resolveImportMultipartFailure(new Error("File too large for upload"), undefined, 5 * 1024 * 1024),
    {
      message: "The selected file is too large to import. Maximum upload size is 5.0 MB. Split it into smaller files or ask an administrator to raise the import upload limit.",
      statusCode: 413,
    },
  );
});

test("default multipart size errors include the standard import limit", () => {
  assert.match(IMPORT_TOO_LARGE_MESSAGE, /96 MB/);
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
    /csv, xlsx, or xlsb/i,
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

test("parseMultipartImportUpload removes limit listeners after stream failures", async () => {
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

  const file = new LimitReadable();
  await assert.rejects(
    () =>
      parseMultipartImportUpload({
        file,
        filename: "multipart-import.csv",
      }),
    new RegExp(IMPORT_TOO_LARGE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );

  assert.equal(file.listenerCount("limit"), 0);
});

test("prepareMultipartImportUpload removes limit listeners after successful staging", async () => {
  const file = Readable.from("name,amount\nAlice,12\n");
  const upload = await prepareMultipartImportUpload({
    file,
    filename: "multipart-import.csv",
  });

  try {
    assert.equal(file.listenerCount("limit"), 0);
    assert.equal(upload.kind, "csv-file");
  } finally {
    await cleanupPreparedMultipartImportUpload(upload);
  }
});

test("prepareMultipartImportUpload uses UPLOAD_TMP_DIR when it is configured", async () => {
  const originalUploadTmpDir = process.env.UPLOAD_TMP_DIR;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sqr-import-upload-root-"));
  const file = Readable.from("name,amount\nAlice,12\n");
  process.env.UPLOAD_TMP_DIR = tempRoot;

  try {
    const upload = await prepareMultipartImportUpload({
      file,
      filename: "multipart-import.csv",
    });

    try {
      assert.equal(resolveImportUploadTempRootDir(), tempRoot);
      assert.equal(upload.kind, "csv-file");
      assert.equal(path.dirname(upload.tempDir), tempRoot);
      assert.equal(upload.filePath.startsWith(upload.tempDir), true);
    } finally {
      await cleanupPreparedMultipartImportUpload(upload);
    }
  } finally {
    if (originalUploadTmpDir === undefined) {
      delete process.env.UPLOAD_TMP_DIR;
    } else {
      process.env.UPLOAD_TMP_DIR = originalUploadTmpDir;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
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
  assert.equal("targetPath" in (warnings[0]?.meta ?? {}), false);
});
