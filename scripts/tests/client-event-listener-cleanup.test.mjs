import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const clientSrcRoot = path.join(repoRoot, "client", "src");
const anonymousListenerPattern =
  /addEventListener\s*\([^,\n]+,\s*(?:\([^)]*\)\s*=>|function\s*(?:\(|$))/g;

function listClientSourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listClientSourceFiles(absolutePath));
      continue;
    }

    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

test("frontend production event listeners use removable handler references", () => {
  const violations = [];

  for (const filePath of listClientSourceFiles(clientSrcRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    const matches = source.matchAll(anonymousListenerPattern);
    for (const match of matches) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      violations.push(`${path.relative(repoRoot, filePath)}:${line}: ${match[0]}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("collection records nickname abort listener is removed after request settles", () => {
  const source = fs.readFileSync(
    path.join(clientSrcRoot, "pages", "collection-records", "useCollectionRecordsQueryState.ts"),
    "utf8",
  );

  assert.match(source, /const handleCallerAbort = \(\) => \{/);
  assert.match(source, /callerSignal\.addEventListener\("abort", handleCallerAbort, \{ once: true \}\)/);
  assert.match(source, /callerSignal\.removeEventListener\("abort", handleCallerAbort\)/);
  assert.match(source, /removeCallerAbortListener\?\.\(\);/);
});
