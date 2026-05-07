import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const websocketSource = readFileSync(
  path.resolve(process.cwd(), "server", "ws", "websocket.ts"),
  "utf8",
);

test("websocket setup requires composition-root storage and keeps session secrets lazy", () => {
  assert.doesNotMatch(websocketSource, /^const defaultStorage = new PostgresStorage\(\);/m);
  assert.doesNotMatch(websocketSource, /^const defaultSessionSecrets = getSessionJwtVerificationSecrets\(\);/m);
  assert.doesNotMatch(websocketSource, /let defaultSessionSecrets/);
  assert.doesNotMatch(websocketSource, /function getDefaultStorage\(\)/);
  assert.match(websocketSource, /setupWebSocket requires an initialized storage instance/);
  assert.match(websocketSource, /function getDefaultSessionSecrets\(\)/);
  assert.match(websocketSource, /return getSessionJwtVerificationSecrets\(\);/);
  assert.doesNotMatch(websocketSource, /options\.storage \?\? getDefaultStorage\(\)/);
  assert.match(websocketSource, /const storage = options\.storage/);
  assert.match(websocketSource, /options\.secret \?\? getDefaultSessionSecrets\(\)/);
});
