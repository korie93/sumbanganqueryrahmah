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

test("parseCsvBuffer keeps quoted multiline cells in one row", () => {
  const result = parseCsvBuffer(
    Buffer.from('name,notes\r\nAlice,"line 1\r\nline 2"\r\n', "utf8"),
  );

  assert.equal(result.error, undefined);
  assert.deepEqual(result.headers, ["name", "notes"]);
  assert.deepEqual(result.rows, [{ name: "Alice", notes: "line 1\nline 2" }]);
});

test("parseCsvBuffer rejects duplicate or empty headers before mapping rows", () => {
  const duplicateResult = parseCsvBuffer(Buffer.from("Name,name\nAlice,Alias\n", "utf8"));
  const emptyResult = parseCsvBuffer(Buffer.from("name,\nAlice,value\n", "utf8"));

  assert.match(String(duplicateResult.error), /duplicate column headers/i);
  assert.deepEqual(duplicateResult.rows, []);
  assert.match(String(emptyResult.error), /empty column header/i);
  assert.deepEqual(emptyResult.rows, []);
});

test("parseCsvBuffer rejects lossy row widths and unterminated quoted fields", () => {
  const wideResult = parseCsvBuffer(Buffer.from("name,amount\nAlice,10,ignored\n", "utf8"));
  const malformedResult = parseCsvBuffer(Buffer.from('name,notes\nAlice,"not closed\n', "utf8"));

  assert.match(String(wideResult.error), /more values than column headers/i);
  assert.deepEqual(wideResult.rows, []);
  assert.match(String(malformedResult.error), /unterminated quoted field/i);
  assert.deepEqual(malformedResult.rows, []);
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

test("parseCsvBuffer rejects payloads beyond configured column and cell limits", () => {
  const tooManyColumns = parseCsvBuffer(
    Buffer.from("a,b,c\n1,2,3\n", "utf8"),
    { maxColumns: 2 },
  );
  assert.match(String(tooManyColumns.error), /column limit of 2/i);

  const oversizedCell = parseCsvBuffer(
    Buffer.from("name\nAlice\n", "utf8"),
    { maxCellLength: 4 },
  );
  assert.match(String(oversizedCell.error), /4 character limit/i);
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

test("forEachCsvFileRow streams multiline records without splitting quoted cells", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const filePath = path.join(tempDir, "multiline.csv");
  const collectedRows: Array<Record<string, string>> = [];

  try {
    await writeFile(filePath, 'name,notes\r\nAlice,"line 1\r\nline 2"\r\n', "utf8");

    const result = await forEachCsvFileRow(filePath, (row) => {
      collectedRows.push(row);
    });

    assert.deepEqual(result, {
      headers: ["name", "notes"],
      rowCount: 1,
    });
    assert.deepEqual(collectedRows, [{ name: "Alice", notes: "line 1\nline 2" }]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("inspectCsvFile rejects duplicate headers and unterminated multiline records", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const duplicatePath = path.join(tempDir, "duplicate.csv");
  const malformedPath = path.join(tempDir, "malformed.csv");

  try {
    await writeFile(duplicatePath, "Name,name\nAlice,Alias\n", "utf8");
    await writeFile(malformedPath, 'name,notes\nAlice,"not closed\n', "utf8");

    const duplicateResult = await inspectCsvFile(duplicatePath);
    const malformedResult = await inspectCsvFile(malformedPath);

    assert.match(String(duplicateResult.error), /duplicate column headers/i);
    assert.equal(duplicateResult.rowCount, 0);
    assert.match(String(malformedResult.error), /unterminated quoted field/i);
    assert.equal(malformedResult.rowCount, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("inspectCsvFile stops streaming when a row exceeds configured structural limits", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const filePath = path.join(tempDir, "customers.csv");

  try {
    await writeFile(filePath, "name,amount,notes\nAlice,10,ok\n", "utf8");
    const result = await inspectCsvFile(filePath, { maxColumns: 2 });

    assert.match(String(result.error), /column limit of 2/i);
    assert.equal(result.rowCount, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("forEachCsvFileRow awaits async row handlers to preserve backpressure", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-csv-utils-"));
  const filePath = path.join(tempDir, "customers.csv");
  let inFlightHandlers = 0;
  let maxInFlightHandlers = 0;

  try {
    await writeFile(filePath, "name,amount\nAlice,10\nBob,20\nCik,30\n", "utf8");

    const result = await forEachCsvFileRow(filePath, async () => {
      inFlightHandlers += 1;
      maxInFlightHandlers = Math.max(maxInFlightHandlers, inFlightHandlers);
      await new Promise((resolve) => setImmediate(resolve));
      inFlightHandlers -= 1;
    });

    assert.equal(result.rowCount, 3);
    assert.equal(maxInFlightHandlers, 1);
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
