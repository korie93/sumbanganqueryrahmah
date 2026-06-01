import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { COLLECTION_RECEIPT_DIR } from "../../lib/collection-receipt-files";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import { scanCollectionReceiptWithExternalScanner } from "../../lib/collection-receipt-external-scan";
import { readExternalScanConfig } from "../../lib/collection-receipt-external-scan-config";
import { validateExternalScanCommand } from "../../lib/collection-receipt-external-scan-paths";
import { runExternalReceiptScan, type ExternalScanSpawn } from "../../lib/collection-receipt-external-scan-runner";
import {
  buildScanArgs,
  DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS,
  type ExternalScanConfig,
} from "../../lib/collection-receipt-external-scan-shared";
import { ScanArgError } from "../../lib/scanner-arg-validator";
import { getInternalMetricsSnapshot } from "../../internal/metrics";

const ENV_KEYS = [
  "NODE_ENV",
  "HOST",
  "PUBLIC_APP_URL",
  "APP_BASE_URL",
  "CLIENT_APP_URL",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS",
] as const;

function snapshotEnv() {
  return new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function withTemporaryReceiptFile<T>(
  run: (filePath: string) => Promise<T> | T,
  fileName = "receipt.pdf",
): Promise<T> {
  await fs.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });
  const temporaryDirectory = await fs.mkdtemp(path.join(COLLECTION_RECEIPT_DIR, "receipt-external-scan-"));
  const filePath = path.join(temporaryDirectory, fileName);
  await fs.writeFile(filePath, "scan-target");

  try {
    return await run(filePath);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function withTemporaryExecutable<T>(
  executableName: string,
  run: (filePath: string) => Promise<T> | T,
): Promise<T> {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-external-scanner-command-"));
  const filePath = path.join(temporaryDirectory, executableName);
  await fs.writeFile(filePath, "#!/bin/sh\nexit 0\n", "utf8");
  if (process.platform !== "win32") {
    await fs.chmod(filePath, 0o755);
  }

  try {
    return await run(filePath);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function createExternalScanTestConfig(overrides: Partial<ExternalScanConfig> = {}): ExternalScanConfig {
  return {
    enabled: true,
    command: "scanner",
    args: ["{file}"],
    timeoutMs: 1_000,
    failClosed: true,
    cleanExitCodes: new Set([0]),
    rejectExitCodes: new Set([1]),
    ...overrides,
  };
}

class FakeScannerStream extends EventEmitter {
  removeAllListenersCalls = 0;

  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }

  override removeAllListeners(eventName?: string | symbol): this {
    this.removeAllListenersCalls += 1;
    if (eventName === undefined) {
      return super.removeAllListeners();
    }
    return super.removeAllListeners(eventName);
  }
}

class FakeScannerProcess extends EventEmitter {
  readonly stdout = new FakeScannerStream();
  readonly stderr = new FakeScannerStream();
  killed = false;
  killCalls = 0;
  removeAllListenersCalls = 0;

  kill(_signal?: NodeJS.Signals): boolean {
    this.killed = true;
    this.killCalls += 1;
    return true;
  }

  override removeAllListeners(eventName?: string | symbol): this {
    this.removeAllListenersCalls += 1;
    if (eventName === undefined) {
      return super.removeAllListeners();
    }
    return super.removeAllListeners(eventName);
  }
}

function createFakeScannerSpawn(child: FakeScannerProcess): ExternalScanSpawn {
  return () => child;
}

function assertFakeScannerListenersRemoved(child: FakeScannerProcess) {
  assert.equal(child.listenerCount("close"), 0);
  assert.equal(child.listenerCount("error"), 0);
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("data"), 0);
  assert.equal(child.removeAllListenersCalls, 1);
  assert.equal(child.stdout.removeAllListenersCalls, 1);
  assert.equal(child.stderr.removeAllListenersCalls, 1);
}

test("external receipt scanner default timeout allows cold antivirus signature loading", () => {
  assert.equal(DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS, 60_000);
});

test("external receipt scanner removes child process listeners after a clean exit", async () => {
  const child = new FakeScannerProcess();
  const scan = runExternalReceiptScan({
    config: createExternalScanTestConfig(),
    filePath: "receipt.pdf",
    scannerCommand: "scanner",
    args: ["receipt.pdf"],
    spawnScanner: createFakeScannerSpawn(child),
  });

  assert.equal(child.listenerCount("close"), 1);
  assert.equal(child.listenerCount("error"), 1);
  assert.equal(child.stdout.listenerCount("data"), 1);
  assert.equal(child.stderr.listenerCount("data"), 1);

  child.stdout.emit("data", "clean");
  child.emit("close", 0, null);

  await scan;
  assertFakeScannerListenersRemoved(child);
  assert.equal(child.killCalls, 0);
});

test("external receipt scanner removes child process listeners after spawn errors", async () => {
  const child = new FakeScannerProcess();
  const scan = runExternalReceiptScan({
    config: createExternalScanTestConfig(),
    filePath: "receipt.pdf",
    scannerCommand: "scanner",
    args: ["receipt.pdf"],
    spawnScanner: createFakeScannerSpawn(child),
  });

  child.emit("error", new Error("scanner missing"));

  await assert.rejects(
    () => scan,
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError
      && error.reasonCode === "external-scan-spawn-failed",
  );
  assertFakeScannerListenersRemoved(child);
  assert.equal(child.killCalls, 0);
});

test("external receipt scanner terminates and removes listeners after scanner timeout", async () => {
  const child = new FakeScannerProcess();

  await assert.rejects(
    () =>
      runExternalReceiptScan({
        config: createExternalScanTestConfig({ timeoutMs: 1 }),
        filePath: "receipt.pdf",
        scannerCommand: "scanner",
        args: ["receipt.pdf"],
        spawnScanner: createFakeScannerSpawn(child),
      }),
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError
      && error.reasonCode === "external-scan-timeout",
  );

  assertFakeScannerListenersRemoved(child);
  assert.equal(child.killCalls, 1);
});

test("external receipt scanner forces fail-closed mode in production-like runtimes", () => {
  const previousEnv = snapshotEnv();
  process.env.NODE_ENV = "production";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = "clamscan";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "0";

  try {
    assert.equal(readExternalScanConfig().failClosed, true);
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner can fail open only in local development", async () => {
  const previousEnv = snapshotEnv();
  process.env.NODE_ENV = "development";
  process.env.HOST = "localhost";
  delete process.env.PUBLIC_APP_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.CLIENT_APP_URL;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"-e\",\"process.exit(2)\",\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "0";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    const before = getInternalMetricsSnapshot().counters;
    await withTemporaryReceiptFile(async (filePath) => {
      await assert.doesNotReject(() => scanCollectionReceiptWithExternalScanner(filePath));
    });
    const after = getInternalMetricsSnapshot().counters;
    assert.equal(
      after.collectionReceiptExternalScanFailuresTotal,
      before.collectionReceiptExternalScanFailuresTotal + 1,
    );
    assert.equal(
      after.collectionReceiptExternalScanFailOpenBypassTotal,
      before.collectionReceiptExternalScanFailOpenBypassTotal + 1,
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner rejects scanner crashes in production even when env requests fail-open", async () => {
  const previousEnv = snapshotEnv();
  process.env.NODE_ENV = "production";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = "clamscan";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "0";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    await withTemporaryReceiptFile(async (filePath) => {
      const config = readExternalScanConfig();
      await assert.rejects(
        () =>
          runExternalReceiptScan({
            config,
            filePath,
            scannerCommand: process.execPath,
            args: ["-e", "process.exit(2)", filePath],
          }),
        (error: unknown) =>
          error instanceof CollectionReceiptSecurityError
          && error.reasonCode === "external-scan-unexpected-exit",
      );
    });
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner rejects scanner executables outside approved directories", async () => {
  const executableName = process.platform === "win32" ? "clamdscan.exe" : "clamdscan";
  await withTemporaryExecutable(executableName, async (scannerPath) => {
    await assert.rejects(
      () => validateExternalScanCommand(scannerPath, { allowDevelopmentScannerShim: false }),
      /approved scanner directory/i,
    );
  });
});

test("external receipt scanner rejects the development node shim in production-like validation", async () => {
  await assert.rejects(
    () => validateExternalScanCommand(process.execPath, { allowDevelopmentScannerShim: false }),
    /approved scanner executable/i,
  );
});

test("external receipt scanner allows the current node executable only as an explicit development shim", async () => {
  await assert.doesNotReject(
    () => validateExternalScanCommand(process.execPath, { allowDevelopmentScannerShim: true }),
  );
});

test("external receipt scanner rejects shell-style command strings", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = "cmd /c calc";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";

  try {
    await assert.rejects(
      () => scanCollectionReceiptWithExternalScanner("receipt.pdf"),
      (error: unknown) =>
        error instanceof CollectionReceiptSecurityError
        && error.reasonCode === "external-scan-command-invalid",
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner rejects args config without a file placeholder", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"--version\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";

  try {
    await assert.rejects(
      () => scanCollectionReceiptWithExternalScanner("receipt.pdf"),
      (error: unknown) =>
        error instanceof CollectionReceiptSecurityError
        && error.reasonCode === "external-scan-config-invalid",
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner rejects bare commands that do not resolve on PATH", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = "scanner-command-that-should-not-exist-codex";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";

  try {
    await assert.rejects(
      () => scanCollectionReceiptWithExternalScanner("receipt.pdf"),
      (error: unknown) =>
        error instanceof CollectionReceiptSecurityError
        && error.reasonCode === "external-scan-command-invalid",
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner rejects missing receipt files before spawn", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"-e\",\"process.exit(0)\",\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    const missingFilePath = path.join(os.tmpdir(), `missing-receipt-${Date.now()}.pdf`);
    await assert.rejects(
      () => scanCollectionReceiptWithExternalScanner(missingFilePath),
      (error: unknown) =>
        error instanceof CollectionReceiptSecurityError
        && error.reasonCode === "external-scan-file-invalid",
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner rejects files outside the managed receipt directory before spawn", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"-e\",\"process.exit(0)\",\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-external-scan-outside-"));
  const outsideFilePath = path.join(temporaryDirectory, "outside-receipt.pdf");
  await fs.writeFile(outsideFilePath, "scan-target");

  try {
    await assert.rejects(
      () => scanCollectionReceiptWithExternalScanner(outsideFilePath),
      (error: unknown) =>
        error instanceof CollectionReceiptSecurityError
        && error.reasonCode === "external-scan-file-invalid",
    );
  } finally {
    restoreEnv(previousEnv);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("external receipt scanner rejects dynamic filename args that look like scanner flags", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"-e\",\"process.exit(0)\",\"{filename}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    const before = getInternalMetricsSnapshot().counters;
    await withTemporaryReceiptFile(async (filePath) => {
      await assert.rejects(
        () => scanCollectionReceiptWithExternalScanner(filePath),
        (error: unknown) =>
          error instanceof CollectionReceiptSecurityError
          && error.reasonCode === "external-scan-args-invalid",
      );
    }, "--scanner-flag.pdf");
    const after = getInternalMetricsSnapshot().counters;
    assert.equal(
      after.collectionReceiptExternalScanArgValidationFailuresTotal,
      before.collectionReceiptExternalScanArgValidationFailuresTotal + 1,
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner argument builder rejects null-byte dynamic paths", () => {
  assert.throws(
    () => buildScanArgs(createExternalScanTestConfig(), `receipt\0.pdf`),
    ScanArgError,
  );
});

test("external receipt scanner accepts a non-executable receipt file", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"-e\",\"process.exit(0)\",\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    await withTemporaryReceiptFile(async (filePath) => {
      if (process.platform !== "win32") {
        await fs.chmod(filePath, 0o600);
      }
      await assert.doesNotReject(() => scanCollectionReceiptWithExternalScanner(filePath));
    });
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner accepts an existing receipt file with a validated executable path", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"-e\",\"process.exit(0)\",\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    await withTemporaryReceiptFile(async (filePath) => {
      await assert.doesNotReject(() => scanCollectionReceiptWithExternalScanner(filePath));
    });
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner rejects files when the scanner reports infection", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[\"-e\",\"process.exit(1)\",\"{file}\"]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    await withTemporaryReceiptFile(async (filePath) => {
      await assert.rejects(
        () => scanCollectionReceiptWithExternalScanner(filePath),
        (error: unknown) =>
          error instanceof CollectionReceiptSecurityError
          && error.reasonCode === "external-scan-rejected",
      );
    });
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner accepts shell-sourced JSON args with stripped quotes", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "[-e,process.exit(0),{file}]";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "1000";

  try {
    await withTemporaryReceiptFile(async (filePath) => {
      await assert.doesNotReject(() => scanCollectionReceiptWithExternalScanner(filePath));
    });
  } finally {
    restoreEnv(previousEnv);
  }
});

test("external receipt scanner explains invalid args JSON without exposing parser internals only", async () => {
  const previousEnv = snapshotEnv();
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = "--no-summary --infected {file}";
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";

  try {
    await assert.rejects(
      () => scanCollectionReceiptWithExternalScanner("receipt.pdf"),
      (error: unknown) =>
        error instanceof CollectionReceiptSecurityError
        && error.reasonCode === "external-scan-config-invalid"
        && /JSON array of strings/i.test(error.message)
        && /sourced by a shell/i.test(error.message),
    );
  } finally {
    restoreEnv(previousEnv);
  }
});
