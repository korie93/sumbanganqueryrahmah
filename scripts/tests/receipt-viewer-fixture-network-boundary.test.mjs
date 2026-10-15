import assert from "node:assert/strict";
import test from "node:test";
import { isChromiumPdfViewerResource } from "../../tests/visual/helpers/chromium-pdf-resources.ts";

test("receipt fixtures recognize only Chrome's internal PDF viewer resources", () => {
  for (const address of [
    "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/pdf_embedder.css",
    "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/pdf_viewer_wrapper.js",
    "chrome://resources/css/text_defaults_md.css",
  ]) assert.equal(isChromiumPdfViewerResource(new URL(address)), true, address);
});

test("receipt fixture exception does not permit external or unrelated origins", () => {
  for (const address of [
    "https://example.test/pdf_embedder.css",
    "http://127.0.0.1:5000/renderer.js",
    "https://mhjfbmdgcfjbbpaeojofohoefgiehjai/pdf_embedder.css",
    "chrome-extension://other-extension/pdf_embedder.css",
    "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai.example.test/main.js",
    "chrome-extension://user:password@mhjfbmdgcfjbbpaeojofohoefgiehjai/main.js",
    "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai:8000/main.js",
    "chrome://settings/",
    "chrome://resources.example.test/main.js",
    "data:text/javascript,void(0)",
    "blob:https://example.test/synthetic",
  ]) assert.equal(isChromiumPdfViewerResource(new URL(address)), false, address);
});
