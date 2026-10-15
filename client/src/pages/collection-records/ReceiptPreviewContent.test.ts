import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanupReceiptImagePreviewElement, ReceiptPreviewContent } from "@/pages/collection-records/ReceiptPreviewContent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("cleanupReceiptImagePreviewElement removes the source attribute only", () => {
  const removedAttributes: string[] = [];

  cleanupReceiptImagePreviewElement({
    removeAttribute: (name: string) => {
      removedAttributes.push(name);
    },
  });

  assert.deepEqual(removedAttributes, ["src"]);
});

test("receipt image cleanup avoids assigning an empty image source", () => {
  const source = readFileSync(path.resolve(__dirname, "ReceiptPreviewContent.tsx"), "utf8");

  assert.match(source, /cleanupReceiptImagePreviewElement\(image\)/);
  assert.doesNotMatch(source, /image\.src\s*=\s*""/);
});

test("receipt image preview declares dimensions and loads the active image eagerly", () => {
  const source = readFileSync(path.resolve(__dirname, "ReceiptPreviewContent.tsx"), "utf8");

  assert.match(source, /width=\{RECEIPT_IMAGE_BASE_DISPLAY_WIDTH_PX\}/);
  assert.match(source, /height=\{RECEIPT_IMAGE_BASE_DISPLAY_HEIGHT_PX\}/);
  assert.match(source, /loading="eager"/);
  assert.match(source, /new ResizeObserver\(updateLayout\)/);
  assert.doesNotMatch(source, /justify-center overflow-auto/);
  const css = readFileSync(path.resolve(__dirname, "receipt-preview-dialog.css"), "utf8");
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.doesNotMatch(css, /width:\s*min\(100%,/);
});

const previewProps = {
  loading: false,
  error: "",
  safeSource: null,
  hasUnsafeSource: false,
  showPdfFallback: false,
  kind: "image" as const,
  isMobile: true,
  zoomValue: "1",
  rotationDegrees: 0,
  fileName: "receipt.png",
  selectedReceipt: null,
};

test("receipt preview exposes loading and retryable errors to assistive technology", () => {
  const loading = renderToStaticMarkup(createElement(ReceiptPreviewContent, { ...previewProps, loading: true }));
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /Loading preview/);
  const error = renderToStaticMarkup(createElement(ReceiptPreviewContent, { ...previewProps, error: "Unable to fetch receipt", onRetry: () => undefined }));
  assert.match(error, /role="alert"/);
  assert.match(error, /Unable to fetch receipt/);
  assert.match(error, /Retry preview/);
});

test("mobile PDF fallback delegates its actions to the single dialog footer", () => {
  const markup = renderToStaticMarkup(createElement(ReceiptPreviewContent, {
    ...previewProps,
    kind: "pdf",
    safeSource: "blob:http://localhost/receipt",
    showPdfFallback: true,
  }));
  assert.match(markup, /PDF ready to open/);
  assert.doesNotMatch(markup, /<a\b|<button\b/);
});

test("desktop PDF does not hide ready bytes behind unreliable native load events", () => {
  const markup = renderToStaticMarkup(createElement(ReceiptPreviewContent, {
    ...previewProps,
    kind: "pdf",
    isMobile: false,
    safeSource: "blob:https://app.sqr.invalid/receipt",
  }));
  assert.match(markup, /title="Receipt PDF Preview"/);
  assert.doesNotMatch(markup, /Opening PDF preview|aria-busy="true"|pointer-events-none/);
});
