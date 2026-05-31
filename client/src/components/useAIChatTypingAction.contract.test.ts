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
    /clearTypingInterval\(\);\s*stopTyping\(\);\s*setIsTyping\(true\);[\s\S]*typingIntervalRef\.current = setManagedInterval/,
  );
  assert.doesNotMatch(source, /window\.setInterval/);
});

test("AI chat typing action clears the interval on inactive and completion paths", () => {
  assert.match(
    source,
    /if \(!isActiveAIChatSession\([\s\S]*?\)\) \{\s*clearTypingInterval\(\);\s*stopTyping\(\);\s*return;/,
  );
  assert.match(
    source,
    /if \(index >= text\.length\) \{\s*clearTypingInterval\(\);\s*stopTyping\(\);/,
  );
});
