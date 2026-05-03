import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const websocketSource = readFileSync(
  path.resolve(process.cwd(), "server", "ws", "websocket.ts"),
  "utf8",
);

test("websocket setup lazily initializes default storage and session secrets", () => {
  assert.doesNotMatch(websocketSource, /^const defaultStorage = new PostgresStorage\(\);/m);
  assert.doesNotMatch(websocketSource, /^const defaultSessionSecrets = getSessionJwtVerificationSecrets\(\);/m);
  assert.match(websocketSource, /function getDefaultStorage\(\)/);
  assert.match(websocketSource, /function getDefaultSessionSecrets\(\)/);
  assert.match(websocketSource, /options\.storage \?\? getDefaultStorage\(\)/);
  assert.match(websocketSource, /options\.secret \?\? getDefaultSessionSecrets\(\)/);
});
