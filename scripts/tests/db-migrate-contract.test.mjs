import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("db migrate keeps a second pool connection available while advisory lock is held", () => {
  const source = readFileSync(new URL("../db-migrate.mjs", import.meta.url), "utf8");

  assert.match(source, /withPostgresMigrationAdvisoryLock\(pool/);
  assert.match(source, /buildPostgresPoolConfig\(process\.env,\s*\{\s*max:\s*2\s*\}\)/s);
});
