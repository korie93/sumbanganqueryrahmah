import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  mobileFullscreenDialogViewportClassName,
  viewportSafeDialogMaxHeightClassName,
  viewportSafeSheetMaxHeightClassName,
} from "./dialog-viewport";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  assert.match(
    viewportSafeSheetMaxHeightClassName,
    /var\(--viewport-min-height-value\)/,
  );
  assert.doesNotMatch(viewportSafeSheetMaxHeightClassName, /100dvh/);
});

test("bottom sheet viewport contract is centralized and does not use raw dvh", () => {
  const sheetSource = readFileSync(path.resolve(__dirname, "sheet.tsx"), "utf8");

  assert.match(sheetSource, /viewportSafeSheetMaxHeightClassName/);
  assert.doesNotMatch(sheetSource, /max-h-\[[^\]]*dvh/);
});

test("nested alert backdrops can opt into the parent layer without changing shared defaults", () => {
  const source = readFileSync(path.resolve(__dirname, "alert-dialog.tsx"), "utf8");
  assert.match(source, /overlayClassName\?: string/);
  assert.match(source, /\(\{ className, overlayClassName, \.\.\.props \}, ref\)/);
  assert.match(source, /<AlertDialogOverlay className=\{overlayClassName\} \/>/);
  assert.match(source, /z-\[var\(--z-modal-overlay\)\]/);
  assert.match(source, /z-\[var\(--z-modal-content\)\]/);
  assert.doesNotMatch(source, /overlayClassName\s*=/); // Overrides are optional, never a new global default.
});
