import assert from "node:assert/strict";
import test from "node:test";
import { verifyCollectionReceiptExternalScanStartup } from "../../lib/collection-receipt-external-scan-startup";

const SCANNER_ENV_KEYS = [
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS",
] as const;

async function withScannerEnv<T>(
  overrides: Partial<Record<(typeof SCANNER_ENV_KEYS)[number], string | null>>,
  fn: () => Promise<T>,
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();
  for (const key of SCANNER_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    const override = overrides[key];
    if (override === null) {
      delete process.env[key];
    } else if (override !== undefined) {
      process.env[key] = override;
    }
  }

  try {
    return await fn();
  } finally {
    for (const key of SCANNER_ENV_KEYS) {
      const previousValue = previousValues.get(key);
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

function createTestLogger() {
  const messages: Array<{ level: "info" | "warn"; message: string }> = [];
  return {
    messages,
    logger: {
      info(message: string) {
        messages.push({ level: "info", message });
      },
      warn(message: string) {
        messages.push({ level: "warn", message });
      },
    },
  };
}

test("receipt external scanner startup check warns but does not fail when disabled outside production", async () => {
  await withScannerEnv(
    {
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "0",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: null,
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: null,
    },
    async () => {
      const { logger, messages } = createTestLogger();
      const result = await verifyCollectionReceiptExternalScanStartup({
        isProductionLike: false,
        logger,
      });

      assert.equal(result.ready, false);
      assert.match(result.message, /disabled/i);
      assert.deepEqual(messages, [
        {
          level: "warn",
          message: "Receipt external malware scanning is disabled; uploads will skip external scanner checks",
        },
      ]);
    },
  );
});

test("receipt external scanner startup check fails production when disabled", async () => {
  await withScannerEnv(
    {
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "0",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: null,
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: null,
    },
    async () => {
      await assert.rejects(
        () =>
          verifyCollectionReceiptExternalScanStartup({
            isProductionLike: true,
          }),
        /Receipt external malware scanning is disabled/i,
      );
    },
  );
});

test("receipt external scanner startup check validates the development shim command and clean scan path", async () => {
  await withScannerEnv(
    {
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: process.execPath,
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: "[\"-e\",\"process.exit(0)\",\"{file}\"]",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS: "1000",
    },
    async () => {
      const { logger, messages } = createTestLogger();
      const result = await verifyCollectionReceiptExternalScanStartup({
        isProductionLike: false,
        logger,
      });

      assert.equal(result.ready, true);
      assert.equal(result.scannerCommand, process.execPath);
      assert.match(result.version ?? "", /^v\d+\./);
      assert.deepEqual(messages, [
        {
          level: "info",
          message: "Receipt external malware scanner startup check passed",
        },
      ]);
    },
  );
});

test("receipt external scanner startup check rejects the development shim in production", async () => {
  await withScannerEnv(
    {
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: process.execPath,
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: "[\"-e\",\"process.exit(0)\",\"{file}\"]",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS: "1000",
    },
    async () => {
      await assert.rejects(
        () =>
          verifyCollectionReceiptExternalScanStartup({
            isProductionLike: true,
          }),
        /approved scanner executable/i,
      );
    },
  );
});

test("receipt external scanner startup check marks non-production degraded when scanner exits unexpectedly", async () => {
  await withScannerEnv(
    {
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: process.execPath,
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: "[\"-e\",\"process.exit(2)\",\"{file}\"]",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
      COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS: "1000",
    },
    async () => {
      const { logger, messages } = createTestLogger();
      const result = await verifyCollectionReceiptExternalScanStartup({
        isProductionLike: false,
        logger,
      });

      assert.equal(result.ready, false);
      assert.match(result.message, /Receipt external malware scan failed/i);
      assert.deepEqual(messages, [
        {
          level: "warn",
          message: "Receipt external malware scanner startup check failed",
        },
      ]);
    },
  );
});
