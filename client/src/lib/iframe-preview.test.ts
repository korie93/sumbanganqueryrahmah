import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCUMENT_PREVIEW_IFRAME_SANDBOX,
  PDF_PREVIEW_IFRAME_SANDBOX,
  PREVIEW_IFRAME_REFERRER_POLICY,
  getSandboxedPreviewIframeProps,
  resolveSafeInlineIframePreviewUrl,
} from "./iframe-preview";

test("resolveSafeInlineIframePreviewUrl limits inline previews to trusted same-origin content", () => {
  assert.equal(
    resolveSafeInlineIframePreviewUrl("/dev/mail-preview/example", {
      baseUrl: "https://sqr-system.com/current",
    }),
    "https://sqr-system.com/dev/mail-preview/example",
  );
  assert.equal(
    resolveSafeInlineIframePreviewUrl("https://preview.example.test/receipt.pdf", {
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
  assert.equal(
    resolveSafeInlineIframePreviewUrl("blob:https://sqr-system.com/receipt-id", {
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
  assert.equal(
    resolveSafeInlineIframePreviewUrl("blob:https://sqr-system.com/receipt-id", {
      allowBlob: true,
      baseUrl: "https://sqr-system.com/current",
    }),
    "blob:https://sqr-system.com/receipt-id",
  );
});

test("getSandboxedPreviewIframeProps keeps preview frames locked down by content type", () => {
  assert.equal(DOCUMENT_PREVIEW_IFRAME_SANDBOX, "");
  assert.equal(PDF_PREVIEW_IFRAME_SANDBOX, "allow-downloads allow-same-origin allow-scripts");
  assert.equal(PREVIEW_IFRAME_REFERRER_POLICY, "no-referrer");

  assert.deepEqual(getSandboxedPreviewIframeProps("document"), {
    referrerPolicy: "no-referrer",
    sandbox: "",
  });
  assert.deepEqual(getSandboxedPreviewIframeProps("pdf"), {
    referrerPolicy: "no-referrer",
    sandbox: "allow-downloads allow-same-origin allow-scripts",
  });
});
