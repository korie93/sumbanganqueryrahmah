import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentDispositionHeader,
  sanitizeContentDispositionFilename,
} from "../content-disposition";

test("sanitizeContentDispositionFilename strips header-breaking characters", () => {
  assert.equal(
    sanitizeContentDispositionFilename('report"\r\nSet-Cookie: boom.txt'),
    "reportSet-Cookie: boom.txt",
  );
  assert.equal(
    sanitizeContentDispositionFilename("../unsafe\\path.txt"),
    ".._unsafe_path.txt",
  );
});

test("buildContentDispositionHeader always returns a quoted safe filename", () => {
  assert.equal(
    buildContentDispositionHeader("attachment", 'sample"\r\n.txt'),
    'attachment; filename="sample.txt"',
  );
  assert.equal(
    buildContentDispositionHeader("inline", "", "receipt"),
    'inline; filename="receipt"',
  );
});
