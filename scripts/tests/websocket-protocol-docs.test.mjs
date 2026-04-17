import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const websocketDocPath = path.resolve(process.cwd(), "docs", "WEBSOCKET_PROTOCOL.md");

test("WebSocket protocol docs capture the implemented runtime limits and terminal close reasons", () => {
  const doc = readFileSync(websocketDocPath, "utf8");

  assert.match(doc, /\/ws/);
  assert.match(doc, /100 KiB/);
  assert.match(doc, /64 KiB/);
  assert.match(doc, /256 KiB/);
  assert.match(doc, /100` message seminit|100 message seminit/);
  assert.match(doc, /30 saat/);
  assert.match(doc, /60 saat/);
  assert.match(doc, /1008/);
  assert.match(doc, /session_invalid/);
  assert.match(doc, /session_expired/);
  assert.match(doc, /base delay: `1000ms`/);
  assert.match(doc, /capped delay: `30000ms`/);
  assert.match(doc, /max attempts: `12`/);
});
