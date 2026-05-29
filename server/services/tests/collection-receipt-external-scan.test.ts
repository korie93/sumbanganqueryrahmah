import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import { scanCollectionReceiptWithExternalScanner } from "../../lib/collection-receipt-external-scan";
import { readExternalScanConfig } from "../../lib/collection-receipt-external-scan-config";
import { validateExternalScanCommand } from "../../lib/collection-receipt-external-scan-paths";
import { runExternalReceiptScan } from "../../lib/collection-receipt-external-scan-runner";
import { DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS } from "../../lib/collection-receipt-external-scan-shared";
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
): Promise<T> {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-external-scan-"));
  const filePath = path.join(temporaryDirectory, "receipt.pdf");
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

test("external receipt scanner default timeout allows cold antivirus signature loading", () => {
  assert.equal(DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS, 60_000);
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
