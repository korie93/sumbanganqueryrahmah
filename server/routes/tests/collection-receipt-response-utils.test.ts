import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import {
  applyCollectionReceiptResponseHeaders,
  sanitizeReceiptRouteParamForLog,
  sanitizeReceiptResponseFileName,
} from "../collection-receipt-response-utils";

function createHeaderCaptureResponse() {
  const headers = new Map<string, string>();
  const res = {
    setHeader(name: string, value: number | string | readonly string[]) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
      return res;
    },
  };

  return {
    headers,
    res: res as unknown as Response,
  };
}

test("collection receipt response headers lock down downloads", () => {
  const { headers, res } = createHeaderCaptureResponse();

  applyCollectionReceiptResponseHeaders({
    res,
    mode: "download",
    mimeType: "application/pdf",
    safeFileName: "receipt.pdf",
  });

  assert.equal(headers.get("content-type"), "application/pdf");
  assert.equal(headers.get("content-disposition"), 'attachment; filename="receipt.pdf"');
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.match(headers.get("content-security-policy") || "", /default-src 'none'/);
  assert.match(headers.get("content-security-policy") || "", /script-src 'none'/);
  assert.match(headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal(headers.get("cache-control"), "no-store, no-cache, must-revalidate, private");
  assert.equal(headers.get("pragma"), "no-cache");
  assert.equal(headers.get("cross-origin-resource-policy"), "same-origin");
});

test("collection receipt response headers preserve inline preview disposition", () => {
  const { headers, res } = createHeaderCaptureResponse();

  applyCollectionReceiptResponseHeaders({
    res,
    mode: "view",
    mimeType: "image/png",
    safeFileName: "preview.png",
  });

  assert.equal(headers.get("content-disposition"), 'inline; filename="preview.png"');
  assert.equal(headers.get("x-frame-options"), "DENY");
});

test("receipt response filenames are sanitized at the header boundary", () => {
  assert.equal(sanitizeReceiptResponseFileName("unsafe receipt (April)#1?.pdf"), "unsafe_receipt_April_1_.pdf");
  assert.equal(sanitizeReceiptResponseFileName("../secret.pdf"), "._secret.pdf");
  assert.equal(sanitizeReceiptResponseFileName("safe\r\nSet-Cookie:evil.pdf"), "safe_Set-Cookie_evil.pdf");
  assert.equal(sanitizeReceiptResponseFileName(""), "receipt");
  assert.equal(sanitizeReceiptResponseFileName("a".repeat(300)).length, 255);
});

test("receipt route parameters are sanitized before structured logging", () => {
  assert.equal(sanitizeReceiptRouteParamForLog(" collection-1\r\nSet-Cookie:evil "), "collection-1 Set-Cookie:evil");
  assert.equal(sanitizeReceiptRouteParamForLog(["collection-1", "collection-2"]), "[multi-value]");
  assert.equal(sanitizeReceiptRouteParamForLog(""), null);
  assert.equal(sanitizeReceiptRouteParamForLog("a".repeat(300))?.length, 128);
});
