import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionRecordsSourceDir = path.resolve(__dirname, "..");

test("collection records receipt preview clears stale source before revoking object url", () => {
  const source = readFileSync(
    path.join(collectionRecordsSourceDir, "useCollectionReceiptPreview.ts"),
    "utf8",
  );

  assert.match(
    source,
    /setReceiptPreviewError\(""\);\s*setReceiptPreviewSource\(""\);\s*clearReceiptPreviewObjectUrl\(\);/s,
  );
});

test("collection records receipt download ignores stale async completions", () => {
  const source = readFileSync(
    path.join(collectionRecordsSourceDir, "useCollectionReceiptPreview.ts"),
    "utf8",
  );

  assert.match(
    source,
    /const isCurrent = \(\) => !controller\.signal\.aborted && isMountedRef\.current && receiptDownloadAbortControllerRef\.current === controller/s,
  );
  assert.match(
    source,
    /if \(isAbortError\(error\) \|\| !isCurrent\(\)\) return/,
  );
  assert.match(
    source,
    /if \(isCurrent\(\)\) \{\s*receiptDownloadAbortControllerRef\.current = null;\s*setReceiptPreviewDownloading\(false\);/s,
  );
  assert.doesNotMatch(source, /if \(isMountedRef\.current\) \{\s*setReceiptPreviewDownloading\(false\);/s);
  const requests = readFileSync(path.join(collectionRecordsSourceDir, "receipt-preview-image-detail.ts"), "utf8");
  assert.match(requests, /if \(isCurrent\(\)\) downloadBlob\(blob, fileName \|\| fallbackFileName \|\| "receipt"\)/);
});

test("retry runs the authenticated preview loader and retains cleanup guards", () => {
  const source = readFileSync(path.join(collectionRecordsSourceDir, "useCollectionReceiptPreview.ts"), "utf8");
  assert.match(source, /onRetry: retryReceiptPreview/);
  assert.match(source, /setReceiptPreviewRetryAttempt\(\(attempt\) => attempt \+ 1\)/);
  assert.match(source, /receiptPreviewRecord,\s*receiptPreviewRetryAttempt,\s*selectedPreviewReceipt,/);
  assert.match(source, /const \{ prepareReceiptPreview \} = await import\("\.\/receipt-preview-image-detail"\)/);
  const requests = readFileSync(path.join(collectionRecordsSourceDir, "receipt-preview-image-detail.ts"), "utf8");
  assert.match(requests, /fetchCollectionReceiptBlob\(recordId, "view", receiptId, \{ signal \}\)/);
  assert.match(source, /activeRequestId === receiptPreviewRequestIdRef\.current/);
  assert.match(source, /isMountedRef\.current = true;\s*return \(\) =>/);
});
