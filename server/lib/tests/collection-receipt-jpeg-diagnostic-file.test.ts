import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { diagnoseCollectionReceiptJpegFile } from "../../maintenance/collection-receipt-jpeg-diagnostic-file";

const MAX_DIAGNOSTIC_BYTES = 5 * 1024 * 1024;
const PRIVATE_FILE_NAME = "synthetic-private-receipt-name.jpg";
const PRIVATE_CONTENT = "SYNTHETIC_PRIVATE_CONTENT_NOT_FOR_REPORTS";
const SAFE_READ_ERROR = "JPEG diagnostic could not read the selected file safely.";
const supportsNoFollow = typeof constants.O_NOFOLLOW === "number"
  && constants.O_NOFOLLOW !== 0
  && typeof constants.O_NONBLOCK === "number"
  && constants.O_NONBLOCK !== 0;
const cliPath = fileURLToPath(new URL("../../maintenance/diagnose-collection-receipt-jpeg.ts", import.meta.url));

// A marker-level fixture, not a claim of independent JPEG raster decoding.
const JPEG = Buffer.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x11, 0x22, 0x33,
  0xff, 0xd9,
]);

async function withFixtureDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-jpeg-diagnostic-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function assertPrivateReport(report: object): void {
  assert.deepEqual(Object.keys(report).sort(), [
    "eoiEndOffset",
    "fileBytes",
    "reasonCode",
    "trailingBytes",
    "trailingClassification",
  ]);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(PRIVATE_FILE_NAME), false);
  assert.equal(serialized.includes(PRIVATE_CONTENT), false);
  assert.doesNotMatch(serialized, /fileName|filePath|sha256|hash|stack|cause/i);
}

function assertSafeReadError(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.equal(error.message, SAFE_READ_ERROR);
  assert.equal("cause" in error, false);
  assert.equal("path" in error, false);
  assert.equal(JSON.stringify(error).includes(PRIVATE_FILE_NAME), false);
  assert.equal(JSON.stringify(error).includes(PRIVATE_CONTENT), false);
  return true;
}

function inheritedTypeScriptBootstrapArgs(): string[] {
  const bootstrapFlags = new Set(["--import", "--require", "--loader", "--experimental-loader"]);
  const result: string[] = [];
  for (let index = 0; index < process.execArgv.length; index += 1) {
    const argument = process.execArgv[index];
    if (bootstrapFlags.has(argument)) {
      const value = process.execArgv[index + 1];
      if (value !== undefined) {
        result.push(argument, value);
        index += 1;
      }
    } else if (Array.from(bootstrapFlags).some((flag) => argument.startsWith(flag + "="))) {
      result.push(argument);
    }
  }
  return result;
}

function runCli(args: string[], directory: string) {
  return spawnSync(process.execPath, [...inheritedTypeScriptBootstrapArgs(), cliPath, ...args], {
    cwd: directory,
    env: {
      NODE_ENV: "test",
      // Keep tsx's bootstrap cache out of the input directory audited below.
      TSX_DISABLE_CACHE: "1",
      HOME: directory,
      XDG_CACHE_HOME: directory,
      TMPDIR: directory,
      TEMP: directory,
      TMP: directory,
      TZ: "UTC",
      LANG: "C.UTF-8",
    },
    encoding: "utf8",
    timeout: 4_000,
    maxBuffer: 16 * 1024,
    windowsHide: true,
  });
}

test("JPEG diagnostic reader reports only scalar structure metadata and leaves the input unchanged", { skip: !supportsNoFollow }, async () => {
  await withFixtureDirectory(async (directory) => {
    const filePath = path.join(directory, PRIVATE_FILE_NAME);
    await fs.writeFile(filePath, JPEG);
    const before = await fs.stat(filePath, { bigint: true });

    const report = await diagnoseCollectionReceiptJpegFile(filePath);

    assert.deepEqual(report, {
      fileBytes: JPEG.length,
      eoiEndOffset: JPEG.length,
      trailingBytes: 0,
      trailingClassification: "none",
      reasonCode: null,
    });
    assertPrivateReport(report);
    assert.deepEqual(await fs.readFile(filePath), JPEG);
    const after = await fs.stat(filePath, { bigint: true });
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeNs, before.mtimeNs);
    assert.equal(after.ctimeNs, before.ctimeNs);
    assert.deepEqual(await fs.readdir(directory), [PRIVATE_FILE_NAME]);
  });
});

