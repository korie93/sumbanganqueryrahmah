import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import readline from "node:readline";
import test from "node:test";

import { parseCsvBuffer, parseCsvFile } from "../import-upload-csv-utils";

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
