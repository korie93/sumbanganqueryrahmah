import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import { scanCollectionReceiptWithExternalScanner } from "../../lib/collection-receipt-external-scan";

const ENV_KEYS = [
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
