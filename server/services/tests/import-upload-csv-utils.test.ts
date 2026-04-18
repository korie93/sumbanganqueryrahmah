import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import readline from "node:readline";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import {
  DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS,
  forEachCsvFileRow,
  inspectCsvFile,
  parseCsvBuffer,
  parseCsvFile,
} from "../import-upload-csv-utils";

class FakeReadableStream extends EventEmitter {
  destroyed = false;

  destroy() {
    this.destroyed = true;
    return this;
  }
}

class FakeLineReader extends EventEmitter {
  closed = false;
  #lines: string[];
  #onStart: (() => void) | null;

  constructor(lines: string[], onStart?: () => void) {
    super();
    this.#lines = lines;
    this.#onStart = onStart ?? null;
  }

  close() {
    this.closed = true;
  }

  async *[Symbol.asyncIterator]() {
    if (this.#onStart) {
      const onStart = this.#onStart;
      this.#onStart = null;
      onStart();
    }

    for (const line of this.#lines) {
      if (this.closed) {
        return;
      }
      await Promise.resolve();
      yield line;
    }
  }
}

test("parseCsvBuffer still parses simple CSV rows", () => {
  const result = parseCsvBuffer(Buffer.from("name,amount\nAlice,10\n", "utf8"));

  assert.equal(result.error, undefined);
  assert.deepEqual(result.headers, ["name", "amount"]);
  assert.deepEqual(result.rows, [{ name: "Alice", amount: "10" }]);
});

test("parseCsvBuffer rejects rows beyond the configured CSV row limit", () => {
  const result = parseCsvBuffer(
    Buffer.from("name,amount\nAlice,10\nBob,20\n", "utf8"),
    { maxRows: 1 },
  );

  assert.match(String(result.error), /row limit of 1 rows/i);
  assert.deepEqual(result.rows, []);
});

test("parseCsvBuffer rejects CSV payloads that exceed the in-memory materialization safety limit", () => {
  const lines = ["name,amount"];
  for (let index = 0; index <= DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS; index += 1) {
    lines.push(`User ${index},${index}`);
  }

  const result = parseCsvBuffer(Buffer.from(lines.join("\n"), "utf8"));

  assert.match(String(result.error), /in-memory materialization safety limit/i);
  assert.deepEqual(result.rows, []);
});

test("parseCsvBuffer rejects oversized uploads before parsing rows", () => {
  const result = parseCsvBuffer(
    Buffer.from("name,amount\nAlice,10\n", "utf8"),
    { maxBytes: 8 },
  );

  assert.match(String(result.error), /too large to import/i);
  assert.deepEqual(result.rows, []);
});

test("parseCsvFile stops reading and rejects rows beyond the configured CSV row limit", async (t) => {
  const fakeStream = new FakeReadableStream();
  const fakeLineReader = new FakeLineReader(["name,amount", "Alice,10", "Bob,20"]);

  t.mock.method(fs, "createReadStream", () => fakeStream as unknown as fs.ReadStream);
  t.mock.method(readline, "createInterface", () => fakeLineReader as unknown as readline.Interface);

  const result = await parseCsvFile("customers.csv", { maxRows: 1 });

  assert.match(String(result.error), /row limit of 1 rows/i);
  assert.deepEqual(result.rows, []);
  assert.equal(fakeLineReader.closed, true);
  assert.equal(fakeStream.destroyed, true);
});

test("parseCsvFile returns a safe file access error when the CSV stream emits an error", async (t) => {
  const fakeStream = new FakeReadableStream();
  const accessError = Object.assign(new Error("permission denied"), { code: "EACCES" });

  t.mock.method(fs, "createReadStream", () => fakeStream as unknown as fs.ReadStream);
  t.mock.method(readline, "createInterface", () =>
    new FakeLineReader([], () => {
      queueMicrotask(() => fakeStream.emit("error", accessError));
    }) as unknown as readline.Interface,
  );

  const result = await parseCsvFile("customers.csv");

  assert.equal(result.error, "Cannot access the uploaded file. Please try again.");
  assert.deepEqual(result.rows, []);
  assert.equal(fakeStream.destroyed, true);
});

test("parseCsvFile returns a safe file access error when the readline interface emits an error", async (t) => {
  const fakeStream = new FakeReadableStream();
  const accessError = Object.assign(new Error("resource busy"), { code: "EBUSY" });
  const fakeLineReader = new FakeLineReader([], () => {
    queueMicrotask(() => fakeLineReader.emit("error", accessError));
  });

  t.mock.method(fs, "createReadStream", () => fakeStream as unknown as fs.ReadStream);
  t.mock.method(readline, "createInterface", () => fakeLineReader as unknown as readline.Interface);

  const result = await parseCsvFile("customers.csv");

  assert.equal(result.error, "Cannot access the uploaded file. Please try again.");
  assert.deepEqual(result.rows, []);
  assert.equal(fakeLineReader.closed, true);
  assert.equal(fakeStream.destroyed, true);
});

test("inspectCsvFile counts rows without materializing them in memory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const filePath = path.join(tempDir, "customers.csv");

  try {
    await writeFile(filePath, "name,amount\nAlice,10\nBob,20\n", "utf8");

    const result = await inspectCsvFile(filePath);

    assert.deepEqual(result, {
      headers: ["name", "amount"],
      rowCount: 2,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("forEachCsvFileRow streams CSV rows to the caller one by one", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const filePath = path.join(tempDir, "customers.csv");
  const collectedRows: Array<Record<string, string>> = [];

  try {
    await writeFile(filePath, "name,amount\nAlice,10\nBob,20\n", "utf8");

    const result = await forEachCsvFileRow(filePath, (row) => {
      collectedRows.push(row);
    });

    assert.deepEqual(result, {
      headers: ["name", "amount"],
      rowCount: 2,
    });
    assert.deepEqual(collectedRows, [
      { name: "Alice", amount: "10" },
      { name: "Bob", amount: "20" },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseCsvFile rejects oversized CSV files before opening the stream", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const filePath = path.join(tempDir, "customers.csv");

  try {
    await writeFile(filePath, "name,amount\nAlice,10\nBob,20\n", "utf8");

    const result = await parseCsvFile(filePath, { maxBytes: 8 });

    assert.match(String(result.error), /too large to import/i);
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseCsvFile rejects CSV files that exceed the in-memory materialization safety limit", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const filePath = path.join(tempDir, "customers.csv");
  const lines = ["name,amount"];

  try {
    for (let index = 0; index <= DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS; index += 1) {
      lines.push(`User ${index},${index}`);
    }
    await writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseCsvFile(filePath);

    assert.match(String(result.error), /in-memory materialization safety limit/i);
    assert.deepEqual(result.rows, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("forEachCsvFileRow rejects CSV paths that resolve outside the allowed upload root", async () => {
  const allowedRootDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-allowed-"));
  const fileDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-file-"));
  const filePath = path.join(fileDir, "customers.csv");

  try {
    await writeFile(filePath, "name,amount\nAlice,10\n", "utf8");

    const result = await forEachCsvFileRow(filePath, () => undefined, {
      allowedRootDir,
    });

    assert.equal(result.error, "Cannot access the uploaded file. Please try again.");
    assert.equal(result.rowCount, 0);
  } finally {
    await rm(allowedRootDir, { recursive: true, force: true });
    await rm(fileDir, { recursive: true, force: true });
  }
});
