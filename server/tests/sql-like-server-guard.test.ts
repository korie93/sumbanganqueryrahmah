import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const FORBIDDEN_PATTERNS = [
  " ILIKE ${`%",
  " LIKE ${`%",
];
const SKIPPED_DIRECTORY_NAMES = new Set([
  "repositories",
  "tests",
]);

function listServerSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listServerSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

test("non-repository server SQL code does not build raw wildcard patterns inline", () => {
  const offendingMatches: string[] = [];

  for (const filePath of listServerSourceFiles(SERVER_DIR)) {
    const contents = readFileSync(filePath, "utf8");

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (contents.includes(pattern)) {
        offendingMatches.push(`${path.relative(SERVER_DIR, filePath)} :: ${pattern.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offendingMatches,
    [],
    `Found unsafe raw LIKE/ILIKE wildcard construction outside repositories:\n${offendingMatches.join("\n")}`,
  );
});