test("JPEG diagnostic reader classifies suffixes without accepting, removing or disclosing them", { skip: !supportsNoFollow }, async () => {
  const variants = [
    { suffix: Buffer.from([0, 0]), classification: "nul-only" },
    { suffix: Buffer.from([9, 10, 11, 12, 13, 32]), classification: "ascii-whitespace-only" },
    { suffix: Buffer.from([0, 13, 10, 32]), classification: "nul-and-ascii-whitespace" },
    { suffix: JPEG, classification: "jpeg-signature-prefix" },
    { suffix: Buffer.from(PRIVATE_CONTENT), classification: "other" },
  ];
  await withFixtureDirectory(async (directory) => {
    const filePath = path.join(directory, PRIVATE_FILE_NAME);
    for (const variant of variants) {
      const original = Buffer.concat([JPEG, variant.suffix]);
      await fs.writeFile(filePath, original);

      const report = await diagnoseCollectionReceiptJpegFile(filePath);

      assert.deepEqual(report, {
        fileBytes: original.length,
        eoiEndOffset: JPEG.length,
        trailingBytes: variant.suffix.length,
        trailingClassification: variant.classification,
        reasonCode: "jpeg-trailing-data",
      });
      assertPrivateReport(report);
      assert.deepEqual(await fs.readFile(filePath), original);
    }
    assert.deepEqual(await fs.readdir(directory), [PRIVATE_FILE_NAME]);
  });
});

test("JPEG diagnostic reader reports malformed image reasons as successful diagnostics", { skip: !supportsNoFollow }, async () => {
  await withFixtureDirectory(async (directory) => {
    const filePath = path.join(directory, PRIVATE_FILE_NAME);
    for (const variant of [
      { bytes: JPEG.subarray(0, -2), reason: "jpeg-eoi-missing" },
      { bytes: Buffer.from(PRIVATE_CONTENT), reason: "jpeg-header-invalid" },
    ]) {
      await fs.writeFile(filePath, variant.bytes);
      const report = await diagnoseCollectionReceiptJpegFile(filePath);
      assert.deepEqual(report, {
        fileBytes: variant.bytes.length,
        eoiEndOffset: null,
        trailingBytes: null,
        trailingClassification: "unavailable",
        reasonCode: variant.reason,
      });
      assertPrivateReport(report);
      assert.deepEqual(await fs.readFile(filePath), variant.bytes);
    }
  });
});

test("JPEG diagnostic reader enforces the raw five MiB boundary without rewriting oversized input", { skip: !supportsNoFollow }, async () => {
  await withFixtureDirectory(async (directory) => {
    const filePath = path.join(directory, PRIVATE_FILE_NAME);
    const atLimit = Buffer.alloc(MAX_DIAGNOSTIC_BYTES);
    JPEG.copy(atLimit);
    await fs.writeFile(filePath, atLimit);
    const report = await diagnoseCollectionReceiptJpegFile(filePath);
    assert.equal(report.fileBytes, MAX_DIAGNOSTIC_BYTES);
    assert.equal(report.eoiEndOffset, JPEG.length);
    assert.equal(report.trailingBytes, MAX_DIAGNOSTIC_BYTES - JPEG.length);
    assert.equal(report.reasonCode, "jpeg-trailing-data");
    assertPrivateReport(report);

    const oversized = Buffer.concat([atLimit, Buffer.from([0])]);
    await fs.writeFile(filePath, oversized);
    await assert.rejects(() => diagnoseCollectionReceiptJpegFile(filePath), assertSafeReadError);
    assert.deepEqual(await fs.readFile(filePath), oversized);
    assert.deepEqual(await fs.readdir(directory), [PRIVATE_FILE_NAME]);
  });
});

test("JPEG diagnostic reader rejects empty files, directories and missing files without native errors", async () => {
  await withFixtureDirectory(async (directory) => {
    const filePath = path.join(directory, PRIVATE_FILE_NAME);
    await fs.writeFile(filePath, Buffer.alloc(0));
    for (const invalidPath of [filePath, directory, path.join(directory, "missing-" + PRIVATE_FILE_NAME)]) {
      await assert.rejects(() => diagnoseCollectionReceiptJpegFile(invalidPath), assertSafeReadError);
    }
    assert.deepEqual(await fs.readFile(filePath), Buffer.alloc(0));
    assert.deepEqual(await fs.readdir(directory), [PRIVATE_FILE_NAME]);
  });
});

