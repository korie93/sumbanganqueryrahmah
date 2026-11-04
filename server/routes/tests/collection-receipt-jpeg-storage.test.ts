import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

// Genuine offline Pillow encoding of a synthetic 2x2 #2468ac square, also used
// by the JPEG diagnostic tests. No receipt or customer data belongs in fixtures.
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/9oADAMBAAIQAxAAAAGYFDf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEPP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64");
const FIXED_SUFFIX = Buffer.from("ffe000124a465858005741000000000000000000", "hex");
const RAW_MAX_BYTES = 5 * 1024 * 1024;
const ENV_KEYS = [
  "NODE_ENV",
  "COLLECTION_RECEIPT_QUARANTINE_ENABLED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES",
  "COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES",
  "SQR_SCANNER_TIMEOUT_MS",
] as const;

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function useScanner(script: string): void {
  process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON = JSON.stringify(["-e", script, "{file}"]);
}

function requireScannerBytes(buffer: Buffer, expectedHash = sha256(buffer)): void {
  useScanner(`const b=require('node:fs').readFileSync(process.argv[1]);process.exit(b.length===${buffer.length}&&require('node:crypto').createHash('sha256').update(b).digest('hex')==='${expectedHash}'?0:1)`);
}

test("synthetic JPEG receipt storage preserves canonical bytes and upload security", { timeout: 60_000 }, async (t) => {
  const previousDirectory = process.cwd();
  const previousEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-jpeg-storage-"));

  try {
    // Receipt paths are resolved at module initialization. Import only after
    // selecting a disposable cwd, keeping all staging/final files isolated.
    process.chdir(fixtureRoot);
    process.env.NODE_ENV = "test";
    process.env.COLLECTION_RECEIPT_QUARANTINE_ENABLED = "0";
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED = "1";
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND = process.execPath;
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED = "1";
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = "5000";
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES = "0";
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES = "1";
    delete process.env.SQR_SCANNER_TIMEOUT_MS;
    requireScannerBytes(JPEG);

    const { saveCollectionReceipt } = await import("../collection-receipt-base64-save-utils");
    const { saveMultipartCollectionReceipt } = await import("../collection-receipt-multipart-save-utils");
    const { CollectionReceiptSecurityError } = await import("../../lib/collection-receipt-security");
    const { COLLECTION_RECEIPT_DIR, resolveCollectionReceiptStoragePath } = await import("../../lib/collection-receipt-files");
    assert.equal(COLLECTION_RECEIPT_DIR, path.join(fixtureRoot, "uploads", "collection-receipts"));
    await fs.mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });

    const uploadPaths = [
      {
        name: "base64",
        save: (buffer: Buffer, fileName = "synthetic.jpg", mimeType = "image/jpeg") => saveCollectionReceipt({
          fileName, mimeType, contentBase64: buffer.toString("base64"),
        }),
      },
      {
        name: "multipart",
        save: (buffer: Buffer, fileName = "synthetic.jpg", mimeType = "image/jpeg") => saveMultipartCollectionReceipt({
          fileName, mimeType, stream: Readable.from([buffer]),
        }),
      },
    ];
    const assertNoFiles = async () => assert.deepEqual(await fs.readdir(COLLECTION_RECEIPT_DIR), []);
    const rejectsSecurityReason = (reason: string) => (error: unknown) =>
      error instanceof CollectionReceiptSecurityError && error.reasonCode === reason;

    for (const upload of uploadPaths) {
      await t.test(`${upload.name} persists only canonical JPEG bytes and scans those exact bytes`, async () => {
        for (const source of [JPEG, Buffer.concat([JPEG, FIXED_SUFFIX])]) {
          requireScannerBytes(JPEG);
          const before = Buffer.from(source);
          const stored = await upload.save(source);
          const resolved = resolveCollectionReceiptStoragePath(stored.storagePath);
          assert.ok(resolved?.isManagedCollectionReceipt);
          try {
            assert.deepEqual(await fs.readFile(resolved.absolutePath), JPEG);
            assert.equal(stored.fileSize, JPEG.length);
            assert.equal(stored.fileHash, sha256(JPEG));
            assert.equal(stored.originalMimeType, "image/jpeg");
            assert.equal(stored.originalExtension, ".jpg");
            assert.deepEqual(source, before, "The caller's original bytes must not be mutated.");
            assert.deepEqual(await fs.readdir(COLLECTION_RECEIPT_DIR), [path.basename(resolved.absolutePath)]);
          } finally {
            await fs.rm(resolved.absolutePath, { force: true });
          }
          await assertNoFiles();
        }
      });

      await t.test(`${upload.name} fails closed on scanner byte mismatch, rejection and operational failure`, async () => {
        for (const scenario of ["mismatch", "rejected", "unexpected-exit"] as const) {
          if (scenario === "mismatch") requireScannerBytes(JPEG, "0".repeat(64));
          else useScanner(`process.exit(${scenario === "rejected" ? 1 : 2})`);
          await assert.rejects(() => upload.save(JPEG), rejectsSecurityReason(
            scenario === "unexpected-exit" ? "external-scan-unexpected-exit" : "external-scan-rejected",
          ));
          await assertNoFiles();
        }
      });

      await t.test(`${upload.name} rejects extra payloads and a missing EOI without leaving files`, async () => {
        requireScannerBytes(JPEG);
        for (const [buffer, reason] of [
          [Buffer.concat([JPEG, JPEG]), "jpeg-trailing-data"],
          [Buffer.concat([JPEG, FIXED_SUFFIX, Buffer.from([1])]), "jpeg-trailing-data"],
          [JPEG.subarray(0, -2), "jpeg-eoi-missing"],
        ] as const) {
          await assert.rejects(() => upload.save(buffer), rejectsSecurityReason(reason));
          await assertNoFiles();
        }
      });

      await t.test(`${upload.name} rejects MIME and extension mismatches without leaving staged files`, async () => {
        requireScannerBytes(JPEG);
        for (const [fileName, mimeType, reason] of [
          ["synthetic.png", "image/jpeg", "receipt-extension-mismatch"],
          ["synthetic.jpg", "image/png", "receipt-mime-mismatch"],
          ["synthetic.exe", "image/jpeg", "receipt-extension-not-allowed"],
        ] as const) {
          await assert.rejects(() => upload.save(JPEG, fileName, mimeType), rejectsSecurityReason(reason));
          await assertNoFiles();
        }
      });

      await t.test(`${upload.name} enforces the raw five MiB limit before any JPEG normalization`, async () => {
        requireScannerBytes(JPEG);
        const oversized = Buffer.alloc(RAW_MAX_BYTES + 1);
        JPEG.copy(oversized);
        FIXED_SUFFIX.copy(oversized, JPEG.length);
        await assert.rejects(() => upload.save(oversized), /Receipt file exceeds 5MB\./);
        await assertNoFiles();
      });
    }
  } finally {
    process.chdir(previousDirectory);
    for (const key of ENV_KEYS) {
      const value = previousEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    assert.equal(path.dirname(fixtureRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixtureRoot).startsWith("sqr-jpeg-storage-"));
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});
