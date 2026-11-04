import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(__dirname, "useAIChatTypingAction.ts"), "utf8");

test("AI chat typing action clears any previous interval before starting a new one", () => {
  assert.match(
    source,
    /clearTypingInterval\(\);\s*stopTyping\(\);\s*setIsTyping\(true\);[\s\S]*const timerId = setManagedInterval/,
  );
  assert.doesNotMatch(source, /window\.setInterval/);
});

test("AI chat typing action clears its own inactive interval and guards completion against stale sessions", () => {
  assert.match(
    source,
    /if \(typingIntervalRef\.current !== timerId \|\| !canApplyAIChatUiUpdate\([\s\S]*?\)\) \{\s*clearManagedInterval\(timerId\);/,
  );
  assert.match(
    source,
    /const finish = \(\) => \{\s*if \(!canApplyAIChatUiUpdate\([\s\S]*?\)\) return;\s*clearTypingInterval\(\);\s*stopTyping\(\);/,
  );
  assert.match(source, /prefersReducedAIResponseMotion\(\) \|\| nextIndex >= text\.length/);
});
