import assert from "node:assert/strict";
import test from "node:test";

import {
  mobileFullscreenDialogViewportClassName,
  viewportSafeDialogMaxHeightClassName,
} from "./dialog-viewport";

test("dialog viewport contracts use the shared viewport token instead of raw dvh values", () => {
  assert.match(
    viewportSafeDialogMaxHeightClassName,
    /var\(--viewport-min-height-value\)/,
  );
  assert.doesNotMatch(viewportSafeDialogMaxHeightClassName, /100dvh/);

  assert.match(
    mobileFullscreenDialogViewportClassName,
    /var\(--viewport-min-height-value\)/,
  );
  assert.doesNotMatch(mobileFullscreenDialogViewportClassName, /100dvh/);
});
