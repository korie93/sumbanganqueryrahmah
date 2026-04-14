import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");

test(".env.example links collection PII key rotation guidance", () => {
  assert.match(envExample, /docs\/SECRET_ROTATION\.md/i);
  assert.match(envExample, /COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS=/);
  assert.match(envExample, /compatibility window/i);
});