test("JPEG diagnostic reader rejects final-component symlinks without changing their target", { skip: !supportsNoFollow }, async () => {
  await withFixtureDirectory(async (directory) => {
    const target = path.join(directory, PRIVATE_FILE_NAME);
    const link = path.join(directory, "selected-link.jpg");
    await fs.writeFile(target, JPEG);
    await fs.symlink(target, link);

    await assert.rejects(() => diagnoseCollectionReceiptJpegFile(link), assertSafeReadError);

    assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
    assert.deepEqual(await fs.readFile(target), JPEG);
  });
});

test("JPEG diagnostic reader rejects hard-linked files without changing either name", { skip: !supportsNoFollow }, async () => {
  await withFixtureDirectory(async (directory) => {
    const original = path.join(directory, PRIVATE_FILE_NAME);
    const alias = path.join(directory, "selected-alias.jpg");
    await fs.writeFile(original, JPEG);
    await fs.link(original, alias);

    await assert.rejects(() => diagnoseCollectionReceiptJpegFile(alias), assertSafeReadError);

    assert.equal((await fs.stat(original)).nlink, 2);
    assert.deepEqual(await fs.readFile(original), JPEG);
    assert.deepEqual(await fs.readFile(alias), JPEG);
  });
});

test("JPEG diagnostic reader fails closed on an unsupported platform", async () => {
  await withFixtureDirectory(async (directory) => {
    const filePath = path.join(directory, PRIVATE_FILE_NAME);
    await fs.writeFile(filePath, JPEG);
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
    assert.ok(descriptor?.configurable);
    Object.defineProperty(process, "platform", { ...descriptor, value: "win32" });
    try {
      await assert.rejects(() => diagnoseCollectionReceiptJpegFile(filePath), assertSafeReadError);
    } finally {
      Object.defineProperty(process, "platform", descriptor);
    }
    assert.deepEqual(await fs.readFile(filePath), JPEG);
  });
});

test("JPEG diagnostic CLI prints one private JSON report and exits zero for rejected image structure", { skip: !supportsNoFollow }, async () => {
  await withFixtureDirectory(async (directory) => {
    const filePath = path.join(directory, PRIVATE_FILE_NAME);
    const original = Buffer.concat([JPEG, Buffer.from(PRIVATE_CONTENT)]);
    await fs.writeFile(filePath, original);

    const result = runCli(["--file", filePath], directory);

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const report: object = JSON.parse(result.stdout);
    assert.deepEqual(report, {
      fileBytes: original.length,
      eoiEndOffset: JPEG.length,
      trailingBytes: Buffer.byteLength(PRIVATE_CONTENT),
      trailingClassification: "other",
      reasonCode: "jpeg-trailing-data",
    });
    assertPrivateReport(report);
    assert.deepEqual(await fs.readFile(filePath), original);
    assert.deepEqual(await fs.readdir(directory), [PRIVATE_FILE_NAME]);
  });
});

test("JPEG diagnostic CLI operational failures return only a fixed error and exit one", async () => {
  await withFixtureDirectory(async (directory) => {
    const result = runCli(["--file", path.join(directory, PRIVATE_FILE_NAME)], directory);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), { error: "jpeg-diagnostic-read-failed" });
    assert.equal(result.stderr.includes(PRIVATE_FILE_NAME), false);
    assert.equal(result.stderr.includes(directory), false);
    assert.deepEqual(await fs.readdir(directory), []);
  });
});

test("JPEG diagnostic CLI requires exactly one explicit file argument without echoing invalid input", async () => {
  await withFixtureDirectory(async (directory) => {
    for (const args of [[], ["--file"], [PRIVATE_FILE_NAME], ["--unknown", PRIVATE_CONTENT]]) {
      const result = runCli(args, directory);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.deepEqual(JSON.parse(result.stderr), { error: "jpeg-diagnostic-usage-invalid" });
      assert.equal(result.stderr.includes(PRIVATE_FILE_NAME), false);
      assert.equal(result.stderr.includes(PRIVATE_CONTENT), false);
    }
    assert.deepEqual(await fs.readdir(directory), []);
  });
});

test("JPEG diagnostic CLI help works without reading a file or creating files", async () => {
  await withFixtureDirectory(async (directory) => {
    const result = runCli(["--help"], directory);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /--file/);
    assert.match(result.stdout, /--help/);
    assert.deepEqual(await fs.readdir(directory), []);
  });
});
