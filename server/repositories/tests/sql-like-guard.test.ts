import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPOSITORIES_DIR = path.resolve(import.meta.dirname, "..");
const FORBIDDEN_PATTERNS = [
  " ILIKE ${`%",
  " LIKE ${`%",
];

function listRepositorySourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "tests") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRepositorySourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

test("repository SQL search clauses do not build raw wildcard patterns inline", () => {
  const offendingMatches: string[] = [];

  for (const filePath of listRepositorySourceFiles(REPOSITORIES_DIR)) {
    const contents = readFileSync(filePath, "utf8");

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (contents.includes(pattern)) {
        offendingMatches.push(`${path.relative(REPOSITORIES_DIR, filePath)} :: ${pattern.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offendingMatches,
    [],
    `Found unsafe raw LIKE/ILIKE wildcard construction:\n${offendingMatches.join("\n")}`,
  );
});
