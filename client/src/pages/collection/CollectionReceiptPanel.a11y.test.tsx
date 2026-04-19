import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import { createEmptyCollectionReceiptDraft } from "@/pages/collection/receipt-validation";
import { assertNoAccessibilityViolations } from "@/test-utils/axe";

function renderWithinMain(node: ReturnType<typeof createElement>) {
  return `<!doctype html><html lang="ms"><body>${
    renderToStaticMarkup(createElement("main", { "aria-label": "Collection receipt accessibility preview" }, node))
  }</body></html>`;
}

test("CollectionReceiptPanel existing-receipt flow has no obvious axe violations", async () => {
  const html = renderWithinMain(
    createElement(CollectionReceiptPanel, {
      pending: {
        pendingFiles: [],
        inputRef: createRef<HTMLInputElement>(),
        onFileChange: () => undefined,
        onRemovePending: () => undefined,
        helperText: "Tambah receipt satu demi satu sebelum simpan.",
        uploadLabel: "Upload Receipt",
      },
      existing: {
        existingReceipts: [{
          id: "receipt-1",
          collectionRecordId: "collection-1",
          storagePath: "collection-receipts/receipt-1.pdf",
          originalFileName: "receipt-1.pdf",
          originalMimeType: "application/pdf",
          originalExtension: ".pdf",
          fileSize: 2048,
          receiptAmount: "12.50",
          extractedAmount: null,
          extractionStatus: "unprocessed",
          extractionConfidence: null,
          receiptDate: "2026-04-19",
          receiptReference: "INV-1001",
          fileHash: "abc123",
          createdAt: "2026-04-19T08:00:00.000Z",
        }],
        existingReceiptDrafts: [createEmptyCollectionReceiptDraft({
          draftLocalId: "receipt-1",
          receiptId: "receipt-1",
          receiptAmount: "12.50",
          receiptDate: "2026-04-19",
          receiptReference: "INV-1001",
          fileHash: "abc123",
        })],
        removedReceiptIds: [],
        onExistingDraftChange: () => undefined,
        onToggleRemoveExisting: () => undefined,
        onViewExisting: () => undefined,
      },
    }),
  );

  await assertNoAccessibilityViolations(html);
});
