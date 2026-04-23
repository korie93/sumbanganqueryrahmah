import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSafeHttpUrl,
  resolveSafeNavigationUrl,
  resolveSafePreviewSourceUrl,
  resolveSafeUrl,
} from "./safe-url";

test("resolveSafeHttpUrl accepts same-origin relative and external http urls", () => {
  assert.equal(
    resolveSafeHttpUrl("/dev/mail-preview/example", { baseUrl: "https://sqr-system.com/current" }),
    "https://sqr-system.com/dev/mail-preview/example",
  );
  assert.equal(
    resolveSafeHttpUrl(
      "https://preview.example.test/message/123",
      { baseUrl: "https://sqr-system.com/current" },
    ),
    "https://preview.example.test/message/123",
  );
});

test("resolveSafeUrl rejects unsafe protocols", () => {
  assert.equal(
    resolveSafeUrl("javascript:alert(1)", {
      allowedProtocols: ["http:", "https:"],
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
  assert.equal(
    resolveSafeUrl("file:///c:/temp/test.txt", {
      allowedProtocols: ["http:", "https:", "blob:"],
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
});

test("resolveSafePreviewSourceUrl keeps preview sources same-origin and blocks data urls", () => {
  assert.equal(
    resolveSafePreviewSourceUrl("blob:https://sqr-system.com/receipt-id", {
      baseUrl: "https://sqr-system.com/current",
    }),
    "blob:https://sqr-system.com/receipt-id",
  );
  assert.equal(
    resolveSafePreviewSourceUrl("/receipts/current.png", {
      baseUrl: "https://sqr-system.com/current",
    }),
    "https://sqr-system.com/receipts/current.png",
  );
  assert.equal(
    resolveSafePreviewSourceUrl("https://preview.example.test/receipt.png", {
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
  assert.equal(
    resolveSafePreviewSourceUrl("data:image/png;base64,AAA=", {
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
  assert.equal(
    resolveSafePreviewSourceUrl("blob:https://preview.example.test/receipt-id", {
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
});

test("resolveSafeNavigationUrl keeps reload targets same-origin only", () => {
  assert.equal(
    resolveSafeNavigationUrl("/monitor?tab=alerts", { baseUrl: "https://sqr-system.com/current" }),
    "https://sqr-system.com/monitor?tab=alerts",
  );
  assert.equal(
    resolveSafeNavigationUrl("https://sqr-system.com/route#details", {
      baseUrl: "https://sqr-system.com/current",
    }),
    "https://sqr-system.com/route#details",
  );
  assert.equal(
    resolveSafeNavigationUrl("https://evil.example/phish", {
      baseUrl: "https://sqr-system.com/current",
    }),
    null,
  );
});
