import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import test from "node:test";

const CLIENT_SRC_DIR = fileURLToPath(new URL("../", import.meta.url));
const NULL_SUSPENSE_FALLBACK_PATTERN = /fallback\s*=\s*\{\s*null\s*\}/;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(fullPath.slice(fullPath.lastIndexOf(".")))) {
      files.push(fullPath);
    }
  }

  return files;
}

test("lazy Suspense boundaries avoid null fallbacks", () => {
  const matches = listSourceFiles(CLIENT_SRC_DIR)
    .filter((filePath) => NULL_SUSPENSE_FALLBACK_PATTERN.test(readFileSync(filePath, "utf8")))
    .map((filePath) => relative(CLIENT_SRC_DIR, filePath));

  assert.deepEqual(matches, []);
});

test("shared lazy fallback exposes a non-visual live status", () => {
  const source = readFileSync(join(CLIENT_SRC_DIR, "components", "LazySuspenseFallback.tsx"), "utf8");

  assert.match(source, /className="sr-only"/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-atomic="true"/);
});
