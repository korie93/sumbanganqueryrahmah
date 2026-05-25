import assert from "node:assert/strict";
import test from "node:test";
import { buildPgRuntimePoolOptions } from "../../db-postgres-options";

test("buildPgRuntimePoolOptions applies search_path and statement_timeout", () => {
  assert.equal(
    buildPgRuntimePoolOptions({
      searchPath: "public, app_private",
      statementTimeoutMs: 30_000,
    }),
    "-c search_path=public,app_private -c statement_timeout=30000",
  );
});

test("buildPgRuntimePoolOptions rejects unsafe statement timeout values", () => {
  assert.throws(
    () => buildPgRuntimePoolOptions({ searchPath: "public", statementTimeoutMs: 999 }),
    /PG_STATEMENT_TIMEOUT_MS must be a safe integer of at least 1000/i,
  );
});

test("buildPgRuntimePoolOptions keeps search_path validation intact", () => {
  assert.throws(
    () => buildPgRuntimePoolOptions({ searchPath: "public;drop schema public", statementTimeoutMs: 30_000 }),
    /Invalid PG search_path/i,
  );
});
