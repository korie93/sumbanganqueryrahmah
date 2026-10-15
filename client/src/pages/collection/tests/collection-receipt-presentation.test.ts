import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionRecordReceipt } from "@/lib/api";
import { CollectionReceiptPanel } from "../CollectionReceiptPanel";

type PanelProps = ComponentProps<typeof CollectionReceiptPanel>;
const noop = () => undefined;
const source = readFileSync(new URL("../CollectionReceiptPanel.tsx", import.meta.url), "utf8");

function renderPanel(overrides: Partial<PanelProps> = {}, withClearPending = true) {
  return renderToStaticMarkup(createElement(CollectionReceiptPanel, {
    pendingFiles: [],
    inputRef: { current: null },
    onFileChange: noop,
    onRemovePending: noop,
    ...(withClearPending ? { onClearPending: noop } : {}),
    ...overrides,
  }));
}

function buttonTag(markup: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markup.match(new RegExp(`<button\\b[^>]*>(?:(?!<button\\b)[\\s\\S])*?${escapedLabel}</button>`))?.[0];
}

function assertSingleFilePicker(markup: string) {
  const fileInputs = markup.match(/<input\b[^>]*type="file"[^>]*>/g) || [];
  assert.equal(fileInputs.length, 1);
  const input = fileInputs[0];
  const inputId = input.match(/id="([^"]+)"/)?.[1];
  const helperId = markup.match(/<p id="([^"]+-help)"/)?.[1];
  assert.ok(inputId);
  assert.ok(helperId);
  assert.ok(markup.includes(`for="${inputId}"`));
  assert.match(input, /name="collectionReceiptUpload"/);
  assert.match(input, /accept="\.jpg,\.jpeg,\.png,\.webp,\.pdf"/);
  assert.doesNotMatch(input, /\bmultiple(?:=|\s|>)/);
  assert.ok(input.includes(`aria-describedby="${helperId}"`));
  const upload = buttonTag(markup, "Upload Receipt");
  assert.ok(upload);
  assert.match(upload, /type="button"/);
  assert.ok(upload.includes(`aria-describedby="${helperId}"`));
  assert.equal((markup.match(/>Upload Receipt<\/button>/g) || []).length, 1);
  return { input, upload };
}

test("implicit default is identical to explicit default and retains its original compact picker", () => {
  const implicit = renderPanel();
  assert.equal(implicit, renderPanel({ presentation: "default" }));
  assertSingleFilePicker(implicit);
  assert.match(implicit, /flex flex-wrap items-center gap-2/);
  assert.match(implicit, /JPG, JPEG, PNG, WEBP or PDF, up to 5MB each/);
  assert.equal((implicit.match(/No pending receipt\./g) || []).length, 1);
  assert.doesNotMatch(implicit, /lucide-cloud-upload|min-h-44/);
});

test("workspace has one real upload target and one truthful empty message without unsupported drop copy", () => {
  const markup = renderPanel({ presentation: "workspace" });
  assertSingleFilePicker(markup);
  assert.match(markup, /lucide-cloud-upload/);
  assert.match(markup, /save-collection-receipt-upload-zone--empty/);
  assert.match(markup, /border-dashed/);
  assert.equal((markup.match(/No pending receipt\./g) || []).length, 1);
  assert.doesNotMatch(markup, /drag|drop|seret/i);
  const clear = buttonTag(markup, "Clear Pending");
  assert.ok(clear);
  assert.match(clear, /disabled=""/);
  assert.match(source, /onClick=\{\(\) => inputRef\.current\?\.click\(\)\}/);
  assert.match(source, /onChange=\{onFileChange\}/);
});

test("workspace never claims empty while selected files await asynchronous preview generation", () => {
  // Effects do not run during SSR: the preview hook still returns [], while the selected file is real.
  const file = new File(["synthetic PDF only"], "pending.pdf", { type: "application/pdf" });
  const markup = renderPanel({ presentation: "workspace", pendingFiles: [file] });
  assertSingleFilePicker(markup);
  assert.doesNotMatch(markup, /No pending receipt\./);
  assert.doesNotMatch(markup, /save-collection-receipt-upload-zone--empty/);
  assert.match(markup, /Pending Upload 1/);
  const clear = buttonTag(markup, "Clear Pending");
  assert.ok(clear);
  assert.doesNotMatch(clear, /disabled=""/);
});

test("both presentations keep the picker and all receipt mutation controls disabled when busy", () => {
  for (const presentation of ["default", "workspace"] as const) {
    const markup = renderPanel({ presentation, disabled: true });
    const { input, upload } = assertSingleFilePicker(markup);
    assert.match(input, /disabled=""/);
    assert.match(upload, /disabled=""/);
    assert.match(buttonTag(markup, "Clear Pending") || "", /disabled=""/);
  }
});

test("generic receipt clear controls retain one optional action and remain disabled for selected files when busy", () => {
  const file = new File(["synthetic PDF only"], "pending.pdf", { type: "application/pdf" });
  for (const presentation of ["default", "workspace"] as const) {
    const withoutAction = renderPanel({ presentation, pendingFiles: [file] }, false);
    assert.doesNotMatch(withoutAction, /Clear Pending/);
    assertSingleFilePicker(withoutAction);

    const busy = renderPanel({ presentation, pendingFiles: [file], disabled: true });
    assert.equal((busy.match(/Clear Pending<\/button>/g) || []).length, 1);
    assert.match(buttonTag(busy, "Clear Pending") || "", /disabled=""/);
  }
});

test("both presentations retain existing receipt actions, metadata identifiers and undo removal", () => {
  const receipt = {
    id: "synthetic-receipt-1", originalFileName: "existing.pdf", originalMimeType: "application/pdf", fileSize: 100,
  } as CollectionRecordReceipt;
  for (const presentation of ["default", "workspace"] as const) {
    for (const removed of [false, true]) {
      const markup = renderPanel({
        presentation,
        existingReceipts: [receipt],
        existingReceiptDrafts: [{ draftLocalId: receipt.id, receiptId: receipt.id, receiptAmount: "12.50", receiptDate: "2026-10-15", receiptReference: "SYNTHETIC" }],
        removedReceiptIds: removed ? [receipt.id] : [],
        onViewExisting: noop,
        onToggleRemoveExisting: noop,
        onExistingDraftChange: noop,
      });
      assert.ok(buttonTag(markup, "View"));
      assert.ok(buttonTag(markup, removed ? "Undo Remove" : "Remove"));
      for (const field of ["amount", "date", "reference"]) {
        assert.ok(markup.includes(`id="existing-receipt-${field}-${receipt.id}"`));
        assert.ok(markup.includes(`aria-label="Existing receipt ${field} for existing.pdf"`));
      }
      assert.match(markup, /value="12\.50"/);
      assert.match(markup, /value="2026-10-15"/);
      assert.match(markup, /value="SYNTHETIC"/);
      if (removed) {
        assert.match(markup, /Will Remove/);
        assert.match(markup, /Ditanda untuk buang selepas Save/);
        assert.match(markup, /id="existing-receipt-amount-synthetic-receipt-1"[^>]*disabled=""/);
      }
    }
  }
});
