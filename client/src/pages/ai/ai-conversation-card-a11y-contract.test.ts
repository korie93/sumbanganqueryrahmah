import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("AI conversation card uses Malay labels and exposes a formal textarea label", () => {
  const source = readSource("AIConversationCard.tsx");

  assert.match(source, /<label htmlFor="ai-conversation-query" className="sr-only">/);
  assert.match(source, /assistantLabel: string/);
  assert.match(source, /Taip soalan kepada \{assistantLabel\}/);
  assert.match(source, /Pembantu AI dinyahaktifkan oleh tetapan sistem\./);
  assert.match(source, /Hentikan AI/);
  assert.match(source, /Sembang Baharu/);
  assert.match(source, /\? "Memproses\.\.\." : "Hantar"/);
  assert.doesNotMatch(source, /AI assistant is disabled by system settings\./);
  assert.doesNotMatch(source, />Stop AI</);
  assert.doesNotMatch(source, />New Chat</);
  assert.doesNotMatch(source, />Send</);
});
