import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionRecord, CollectionRecordReceipt } from "@/lib/api";
import { ReceiptPreviewSelector } from "../ReceiptPreviewSelector";
import { ReceiptPreviewToolbar } from "../ReceiptPreviewToolbar";
import { ReceiptPreviewRecordDetails } from "../ReceiptPreviewRecordDetails";

const receipts = [
  { id: "first", originalFileName: "bank-transfer.png", originalMimeType: "image/png" },
  { id: "second", originalFileName: "cash-receipt.pdf", originalMimeType: "application/pdf" },
] as CollectionRecordReceipt[];

test("receipt choices expose filenames, count and the selected pressed state", () => {
  const markup = renderToStaticMarkup(createElement(ReceiptPreviewSelector, {
    receipts,
    selectedReceipt: receipts[1],
    loading: true,
    isMobile: true,
    onSelectReceipt: () => undefined,
  }));
  assert.match(markup, /Receipt 2 of 2/);
  assert.match(markup, /aria-label="Choose receipt" aria-busy="true"/);
  const buttons = markup.match(/<button\b[^>]*>/g) || [];
  assert.equal(buttons.length, 2);
  assert.match(buttons[0], /aria-label="Receipt 1: bank-transfer.png"/);
  assert.match(buttons[0], /aria-pressed="false"/);
  assert.match(buttons[1], /aria-label="Receipt 2: cash-receipt.pdf"/);
  assert.match(buttons[1], /aria-pressed="true"/);
  assert.doesNotMatch(markup, /disabled=/);
});

test("details toggle controls the actual record details region and zoom is clearly named", () => {
  const detailsId = "receipt-details-test";
  const toolbar = renderToStaticMarkup(createElement(ReceiptPreviewToolbar, {
    detailsId,
    showDetails: false,
    setShowDetails: () => undefined,
    canShowDetails: true,
    canZoom: true,
    zoom: 1.5,
    setZoom: () => undefined,
    setRotationDegrees: () => undefined,
    isMobile: true,
  }));
  assert.match(toolbar, /aria-expanded="false" aria-controls="receipt-details-test"/);
  assert.match(toolbar, /150% fit/);
  assert.match(toolbar, /aria-label="Fit receipt to viewer width"/);
  assert.match(toolbar, /aria-label="Zoom in"/);
  assert.match(toolbar, /aria-label="Zoom out"/);
  assert.doesNotMatch(toolbar, /Open PDF|Receipt info hidden|Show more/);

  const record = { customerName: "Customer", paymentDate: "2026-10-01", amount: "20.00", receiptTotalAmount: "20.00" } as CollectionRecord;
  const closed = renderToStaticMarkup(createElement(ReceiptPreviewRecordDetails, { id: detailsId, record, selectedReceipt: receipts[0], showDetails: false, isMobile: true }));
  const open = renderToStaticMarkup(createElement(ReceiptPreviewRecordDetails, { id: detailsId, record, selectedReceipt: receipts[0], showDetails: true, isMobile: true }));
  assert.match(closed, /id="receipt-details-test" role="region" aria-label="Receipt and collection details" hidden=""/);
  assert.doesNotMatch(open, /hidden=""/);
  assert.match(open, /tabindex="0"/);
  assert.match(open, /focus-visible:ring-2/);
  assert.match(open, /Customer/);
  assert.match(open, /bank-transfer.png/);
});
