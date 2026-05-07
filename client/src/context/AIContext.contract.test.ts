import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("AI context resetSession remains memoized with stable provider identity", () => {
  const source = readSource("AIContext.tsx");

  assert.match(source, /const resetSession = useCallback\(\(\) => \{/);
  assert.match(source, /setMessages\(\[\]\);/);
  assert.match(source, /setUnreadCount\(0\);/);
  assert.match(source, /\}, \[\]\);/);
  assert.match(source, /\[isThinking, messages, resetSession, unreadCount\]/);
  assert.doesNotMatch(source, /resetSession:\s*\(\)\s*=>\s*\{/);
});
