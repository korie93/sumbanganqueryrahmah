import assert from "node:assert/strict";
import test from "node:test";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import { scanCollectionReceiptWithExternalScanner } from "../../lib/collection-receipt-external-scan";

const ENV_KEYS = [
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED",
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
