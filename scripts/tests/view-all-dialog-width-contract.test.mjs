import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const dialogPath = path.join(rootDir, "client", "src", "pages", "collection-records", "ViewAllRecordsDialog.tsx");

test("ViewAllRecordsDialog keeps a reviewed desktop max-width cap for ultra-wide screens", async () => {
  const source = await fs.readFile(dialogPath, "utf8");

  assert.match(source, /w-\[96vw\] max-w-\[112rem\]/);
});
