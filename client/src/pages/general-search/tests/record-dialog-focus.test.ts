import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("lazy record dialog restores its originating result, not a related-record control", () => {
  const page = readFileSync(path.resolve("client/src/pages/GeneralSearch.tsx"), "utf8");
  const dialog = readFileSync(path.resolve("client/src/pages/general-search/GeneralSearchRecordDialog.tsx"), "utf8");
  assert.match(page, /recordTriggerRef\.current = document\.activeElement/);
  assert.match(page, /onRecordSelect=\{selectResultRecord\}/);
  assert.match(page, /onCloseAutoFocus=\{restoreRecordTriggerFocus\}/);
  assert.match(page, /if \(trigger\?\.isConnected\)/);
  assert.match(page, /trigger\.focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /<GeneralSearchRecordDialog[\s\S]*onRecordSelect=\{actions\.setSelectedRecord\}/);
  assert.match(dialog, /onCloseAutoFocus=\{onCloseAutoFocus\}/);
});
