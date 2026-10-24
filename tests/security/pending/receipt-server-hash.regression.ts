import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreateReceiptInput,
  normalizeCollectionReceiptMetadata,
} from "../../../server/services/collection/collection-record-receipt-mutation-utils";

// Pending denial invariant; excluded from test:security:audit.
// Failed in the 2026-10-24 isolated WSL audit run. Keep the trusted-hash assertion.
test("caller receipt metadata must not replace a server-computed content identity", () => {
  const trustedHash = "a".repeat(64);
  const uploaded = {
    storagePath: "/uploads/collection-receipts/audit-only.png",
    originalFileName: "audit-only.png",
    originalMimeType: "image/png",
    originalExtension: ".png",
    fileSize: 1,
    fileHash: trustedHash,
  } as Parameters<typeof buildCreateReceiptInput>[0];
  for (const submittedHash of ["b".repeat(64), "c".repeat(64)]) {
    const metadata = normalizeCollectionReceiptMetadata({ fileHash: submittedHash });
    const merged = buildCreateReceiptInput(uploaded, metadata);
    assert.equal(merged.fileHash, trustedHash);
  }
});
