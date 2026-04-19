import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = process.cwd();
const dialogPath = path.resolve(rootDir, "client/src/components/ui/dialog.tsx");
const alertDialogPath = path.resolve(rootDir, "client/src/components/ui/alert-dialog.tsx");

test("dialog primitives use a mobile-safe width expression that avoids raw 100vw overflow", () => {
  const dialogSource = readFileSync(dialogPath, "utf8");
  const alertDialogSource = readFileSync(alertDialogPath, "utf8");

  assert.match(dialogSource, /w-\[min\(calc\(100%-1rem\),calc\(100vw-1rem\)\)\]/);
  assert.match(alertDialogSource, /w-\[min\(calc\(100%-1rem\),calc\(100vw-1rem\)\)\]/);
  assert.doesNotMatch(dialogSource, /w-\[calc\(100vw-1rem\)\]/);
  assert.doesNotMatch(alertDialogSource, /w-\[calc\(100vw-1rem\)\]/);
});
