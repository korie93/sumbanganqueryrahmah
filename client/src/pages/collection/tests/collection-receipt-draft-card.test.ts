import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionReceiptDraftCard } from "../CollectionReceiptDraftCard";
import { resolveCollectionReceiptPendingStatusCopy } from "../collection-receipt-pending-status";
import type { CollectionReceiptDraftPreview } from "../useCollectionReceiptDraftPreviews";

function renderCard(overrides: Partial<CollectionReceiptDraftPreview> = {}, disabled = false) {
  return renderToStaticMarkup(createElement(CollectionReceiptDraftCard, {
    preview: {
      key: "test-receipt",
      file: new File(["synthetic image"], "receipt.png", { type: "image/png" }),
      kind: "image",
      url: "blob:https://app.sqr.invalid/synthetic-preview",
      width: 480,
      height: 960,
      ...overrides,
    },
    index: 0,
    totalCount: 2,
    draft: { draftLocalId: "test-receipt", receiptAmount: "120.50", receiptDate: "2026-10-06", receiptReference: "TEST-REFERENCE-ONLY" },
    disabled,
    pendingStatus: "pending",
    pendingStatusCopy: resolveCollectionReceiptPendingStatusCopy("pending"),
    willReplace: false,
    onDraftChange: () => {},
    onRemove: () => {},
  }));
}

test("receipt cards start compact with a named image size toggle and visible metadata", () => {
  const html = renderCard();
  assert.match(html, /h-32 w-32/);
  assert.doesNotMatch(html, /min-h-72/);
  assert.match(html, /aria-label="Lihat besar resit 1"/);
  assert.match(html, /aria-expanded="false"/);
  const previewId = /<img id="([^"]+)"/.exec(html)?.[1];
  assert.ok(previewId);
  assert.ok(html.includes(`aria-controls="${previewId}"`));
  for (const value of ["120.50", "2026-10-06", "TEST-REFERENCE-ONLY"]) {
    assert.ok(html.includes(`value="${value}"`));
  }
  assert.match(html, /Receipt 1 of 2/);
  assert.match(html, /Remove/);
});

test("PDF cards retain type and editable details without a tall empty image area", () => {
  const html = renderCard({
    kind: "pdf", url: "", width: 0, height: 0,
    file: new File(["synthetic PDF"], "receipt.pdf", { type: "application/pdf" }),
  });
  assert.match(html, /PDF/);
  assert.match(html, /receipt.pdf/);
  assert.match(html, /value="TEST-REFERENCE-ONLY"/);
  assert.doesNotMatch(html, /<img|<iframe|<object|<embed|Lihat besar|min-h-72/);
});

test("unavailable or unsafe previews do not offer enlargement or embed unsafe content", () => {
  for (const url of ["", "javascript:alert(1)"]) {
    const html = renderCard({ url });
    assert.doesNotMatch(html, /<img|Lihat besar|javascript:/);
    assert.match(html, /value="120.50"/);
  }
});

test("receipt busy state still disables mutation controls and preview toggle", () => {
  const html = renderCard({}, true);
  const toggle = html.match(/<button[^>]*aria-label="Lihat besar resit 1"[^>]*>/)?.[0];
  assert.ok(toggle);
  assert.match(toggle, /disabled=""/);
  assert.match(html, /<input[^>]*id="pending-receipt-amount-0"[^>]*disabled=""/);
  assert.match(html, /<input[^>]*id="pending-receipt-date-0"[^>]*disabled=""/);
  assert.match(html, /<input[^>]*id="pending-receipt-reference-0"[^>]*disabled=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*><svg[^>]*class="[^"]*lucide-trash2/);
});
