import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExpandableMessageParts,
  EXPANDABLE_MESSAGE_PREVIEW_LIMIT,
} from "./expandable-message-utils";

test("buildExpandableMessageParts keeps short messages unchanged", () => {
  const parts = buildExpandableMessageParts("  Sila cuba semula.  ");

  assert.equal(parts.isTruncated, false);
  assert.equal(parts.fullText, "Sila cuba semula.");
  assert.equal(parts.previewText, "Sila cuba semula.");
});

test("buildExpandableMessageParts preserves the full message behind a bounded preview", () => {
  const longMessage = `Ralat muat naik: ${"butiran teknikal selamat ".repeat(20)}`;
  const parts = buildExpandableMessageParts(longMessage);

  assert.equal(parts.isTruncated, true);
  assert.equal(parts.fullText, longMessage.trim());
  assert.ok(parts.previewText.length <= EXPANDABLE_MESSAGE_PREVIEW_LIMIT);
  assert.match(parts.previewText, /\.\.\.$/);
});
