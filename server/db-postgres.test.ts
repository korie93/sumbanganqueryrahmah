import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPgPoolConfig,
  PG_QUERY_TIMEOUT_AUTHORITY,
  stopPgPoolBackgroundTasks,
} from "./db-postgres";
import { runtimeConfig } from "./config/runtime";

test.after(() => {
  stopPgPoolBackgroundTasks();
});

test("buildPgPoolConfig uses statement_timeout as the single normal-query timeout authority", () => {
  const config = buildPgPoolConfig({
    ...runtimeConfig.database,
    searchPath: "public",
    statementTimeoutMs: 47_000,
    queryTimeoutMs: 12_000,
  });

  assert.equal(PG_QUERY_TIMEOUT_AUTHORITY, "statement_timeout");
  assert.match(String(config.options || ""), /-c search_path=public\b/);
  assert.match(String(config.options || ""), /-c statement_timeout=47000\b/);
  assert.equal(config.statement_timeout, 47_000);
  assert.equal("query_timeout" in config, false);
});
