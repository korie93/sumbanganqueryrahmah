import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(path.join(repoRoot, "client/src/app/useAppShellSavedCount.ts"), "utf8");

test("app shell saved-count probe is cancellable and independent of page navigation", () => {
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /activeController\?\.abort\(\)/);
  assert.match(source, /getSavedImportCount\(\{ signal \}\)/);
  assert.match(
    source,
    /\}, \[savedCountIdentity, setSavedCount, userRole\]\);/,
  );
  assert.doesNotMatch(source, /currentPage\s*===/);
  assert.doesNotMatch(source, /\[[^\]]*currentPage[^\]]*\]/);
});

test("app shell saved-count refresh is mutation-driven and cleans up listeners and timers", () => {
  assert.match(
    source,
    /eventTarget\.addEventListener\(\s*SAVED_IMPORTS_CHANGED_EVENT,/,
  );
  assert.match(
    source,
    /eventTarget\.removeEventListener\(\s*SAVED_IMPORTS_CHANGED_EVENT,/,
  );
  assert.match(source, /SAVED_COUNT_REFRESH_DEBOUNCE_MS\s*=\s*150/);
  assert.match(source, /cancelScheduledRefresh\(scheduledRefresh\)/);
});
