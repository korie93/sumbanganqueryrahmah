import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(path.join(repoRoot, "client/src/app/useAppShellSavedCount.ts"), "utf8");

test("app shell saved-count probe is cancellable and skips the saved page", () => {
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal:\s*controller\.signal/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /currentPage\s*===\s*"saved"/);
});
